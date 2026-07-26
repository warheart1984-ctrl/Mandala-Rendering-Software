"""Image → SceneSpecification bridge (hackathon D path).

Drive-G-1 / honest scope:
    Multimodal NIM (or heuristic fallback) emits a SceneSpecification.
    MRS path-traces a full frame. This is **scene interpretation**, NOT
    geometric reconstruction / photogrammetry / depth / mesh / pose recovery.
"""

from __future__ import annotations

import base64
import hashlib
import json
import logging
import re
import subprocess
import tempfile
import uuid
from pathlib import Path
from typing import Any, Callable

import httpx

from app.config import (
    APP_DIR,
    Settings,
    validate_scene_spec_default_script_path,
)
from app.config import APP_DIR, REPO_ROOT, Settings
from app.image_ingest import (
    analyze_image_bytes,
    decode_base64_payload,
    get_ingested_meta,
    is_safe_ingest_id,
    resolve_stored_file,
)
from app.preview_cache import get_preview_path, is_run_id
from app.render_quality import (
    DRAFT_HEIGHT,
    DRAFT_MAX_DEPTH,
    DRAFT_SAMPLES,
    DRAFT_WIDTH,
    quality_presets,
    resolve_quality,
)
from app.rt4d_provider import _find_node
from app.rt4d_to_nvidia import (
    NvidiaUnavailableError,
    raise_if_nvidia_required_unavailable,
)

logger = logging.getLogger(__name__)

DEFAULT_IMAGE_TO_SCENE_MODEL = "meta/llama-3.2-11b-vision-instruct"
DEFAULT_CHAT_URL = "https://integrate.api.nvidia.com/v1/chat/completions"

ANALYSIS_MODE = "scene-interpretation"
DISCLAIMER = (
    "Scene interpretation + optional path-traced full frame. "
    "NOT geometric reconstruction, photogrammetry, depth maps, mesh recovery, or pose estimation."
)

# Fixed map: heuristic priors → RT4D-allowed surfaceId (no meshRef).
_SURFACE_BY_PALETTE = (
    ("warm-red bias", "tesseract"),
    ("cool-blue bias", "clifford-torus"),
    ("green bias", "lattice-grid"),
)
_SURFACE_BY_FRAMING = {
    "wide / landscape-friendly lattice": "lattice-grid",
    # Portrait framing used to map to orbital-cluster (6+1 bare spheres), which
    # made NVIDIA/heuristic re-renders of lattice stills look like blob piles.
    "tall / portrait-friendly lattice": "lattice-grid",
    "square-ish / centered lattice": "tesseract",
}

# RT4D procedural archetype → SceneSpec surfaceId when re-interpreting a prior still.
_SOURCE_SCENE_TO_SURFACE = {
    "tesseract-lattice": "tesseract",
    "tesseract-vertices": "tesseract",
    "neural-lattice": "lattice-grid",
    "lattice-grid": "lattice-grid",
}

# Surfaces that read as a handful of ellipsoids — replace when we know the source
# still was a lattice/tesseract archetype.
_WEAK_CLUSTER_SURFACES = frozenset(
    {"orbital-cluster", "central-orb", "torus-3d", "hopf-surface"}
)

_PROMPT_PATH = Path(__file__).resolve().parent / "prompts" / "image_to_scene_spec.md"


def validate_scene_spec_default_script_path(repo_root: Path = REPO_ROOT) -> Path:
    return (
        repo_root
        / "mrs"
        / "packages"
        / "renderer-core"
        / "scripts"
        / "validate-scene-spec.mjs"
    )


def image_to_scene_availability(settings: Settings) -> dict[str, Any]:
    """Cheap /health probe — never claims reconstruction."""
    node = _find_node(settings.rt4d_node_path)
    validate_script = Path(
        getattr(settings, "resolved_validate_scene_spec_script", None)
        or str(validate_scene_spec_default_script_path())
    )
    render_script = Path(settings.resolved_scene_spec_script)
    nim_ready = bool(settings.nvidia_configured)
    return {
        "available": nim_ready or True,  # heuristic always available
        "model": settings.image_to_scene_model,
        "nim_configured": nim_ready,
        "fallback": "heuristic",
        "validate_script_found": validate_script.is_file(),
        "render_script_found": render_script.is_file(),
        "node_found": node is not None,
        "quality_default": resolve_quality(settings),
        "quality_presets": quality_presets(settings),
        "note": DISCLAIMER,
        "analysis_mode": ANALYSIS_MODE,
    }


