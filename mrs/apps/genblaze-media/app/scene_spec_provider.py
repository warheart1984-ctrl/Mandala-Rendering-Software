"""SceneSpecification → RT4D still via render-scene.mjs (Genblaze hackathon path).

HONEST SCOPE (Drive-G-1):
    LLM/tool supplies a SceneSpecification JSON. This provider validates via the
    Node CLI (which uses renderer-core/scene-spec), path-traces a deterministic
    PNG, then uploads PNG + SHA-256 manifest to B2 (or local preview) under
    ``{prefix}/scene-spec/{run_id}/``. Not text-to-image / not diffusion / no MP4.
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
import zipfile
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
    apply_quality_to_output,
    quality_presets,
    resolve_quality,
)
from app.rt4d_provider import RT4DRenderError, _find_node

logger = logging.getLogger(__name__)

SCENE_SPEC_MODEL_ID = "mrs-renderer-core/scene-spec"
SCENE_SPEC_PROVIDER_ID = "scene-spec-render"

SCENE_SPEC_SETUP_HELP = (
    "Scene-spec render needs Node.js and renderer-core scripts/render-scene.mjs. "
    "Install Node 18+ (set RT4D_NODE_PATH if needed) and ensure the monorepo "
    "script is present (set SCENE_SPEC_SCRIPT_PATH to override)."
)


def scene_spec_availability(settings: Settings) -> dict[str, Any]:
    """Cheap check of node + render-scene.mjs for /health."""
    node_resolved = _find_node(settings.rt4d_node_path)
    script_path = settings.resolved_scene_spec_script
    script_found = Path(script_path).is_file()
    node_found = node_resolved is not None
    return {
        "available": bool(node_found and script_found),
        "node_path": settings.rt4d_node_path,
        "node_found": node_found,
        "node_resolved": node_resolved,
        "script_path": script_path,
        "script_found": script_found,
        "timeout_seconds": settings.rt4d_timeout_seconds,
        "quality_default": resolve_quality(settings),
        "quality_presets": quality_presets(settings),
        "quality_note": (
            "draft (default) caps output at the draft preset for fast CPU "
            "stills — smaller and noisier than final. quality=final keeps "
            "the RT4D_* profile."
        ),
        "note": (
            "Deterministic SceneSpecification → RT4D still. "
            "NOT text-to-image. Clip endpoint returns frame PNGs (no MP4)."
        ),
    }


def _run_scene_cli(
    settings: Settings,
    spec: dict[str, Any],
    out_png: Path,
    *,
    frame: int | None = None,
    time: float | None = None,
    quality: str | None = None,
) -> dict[str, Any]:
    """Invoke render-scene.mjs; return provenance dict.

    Raises RuntimeError(SCENE_SPEC_SETUP_HELP) → HTTP 503.
    Raises RT4DRenderError → HTTP 502.
    """
    node_resolved = _find_node(settings.rt4d_node_path)
    if node_resolved is None:
        raise RuntimeError(SCENE_SPEC_SETUP_HELP)
    script_path = settings.resolved_scene_spec_script
    if not Path(script_path).is_file():
        raise RuntimeError(SCENE_SPEC_SETUP_HELP)

    spec_path = out_png.parent / "spec.json"
    # Apply the quality preset before the subprocess. Draft (default) caps
    # output at the draft preset — overwrite, not setdefault — so NIM/heuristic
    # specs asking for 448/20/5 cannot force a multi-minute CPU render on the
    # default path. Final fills only missing fields from the RT4D_* profile.
    resolved_quality = resolve_quality(settings, quality)
    spec_out, applied_output = apply_quality_to_output(
        spec, settings, resolved_quality
    )
    # Write the quality-resolved spec (do not re-merge from the original —
    # that discarded draft clamps and re-sent 448/20 to the CLI).
    spec_path.write_text(json.dumps(spec_out), encoding="utf-8")

    argv = [
        node_resolved,
        script_path,
        "--",
        "--spec",
        str(spec_path),
        "--output",
        str(out_png),
    ]
    if frame is not None:
        argv.extend(["--frame", str(int(frame))])
    if time is not None:
        argv.extend(["--time", str(float(time))])

    try:
        proc = subprocess.run(  # noqa: S603
            argv,
            capture_output=True,
            text=True,
            timeout=settings.rt4d_timeout_seconds,
            check=False,
        )
    except FileNotFoundError as exc:
        raise RuntimeError(SCENE_SPEC_SETUP_HELP) from exc
    except subprocess.TimeoutExpired as exc:
        raise RT4DRenderError(
            f"Scene-spec render timed out after {settings.rt4d_timeout_seconds:.0f}s"
        ) from exc

    if proc.returncode != 0:
        stderr = (proc.stderr or "").strip()
        for line in (proc.stderr or "").splitlines():
            line = line.strip()
            if line.startswith("{") and '"errors"' in line:
                try:
                    payload = json.loads(line)
                except json.JSONDecodeError:
                    break
                if isinstance(payload, dict) and isinstance(payload.get("errors"), list):
                    raise ValueError(payload)
                break
        raise RT4DRenderError(
            f"Scene-spec render CLI failed (exit {proc.returncode}): {stderr[:600]}"
        )

    provenance: dict[str, Any] = {}
    for line in reversed((proc.stdout or "").splitlines()):
        line = line.strip()
        if line.startswith("{") and line.endswith("}"):
            try:
                provenance = json.loads(line)
                break
            except json.JSONDecodeError:
                continue
    provenance = {
        **provenance,
        "quality": resolved_quality,
        "output": applied_output,
    }
    return provenance


def _build_manifest(
    *,
    run_id: str,
    created_at: str,
    sha256: str,
    provenance: dict[str, Any],
    asset_key: str,
    spec_id: str | None,
) -> dict[str, Any]:
    return {
        "run_id": run_id,
        "spec_id": spec_id,
        "model": SCENE_SPEC_MODEL_ID,
        "provider": SCENE_SPEC_PROVIDER_ID,
        "created_at": created_at,
        "asset_key": asset_key,
        "asset_sha256": sha256,
        "kind": "deterministic-scene-spec-4d-render",
        "note": (
            "Deterministic RT4D path-traced still from SceneSpecification. "
            "NOT text-to-image / not diffusion. Same specHash+seed+frame → identical PNG."
        ),
        "render": provenance,
    }


def render_scene_spec(
    settings: Settings,
    spec: dict[str, Any],
    *,
    frame: int | None = None,
    time: float | None = None,
    storage_kind: str = "scene-spec",
    quality: str | None = None,
) -> GenerateResult:
    """Render one still from a SceneSpecification and persist via Genblaze paths.

    ``storage_kind`` selects the B2/local key segment (e.g. ``scene-spec`` or
    ``image-to-scene``). ``quality`` is ``draft`` (default) or ``final``.
    """
    if not isinstance(spec, dict):
        raise ValueError("spec must be a JSON object")

    kind_seg = (storage_kind or "scene-spec").strip().strip("/") or "scene-spec"
    # Keep keys path-safe (no traversal).
    if "/" in kind_seg or "\\" in kind_seg or ".." in kind_seg:
        kind_seg = "scene-spec"

    run_id = str(uuid.uuid4())
    created_at = _utc_now()
    spec_id = str(spec.get("id") or "unnamed")

    tmp_root = Path(tempfile.gettempdir()) / "mrs-genblaze-scene-spec"
    tmp_root.mkdir(parents=True, exist_ok=True)
    work = Path(tempfile.mkdtemp(prefix="run-", dir=str(tmp_root)))
    out_png = work / "render.png"
    try:
        provenance = _run_scene_cli(
            settings, spec, out_png, frame=frame, time=time, quality=quality
        )
        if not out_png.is_file():
            raise RT4DRenderError("Scene-spec render produced no output file")
        png = out_png.read_bytes()
    finally:
        shutil.rmtree(work, ignore_errors=True)

    if not png:
        raise RT4DRenderError("Scene-spec render produced an empty file")

    assessment = assess_image_bytes(png)
    if not assessment.ok:
        raise GenerationQualityError(
            f"Scene-spec render failed quality check: {assessment.reason}"
        )

    sha256 = hashlib.sha256(png).hexdigest()
    if provenance.get("sha256") and provenance["sha256"] != sha256:
        logger.warning(
            "Scene-spec provenance sha256 mismatch; using recomputed digest"
        )
    provenance = {**provenance, "sha256": sha256}

    asset_key = f"{settings.storage_prefix}/{kind_seg}/{run_id}/render.png"
    manifest_key = f"{settings.storage_prefix}/{kind_seg}/{run_id}/manifest.json"
    manifest = _build_manifest(
        run_id=run_id,
        created_at=created_at,
        sha256=sha256,
        provenance=provenance,
        asset_key=asset_key,
        spec_id=spec_id,
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

    prompt_label = f"scene-spec:{spec_id}"

    if not settings.b2_configured:
        gen = GenerateResult(
            run_id=run_id,
            prompt=prompt_label,
            model=SCENE_SPEC_MODEL_ID,
            provider=SCENE_SPEC_PROVIDER_ID,
            status="ok",
            asset_key=asset_key,
            manifest_key=manifest_key,
            asset_sha256=sha256,
            preview_url=None,
            created_at=created_at,
            dry_run=False,
            detail="B2 not configured; scene-spec render stayed local-only.",
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
        prompt=prompt_label,
        model=SCENE_SPEC_MODEL_ID,
        provider=SCENE_SPEC_PROVIDER_ID,
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


def render_scene_clip(
    settings: Settings,
    spec: dict[str, Any],
    *,
    max_frames: int = 24,
    quality: str | None = None,
) -> dict[str, Any]:
    """Sample animation timeline → PNG frame sequence (+ zip). No MP4 encoding.

    Status: **partial** — returns frame list / zip bytes path; no video codec.
    """
    anim = spec.get("animation")
    if not isinstance(anim, dict):
        raise ValueError("spec.animation is required for render-clip")

    duration = float(anim.get("duration") or 0)
    fps = float(anim.get("fps") or 12)
    frame_count = min(max_frames, max(1, int(duration * fps) + 1))

    run_id = str(uuid.uuid4())
    created_at = _utc_now()
    spec_id = str(spec.get("id") or "unnamed")

    tmp_root = Path(tempfile.gettempdir()) / "mrs-genblaze-scene-clip"
    tmp_root.mkdir(parents=True, exist_ok=True)
    work = Path(tempfile.mkdtemp(prefix="clip-", dir=str(tmp_root)))
    frames_meta: list[dict[str, Any]] = []
    try:
        for i in range(frame_count):
            out_png = work / f"frame_{i:04d}.png"
            provenance = _run_scene_cli(
                settings, spec, out_png, frame=i, quality=quality
            )
            provenance = _run_scene_cli(settings, spec, out_png, frame=i)
            png = out_png.read_bytes()
            sha = hashlib.sha256(png).hexdigest()
            frames_meta.append(
                {
                    "frameIndex": i,
                    "sha256": sha,
                    "bytes": len(png),
                    "specHash": provenance.get("specHash"),
                    "timeSeconds": provenance.get("timeSeconds"),
                }
            )

        zip_path = work / "frames.zip"
        with zipfile.ZipFile(zip_path, "w", compression=zipfile.ZIP_DEFLATED) as zf:
            for i in range(frame_count):
                zf.write(work / f"frame_{i:04d}.png", arcname=f"frame_{i:04d}.png")
            zf.writestr(
                "manifest.json",
                json.dumps(
                    {
                        "run_id": run_id,
                        "spec_id": spec_id,
                        "frame_count": frame_count,
                        "frames": frames_meta,
                        "note": "Frame sequence only — MP4 encoding not available in-image.",
                    },
                    indent=2,
                ),
            )
        zip_bytes = zip_path.read_bytes()
    finally:
        # Keep zip bytes; wipe work after upload prep
        pass

    zip_sha = hashlib.sha256(zip_bytes).hexdigest()
    asset_key = f"{settings.storage_prefix}/scene-spec/{run_id}/frames.zip"
    manifest_key = f"{settings.storage_prefix}/scene-spec/{run_id}/clip-manifest.json"
    manifest = {
        "run_id": run_id,
        "spec_id": spec_id,
        "model": SCENE_SPEC_MODEL_ID,
        "provider": SCENE_SPEC_PROVIDER_ID,
        "created_at": created_at,
        "asset_key": asset_key,
        "asset_sha256": zip_sha,
        "kind": "deterministic-scene-spec-frame-sequence",
        "frame_count": frame_count,
        "frames": frames_meta,
        "note": "PNG frame zip — MP4 encoding is NOT available in this service image.",
    }

    result: dict[str, Any] = {
        "run_id": run_id,
        "status": "ok",
        "provider": SCENE_SPEC_PROVIDER_ID,
        "model": SCENE_SPEC_MODEL_ID,
        "frame_count": frame_count,
        "frames": frames_meta,
        "asset_key": asset_key,
        "manifest_key": manifest_key,
        "asset_sha256": zip_sha,
        "created_at": created_at,
        "note": manifest["note"],
    }

    if settings.b2_configured:
        backend = build_backend(settings)
        try:
            backend.put(asset_key, zip_bytes, content_type="application/zip")
            backend.put(
                manifest_key,
                json.dumps(manifest, indent=2).encode("utf-8"),
                content_type="application/json",
            )
            result["preview_url"] = _presign_preview(backend, settings, asset_key, None)
        finally:
            close = getattr(backend, "close", None)
            if callable(close):
                close()
    else:
        # Local: write zip under preview cache dir for operator retrieval
        local_dir = Path(os.environ.get("GENBLAZE_PREVIEW_CACHE_DIR") or (tmp_root / "local"))
        local_dir.mkdir(parents=True, exist_ok=True)
        local_zip = local_dir / f"{run_id}-frames.zip"
        local_zip.write_bytes(zip_bytes)
        result["local_zip"] = str(local_zip)
        result["detail"] = "B2 not configured; clip zip stayed local-only."

    shutil.rmtree(work, ignore_errors=True)
    return result
