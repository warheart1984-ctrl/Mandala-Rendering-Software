"""RT4D deterministic renderer backend for Genblaze image generation.

Bridges Python (FastAPI) → the JS renderer-core ``render-still`` CLI via a
subprocess, then flows the produced PNG through the existing Genblaze pipeline
(SHA-256 manifest, Backblaze B2 upload or local preview cache, asset index).

HONEST SCOPE (Drive-G-1):
    This backend does **not** do text-to-image or diffusion. The prompt drives
    *procedural scene selection* only (keyword → scene archetype + palette +
    material), and a seed derived from the prompt drives deterministic
    variation. The output is a replayable RT4D path-traced render — same prompt
    (same seed) → byte-identical PNG. It is stronger for provenance precisely
    because it is deterministic and seed-recorded, but it is not a generative
    model and must not be labeled as one.

The CLI (and therefore ``node``) is required. Where neither ``node`` nor the
script is present — the app-local Docker image, or any container predating the
repo-root Dockerfile's Node layer — ``rt4d_availability`` reports
``available: False`` and ``/health`` surfaces it rather than crashing.
"""

from __future__ import annotations

import hashlib
import json
import logging
import os
import shutil
import subprocess
import tempfile
import uuid
from pathlib import Path
from typing import Any

from app.config import Settings
from app.image_quality import assess_image_bytes
from app.pipeline import (
    GenerateResult,
    GenerationQualityError,
    _attach_local_preview,
    _presign_preview,
    _utc_now,
    build_backend,
)
from app.render_quality import (
    quality_presets,
    resolve_quality,
    resolve_still_render_params,
)

logger = logging.getLogger(__name__)

RT4D_MODEL_ID = "mrs-renderer-core/rt4d"
RT4D_PROVIDER_ID = "rt4d-render"

RT4D_SETUP_HELP = (
    "RT4D renderer backend needs Node.js and the renderer-core render-still CLI. "
    "Install Node 18+ (set RT4D_NODE_PATH if not on PATH) and ensure "
    "mrs/packages/renderer-core/scripts/render-still.mjs is present (set "
    "RT4D_SCRIPT_PATH to override). Containers built from the repo-root "
    "Dockerfile bundle both; the app-local Dockerfile does not, and a service "
    "still running an older image needs a redeploy."
)


class RT4DRenderError(Exception):
    """CLI present but render failed (crash, timeout, empty output).

    Not a subclass of ``RuntimeError`` so ``main._run_generate_common`` maps it
    to HTTP 502 (generation failure), not 503 (missing setup / redeploy).
    Setup/missing-node/script paths keep raising ``RuntimeError(RT4D_SETUP_HELP)``.
    """


def _derive_seed(prompt: str) -> int:
    """Stable uint32 seed from the prompt (SHA-256 → first 4 bytes)."""
    digest = hashlib.sha256((prompt or "").encode("utf-8")).digest()
    return int.from_bytes(digest[:4], "big")


def _find_node(node_path: str) -> str | None:
    """Resolve the node binary. Absolute/relative path is checked directly."""
    if not node_path:
        return None
    p = Path(node_path)
    if p.is_absolute() or os.sep in node_path or (os.altsep and os.altsep in node_path):
        return str(p) if p.is_file() else None
    return shutil.which(node_path)


def rt4d_availability(settings: Settings) -> dict[str, Any]:
    """Cheap, no-subprocess check of node + script presence for /health."""
    node_resolved = _find_node(settings.rt4d_node_path)
    script_path = settings.resolved_rt4d_script
    script_found = Path(script_path).is_file()
    node_found = node_resolved is not None
    return {
        "available": bool(node_found and script_found),
        "node_path": settings.rt4d_node_path,
        "node_found": node_found,
        "node_resolved": node_resolved,
        "script_path": script_path,
        "script_found": script_found,
        "render_size": [settings.rt4d_width, settings.rt4d_height],
        "samples": settings.rt4d_samples,
        "max_depth": settings.rt4d_max_depth,
        "timeout_seconds": settings.rt4d_timeout_seconds,
        # What /api/generate will actually run. render_size/samples/max_depth
        # above are the *final* profile; draft caps them so a profile sized for
        # a dev machine cannot exceed RT4D_TIMEOUT on a small shared instance.
        "quality_default": resolve_quality(settings),
        "quality_presets": quality_presets(settings),
        "effective_default": resolve_still_render_params(settings),
        "quality_note": (
            "POST /api/generate renders at quality_default (draft caps the "
            "RT4D_* profile at RT4D_DRAFT_*); pass quality=final for the full "
            "RT4D_* profile."
        ),
    }