def load_system_prompt() -> str:
    if _PROMPT_PATH.is_file():
        return _PROMPT_PATH.read_text(encoding="utf-8")
    return (
        "Emit ONLY a SceneSpecification JSON object with schemaVersion 1.0, "
        "kind SceneSpecification, and geometry.kind surface with an RT4D surfaceId."
    )


def seed_from_sha256(sha256_hex: str) -> int:
    """Deterministic uint32 seed from image digest."""
    digest = (sha256_hex or "").strip().lower()
    if len(digest) < 8:
        digest = hashlib.sha256((sha256_hex or "empty").encode("utf-8")).hexdigest()
    return int(digest[:8], 16) & 0xFFFFFFFF


def surface_id_for_source_scene(source_scene: str | None) -> str | None:
    """Map an RT4D archetype id to a SceneSpec surfaceId, or None if unknown."""
    if not source_scene or not isinstance(source_scene, str):
        return None
    return _SOURCE_SCENE_TO_SURFACE.get(source_scene.strip())


def extract_source_scene(entry: dict[str, Any] | None) -> str | None:
    """Pull ``scene`` from a generate/index asset entry when present."""
    if not isinstance(entry, dict):
        return None
    for bag in (entry.get("provenance"), entry.get("render"), entry):
        if not isinstance(bag, dict):
            continue
        scene = bag.get("scene")
        if isinstance(scene, str) and scene.strip():
            return scene.strip()
        nested = bag.get("render")
        if isinstance(nested, dict):
            scene = nested.get("scene")
            if isinstance(scene, str) and scene.strip():
                return scene.strip()
    return None


def apply_source_scene_bias(
    spec: dict[str, Any],
    *,
    source_scene: str | None,
    force: bool = False,
) -> dict[str, Any]:
    """Bias/remap primary surfaceId when the source still's RT4D archetype is known.

    Drive-G-1: this preserves lattice *interpretation* for re-renders; it does
    not claim geometric reconstruction of the PNG.
    """
    preferred = surface_id_for_source_scene(source_scene)
    if not preferred or not isinstance(spec, dict):
        return spec
    entities = spec.get("entities")
    if not isinstance(entities, list) or not entities:
        return spec
    primary = entities[0]
    if not isinstance(primary, dict):
        return spec
    geom = primary.get("geometry")
    if not isinstance(geom, dict) or geom.get("kind") != "surface":
        return spec
    current = geom.get("surfaceId")
    if not isinstance(current, str):
        current = ""
    if force or current == preferred or current in _WEAK_CLUSTER_SURFACES:
        if current != preferred:
            geom = {**geom, "surfaceId": preferred}
            primary = {**primary, "geometry": geom}
            entities = [primary, *entities[1:]]
            meta = spec.get("metadata") if isinstance(spec.get("metadata"), dict) else {}
            return {
                **spec,
                "entities": entities,
                "metadata": {
                    **meta,
                    "source_scene_bias": source_scene,
                    "surface_id_before_bias": current or None,
                    "surface_id_after_bias": preferred,
                },
            }
    return spec


