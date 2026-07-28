"""Genblaze prompt → SceneSpecification / Engine3DWorldDocument provider.

Out-of-process only: invokes ``PROMPT_SCENE_BRIDGE_SCRIPT`` via subprocess.
Does not import Infinity narrative packages (CI bans those strings under app/).

Status: **enforced** for structured JSON + Genblaze health/POST wiring (tests).
Optional ``render=true`` uses existing SceneSpecification RT4D path (**partial**
when Node/script missing). Infinity narrative lane remains out-of-process only.
"""

from __future__ import annotations

import json
import logging
import os
import subprocess
import sys
from pathlib import Path
from typing import Any

from app.config import APP_DIR, REPO_ROOT, Settings
from app.pipeline import GenerationQualityError
from app.scene_spec_provider import render_scene_spec

logger = logging.getLogger(__name__)

PROMPT_SCENE_PROVIDER_ID = "prompt-scene-bridge"
PROMPT_SCENE_SETUP_HELP = (
    "Prompt→scene bridge needs Python and run_bridge.py "
    "(monorepo mrs/adapters/prompt-scene-bridge/ or Docker /app/prompt-scene-bridge/). "
    "Set PROMPT_SCENE_BRIDGE_ENABLED=1 and optionally PROMPT_SCENE_BRIDGE_SCRIPT / "
    "INFINITY_STORY_SRC for the full Infinity narrative lane."
)


class PromptSceneBridgeError(Exception):
    """Bridge CLI present but failed."""


def prompt_scene_bridge_default_script_path(
    repo_root: Path = REPO_ROOT,
    app_dir: Path = APP_DIR,
) -> Path:
    """Resolve run_bridge.py across monorepo and repo-root Docker layouts.

    * Monorepo: ``<repo>/mrs/adapters/prompt-scene-bridge/run_bridge.py``
    * Docker: ``<app_dir>/prompt-scene-bridge/run_bridge.py`` (``/app/...``)
    """
    monorepo = (
        repo_root
        / "mrs"
        / "adapters"
        / "prompt-scene-bridge"
        / "run_bridge.py"
    )
    if monorepo.is_file():
        return monorepo
    docker = app_dir / "prompt-scene-bridge" / "run_bridge.py"
    if docker.is_file():
        return docker
    return monorepo


def prompt_scene_availability(settings: Settings) -> dict[str, Any]:
    """Cheap /health probe — no subprocess."""
    script = Path(
        settings.prompt_scene_bridge_script_path
        or prompt_scene_bridge_default_script_path()
    )
    enabled = bool(settings.prompt_scene_bridge_enabled)
    infinity_src = (settings.prompt_scene_infinity_src or "").strip() or None
    return {
        "provider": PROMPT_SCENE_PROVIDER_ID,
        "enabled": enabled,
        "available": enabled and script.is_file(),
        "script_path": str(script),
        "script_exists": script.is_file(),
        "infinity_src_configured": bool(infinity_src),
        "setup_help": PROMPT_SCENE_SETUP_HELP,
        "endpoint": "/api/prompt-to-scene",
        "outputs": ["sceneSpecification", "engine3dWorldDocument"],
        "expand_world": bool(getattr(settings, "prompt_scene_expand_world", False)),
        "note": (
            "POST /api/prompt-to-scene: prompt → structured MRS scene + Engine3D "
            "world request. Optional render=true uses SceneSpecification → RT4D. "
            "Set PROMPT_SCENE_EXPAND_WORLD=1 to expand generator stubs via "
            "engine3d-core Node. Infinity narrative lane is out-of-process only."
        ),
    }


def _bridge_env(settings: Settings) -> dict[str, str]:
    env = os.environ.copy()
    src = (settings.prompt_scene_infinity_src or "").strip()
    if src:
        env["INFINITY_STORY_SRC"] = src
        # Worker also accepts this; keep PYTHONPATH additive for the lane package.
        existing = env.get("PYTHONPATH", "")
        env["PYTHONPATH"] = (
            f"{src}{os.pathsep}{existing}" if existing else src
        )
    if bool(getattr(settings, "prompt_scene_expand_world", False)):
        env["PROMPT_SCENE_EXPAND_WORLD"] = "1"
    else:
        env.setdefault("PROMPT_SCENE_EXPAND_WORLD", "0")
    return env