def _run_render_cli(
    settings: Settings,
    prompt: str,
    seed: int,
    out_png: Path,
    params: dict[str, int],
) -> dict[str, Any]:
    """Invoke the node render-still CLI; return parsed provenance dict.

    ``params`` carries the quality-resolved width/height/samples/maxDepth.

    Raises ``RuntimeError(RT4D_SETUP_HELP)`` when node/script are missing
    (HTTP 503). Raises ``RT4DRenderError`` when the CLI env is present but the
    run fails, times out, or yields unusable output (HTTP 502).
    """
    node_resolved = _find_node(settings.rt4d_node_path)
    if node_resolved is None:
        raise RuntimeError(RT4D_SETUP_HELP)
    script_path = settings.resolved_rt4d_script
    if not Path(script_path).is_file():
        raise RuntimeError(RT4D_SETUP_HELP)

    # ``--`` end-of-options so a prompt that looks like a flag cannot be
    # mis-parsed by any future argv consumer; render-still's parseArgs also
    # treats value-taking options as always consuming the next token.
    argv = [
        node_resolved,
        script_path,
        "--",
        "--prompt",
        prompt,
        "--seed",
        str(seed),
        "--width",
        str(params["width"]),
        "--height",
        str(params["height"]),
        "--samples",
        str(params["samples"]),
        "--max-depth",
        str(params["maxDepth"]),
        "--output",
        str(out_png),
    ]
    try:
        proc = subprocess.run(  # noqa: S603 — fixed argv, no shell
            argv,
            capture_output=True,
            text=True,
            timeout=settings.rt4d_timeout_seconds,
            check=False,
        )
    except FileNotFoundError as exc:
        raise RuntimeError(RT4D_SETUP_HELP) from exc
    except subprocess.TimeoutExpired as exc:
        raise RT4DRenderError(
            f"RT4D render timed out after {settings.rt4d_timeout_seconds:.0f}s "
            f"(reduce RT4D_RENDER_WIDTH/HEIGHT/SAMPLES or raise RT4D_TIMEOUT)"
        ) from exc

    if proc.returncode != 0:
        stderr = (proc.stderr or "").strip()
        raise RT4DRenderError(
            f"RT4D render CLI failed (exit {proc.returncode}): {stderr[:600]}"
        )

    stdout = (proc.stdout or "").strip()
    provenance: dict[str, Any] = {}
    for line in reversed(stdout.splitlines()):
        line = line.strip()
        if line.startswith("{") and line.endswith("}"):
            try:
                provenance = json.loads(line)
                break
            except json.JSONDecodeError:
                continue
    if not provenance:
        logger.warning("RT4D CLI produced no parseable provenance JSON: %s", stdout[:300])
    return provenance


def _build_manifest(
    *,
    run_id: str,
    prompt: str,
    created_at: str,
    sha256: str,
    provenance: dict[str, Any],
    asset_key: str,
    quality: str,
) -> dict[str, Any]:
    return {
        "run_id": run_id,
        "prompt": prompt,
        "model": RT4D_MODEL_ID,
        "provider": RT4D_PROVIDER_ID,
        "created_at": created_at,
        "asset_key": asset_key,
        "asset_sha256": sha256,
        "quality": quality,
        "kind": "deterministic-procedural-4d-render",
        "note": (
            "Deterministic RT4D path-traced still from procedural scene selection. "
            "NOT text-to-image / not diffusion. Same prompt+seed → identical PNG."
        ),
        "render": provenance,
    }


