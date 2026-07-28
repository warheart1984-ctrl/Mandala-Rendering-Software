"""Genblaze proton soft-splat provider (subprocess → render-proton-splat.mjs).

STATUS: **enforced** for mocked subprocess / availability shape;
**partial** for live Node-in-Docker (script + node must exist).

Out-of-process only: invoke renderer-core ``render-proton-splat.mjs`` via
subprocess when ``PROTON_RASTER_ENABLED=1``. Does not modify triangle
soft-raster paths. No narrative-lane package imports under this module.

Declared env:
  PROTON_RASTER_ENABLED (default off)
  PROTON_RASTER_SCRIPT / PROTON_RASTER_SCRIPT_PATH
  PROTON_RASTER_TIMEOUT_SECONDS
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

PROTON_RASTER_PROVIDER_ID = "proton-raster"
PROTON_RASTER_MODEL_ID = "mrs-renderer-core/proton-splat"
PROTON_RASTER_KIND = "proton-raster-still"

PROTON_RASTER_SETUP_HELP = (
    "Proton soft-splat CPU MVP is enforced via Node CLI "
    "(mrs/packages/renderer-core/scripts/render-proton-splat.mjs). "
    "Genblaze host: set PROTON_RASTER_ENABLED=1; requires Node on PATH. "
    "Live Node-in-Docker remains partial until the image bundles renderer-core + node. "
    "Default: disabled. Sibling path to Engine3D triangle soft-raster; "
    "CIR is a thin IntentRecord overlay."
)


def proton_raster_default_script_path(repo_root: Path = REPO_ROOT) -> Path:
    """Monorepo / Docker path to render-proton-splat.mjs (not legacy softSplat)."""
    monorepo = (
        repo_root
        / "mrs"
        / "packages"
        / "renderer-core"
        / "scripts"
        / "render-proton-splat.mjs"
    )
    if monorepo.is_file():
        return monorepo
    docker = APP_DIR / "renderer-core" / "scripts" / "render-proton-splat.mjs"
    if docker.is_file():
        return docker
    return monorepo


def proton_raster_availability(settings: Settings) -> dict[str, Any]:
    """Cheap /health-shaped probe — no subprocess. Disabled by default."""
    enabled = bool(getattr(settings, "proton_raster_enabled", False))
    script = Path(
        getattr(settings, "proton_raster_script_path", None)
        or getattr(settings, "resolved_proton_raster_script", None)
        or proton_raster_default_script_path()
    )
    if hasattr(settings, "resolved_proton_raster_script"):
        script = Path(settings.resolved_proton_raster_script)
    node_resolved = _find_node(getattr(settings, "rt4d_node_path", None))
    script_exists = script.is_file()
    available = bool(enabled and script_exists and node_resolved)
    return {
        "provider": PROTON_RASTER_PROVIDER_ID,
        "enabled": enabled,
        "available": available,
        "script_path": str(script),
        "script_exists": script_exists,
        "node_found": node_resolved is not None,
        "timeout_seconds": float(
            getattr(settings, "proton_raster_timeout_seconds", 120.0)
        ),
        "setup_help": PROTON_RASTER_SETUP_HELP,
        "endpoint": "/api/proton-raster" if enabled else None,
        "status": "enforced" if available else "partial",
        "note": (
            "POST /api/proton-raster runs six-mod proton soft-splat (beauty+AOVs) "
            "via Node subprocess when enabled. "
            + ("" if available else PROTON_RASTER_SETUP_HELP)
        ),
    }


class ProtonRasterError(Exception):
    """CLI present but proton raster failed."""


def _run_proton_cli(
    settings: Settings,
    *,
    out_dir: Path,
    width: int,
    height: int,
    mode: str,
    scene_spec_path: str | None,
    aov_depth: bool,
    aov_normal: bool,
    seed: str | None,
) -> dict[str, Any]:
    node = _find_node(getattr(settings, "rt4d_node_path", None))
    if node is None:
        raise RuntimeError(PROTON_RASTER_SETUP_HELP)
    script = Path(
        getattr(settings, "resolved_proton_raster_script", None)
        or settings.proton_raster_script_path
        or proton_raster_default_script_path()
    )
    if not script.is_file():
        raise RuntimeError(PROTON_RASTER_SETUP_HELP)

    aov_parts: list[str] = []
    if aov_depth:
        aov_parts.append("depth")
    if aov_normal:
        aov_parts.append("normal")
    aov = ",".join(aov_parts) if aov_parts else "none"

    argv = [
        node,
        str(script),
        "--width",
        str(width),
        "--height",
        str(height),
        "--out-dir",
        str(out_dir),
        "--aov",
        aov,
    ]
    if seed:
        argv.extend(["--seed", str(seed)])

    if mode == "star-demo":
        argv.append("--star-demo")
    elif mode == "lattice-demo":
        argv.append("--lattice-demo")
    elif mode == "scene-spec" and scene_spec_path:
        argv.extend(["--scene-spec", scene_spec_path])
    else:
        argv.append("--demo")

    timeout = float(getattr(settings, "proton_raster_timeout_seconds", 120.0))
    try:
        proc = subprocess.run(
            argv,
            capture_output=True,
            text=True,
            timeout=timeout,
            cwd=str(script.parent.parent),
            env={**os.environ},
            check=False,
        )
    except subprocess.TimeoutExpired as exc:
        raise ProtonRasterError(f"proton raster timed out after {timeout}s") from exc

    if proc.returncode != 0:
        err = (proc.stderr or proc.stdout or "no output")[:800]
        raise ProtonRasterError(f"proton raster failed (exit {proc.returncode}): {err}")

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
        raise ProtonRasterError(
            f"proton raster produced no JSON: {(proc.stdout or '')[:300]}"
        )
    return provenance


def run_proton_raster(
    request: dict[str, Any],
    settings: Settings,
) -> dict[str, Any]:
    """Run proton raster subprocess; return paths + evidence dict."""
    if not getattr(settings, "proton_raster_enabled", False):
        raise RuntimeError(
            "Proton raster is disabled (PROTON_RASTER_ENABLED=0). "
            "Set PROTON_RASTER_ENABLED=1 to enable."
        )

    width = int(request.get("width") or 256)
    height = int(request.get("height") or 256)
    width = max(8, min(1024, width))
    height = max(8, min(1024, height))
    mode = str(request.get("mode") or "demo")
    aov_depth = bool(request.get("aov_depth", True))
    aov_normal = bool(request.get("aov_normal", True))
    seed = request.get("seed")
    scene_spec = request.get("scene_spec")
    scene_spec_path = request.get("scene_spec_path")

    tmp_root = Path(tempfile.gettempdir()) / "mrs-genblaze-proton"
    tmp_root.mkdir(parents=True, exist_ok=True)
    work = Path(tempfile.mkdtemp(prefix="proton-", dir=str(tmp_root)))
    try:
        if scene_spec is not None and not scene_spec_path:
            spec_path = work / "scene-spec.json"
            spec_path.write_text(
                json.dumps(scene_spec, indent=2),
                encoding="utf-8",
            )
            scene_spec_path = str(spec_path)
            mode = "scene-spec"

        provenance = _run_proton_cli(
            settings,
            out_dir=work,
            width=width,
            height=height,
            mode=mode,
            scene_spec_path=scene_spec_path,
            aov_depth=aov_depth,
            aov_normal=aov_normal,
            seed=str(seed) if seed is not None else None,
        )

        beauty = Path(str(provenance.get("beautyPath") or provenance.get("pngPath") or ""))
        if not beauty.is_file():
            candidates = list(work.rglob("beauty.png"))
            if not candidates:
                raise ProtonRasterError("proton raster produced no beauty.png")
            beauty = candidates[0]

        evidence_path = work / "evidence.json"
        evidence: dict[str, Any] = {}
        if evidence_path.is_file():
            try:
                evidence = json.loads(evidence_path.read_text(encoding="utf-8"))
            except json.JSONDecodeError:
                evidence = {}
        if not evidence and isinstance(provenance.get("evidence"), dict):
            evidence = provenance["evidence"]

        return {
            "beauty_path": str(beauty),
            "depth_path": provenance.get("depthPath"),
            "normal_path": provenance.get("normalPath"),
            "evidence_path": str(evidence_path) if evidence_path.is_file() else None,
            "evidence": evidence,
            "proton_count": provenance.get("protonCount"),
            "cli": provenance,
            "work_dir": str(work),
        }
    except Exception:
        shutil.rmtree(work, ignore_errors=True)
        raise


def generate_proton_raster(
    settings: Settings,
    *,
    width: int = 256,
    height: int = 256,
    mode: str = "demo",
    aov_depth: bool = True,
    aov_normal: bool = True,
    seed: str | None = None,
    scene_spec: dict[str, Any] | None = None,
) -> GenerateResult:
    """Render proton still and persist via Genblaze preview cache / optional B2."""
    run_id = str(uuid.uuid4())
    created_at = _utc_now()
    request: dict[str, Any] = {
        "width": width,
        "height": height,
        "mode": mode,
        "aov_depth": aov_depth,
        "aov_normal": aov_normal,
        "seed": seed,
    }
    if scene_spec is not None:
        request["scene_spec"] = scene_spec

    result = run_proton_raster(request, settings)
    work = Path(str(result.get("work_dir") or ""))
    try:
        beauty_path = Path(str(result["beauty_path"]))
        png = beauty_path.read_bytes()
    finally:
        if work.is_dir():
            shutil.rmtree(work, ignore_errors=True)

    if not png:
        raise ProtonRasterError("proton raster produced empty beauty.png")

    sha256 = hashlib.sha256(png).hexdigest()
    asset_key = f"{settings.storage_prefix}/proton-raster/{run_id}/beauty.png"
    manifest_key = f"{settings.storage_prefix}/proton-raster/{run_id}/manifest.json"
    evidence = result.get("evidence") if isinstance(result.get("evidence"), dict) else {}
    manifest = {
        "run_id": run_id,
        "model": PROTON_RASTER_MODEL_ID,
        "provider": PROTON_RASTER_PROVIDER_ID,
        "kind": PROTON_RASTER_KIND,
        "created_at": created_at,
        "asset_key": asset_key,
        "asset_sha256": sha256,
        "proton_count": result.get("proton_count"),
        "evidence": evidence,
        "note": (
            "Proton six-mod soft-splat still. Sibling to Engine3D triangle "
            "soft-raster; not photoreal diffusion."
        ),
    }

    put_preview(APP_DIR, run_id, png)

    if not settings.b2_configured:
        gen = GenerateResult(
            run_id=run_id,
            prompt=f"proton-raster:{mode}",
            model=PROTON_RASTER_MODEL_ID,
            provider=PROTON_RASTER_PROVIDER_ID,
            status="ok",
            asset_key=asset_key,
            manifest_key=manifest_key,
            asset_sha256=sha256,
            preview_url=None,
            created_at=created_at,
            dry_run=False,
            detail="B2 not configured; proton raster stayed local-only.",
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
        prompt=f"proton-raster:{mode}",
        model=PROTON_RASTER_MODEL_ID,
        provider=PROTON_RASTER_PROVIDER_ID,
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