def build_heuristic_scene_spec(
    analysis: dict[str, Any],
    *,
    image_sha256: str,
    width: int | None = None,
    height: int | None = None,
) -> dict[str, Any]:
    """Map dominant_color + aspect → material + one RT4D surfaceId.

    Always produces a validate-clean RT4D SceneSpecification.
    """
    suggestion = analysis.get("suggestion") if isinstance(analysis.get("suggestion"), dict) else {}
    dominant = str(
        analysis.get("dominant_color")
        or suggestion.get("suggested_color")
        or "#808080"
    )
    if not re.fullmatch(r"#[0-9a-fA-F]{6}", dominant):
        dominant = "#808080"

    palette_tag = str(suggestion.get("palette_tag") or "")
    framing = str(suggestion.get("framing") or "")
    surface_id = "tesseract"
    for tag, sid in _SURFACE_BY_PALETTE:
        if tag in palette_tag:
            surface_id = sid
            break
    else:
        surface_id = _SURFACE_BY_FRAMING.get(framing, "tesseract")

    w = int(width or analysis.get("width") or DRAFT_WIDTH)
    h = int(height or analysis.get("height") or DRAFT_HEIGHT)
    # Prefer the draft preset so heuristic specs don't force a long CPU path
    # before the server-side quality clamp (also draft by default).
    out_w = max(64, min(DRAFT_WIDTH, w if w <= DRAFT_WIDTH else DRAFT_WIDTH))
    out_h = max(64, min(DRAFT_HEIGHT, h if h <= DRAFT_HEIGHT else DRAFT_HEIGHT))

    seed = seed_from_sha256(image_sha256)
    short = (image_sha256 or uuid.uuid4().hex)[:10]
    return {
        "schemaVersion": "1.0",
        "kind": "SceneSpecification",
        "id": f"heuristic-{short}",
        "name": "Heuristic scene interpretation",
        "description": (
            "Heuristic SceneSpecification from palette/aspect priors — "
            "not geometric reconstruction."
        ),
        "materials": [
            {
                "id": "mat0",
                "color": dominant.lower(),
                "opacity": 1,
                "wireframe": False,
            }
        ],
        "entities": [
            {
                "id": "primary",
                "materialId": "mat0",
                "transform4d": {
                    "translate": [0, 0, 0, 0],
                    "rotate": {"xw": 0.15, "zw": 0.08},
                },
                "geometry": {"kind": "surface", "surfaceId": surface_id},
            }
        ],
        "defaultObservation": {"modeId": "perspective_w", "params": {"d4": 4}},
        "camera": {
            "position4d": [4.3, 1.4, 0.2, 0.1],
            "target4d": [0, 0.1, 0, 0],
            "fovX": 52,
            "fovY": 52,
            "fovZ": 45,
            "fovW": 28,
        },
        "lights": [
            {
                "id": "key",
                "center": [2.4, 3.3, -1.6, 0.7],
                "radius": 0.95,
                "emission": [17, 16, 14.5],
            }
        ],
        "output": {
            "width": out_w,
            "height": out_h,
            "samples": DRAFT_SAMPLES,
            "maxDepth": DRAFT_MAX_DEPTH,
            "seed": seed,
        },
        "metadata": {
            "source": "heuristic-fallback",
            "analysis_mode": ANALYSIS_MODE,
            "image_sha256": image_sha256,
        },
    }


def _ensure_seed(spec: dict[str, Any], image_sha256: str) -> dict[str, Any]:
    out = dict(spec)
    output = dict(out.get("output") or {})
    if output.get("seed") is None:
        output["seed"] = seed_from_sha256(image_sha256)
    out["output"] = output
    return out


def _extract_json_object(text: str) -> dict[str, Any]:
    raw = (text or "").strip()
    if not raw:
        raise ValueError("empty model response")
    # Strip common markdown fences.
    fence = re.search(r"```(?:json)?\s*([\s\S]*?)```", raw, re.IGNORECASE)
    if fence:
        raw = fence.group(1).strip()
    try:
        val = json.loads(raw)
    except json.JSONDecodeError:
        start = raw.find("{")
        end = raw.rfind("}")
        if start < 0 or end <= start:
            raise ValueError("model response is not JSON object")
        val = json.loads(raw[start : end + 1])
    if not isinstance(val, dict):
        raise ValueError("model JSON root must be an object")
    return val


