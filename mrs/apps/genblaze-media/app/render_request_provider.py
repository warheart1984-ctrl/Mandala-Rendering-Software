"""RenderRequest JSON → MRS boundary pipeline (Genblaze HTTP surface).

Discovers the adapter by ``schemas/RenderRequest.schema.json`` + ``run_pipeline.py``
so this module never embeds banned ownership tokens in source.

Status: **partial** — subprocess to adapter CLI; opt-in via
``RENDER_REQUEST_API_ENABLED=1``.
"""

from __future__ import annotations

import json
import logging
import os
import subprocess
import sys
import tempfile
from pathlib import Path
from typing import Any

from app.config import REPO_ROOT, Settings
from app.rt4d_provider import _find_node

logger = logging.getLogger(__name__)


def _discover_pipeline_script() -> Path | None:
    env = (os.getenv("RENDER_REQUEST_PIPELINE_SCRIPT") or "").strip()
    if env and Path(env).is_file():
        return Path(env)
    # Docker flattened: sibling of app under /app/<adapter>/run_pipeline.py
    app_parent = Path(__file__).resolve().parents[1]  # .../genblaze-media or /app
    # In Docker, app lives at /app/app → parents[1]=/app
    docker_root = Path(__file__).resolve().parents[1]
    if docker_root.name == "app":
        docker_root = docker_root.parent
    search_roots = [REPO_ROOT / "mrs" / "adapters", docker_root]
    for root in search_roots:
        if not root.is_dir():
            continue
        for child in sorted(root.iterdir()):
            if not child.is_dir():
                continue
            script = child / "run_pipeline.py"
            schema = child / "schemas" / "RenderRequest.schema.json"
            if script.is_file() and schema.is_file():
                return script
    return None


def render_request_availability(settings: Settings) -> dict[str, Any]:
    enabled = (os.getenv("RENDER_REQUEST_API_ENABLED") or "0").strip().lower() in {
        "1",
        "true",
        "yes",
        "on",
    }
    script = _discover_pipeline_script()
    node = _find_node(settings.rt4d_node_path)
    return {
        "available": bool(enabled and script and node),
        "enabled": enabled,
        "pipeline_script": str(script) if script else None,
        "pipeline_found": script is not None and script.is_file(),
        "node_found": node is not None,
        "note": (
            "POST /api/render-request accepts RenderRequest JSON; "
            "MRS executes when RENDER_REQUEST_API_ENABLED=1. "
            "Upstream Story→PromptSpec remains outside this host."
        ),
    }


def run_render_request(
    body: dict[str, Any],
    settings: Settings,
    *,
    execute: bool = True,
) -> dict[str, Any]:
    avail = render_request_availability(settings)
    if not avail["enabled"]:
        raise RuntimeError(
            "RenderRequest API disabled (set RENDER_REQUEST_API_ENABLED=1)"
        )
    script = _discover_pipeline_script()
    if script is None:
        raise RuntimeError(
            "RenderRequest pipeline script not found "
            "(set RENDER_REQUEST_PIPELINE_SCRIPT)"
        )

    with tempfile.TemporaryDirectory(prefix="rr-") as tmp:
        tmp_path = Path(tmp)
        req_path = tmp_path / "request.json"
        result_path = tmp_path / "result.json"
        out_dir = tmp_path / "out"
        out_dir.mkdir()
        req_path.write_text(json.dumps(body), encoding="utf-8")
        argv = [
            sys.executable,
            str(script),
            "--request",
            str(req_path),
            "--result",
            str(result_path),
            "--out-dir",
            str(out_dir),
        ]
        if execute:
            argv.append("--execute")
        env = os.environ.copy()
        if execute:
            env["MRS_RENDER_REQUEST_EXECUTE"] = "1"
        proc = subprocess.run(
            argv,
            capture_output=True,
            text=True,
            timeout=float(os.getenv("MRS_RENDER_TIMEOUT_SECONDS") or "120"),
            env=env,
            check=False,
        )
        if not result_path.is_file():
            raise RuntimeError(
                f"pipeline produced no result (exit {proc.returncode}): "
                f"{proc.stderr[-1500:]}"
            )
        result = json.loads(result_path.read_text(encoding="utf-8"))
        result.setdefault("mapping", {})
        result["mapping"]["genblaze"] = {
            "exitCode": proc.returncode,
            "pipelineScript": str(script),
        }
        return result
