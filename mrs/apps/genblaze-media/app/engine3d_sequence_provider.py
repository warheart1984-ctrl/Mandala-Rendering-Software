"""Engine3D short cinematic sequence provider for Genblaze.

Bridges Python → engine3d-core ``render-engine3d-sequence.mjs``.

Drive-G-1:
    Structure frames = Engine3D soft-raster. NOT 8K film farm. NOT RT4D
    sphere-bridge for faces. Per-frame polish is opt-in and billed separately
    (not implemented in this provider — use still + polish for faces).
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

from app.config import APP_DIR, REPO_ROOT, Settings
from app.pipeline import (
    GenerateResult,
    _attach_local_preview,
    _presign_preview,
    _utc_now,
    build_backend,
)
from app.preview_cache import put_preview
from app.rt4d_provider import _find_node

logger = logging.getLogger(__name__)

ENGINE3D_SEQUENCE_MODEL_ID = "mrs-engine3d-core/soft-raster-sequence"
ENGINE3D_SEQUENCE_PROVIDER_ID = "engine3d-sequence"
ENGINE3D_SEQUENCE_KIND = "engine3d-cinematic-sequence"

ENGINE3D_SEQUENCE_SETUP_HELP = (
    "Engine3D sequence needs Node.js and engine3d-core "
    "scripts/render-engine3d-sequence.mjs (after npm run build). "
    "Set ENGINE3D_SEQUENCE_SCRIPT_PATH to override. Short clips only."
)


class Engine3dSequenceError(Exception):
    """CLI present but sequence render failed."""


def engine3d_sequence_default_script_path(repo_root: Path = REPO_ROOT) -> Path:
    monorepo = (
        repo_root
        / "mrs"
        / "packages"
        / "engine3d-core"
        / "scripts"
        / "render-engine3d-sequence.mjs"
    )
    if monorepo.is_file():
        return monorepo
    docker = APP_DIR / "engine3d-core" / "scripts" / "render-engine3d-sequence.mjs"
    if docker.is_file():
        return docker
    return monorepo


def engine3d_sequence_availability(settings: Settings) -> dict[str, Any]:
    node_resolved = _find_node(settings.rt4d_node_path)
    script = Path(settings.resolved_engine3d_sequence_script)
    dist_mod = (
        script.parent.parent / "dist" / "src" / "runtime" / "Engine3DCinematicRuntime.js"
    )
    if not dist_mod.is_file():
        alt = (
            APP_DIR
            / "engine3d-core"
            / "dist"
            / "src"
            / "runtime"
            / "Engine3DCinematicRuntime.js"
        )
        dist_found = alt.is_file()
    else:
        dist_found = True
    enabled = bool(getattr(settings, "engine3d_sequence_enabled", True))
    available = bool(enabled and node_resolved and script.is_file() and dist_found)
    return {
        "available": available,
        "enabled": enabled,
        "node_found": node_resolved is not None,
        "script_path": str(script),
        "script_found": script.is_file(),
        "dist_found": dist_found,
        "timeout_seconds": float(
            getattr(settings, "engine3d_sequence_timeout_seconds", 180.0)
        ),
        "max_frames": int(getattr(settings, "engine3d_sequence_max_frames", 24)),
        "note": (
            "POST /api/engine3d-sequence renders a short Engine3D soft-raster "
            "orbit sequence (structure AOVs). NOT 8K farm; NOT photoreal polish. "
            + ("" if available else ENGINE3D_SEQUENCE_SETUP_HELP)
        ),
    }


def _run_sequence_cli(
    settings: Settings,
    *,
    out_dir: Path,
    width: int,
    height: int,
    duration: float,
    fps: float,
) -> dict[str, Any]:
    node = _find_node(settings.rt4d_node_path)
    if node is None:
        raise RuntimeError(ENGINE3D_SEQUENCE_SETUP_HELP)
    script = Path(settings.resolved_engine3d_sequence_script)
    if not script.is_file():
        raise RuntimeError(ENGINE3D_SEQUENCE_SETUP_HELP)

    argv = [
        node,
        str(script),
        "--engine3d-sequence",
        "--out-dir",
        str(out_dir),
        "--width",
        str(width),
        "--height",
        str(height),
        "--duration",
        str(duration),
        "--fps",
        str(fps),
    ]
    timeout = float(getattr(settings, "engine3d_sequence_timeout_seconds", 180.0))
    try:
        proc = subprocess.run(
            argv,
            capture_output=True,
            text=True,
            timeout=timeout,
            cwd=str(script.parent.parent),
            env={**os.environ, "ENGINE3D_SEQUENCE": "1"},
            check=False,
        )
    except subprocess.TimeoutExpired as exc:
        raise Engine3dSequenceError(
            f"Engine3D sequence timed out after {timeout}s"
        ) from exc

    if proc.returncode != 0:
        err = (proc.stderr or proc.stdout or "no output")[:800]
        raise Engine3dSequenceError(
            f"Engine3D sequence failed (exit {proc.returncode}): {err}"
        )

    provenance: dict[str, Any] = {}
    for line in (proc.stdout or "").splitlines():
        line = line.strip()
        if not line.startswith("{"):
            continue
        try:
            provenance = json.loads(line)
        except json.JSONDecodeError:
            continue
    if not provenance:
        raise Engine3dSequenceError(
            f"Engine3D sequence produced no provenance JSON: {(proc.stdout or '')[:300]}"
        )
    return provenance


def generate_engine3d_sequence(
    settings: Settings,
    *,
    width: int = 64,
    height: int = 48,
    duration: float = 0.5,
    fps: float = 4.0,
) -> GenerateResult:
    """Render short Engine3D structure sequence; preview = first final frame."""
    if not getattr(settings, "engine3d_sequence_enabled", True):
        raise RuntimeError(
            "Engine3D sequence is disabled (ENGINE3D_SEQUENCE_ENABLED=0)."
        )

    max_frames = int(getattr(settings, "engine3d_sequence_max_frames", 24))
    est = max(1, int(round(duration * fps)))
    if est > max_frames:
        raise Engine3dSequenceError(
            f"Requested ~{est} frames exceeds max_frames={max_frames}. "
            "Lower duration/fps or raise ENGINE3D_SEQUENCE_MAX_FRAMES."
        )

    width = max(16, min(512, int(width)))
    height = max(16, min(512, int(height)))
    duration = max(0.1, min(5.0, float(duration)))
    fps = max(1.0, min(24.0, float(fps)))

    run_id = str(uuid.uuid4())
    created_at = _utc_now()
    tmp_root = Path(tempfile.gettempdir()) / "mrs-genblaze-engine3d-seq"
    tmp_root.mkdir(parents=True, exist_ok=True)
    work = Path(tempfile.mkdtemp(prefix="e3d-seq-", dir=str(tmp_root)))
    try:
        provenance = _run_sequence_cli(
            settings,
            out_dir=work,
            width=width,
            height=height,
            duration=duration,
            fps=fps,
        )
        frames = provenance.get("frames") or []
        if not frames:
            raise Engine3dSequenceError("sequence produced zero frames")
        first = frames[0]
        final_path = Path(str(first.get("final_path") or first.get("beauty_path") or ""))
        if not final_path.is_file():
            raise Engine3dSequenceError("first frame PNG missing")
        png = final_path.read_bytes()
        seq_id = provenance.get("sequence_id")
        if isinstance(seq_id, str) and seq_id.strip():
            run_id = seq_id.strip()
    finally:
        shutil.rmtree(work, ignore_errors=True)

    sha256 = hashlib.sha256(png).hexdigest()
    asset_key = f"{settings.storage_prefix}/engine3d-sequence/{run_id}/frame_0000_final.png"
    manifest_key = f"{settings.storage_prefix}/engine3d-sequence/{run_id}/sequence_record.json"
    manifest = {
        "run_id": run_id,
        "model": ENGINE3D_SEQUENCE_MODEL_ID,
        "provider": ENGINE3D_SEQUENCE_PROVIDER_ID,
        "kind": ENGINE3D_SEQUENCE_KIND,
        "created_at": created_at,
        "asset_key": asset_key,
        "asset_sha256": sha256,
        "structure_source": provenance.get("structure_source") or "engine3d_raster",
        "sequence_record": {
            k: v
            for k, v in provenance.items()
            if k not in {"frames"}  # paths were temp
        },
        "frame_count": provenance.get("frame_count"),
        "fps": provenance.get("fps"),
        "note": (
            "Engine3D soft-raster short sequence (first frame previewed). "
            "NOT photoreal; NOT 8K farm. Full frame set stayed local to CLI workdir."
        ),
    }

    put_preview(APP_DIR, run_id, png)

    if not settings.b2_configured:
        gen = GenerateResult(
            run_id=run_id,
            prompt=f"engine3d-sequence:{provenance.get('timeline_id') or 'demo-orbit'}",
            model=ENGINE3D_SEQUENCE_MODEL_ID,
            provider=ENGINE3D_SEQUENCE_PROVIDER_ID,
            status="ok",
            asset_key=asset_key,
            manifest_key=manifest_key,
            asset_sha256=sha256,
            preview_url=None,
            created_at=created_at,
            dry_run=False,
            detail="B2 not configured; Engine3D sequence stayed local-only.",
            provenance=manifest,
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
        prompt=f"engine3d-sequence:{provenance.get('timeline_id') or 'demo-orbit'}",
        model=ENGINE3D_SEQUENCE_MODEL_ID,
        provider=ENGINE3D_SEQUENCE_PROVIDER_ID,
        status="ok",
        asset_key=asset_key,
        manifest_key=manifest_key,
        asset_sha256=sha256,
        preview_url=preview,
        created_at=created_at,
        dry_run=False,
        provenance=manifest,
    )
    _attach_local_preview(gen, png)
    return gen
