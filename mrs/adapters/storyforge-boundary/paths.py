"""Dual-layout path resolution for StoryForge→MRS pipeline scripts.

Layouts:
  * Monorepo: ``<repo>/mrs/packages/...``, ``<repo>/mrs/adapters/...``
  * Docker (repo-root image): ``/app/renderer-core``, ``/app/proton-raster-bridge``,
    ``/app/storyforge-boundary``, ``/app/engine3d-core``

Status: **partial** — resolution helpers; not a runtime authority gate.
"""

from __future__ import annotations

import os
import shutil
from pathlib import Path

_ADAPTER_DIR = Path(__file__).resolve().parent


def repo_root() -> Path:
    """Best-effort monorepo root; falls back to adapter parent (/app in Docker)."""
    # mrs/adapters/storyforge-boundary → parents[2] = repo root
    candidate = _ADAPTER_DIR.parents[2] if len(_ADAPTER_DIR.parents) > 2 else _ADAPTER_DIR.parent
    if (candidate / "mrs" / "adapters").is_dir():
        return candidate
    # Docker flattened: /app/storyforge-boundary → /app
    if (_ADAPTER_DIR.parent / "renderer-core").is_dir():
        return _ADAPTER_DIR.parent
    return candidate


def find_node(explicit: str | None = None) -> str | None:
    cand = explicit or os.environ.get("RT4D_NODE_PATH") or os.environ.get("NODE_PATH_BIN")
    if cand:
        p = Path(cand)
        if p.is_file():
            return str(p)
        # Allow bare "node" when which works
        if cand == "node":
            return shutil.which("node")
    return shutil.which("node")


def _first_existing(*candidates: Path) -> Path | None:
    for p in candidates:
        if p.is_file():
            return p
    return None


def render_scene_script() -> Path | None:
    env = os.environ.get("SCENE_SPEC_SCRIPT_PATH")
    if env:
        p = Path(env)
        return p if p.is_file() else None
    root = repo_root()
    return _first_existing(
        root / "mrs" / "packages" / "renderer-core" / "scripts" / "render-scene.mjs",
        root / "renderer-core" / "scripts" / "render-scene.mjs",
        Path("/app/renderer-core/scripts/render-scene.mjs"),
        _ADAPTER_DIR.parents[1] / "packages" / "renderer-core" / "scripts" / "render-scene.mjs",
    )


def render_still_script() -> Path | None:
    env = os.environ.get("RT4D_SCRIPT_PATH")
    if env:
        p = Path(env)
        return p if p.is_file() else None
    root = repo_root()
    return _first_existing(
        root / "mrs" / "packages" / "renderer-core" / "scripts" / "render-still.mjs",
        root / "renderer-core" / "scripts" / "render-still.mjs",
        Path("/app/renderer-core/scripts/render-still.mjs"),
    )


def proton_pipeline_script() -> Path | None:
    env = os.environ.get("PROTON_PIPELINE_SCRIPT")
    if env:
        p = Path(env)
        return p if p.is_file() else None
    root = repo_root()
    return _first_existing(
        root / "mrs" / "adapters" / "proton-raster-bridge" / "run_proton_pipeline.mjs",
        root / "proton-raster-bridge" / "run_proton_pipeline.mjs",
        Path("/app/proton-raster-bridge/run_proton_pipeline.mjs"),
        _ADAPTER_DIR.parent / "proton-raster-bridge" / "run_proton_pipeline.mjs",
    )


def proton_splat_script() -> Path | None:
    """HQ six-mod proton CLI (beauty + depth/normal AOVs)."""
    env = os.environ.get("PROTON_SPLAT_SCRIPT")
    if env:
        p = Path(env)
        return p if p.is_file() else None
    root = repo_root()
    return _first_existing(
        root / "mrs" / "packages" / "renderer-core" / "scripts" / "render-proton-splat.mjs",
        root / "renderer-core" / "scripts" / "render-proton-splat.mjs",
        Path("/app/renderer-core/scripts/render-proton-splat.mjs"),
        _ADAPTER_DIR.parents[1]
        / "packages"
        / "renderer-core"
        / "scripts"
        / "render-proton-splat.mjs",
    )


def engine3d_still_script() -> Path | None:
    env = os.environ.get("ENGINE3D_STILL_SCRIPT_PATH")
    if env:
        p = Path(env)
        return p if p.is_file() else None
    root = repo_root()
    return _first_existing(
        root / "mrs" / "packages" / "engine3d-core" / "scripts" / "render-engine3d-still.mjs",
        root / "engine3d-core" / "scripts" / "render-engine3d-still.mjs",
        Path("/app/engine3d-core/scripts/render-engine3d-still.mjs"),
    )


def worlddocument_rt4d_script() -> Path | None:
    env = os.environ.get("RT4D_WORLD_SCRIPT_PATH")
    if env:
        p = Path(env)
        return p if p.is_file() else None
    root = repo_root()
    return _first_existing(
        root
        / "mrs"
        / "packages"
        / "renderer-core"
        / "scripts"
        / "render-worlddocument-rt4d.mjs",
        root / "renderer-core" / "scripts" / "render-worlddocument-rt4d.mjs",
        Path("/app/renderer-core/scripts/render-worlddocument-rt4d.mjs"),
    )


def default_output_dir() -> Path:
    env = os.environ.get("MRS_RENDER_OUTPUT_DIR")
    if env:
        return Path(env)
    root = repo_root()
    if (root / "mrs").is_dir():
        return root / "output"
    if (root / "data").is_dir():
        return root / "data" / "output"
    return root / "output"
