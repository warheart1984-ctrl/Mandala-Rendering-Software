"""Engine3D structure still provider for Genblaze.

Bridges Python (FastAPI) → engine3d-core ``render-engine3d-still.mjs`` via
subprocess, then stores beauty PNG in the preview cache / optional B2.

Drive-G-1:
    Structure pass = Engine3D soft-raster (triangles). NOT RT4D sphere-bridge
    and NOT photoreal skin. Optional polish is a separate diffusion step.
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

ENGINE3D_STILL_MODEL_ID = "mrs-engine3d-core/soft-raster"
ENGINE3D_STILL_PROVIDER_ID = "engine3d-still"
ENGINE3D_STILL_KIND = "engine3d-structure-still"

ENGINE3D_STILL_SETUP_HELP = (
    "Engine3D still needs Node.js and engine3d-core scripts/render-engine3d-still.mjs "
    "(after npm run build in mrs/packages/engine3d-core). "
    "Set ENGINE3D_STILL_SCRIPT_PATH to override. Soft-raster CPU path — no WebGPU required."
)


class Engine3dStillError(Exception):
    """CLI present but still render failed."""


def engine3d_still_default_script_path(repo_root: Path = REPO_ROOT) -> Path:
    monorepo = (
        repo_root
        / "mrs"
        / "packages"
        / "engine3d-core"
        / "scripts"
        / "render-engine3d-still.mjs"
    )
    if monorepo.is_file():
        return monorepo
    docker = APP_DIR / "engine3d-core" / "scripts" / "render-engine3d-still.mjs"
    if docker.is_file():
        return docker
    return monorepo


def engine3d_still_availability(settings: Settings) -> dict[str, Any]:
    """Cheap /health probe — no subprocess."""
    node_resolved = _find_node(settings.rt4d_node_path)
    script = Path(settings.resolved_engine3d_still_script)
    # Dist module required by the CLI.
    dist_mod = script.parent.parent / "dist" / "src" / "scene" / "renderEngine3dStill.js"
    if not dist_mod.is_file():
        # Docker layout may nest differently
        alt = APP_DIR / "engine3d-core" / "dist" / "src" / "scene" / "renderEngine3dStill.js"
        dist_found = alt.is_file()
    else:
        dist_found = True
    enabled = bool(getattr(settings, "engine3d_still_enabled", True))
    available = bool(enabled and node_resolved and script.is_file() and dist_found)
    return {
        "available": available,
        "enabled": enabled,
        "node_found": node_resolved is not None,
        "script_path": str(script),
        "script_found": script.is_file(),
        "dist_found": dist_found,
        "timeout_seconds": float(getattr(settings, "engine3d_still_timeout_seconds", 120.0)),
        "note": (
            "POST /api/engine3d-still renders Engine3D triangle structure (beauty+AOVs). "
            "Optional polish via existing img2img path. NOT RT4D sphere-bridge for faces. "
            + ("" if available else ENGINE3D_STILL_SETUP_HELP)
        ),
    }


def _run_still_cli(
    settings: Settings,
    *,
    out_dir: Path,
    width: int,
    height: int,
    aov_depth: bool,
    aov_normal: bool,
    world_path: str | None,
    human_glb: str | None,
) -> dict[str, Any]:
    node = _find_node(settings.rt4d_node_path)
    if node is None:
        raise RuntimeError(ENGINE3D_STILL_SETUP_HELP)
    script = Path(settings.resolved_engine3d_still_script)
    if not script.is_file():
        raise RuntimeError(ENGINE3D_STILL_SETUP_HELP)

    aov_parts = []
    if aov_depth:
        aov_parts.append("depth")
    if aov_normal:
        aov_parts.append("normal")
    aov = ",".join(aov_parts) if aov_parts else "none"

    argv = [
        node,
        str(script),
        "--engine3d-still",
        "--out-dir",
        str(out_dir),
        "--width",
        str(width),
        "--height",
        str(height),
        "--aov",
        aov,
    ]
    if world_path:
        argv.extend(["--world", world_path])
    if human_glb:
        argv.extend(["--human-glb", human_glb])

    timeout = float(getattr(settings, "engine3d_still_timeout_seconds", 120.0))
    try:
        proc = subprocess.run(
            argv,
            capture_output=True,
            text=True,
            timeout=timeout,
            cwd=str(script.parent.parent),
            env={**os.environ, "ENGINE3D_STILL": "1"},
            check=False,
        )
    except subprocess.TimeoutExpired as exc:
        raise Engine3dStillError(f"Engine3D still timed out after {timeout}s") from exc

    if proc.returncode != 0:
        err = (proc.stderr or proc.stdout or "no output")[:800]
        raise Engine3dStillError(f"Engine3D still failed (exit {proc.returncode}): {err}")

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
        raise Engine3dStillError(
            f"Engine3D still produced no provenance JSON: {(proc.stdout or '')[:300]}"
        )
    return provenance


def generate_engine3d_still(
    settings: Settings,
    *,
    width: int = 256,
    height: int = 256,
    aov_depth: bool = True,
    aov_normal: bool = True,
    world_path: str | None = None,
    human_glb: str | None = None,
) -> GenerateResult:
    """Render Engine3D structure still and persist via Genblaze paths."""
    if not getattr(settings, "engine3d_still_enabled", True):
        raise RuntimeError(
            "Engine3D still is disabled (ENGINE3D_STILL_ENABLED=0). "
            "Set ENGINE3D_STILL_ENABLED=1 to enable."
        )

    run_id = str(uuid.uuid4())
    created_at = _utc_now()
    tmp_root = Path(tempfile.gettempdir()) / "mrs-genblaze-engine3d"
    tmp_root.mkdir(parents=True, exist_ok=True)
    work = Path(tempfile.mkdtemp(prefix="e3d-", dir=str(tmp_root)))
    try:
        provenance = _run_still_cli(
            settings,
            out_dir=work,
            width=width,
            height=height,
            aov_depth=aov_depth,
            aov_normal=aov_normal,
            world_path=world_path,
            human_glb=human_glb,
        )
        # CLI nests under out_dir/<run_id>/beauty.png — use provenance paths.
        beauty_path = Path(str(provenance.get("beauty_path") or ""))
        if not beauty_path.is_file():
            # Fallback: search work tree
            candidates = list(work.rglob("beauty.png"))
            if not candidates:
                raise Engine3dStillError("Engine3D still produced no beauty.png")
            beauty_path = candidates[0]
        png = beauty_path.read_bytes()
        # Prefer CLI run_id when present so structure record matches.
        cli_run = provenance.get("run_id")
        if isinstance(cli_run, str) and cli_run.strip():
            run_id = cli_run.strip()
    finally:
        shutil.rmtree(work, ignore_errors=True)

    if not png:
        raise Engine3dStillError("Engine3D still produced empty beauty.png")

    sha256 = hashlib.sha256(png).hexdigest()
    asset_key = f"{settings.storage_prefix}/engine3d-still/{run_id}/beauty.png"
    manifest_key = f"{settings.storage_prefix}/engine3d-still/{run_id}/manifest.json"
    manifest = {
        "run_id": run_id,
        "model": ENGINE3D_STILL_MODEL_ID,
        "provider": ENGINE3D_STILL_PROVIDER_ID,
        "kind": ENGINE3D_STILL_KIND,
        "created_at": created_at,
        "asset_key": asset_key,
        "asset_sha256": sha256,
        "structure_source": provenance.get("structure_source") or "engine3d_raster",
        "structure_record": provenance,
        "note": (
            "Engine3D soft-raster structure still. NOT photoreal skin; "
            "NOT RT4D sphere-bridge. Optional polish is a separate diffusion step."
        ),
    }

    put_preview(APP_DIR, run_id, png)

    if not settings.b2_configured:
        gen = GenerateResult(
            run_id=run_id,
            prompt=f"engine3d-still:{provenance.get('world_id') or 'demo'}",
            model=ENGINE3D_STILL_MODEL_ID,
            provider=ENGINE3D_STILL_PROVIDER_ID,
            status="ok",
            asset_key=asset_key,
            manifest_key=manifest_key,
            asset_sha256=sha256,
            preview_url=None,
            created_at=created_at,
            dry_run=False,
            detail="B2 not configured; Engine3D still stayed local-only.",
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
        # Store AOV hashes in manifest only (paths were temp); beauty is enough for polish.
        preview = _presign_preview(backend, settings, asset_key, None)
    finally:
        close = getattr(backend, "close", None)
        if callable(close):
            close()

    gen = GenerateResult(
        run_id=run_id,
        prompt=f"engine3d-still:{provenance.get('world_id') or 'demo'}",
        model=ENGINE3D_STILL_MODEL_ID,
        provider=ENGINE3D_STILL_PROVIDER_ID,
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
