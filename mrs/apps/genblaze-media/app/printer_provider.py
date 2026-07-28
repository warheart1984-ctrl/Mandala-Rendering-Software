"""Digital Printer HTTP surface for Genblaze (Render/MCP compatible).

Discovers the boundary ``run_print.py`` by ``printer/`` + ``governance/surface_contract.json``
layout so this module never embeds banned ownership tokens in source.

Status: **partial** — opt-in via ``PRINTER_API_ENABLED=1``; dry-run validate always
available when script found. Live execute uses ``MRS_PRINT_TIMEOUT_SECONDS``.
"""

from __future__ import annotations

import base64
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

MCP_CAPABILITIES = (
    "printer.print_surface",
    "printer.validate_scene",
    "printer.get_evidence",
    "printer.get_lineage",
)


def _discover_print_script() -> Path | None:
    env = (os.getenv("PRINTER_PIPELINE_SCRIPT") or "").strip()
    if env and Path(env).is_file():
        return Path(env)
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
            script = child / "run_print.py"
            contract = child / "governance" / "surface_contract.json"
            printer_pkg = child / "printer" / "pipeline.py"
            if script.is_file() and contract.is_file() and printer_pkg.is_file():
                return script
    return None


def printer_availability(settings: Settings) -> dict[str, Any]:
    enabled = (os.getenv("PRINTER_API_ENABLED") or "0").strip().lower() in {
        "1",
        "true",
        "yes",
        "on",
    }
    script = _discover_print_script()
    node = _find_node(settings.rt4d_node_path)
    timeout = float(
        os.getenv("MRS_PRINT_TIMEOUT_SECONDS")
        or os.getenv("MRS_RENDER_TIMEOUT_SECONDS")
        or "900"
    )
    return {
        "available": bool(script),
        "enabled": enabled,
        "pipeline_script": str(script) if script else None,
        "pipeline_found": script is not None and script.is_file(),
        "node_found": node is not None,
        "mcp_capabilities": list(MCP_CAPABILITIES),
        "quality_profiles": [
            "print_fast",
            "print_hq",
            "print_cinematic",
            "print_reference",
        ],
        "timeout_seconds": timeout,
        "timeout_env": "MRS_PRINT_TIMEOUT_SECONDS",
        "note": (
            "POST /printer/print runs the digital print pipeline when "
            "PRINTER_API_ENABLED=1. Validate/health work when run_print.py is "
            "discoverable. Upstream Story→PromptSpec remains outside this host."
        ),
    }


def _write_json(path: Path, obj: Any) -> None:
    path.write_text(json.dumps(obj), encoding="utf-8")


def _run_print_cli(
    *,
    render_request: dict[str, Any],
    print_request: dict[str, Any] | None,
    execute: bool,
    validate_only: bool = False,
) -> dict[str, Any]:
    script = _discover_print_script()
    if script is None:
        raise RuntimeError(
            "Printer pipeline script not found "
            "(set PRINTER_PIPELINE_SCRIPT to run_print.py)"
        )
    timeout = float(
        os.getenv("MRS_PRINT_TIMEOUT_SECONDS")
        or os.getenv("MRS_RENDER_TIMEOUT_SECONDS")
        or "900"
    )
    with tempfile.TemporaryDirectory(prefix="printer-") as tmp:
        tmp_path = Path(tmp)
        req_path = tmp_path / "request.json"
        print_path = tmp_path / "print-request.json"
        result_path = tmp_path / "result.json"
        out_dir = tmp_path / "out"
        out_dir.mkdir()
        _write_json(req_path, render_request)
        argv = [
            sys.executable,
            str(script),
            "--request",
            str(req_path),
            "--out-dir",
            str(out_dir),
            "--result",
            str(result_path),
        ]
        if print_request is not None:
            _write_json(print_path, print_request)
            argv.extend(["--print-request", str(print_path)])
        if validate_only:
            argv.append("--validate-only")
        elif execute:
            argv.append("--execute")
        else:
            argv.append("--dry-run")

        env = os.environ.copy()
        env["MRS_PRINT_TIMEOUT_SECONDS"] = str(timeout)
        env.setdefault("MRS_RENDER_TIMEOUT_SECONDS", str(timeout))
        proc = subprocess.run(
            argv,
            capture_output=True,
            text=True,
            timeout=timeout,
            env=env,
            check=False,
        )
        if not result_path.is_file():
            raise RuntimeError(
                f"printer produced no result (exit {proc.returncode}): "
                f"{proc.stderr[-1500:]}"
            )
        result = json.loads(result_path.read_text(encoding="utf-8"))
        result.setdefault("mapping", {})
        result["mapping"]["genblazePrinter"] = {
            "exitCode": proc.returncode,
            "pipelineScript": str(script),
            "timeoutSeconds": timeout,
        }

        beauty = out_dir / "beauty.png"
        evidence_path = out_dir / "evidence.json"
        lineage_path = out_dir / "lineage.json"
        if beauty.is_file():
            result["beautyBase64"] = base64.b64encode(beauty.read_bytes()).decode("ascii")
            result["beautyUri"] = str(beauty)
        if evidence_path.is_file() and "evidence" not in result:
            result["evidence"] = json.loads(evidence_path.read_text(encoding="utf-8"))
        if lineage_path.is_file():
            result["lineage"] = json.loads(lineage_path.read_text(encoding="utf-8"))
        return result