def generate_image_rt4d(
    settings: Settings, prompt: str, quality: str | None = None
) -> GenerateResult:
    """Render a deterministic RT4D still and persist it via the Genblaze paths.

    ``quality`` is ``draft`` (default — caps the render at ``RT4D_DRAFT_*`` so a
    CPU path trace finishes well inside ``RT4D_TIMEOUT``) or ``final`` (the full
    ``RT4D_*`` profile). Unset falls back to ``GENBLAZE_RENDER_QUALITY_DEFAULT``.

    Live mode does not require any external API key. When B2 is configured the
    PNG + manifest are uploaded and a presigned preview is returned; otherwise
    the render stays local and is served from the same-origin preview cache.
    """
    cleaned = (prompt or "").strip()
    if not cleaned:
        raise ValueError("prompt is required")

    run_id = str(uuid.uuid4())
    created_at = _utc_now()
    seed = _derive_seed(cleaned)
    resolved_quality = resolve_quality(settings, quality)
    params = resolve_still_render_params(settings, resolved_quality)

    tmp_root = Path(tempfile.gettempdir()) / "mrs-genblaze-rt4d"
    tmp_root.mkdir(parents=True, exist_ok=True)
    work = Path(tempfile.mkdtemp(prefix="run-", dir=str(tmp_root)))
    out_png = work / "render.png"
    try:
        provenance = _run_render_cli(settings, cleaned, seed, out_png, params)
        if not out_png.is_file():
            raise RT4DRenderError("RT4D render produced no output file")
        png = out_png.read_bytes()
    finally:
        shutil.rmtree(work, ignore_errors=True)

    if not png:
        raise RT4DRenderError("RT4D render produced an empty file")

    assessment = assess_image_bytes(png)
    if not assessment.ok:
        raise GenerationQualityError(
            f"RT4D render failed quality check: {assessment.reason}"
        )

    sha256 = hashlib.sha256(png).hexdigest()
    # Cross-check the CLI-reported digest; the PNG we read is authoritative.
    if provenance.get("sha256") and provenance["sha256"] != sha256:
        logger.warning(
            "RT4D provenance sha256 %s != recomputed %s (using recomputed)",
            provenance.get("sha256"),
            sha256,
        )
    provenance = {
        **provenance,
        "sha256": sha256,
        "seed": seed,
        "quality": resolved_quality,
        "requested_output": dict(params),
    }

    asset_key = f"{settings.storage_prefix}/rt4d/{run_id}/render.png"
    manifest_key = f"{settings.storage_prefix}/rt4d/{run_id}/manifest.json"
    manifest = _build_manifest(
        run_id=run_id,
        prompt=cleaned,
        created_at=created_at,
        sha256=sha256,
        provenance=provenance,
        asset_key=asset_key,
        quality=resolved_quality,
    )

    quality = {
        "ok": assessment.ok,
        "byte_len": assessment.byte_len,
        "width": assessment.width,
        "height": assessment.height,
        "mean_luminance": assessment.mean_luminance,
        "unique_colors": assessment.unique_colors,
        "format": assessment.format,
    }

    if not settings.b2_configured:
        gen = GenerateResult(
            run_id=run_id,
            prompt=cleaned,
            model=RT4D_MODEL_ID,
            provider=RT4D_PROVIDER_ID,
            status="ok",
            asset_key=asset_key,
            manifest_key=manifest_key,
            asset_sha256=sha256,
            preview_url=None,
            created_at=created_at,
            dry_run=False,
            detail="B2 not configured; RT4D render stayed local-only (no upload).",
            quality=quality,
            provenance=provenance,
        )
        _attach_local_preview(gen, png)
        return gen

    backend = build_backend(settings)
    try:
        backend.put(asset_key, png, content_type="image/png")
        backend.put(
            manifest_key,
            json.dumps(manifest, indent=2).encode("utf-8"),
            content_type="application/json",
        )
        preview = _presign_preview(backend, settings, asset_key, None)
    finally:
        close = getattr(backend, "close", None)
        if callable(close):
            close()

    gen = GenerateResult(
        run_id=run_id,
        prompt=cleaned,
        model=RT4D_MODEL_ID,
        provider=RT4D_PROVIDER_ID,
        status="ok",
        asset_key=asset_key,
        manifest_key=manifest_key,
        asset_sha256=sha256,
        preview_url=preview,
        created_at=created_at,
        dry_run=False,
        quality=quality,
        provenance=provenance,
    )
    _attach_local_preview(gen, png)
    return gen