def validate_spec_via_node(
    settings: Settings,
    spec: dict[str, Any],
    *,
    target: str = "rt4d",
) -> dict[str, Any]:
    """Shell out to validate-scene-spec.mjs (single SoT)."""
    node = _find_node(settings.rt4d_node_path)
    script = Path(
        getattr(settings, "resolved_validate_scene_spec_script", None)
        or str(validate_scene_spec_default_script_path())
    )
    if node is None or not script.is_file():
        # Soft structural gate when Node missing — still prefer Node when present.
        errors: list[dict[str, str]] = []
        if not isinstance(spec, dict):
            return {"ok": False, "errors": [{"path": "", "message": "expected object"}]}
        if spec.get("schemaVersion") != "1.0":
            errors.append({"path": "schemaVersion", "message": 'expected "1.0"'})
        if not isinstance(spec.get("id"), str) or not spec.get("id"):
            errors.append({"path": "id", "message": "expected non-empty string"})
        entities = spec.get("entities")
        if not isinstance(entities, list) or len(entities) < 1:
            errors.append({"path": "entities", "message": "expected at least 1 item(s)"})
        else:
            for i, ent in enumerate(entities):
                geom = (ent or {}).get("geometry") if isinstance(ent, dict) else None
                if not isinstance(geom, dict):
                    errors.append(
                        {"path": f"entities[{i}].geometry", "message": "expected object"}
                    )
                    continue
                kind = geom.get("kind")
                if kind in {"meshRef", "sdfRef"}:
                    errors.append(
                        {
                            "path": f"entities[{i}].geometry.kind",
                            "message": f"RT4D still path does not support {kind}",
                        }
                    )
                if kind == "surface" and not geom.get("surfaceId"):
                    errors.append(
                        {
                            "path": f"entities[{i}].geometry.surfaceId",
                            "message": "required",
                        }
                    )
        return {"ok": not errors, "errors": errors, "value": spec if not errors else None}

    with tempfile.TemporaryDirectory(prefix="mrs-validate-spec-") as tmp:
        spec_path = Path(tmp) / "spec.json"
        spec_path.write_text(json.dumps(spec), encoding="utf-8")
        try:
            proc = subprocess.run(  # noqa: S603
                [node, str(script), "--", "--spec", str(spec_path), "--target", target],
                capture_output=True,
                text=True,
                timeout=60.0,
                check=False,
            )
        except (FileNotFoundError, subprocess.TimeoutExpired) as exc:
            logger.warning("validate-scene-spec failed to run: %s", exc)
            return {
                "ok": False,
                "errors": [{"path": "", "message": f"validator unavailable: {exc}"}],
            }

    payload: dict[str, Any] | None = None
    for line in reversed((proc.stdout or "").splitlines()):
        line = line.strip()
        if line.startswith("{") and line.endswith("}"):
            try:
                payload = json.loads(line)
                break
            except json.JSONDecodeError:
                continue
    if not isinstance(payload, dict):
        err = (proc.stderr or proc.stdout or "no validator output").strip()[:400]
        return {
            "ok": False,
            "errors": [{"path": "", "message": f"validator failed: {err}"}],
        }
    return payload


def _mime_and_b64(data: bytes) -> tuple[str, str]:
    if data[:8] == b"\x89PNG\r\n\x1a\n":
        mime = "image/png"
    elif data[:3] == b"\xff\xd8\xff":
        mime = "image/jpeg"
    elif data[:4] == b"RIFF" and data[8:12] == b"WEBP":
        mime = "image/webp"
    else:
        mime = "image/jpeg"
    return mime, base64.b64encode(data).decode("ascii")


