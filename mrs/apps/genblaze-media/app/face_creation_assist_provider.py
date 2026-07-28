"""Face Creation Assist — Genblaze opt-in shell to Sovereign X Node CLI.

Drive-G-1: assist-only. Never Digital Printer SoT.
No StoryForge imports. Default OFF (FACE_CREATION_ASSIST_ENABLED=1 to enable).
"""

from __future__ import annotations

import json
import logging
import os
import subprocess
from pathlib import Path
from typing import Any

from app.config import REPO_ROOT, Settings
from app.rt4d_provider import _find_node

logger = logging.getLogger(__name__)

FACE_CREATION_KIND = "face-creation-assist"


def face_creation_default_cli_path() -> Path:
    return REPO_ROOT / "sovereign-x" / "cli" / "sx-face-creation.mjs"


def face_creation_assist_availability(settings: Settings) -> dict[str, Any]:
    enabled = bool(getattr(settings, "face_creation_assist_enabled", False))
    cli = Path(
        getattr(settings, "face_creation_assist_cli_path", None)
        or face_creation_default_cli_path()
    )
    node = _find_node(settings.rt4d_node_path)
    available = enabled and cli.is_file() and bool(node)
    return {
        "kind": FACE_CREATION_KIND,
        "enabled": enabled,
        "available": available,
        "cli": str(cli),
        "node": node,
        "assistOnly": True,
        "printSoT": False,
        "note": (
            "Opt-in FACE_CREATION_ASSIST_ENABLED=1 shells to "
            "sovereign-x/cli/sx-face-creation.mjs (assistOnly; not print SoT)."
            if enabled
            else "Disabled by default — set FACE_CREATION_ASSIST_ENABLED=1."
        ),
    }


class FaceCreationAssistError(RuntimeError):
    """Shell / CLI failure for face creation assist."""


def run_face_creation_assist(
    settings: Settings,
    *,
    prompt: str | None = None,
    image_path: str | None = None,
    dry_run: bool = True,
    timeout_seconds: float | None = None,
) -> dict[str, Any]:
    """Invoke Node CLI; return parsed JSON (assistOnly)."""
    avail = face_creation_assist_availability(settings)
    if not avail["enabled"]:
        raise FaceCreationAssistError(
            "Face Creation Assist disabled — set FACE_CREATION_ASSIST_ENABLED=1"
        )
    if not avail["available"]:
        raise FaceCreationAssistError(
            f"Face Creation Assist unavailable (cli={avail['cli']}, node={avail['node']})"
        )

    node = avail["node"]
    cli = avail["cli"]
    cmd = [node, cli]
    if prompt:
        cmd.extend(["--prompt", prompt])
    if image_path:
        cmd.extend(["--image", image_path])
    if dry_run:
        cmd.append("--dry-run")

    timeout = float(
        timeout_seconds
        if timeout_seconds is not None
        else getattr(settings, "face_creation_assist_timeout_seconds", 120.0)
    )

    env = {**os.environ, "FORCE_COLOR": "0"}
    # BYOK / request-scoped key for child NIM call — never log.
    if getattr(settings, "nvidia_api_key", None):
        env["NVIDIA_API_KEY"] = str(settings.nvidia_api_key)
    if getattr(settings, "image_model", None):
        env["GENBLAZE_IMAGE_MODEL"] = str(settings.image_model)

    try:
        completed = subprocess.run(
            cmd,
            cwd=str(REPO_ROOT),
            capture_output=True,
            text=True,
            timeout=timeout,
            check=False,
            env=env,
        )
    except subprocess.TimeoutExpired as exc:
        raise FaceCreationAssistError(
            f"Face Creation Assist timed out after {timeout}s"
        ) from exc

    if completed.returncode != 0:
        err = (completed.stderr or completed.stdout or "").strip()[:800]
        raise FaceCreationAssistError(
            f"Face Creation Assist CLI exited {completed.returncode}: {err}"
        )

    raw = (completed.stdout or "").strip()
    try:
        body = json.loads(raw)
    except json.JSONDecodeError as exc:
        raise FaceCreationAssistError(
            f"Face Creation Assist CLI returned non-JSON: {raw[:400]}"
        ) from exc

    if not isinstance(body, dict):
        raise FaceCreationAssistError("Face Creation Assist CLI JSON must be an object")

    body.setdefault("assistOnly", True)
    body.setdefault("nonAuthoritative", True)
    body["printSoT"] = False
    return body
