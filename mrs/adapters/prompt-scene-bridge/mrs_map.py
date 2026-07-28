"""
Map Project Infinity narrative text-to-3d sceneSpec → MRS SceneSpecification
and Engine3DWorldDocument JSON.

Drive-G-1: This module does NOT import the Infinity narrative package.
It only maps already-produced JSON. SceneSpecification mapping is **enforced**.
World stubs remain **partial** until expand; expand_world_request is **enforced**
via out-of-process engine3d-core Node (createWorldGenerator + generateWorldFromGenerator).
"""

from __future__ import annotations

import hashlib
import json
import os
import re
import shutil
import subprocess
from pathlib import Path
from typing import Any

_BRIDGE_DIR = Path(__file__).resolve().parent


def _guess_repo_root(bridge_dir: Path = _BRIDGE_DIR) -> Path:
    """Monorepo root when present; otherwise bridge parent (Docker ``/app``)."""
    try:
        candidate = bridge_dir.parents[2]
    except IndexError:
        return bridge_dir.parent
    if (candidate / "mrs" / "packages" / "engine3d-core").is_dir():
        return candidate
    if (candidate / ".git").exists():
        return candidate
    return bridge_dir.parent


_REPO_ROOT = _guess_repo_root()
_DEFAULT_EXPAND_SCRIPT = (
    _REPO_ROOT
    / "mrs"
    / "packages"
    / "engine3d-core"
    / "scripts"
    / "expand-world-document.mjs"
)


def _sibling_expand_script_path(bridge_dir: Path | None = None) -> Path:
    """Docker flatten: ``/app/prompt-scene-bridge`` → ``/app/engine3d-core/scripts/...``."""
    base = bridge_dir if bridge_dir is not None else _BRIDGE_DIR
    return (
        base.parent
        / "engine3d-core"
        / "scripts"
        / "expand-world-document.mjs"
    )


def _slug(value: str) -> str:
    token = re.sub(r"[^a-z0-9]+", "_", str(value or "").strip().lower()).strip("_")
    return token or "scene"


def _hex_from_mood(mood: str) -> str:
    m = (mood or "steady").lower()
    if m in ("ominous", "eerie"):
        return "#8a2be2"
    if m == "curious":
        return "#1accff"
    if m == "restless":
        return "#ff8c42"
    return "#55aaff"


def _surface_for_theme(theme: str, keywords: list[str]) -> str:
    """Map to RT4D_SURFACE_IDS only (see renderer-core scene-spec/validate.js)."""
    kw = {k.lower() for k in keywords}
    theme_l = (theme or "").lower()
    if kw & {"star", "4d", "hypersphere", "mandala", "tesseract"} or "star" in theme_l:
        return "tesseract"
    if theme_l == "gothic_ritual" or kw & {"altar", "blood", "moon", "thorn"}:
        return "tesseract"
    if theme_l == "forbidden_archive" or kw & {"archive", "ledger", "cathedral"}:
        return "lattice-grid"
    if theme_l == "haunted_wilds" or kw & {"garden", "moor", "bridge", "road"}:
        return "torus-ring"
    if "neural" in theme_l or "lattice" in kw:
        return "lattice-grid"
    if kw & {"torus", "ring", "hopf"}:
        return "clifford-torus"
    return "central-orb"


def _seed_from(payload: dict[str, Any]) -> int:
    raw = (
        payload.get("seedSignature")
        or payload.get("worldId")
        or payload.get("sceneId")
        or "seed"
    )
    digest = hashlib.sha256(str(raw).encode("utf-8")).digest()
    return int.from_bytes(digest[:4], "big")