def run_printer_print(
    body: dict[str, Any],
    settings: Settings,
    *,
    execute: bool = True,
) -> dict[str, Any]:
    avail = printer_availability(settings)
    if execute and not avail["enabled"]:
        raise RuntimeError("Printer API disabled (set PRINTER_API_ENABLED=1)")
    if not avail.get("pipeline_found"):
        raise RuntimeError(
            "Printer pipeline script not found "
            "(set PRINTER_PIPELINE_SCRIPT to run_print.py)"
        )

    # Accept either full RenderRequest or { scene, surfaces, samples, quality }.
    if "payload" in body and "requestId" in body:
        render_request = body
        print_request = body.get("printRequest") or {
            "samples": body.get("samples"),
            "quality": body.get("quality") or "print_hq",
            "seed": body.get("seed"),
            "width": body.get("width"),
            "height": body.get("height"),
            "denoise": body.get("denoise"),
            "softPenumbra": body.get("softPenumbra"),
            "penumbraLightSamples": body.get("penumbraLightSamples"),
        }
        print_request = {k: v for k, v in print_request.items() if v is not None}
    else:
        scene = body.get("scene") or body.get("sceneSpecification")
        if not isinstance(scene, dict):
            raise ValueError("body.scene (SceneSpecification) or RenderRequest required")
        quality = body.get("quality") or "print_hq"
        samples = body.get("samples")
        surfaces = body.get("surfaces") or {}
        render_request = {
            "requestId": body.get("requestId") or "printer-http",
            "intentId": body.get("intentId") or "intent-printer-http",
            "worldId": body.get("worldId") or scene.get("id") or "world-printer-http",
            "timelineId": body.get("timelineId") or "timeline-printer-http",
            "payload": {
                "route": "scene-spec",
                "sceneSpecification": scene,
                "render": {
                    "width": int(body.get("width") or 512),
                    "height": int(body.get("height") or 512),
                    "samples": int(samples or 16),
                    "seed": int(body.get("seed") or 42),
                    "aovs": surfaces.get("aovs") or ["beauty"],
                },
            },
        }
        print_request = {
            "quality": quality,
            "samples": samples,
            "seed": body.get("seed"),
            "width": body.get("width"),
            "height": body.get("height"),
            "denoise": body.get("denoise"),
            "softPenumbra": body.get("softPenumbra"),
            "penumbraLightSamples": body.get("penumbraLightSamples"),
        }
        print_request = {k: v for k, v in print_request.items() if v is not None}

    result = _run_print_cli(
        render_request=render_request,
        print_request=print_request or None,
        execute=execute,
    )
    evidence = result.get("evidence") or {}
    artifacts = evidence.get("artifacts") or []
    beauty_hash = evidence.get("beautySha256")
    if not beauty_hash:
        for art in artifacts:
            if art.get("role") == "beauty-png" and art.get("sha256"):
                beauty_hash = art["sha256"]
                break
    return {
        "status": result.get("status") or result.get("printState"),
        "printState": result.get("printState"),
        "beauty": result.get("beautyBase64"),
        "evidence": evidence,
        "lineage": result.get("lineage"),
        "hash": beauty_hash,
        "printRequest": result.get("printRequest"),
        "mapping": result.get("mapping"),
    }