def call_nim_vision(
    settings: Settings,
    image_bytes: bytes,
    *,
    analysis: dict[str, Any],
    repair_errors: list[dict[str, Any]] | None = None,
    http_post: Callable[..., Any] | None = None,
    source_scene: str | None = None,
) -> str:
    """Call NVIDIA integrate chat/completions with image + text priors."""
    if not settings.nvidia_configured:
        raise RuntimeError("NVIDIA_API_KEY is required for NIM vision image-to-scene")

    mime, b64 = _mime_and_b64(image_bytes)
    suggestion = analysis.get("suggestion") if isinstance(analysis.get("suggestion"), dict) else {}
    preferred = surface_id_for_source_scene(source_scene)
    priors = {
        "dominant_color": analysis.get("dominant_color"),
        "width": analysis.get("width"),
        "height": analysis.get("height"),
        "palette_tag": suggestion.get("palette_tag"),
        "framing": suggestion.get("framing"),
        "mood": suggestion.get("mood"),
        "note": "Weak heuristic priors only — not depth or geometry.",
    }
    if source_scene:
        priors["source_rt4d_scene"] = source_scene
    if preferred:
        priors["preferred_surfaceId"] = preferred
        priors["source_note"] = (
            "This PNG is a prior MRS procedural RT4D still of the named archetype. "
            f"Prefer surfaceId '{preferred}'. Do NOT use orbital-cluster or central-orb "
            "for lattice/tesseract source stills — those expand to a few bare spheres."
        )
    user_bits: list[dict[str, Any]] = [
        {
            "type": "text",
            "text": (
                "Interpret this image into a SceneSpecification JSON object only.\n"
                f"Weak priors: {json.dumps(priors)}\n"
                f"Disclaimer: {DISCLAIMER}"
            ),
        },
        {
            "type": "image_url",
            "image_url": {"url": f"data:{mime};base64,{b64}"},
        },
    ]
    if repair_errors:
        user_bits = [
            {
                "type": "text",
                "text": (
                    "Previous SceneSpecification failed validation. "
                    "Fix ONLY these errors and re-emit a complete valid JSON object:\n"
                    + json.dumps(repair_errors)
                ),
            },
            *user_bits,
        ]

    payload = {
        "model": settings.image_to_scene_model,
        "messages": [
            {"role": "system", "content": load_system_prompt()},
            {"role": "user", "content": user_bits},
        ],
        "temperature": 0.2,
        "max_tokens": 2048,
    }
    headers = {
        "Authorization": f"Bearer {settings.nvidia_api_key}",
        "Accept": "application/json",
        "Content-Type": "application/json",
    }
    url = settings.image_to_scene_chat_url
    timeout = settings.image_to_scene_timeout_seconds

    if http_post is not None:
        resp = http_post(url, headers=headers, json=payload, timeout=timeout)
        body = resp if isinstance(resp, dict) else resp.json()
    else:
        with httpx.Client(timeout=timeout) as client:
            r = client.post(url, headers=headers, json=payload)
            r.raise_for_status()
            body = r.json()

    choices = body.get("choices") if isinstance(body, dict) else None
    if not isinstance(choices, list) or not choices:
        raise RuntimeError("NIM vision response missing choices")
    message = choices[0].get("message") if isinstance(choices[0], dict) else None
    content = message.get("content") if isinstance(message, dict) else None
    if isinstance(content, list):
        # Some multimodal responses return content parts.
        texts = [
            str(p.get("text") or "")
            for p in content
            if isinstance(p, dict) and p.get("type") in (None, "text")
        ]
        content = "\n".join(t for t in texts if t)
    if not isinstance(content, str) or not content.strip():
        raise RuntimeError("NIM vision response missing message content")
    return content


def resolve_image_bytes(
    *,
    image_base64: str | None = None,
    ingest_id: str | None = None,
    run_id: str | None = None,
    app_dir: Path = APP_DIR,
    index_lookup: Callable[[str], dict[str, Any] | None] | None = None,
    b2_fetch: Callable[[str], bytes | None] | None = None,
) -> tuple[bytes, dict[str, Any]]:
    """Resolve image bytes from base64, ingest id, or generate run_id preview/B2."""
    meta: dict[str, Any] = {}

    if image_base64:
        data = decode_base64_payload(image_base64)
        meta["source"] = "base64"
        return data, meta

    if ingest_id:
        if not is_safe_ingest_id(ingest_id):
            raise ValueError("invalid ingest id")
        path = resolve_stored_file(app_dir, ingest_id)
        if path is None:
            raise FileNotFoundError(f"ingested image not found: {ingest_id}")
        data = path.read_bytes()
        meta = get_ingested_meta(app_dir, ingest_id) or {}
        meta["source"] = "ingest"
        meta["id"] = ingest_id
        return data, meta

    if run_id:
        if not is_run_id(run_id):
            raise ValueError("invalid run_id")
        preview = get_preview_path(app_dir, run_id)
        if preview is not None:
            data = preview.read_bytes()
            meta = {"source": "preview_cache", "run_id": run_id}
            return data, meta
        # Optional index → B2 fetch
        if index_lookup is not None:
            entry = index_lookup(run_id)
            if isinstance(entry, dict):
                asset_key = entry.get("asset_key")
                if isinstance(asset_key, str) and b2_fetch is not None:
                    fetched = b2_fetch(asset_key)
                    if fetched:
                        meta = {
                            "source": "b2",
                            "run_id": run_id,
                            "asset_key": asset_key,
                        }
                        return fetched, meta
        raise FileNotFoundError(
            f"no local preview (and no B2 fetch) for run_id: {run_id}"
        )

    raise ValueError("provide image_base64, id (ingest), or run_id")