def run_prompt_scene_bridge(
    settings: Settings,
    prompt: str,
    *,
    width: int = 256,
    height: int = 192,
    samples: int = 4,
    max_depth: int = 4,
) -> dict[str, Any]:
    """Run the out-of-process bridge; return parsed JSON payload."""
    if not settings.prompt_scene_bridge_enabled:
        raise RuntimeError(
            "prompt→scene bridge disabled (set PROMPT_SCENE_BRIDGE_ENABLED=1)"
        )
    prompt = (prompt or "").strip()
    if not prompt:
        raise ValueError("prompt is required")

    script = Path(
        settings.prompt_scene_bridge_script_path
        or prompt_scene_bridge_default_script_path()
    )
    if not script.is_file():
        raise RuntimeError(
            f"prompt→scene bridge script missing: {script}. {PROMPT_SCENE_SETUP_HELP}"
        )

    python = (settings.prompt_scene_bridge_python or sys.executable or "python").strip()
    cmd = [
        python,
        str(script),
        "--prompt",
        prompt,
        "--json",
        "--width",
        str(width),
        "--height",
        str(height),
        "--samples",
        str(samples),
        "--max-depth",
        str(max_depth),
    ]
    src = (settings.prompt_scene_infinity_src or "").strip()
    if src:
        cmd.extend(["--infinity-src", src])
    if bool(getattr(settings, "prompt_scene_expand_world", False)):
        cmd.append("--expand")

    timeout = float(settings.prompt_scene_bridge_timeout_seconds or 60.0)
    try:
        proc = subprocess.run(  # noqa: S603 — fixed argv, no shell
            cmd,
            capture_output=True,
            text=True,
            timeout=timeout,
            env=_bridge_env(settings),
            cwd=str(script.parent),
            check=False,
        )
    except subprocess.TimeoutExpired as exc:
        raise PromptSceneBridgeError(
            f"prompt→scene bridge timed out after {timeout}s"
        ) from exc
    except FileNotFoundError as exc:
        raise RuntimeError(
            f"Python interpreter not found for bridge: {python}"
        ) from exc

    stdout = (proc.stdout or "").strip()
    stderr = (proc.stderr or "").strip()
    if proc.returncode != 0:
        detail = stdout or stderr or f"exit {proc.returncode}"
        raise PromptSceneBridgeError(f"bridge failed: {detail[:800]}")

    # Last non-empty line is JSON (worker may print noise).
    line = ""
    for candidate in reversed(stdout.splitlines()):
        if candidate.strip().startswith("{"):
            line = candidate.strip()
            break
    if not line:
        raise PromptSceneBridgeError(
            f"bridge returned no JSON: {(stderr or stdout)[:400]}"
        )
    try:
        payload = json.loads(line)
    except json.JSONDecodeError as exc:
        raise PromptSceneBridgeError(
            f"bridge JSON parse error: {exc}; got {line[:200]!r}"
        ) from exc

    if not isinstance(payload, dict) or not payload.get("ok"):
        err = payload.get("error") if isinstance(payload, dict) else payload
        raise PromptSceneBridgeError(f"bridge error: {err}")

    return payload


def prompt_to_scene(
    settings: Settings,
    prompt: str,
    *,
    render: bool = False,
    quality: str = "draft",
    width: int = 256,
    height: int = 192,
    samples: int = 4,
    max_depth: int = 4,
) -> dict[str, Any]:
    """Bridge prompt → structured scene; optionally RT4D-render SceneSpecification."""
    payload = run_prompt_scene_bridge(
        settings,
        prompt,
        width=width,
        height=height,
        samples=samples,
        max_depth=max_depth,
    )
    out: dict[str, Any] = {
        "ok": True,
        "provider": PROMPT_SCENE_PROVIDER_ID,
        "prompt": prompt,
        "sceneSpecification": payload.get("sceneSpecification"),
        "engine3dWorldDocument": payload.get("engine3dWorldDocument"),
        "infinityScene": payload.get("infinityScene"),
        "laneMeta": payload.get("laneMeta"),
        "rendered": False,
    }
    if not render:
        return out

    spec = payload.get("sceneSpecification")
    if not isinstance(spec, dict):
        raise ValueError("bridge did not return sceneSpecification")
    try:
        result = render_scene_spec(settings, spec, quality=quality)
    except GenerationQualityError:
        raise
    entry = result.to_dict()
    entry["modality"] = "image"
    entry["kind"] = "prompt-scene-bridge-rt4d"
    out["rendered"] = True
    out["render"] = {k: v for k, v in entry.items() if k != "embedding_vector"}
    return out