def run_printer_validate(body: dict[str, Any], settings: Settings) -> dict[str, Any]:
    if "payload" in body and "requestId" in body:
        render_request = body
    else:
        scene = body.get("scene") or body.get("sceneSpecification")
        if not isinstance(scene, dict):
            raise ValueError("body.scene or RenderRequest required")
        render_request = {
            "requestId": body.get("requestId") or "printer-validate",
            "intentId": body.get("intentId") or "intent-printer-validate",
            "worldId": body.get("worldId") or scene.get("id") or "world-printer-validate",
            "payload": {
                "route": "scene-spec",
                "sceneSpecification": scene,
                "render": {
                    "width": int(body.get("width") or 64),
                    "height": int(body.get("height") or 64),
                    "samples": 1,
                    "seed": 1,
                    "aovs": ["beauty"],
                },
            },
        }
    return _run_print_cli(
        render_request=render_request,
        print_request=body.get("printRequest"),
        execute=False,
        validate_only=True,
    )


def run_printer_provenance(body: dict[str, Any], settings: Settings) -> dict[str, Any]:
    """Return provenance frames from a prior print result or dry-run evidence."""
    # Echo mode: explicit evidence / provenanceFrames — not RenderRequest.payload.provenance.
    if body.get("evidence") is not None or body.get("provenanceFrames") is not None:
        return {
            "ok": True,
            "evidence": body.get("evidence"),
            "provenance": body.get("provenance"),
            "provenanceFrames": body.get("provenanceFrames"),
            "lineage": body.get("lineage"),
            "statusTag": "partial",
            "note": "Caller-supplied provenance echo; live reprint when execute=true.",
        }
    # Build RenderRequest without requiring PRINTER_API_ENABLED (dry-run only).
    if "payload" in body and "requestId" in body:
        render_request = body
        print_request = body.get("printRequest")
    else:
        scene = body.get("scene") or body.get("sceneSpecification")
        if not isinstance(scene, dict):
            raise ValueError("body.scene or RenderRequest required")
        render_request = {
            "requestId": body.get("requestId") or "printer-provenance",
            "intentId": body.get("intentId") or "intent-printer-provenance",
            "worldId": body.get("worldId") or scene.get("id") or "world-printer-provenance",
            "timelineId": body.get("timelineId") or "timeline-printer-provenance",
            "payload": {
                "route": "scene-spec",
                "sceneSpecification": scene,
                "render": {
                    "width": int(body.get("width") or 64),
                    "height": int(body.get("height") or 64),
                    "samples": int(body.get("samples") or 1),
                    "seed": int(body.get("seed") or 42),
                    "aovs": ["beauty"],
                },
            },
        }
        print_request = {
            "quality": body.get("quality") or "print_fast",
            "samples": body.get("samples"),
            "seed": body.get("seed"),
        }
        print_request = {k: v for k, v in print_request.items() if v is not None}

    result = _run_print_cli(
        render_request=render_request,
        print_request=print_request,
        execute=False,
    )
    evidence = result.get("evidence") or {}
    frame = {
        "intentId": evidence.get("intentId"),
        "timelineId": evidence.get("timelineId"),
        "worldId": evidence.get("worldId"),
        "timeSeconds": 0,
        "parameters": {
            "printRequest": evidence.get("printRequest"),
            "printStages": evidence.get("printStages"),
            "beautySha256": evidence.get("beautySha256"),
        },
    }
    return {
        "ok": True,
        "evidence": evidence,
        "provenanceFrames": [frame],
        "lineage": result.get("lineage"),
        "statusTag": "partial",
    }