def interpret_image_to_scene(
    settings: Settings,
    image_bytes: bytes,
    *,
    force_heuristic: bool = False,
    require_nvidia: bool = False,
    http_post: Callable[..., Any] | None = None,
    validate_fn: Callable[..., dict[str, Any]] | None = None,
    source_scene: str | None = None,
) -> dict[str, Any]:
    """Core bridge: bytes → SceneSpecification + provenance fields.

    When ``require_nvidia`` is True, never silently fall back to the heuristic:
    missing key or NIM failure raises ``NvidiaUnavailableError`` so callers can
    keep the source RT4D still and surface "NVIDIA unavailable" honestly.

    ``source_scene`` is an optional RT4D archetype id from a prior generate
    (e.g. ``tesseract-lattice``). When set, NIM is steered toward a matching
    surfaceId and weak cluster surfaces are remapped after interpret.
    """
    if not image_bytes:
        raise ValueError("empty image")
    if require_nvidia and force_heuristic:
        raise ValueError("require_nvidia and force_heuristic are mutually exclusive")

    if require_nvidia and not settings.nvidia_configured:
        raise_if_nvidia_required_unavailable(settings)

    image_sha256 = hashlib.sha256(image_bytes).hexdigest()
    analysis = analyze_image_bytes(image_bytes)
    validate = validate_fn or (lambda s: validate_spec_via_node(settings, s))

    source = "heuristic-fallback"
    repair_attempted = False
    nim_error: str | None = None
    spec: dict[str, Any] | None = None
    # When we know the prior still was a lattice/tesseract archetype, force the
    # matching surfaceId even if NIM/heuristic picks a ring or torus mood.
    force_bias = surface_id_for_source_scene(source_scene) is not None

    if not force_heuristic and settings.nvidia_configured:
        try:
            content = call_nim_vision(
                settings,
                image_bytes,
                analysis=analysis,
                http_post=http_post,
                source_scene=source_scene,
            )
            candidate = _ensure_seed(_extract_json_object(content), image_sha256)
            candidate = apply_source_scene_bias(
                candidate, source_scene=source_scene, force=force_bias
            )
            result = validate(candidate)
            if result.get("ok"):
                spec = candidate
                source = "nim-vision"
            else:
                repair_attempted = True
                errors = result.get("errors") or []
                content2 = call_nim_vision(
                    settings,
                    image_bytes,
                    analysis=analysis,
                    repair_errors=errors if isinstance(errors, list) else [],
                    http_post=http_post,
                    source_scene=source_scene,
                )
                candidate2 = _ensure_seed(_extract_json_object(content2), image_sha256)
                candidate2 = apply_source_scene_bias(
                    candidate2, source_scene=source_scene, force=force_bias
                )
                result2 = validate(candidate2)
                if result2.get("ok"):
                    spec = candidate2
                    source = "nim-vision"
                else:
                    nim_error = json.dumps(result2.get("errors") or result2)[:500]
        except NvidiaUnavailableError:
            raise
        except Exception as exc:  # noqa: BLE001 — fall back unless require_nvidia
            nim_error = str(exc)
            logger.warning("NIM vision image-to-scene failed: %s", exc)
            if require_nvidia:
                raise_if_nvidia_required_unavailable(
                    settings, nim_error=nim_error, scene_source=None
                )

    if require_nvidia and source != "nim-vision":
        raise_if_nvidia_required_unavailable(
            settings, nim_error=nim_error, scene_source=source
        )

    if spec is None:
        spec = build_heuristic_scene_spec(analysis, image_sha256=image_sha256)
        preferred = surface_id_for_source_scene(source_scene)
        if preferred:
            spec = apply_source_scene_bias(
                spec, source_scene=source_scene, force=True
            )
        source = "heuristic-fallback"
        # Ensure heuristic always validates clean when Node SoT is present.
        check = validate(spec)
        if not check.get("ok"):
            # Last-resort minimal tesseract (should not happen).
            logger.error("heuristic SceneSpec failed validation: %s", check)
            spec = build_heuristic_scene_spec(
                {
                    **analysis,
                    "suggestion": {
                        "palette_tag": "neutral / mixed",
                        "framing": "square-ish / centered lattice",
                        "suggested_color": "#808080",
                    },
                    "dominant_color": "#808080",
                },
                image_sha256=image_sha256,
            )
            spec["entities"][0]["geometry"]["surfaceId"] = preferred or "tesseract"

    return {
        "spec": spec,
        "source": source,
        "image_sha256": image_sha256,
        "analysis": analysis,
        "analysis_mode": ANALYSIS_MODE,
        "note": DISCLAIMER,
        "repair_attempted": repair_attempted,
        "nim_error": nim_error,
        "source_scene": source_scene,
    }