def map_infinity_scene_to_scene_specification(
    infinity_scene: dict[str, Any],
    *,
    width: int = 256,
    height: int = 192,
    samples: int = 4,
    max_depth: int = 4,
) -> dict[str, Any]:
    """Convert Infinity text-to-3d sceneSpec → MRS SceneSpecification 1.0."""
    theme = str(infinity_scene.get("theme") or "mythic_threshold")
    mood = str(infinity_scene.get("mood") or "steady")
    keywords = [
        str(k) for k in (infinity_scene.get("keywords") or []) if str(k).strip()
    ]
    summary = str(infinity_scene.get("summary") or theme)
    world_id = str(infinity_scene.get("worldId") or "world")
    scene_id = str(infinity_scene.get("sceneId") or f"{world_id}:scene")
    surface = _surface_for_theme(theme, keywords)
    color = _hex_from_mood(mood)
    seed = _seed_from(infinity_scene)

    entities: list[dict[str, Any]] = [
        {
            "id": "primary",
            "materialId": "mood",
            "geometry": {"kind": "surface", "surfaceId": surface},
            "transform4d": {"rotate": {"xw": 0.15, "zw": 0.05}},
        }
    ]
    for i, focal in enumerate(infinity_scene.get("focalObjects") or []):
        if not isinstance(focal, dict):
            continue
        fid = _slug(str(focal.get("id") or focal.get("label") or f"focal_{i}"))
        entities.append(
            {
                "id": fid[:48],
                "materialId": "prop",
                "geometry": {
                    "kind": "hypersphere",
                    "radius": 0.18 + (i % 3) * 0.04,
                },
                "transform4d": {
                    "translate": [
                        ((i % 4) - 1.5) * 0.55,
                        0.2 + (i % 2) * 0.15,
                        ((i // 4) - 0.5) * 0.55,
                        (i % 5) * 0.08 - 0.16,
                    ]
                },
            }
        )

    return {
        "schemaVersion": "1.0",
        "kind": "SceneSpecification",
        "id": _slug(scene_id)[:64],
        "name": summary[:120],
        "materials": [
            {"id": "mood", "color": color, "opacity": 1, "wireframe": False},
            {"id": "prop", "color": "#d0d8e8", "opacity": 1, "wireframe": False},
        ],
        "entities": entities,
        "defaultObservation": {"modeId": "perspective_w", "params": {"d4": 4}},
        "camera": {
            "position4d": [4.2, 1.6, 0.4, 0.12],
            "target4d": [0, 0.2, 0, 0],
            "fovX": 52,
            "fovY": 52,
        },
        "lights": [
            {
                "id": "key",
                "center": [2.2, 3.1, -1.4, 0.5],
                "radius": 0.9,
                "emission": [16, 15, 14],
            }
        ],
        "output": {
            "width": width,
            "height": height,
            "samples": samples,
            "maxDepth": max_depth,
            "seed": seed,
        },
        "provenance": {
            "source": "prompt-scene-bridge",
            "infinityTheme": theme,
            "infinityMood": mood,
            "keywords": keywords,
            "worldId": world_id,
        },
    }


def map_infinity_scene_to_world_document(
    infinity_scene: dict[str, Any],
) -> dict[str, Any]:
    """
    Emit Engine3DWorldDocument JSON compatible with create4dStarWorld /
    worldDocument generators (schema engine3d-world/1.0).
    """
    theme = str(infinity_scene.get("theme") or "mythic_threshold")
    keywords = [
        str(k).lower() for k in (infinity_scene.get("keywords") or []) if str(k).strip()
    ]
    seed = _seed_from(infinity_scene)
    world_id = str(infinity_scene.get("worldId") or f"world-{seed}")
    summary = str(infinity_scene.get("summary") or theme)

    use_star = bool(
        {"star", "4d", "hypersphere", "mandala", "tesseract"} & set(keywords)
        or "star" in theme.lower()
        or "gothic_ritual" in theme.lower()
    )

    if use_star:
        arm_count = min(12, max(4, 4 + len(infinity_scene.get("focalObjects") or [])))
        return {
            "schemaVersion": "engine3d-world/1.0",
            "id": f"star-from-prompt-{seed}",
            "generator": {
                "id": "star-generator",
                "type": "star",
                "seed": seed,
                "params": {
                    "coreRadius": 0.32,
                    "armRadius": 0.07,
                    "armCount": arm_count,
                    "armLength": 1.7,
                    "includeHalo": 1,
                },
            },
            "promptBridge": {
                "summary": summary,
                "theme": theme,
                "keywords": keywords,
                "sourceWorldId": world_id,
            },
            # Minimal stub; create4dStarWorld regenerates geometry when type=star
            # via generateWorldFromGenerator — callers should prefer that path.
            "objects": [],
            "materials": [],
            "lights": [],
            "cameras": [],
            "activeCameraId": "camera-main",
        }

    # Generic mandala lattice world request
    count = min(12, max(4, 2 + len(infinity_scene.get("focalObjects") or [])))
    return {
        "schemaVersion": "engine3d-world/1.0",
        "id": f"mandala-from-prompt-{seed}",
        "generator": {
            "id": "mandala-generator",
            "type": "mandala",
            "seed": seed,
            "params": {"count": count},
        },
        "promptBridge": {
            "summary": summary,
            "theme": theme,
            "keywords": keywords,
            "sourceWorldId": world_id,
        },
        "objects": [],
        "materials": [],
        "lights": [],
        "cameras": [],
        "activeCameraId": "camera-main",
    }


class WorldExpandError(RuntimeError):
    """Node expand CLI failed or returned invalid JSON."""


def default_expand_script_path() -> Path:
    """Resolve expand-world-document.mjs across ENV, monorepo, and Docker layouts."""
    override = (os.environ.get("ENGINE3D_EXPAND_SCRIPT") or "").strip()
    if override:
        return Path(override)
    if _DEFAULT_EXPAND_SCRIPT.is_file():
        return _DEFAULT_EXPAND_SCRIPT
    sibling = _sibling_expand_script_path()
    if sibling.is_file():
        return sibling
    return _DEFAULT_EXPAND_SCRIPT


def _needs_expand(world_request: dict[str, Any]) -> bool:
    objects = world_request.get("objects")
    if isinstance(objects, list) and len(objects) > 0:
        return False
    generator = world_request.get("generator")
    return isinstance(generator, dict) and bool(generator.get("type"))


def expand_world_request(
    world_request: dict[str, Any],
    *,
    script_path: Path | None = None,
    node_bin: str | None = None,
    timeout_seconds: float = 60.0,
) -> dict[str, Any]:
    """
    Expand an Engine3D generator stub to a full WorldDocument via Node OOP.

    Idempotent when ``objects`` is already non-empty. Raises WorldExpandError
    when expand is required but the Node CLI fails.
    Status: **enforced** by test_mrs_map expand cases (star + mandala).
    """
    if not isinstance(world_request, dict):
        raise TypeError("world_request must be a dict")
    if not _needs_expand(world_request):
        return world_request

    script = Path(script_path) if script_path else default_expand_script_path()
    if not script.is_file():
        raise WorldExpandError(
            f"expand script missing: {script}. Build/engine3d-core scripts required."
        )

    node = (
        (node_bin or "").strip()
        or (os.environ.get("ENGINE3D_EXPAND_NODE") or "").strip()
        or (os.environ.get("NODE_BIN") or "").strip()
        or shutil.which("node")
        or "node"
    )
    payload = json.dumps(world_request, separators=(",", ":"), sort_keys=True)
    try:
        proc = subprocess.run(  # noqa: S603 — fixed argv, no shell
            [node, str(script)],
            input=payload,
            capture_output=True,
            text=True,
            timeout=float(timeout_seconds),
            cwd=str(script.parent),
            check=False,
        )
    except FileNotFoundError as exc:
        raise WorldExpandError(f"Node interpreter not found: {node}") from exc
    except subprocess.TimeoutExpired as exc:
        raise WorldExpandError(
            f"expand timed out after {timeout_seconds}s"
        ) from exc

    stdout = (proc.stdout or "").strip()
    stderr = (proc.stderr or "").strip()
    if proc.returncode != 0:
        detail = stderr or stdout or f"exit {proc.returncode}"
        raise WorldExpandError(f"expand failed: {detail[:800]}")

    line = ""
    for candidate in reversed(stdout.splitlines()):
        if candidate.strip().startswith("{"):
            line = candidate.strip()
            break
    if not line:
        raise WorldExpandError(
            f"expand returned no JSON: {(stderr or stdout)[:400]}"
        )
    try:
        expanded = json.loads(line)
    except json.JSONDecodeError as exc:
        raise WorldExpandError(
            f"expand JSON parse error: {exc}; got {line[:200]!r}"
        ) from exc
    if not isinstance(expanded, dict):
        raise WorldExpandError("expand output is not a JSON object")
    objects = expanded.get("objects")
    if not isinstance(objects, list) or len(objects) < 1:
        raise WorldExpandError(
            "expand produced empty objects[]; engine3d-core dist may be stale"
        )
    return expanded


def expand_world_request_if_enabled(
    world_request: dict[str, Any],
    *,
    enabled: bool | None = None,
    **kwargs: Any,
) -> dict[str, Any]:
    """Opt-in expand: env PROMPT_SCENE_EXPAND_WORLD=1 or explicit enabled=True."""
    if enabled is None:
        flag = (os.environ.get("PROMPT_SCENE_EXPAND_WORLD") or "0").strip().lower()
        enabled = flag in {"1", "true", "yes", "on"}
    if not enabled:
        return world_request
    return expand_world_request(world_request, **kwargs)
