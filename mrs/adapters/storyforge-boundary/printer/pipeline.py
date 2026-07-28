"""Digital print pipeline — sovereignty → execute → evidence.

STATUS: **enforced** for sovereignty + evidence + deterministic scene print path
when Node CLIs present; denoise **partial**/declared.

Print stages: Sampling → Reconstruction → Tonemap → Color → Encode → Hash.
"""

from __future__ import annotations

import shutil
from pathlib import Path
from typing import Any

from printer.errors import PrintError, PrintErrorState
from printer.evidence import write_evidence_bundle
from printer.print_request import (
    apply_print_request_to_render_request,
    normalize_print_request,
)
from printer.sovereignty import check_render_request_surfaces, load_surface_contract


def run_digital_print(
    render_request: dict[str, Any],
    *,
    out_dir: Path | str,
    print_request: dict[str, Any] | None = None,
    execute: bool = True,
) -> dict[str, Any]:
    """Print a declared RenderRequest surface to out_dir.

    Raises PrintError on sovereignty / gap failures (fail loudly).
    """
    out = Path(out_dir)
    out.mkdir(parents=True, exist_ok=True)

    contract = load_surface_contract()
    print_req = normalize_print_request(print_request)
    # Attach declared aovs onto render for AOV_MISMATCH checks
    rr = dict(render_request)
    rr["payload"] = dict(rr.get("payload") or {})
    render = dict(rr["payload"].get("render") or {})
    render["aovs"] = print_req["aovs"]
    rr["payload"]["render"] = render

    state = check_render_request_surfaces(rr)
    if state != PrintErrorState.OK:
        raise PrintError(state, "sovereignty check failed")

    patched = apply_print_request_to_render_request(rr, print_req)

    if not execute:
        evidence = write_evidence_bundle(
            out_dir=out,
            print_request=print_req,
            render_request=patched,
            route_result={
                "status": "ok",
                "routeUsed": patched["payload"]["route"],
                "artifacts": [],
                "mapping": {
                    "execute": False,
                    "statusTag": "partial",
                    "note": "dry-run print (sovereignty only)",
                    "contractId": contract.get("id"),
                },
            },
            print_state=PrintErrorState.OK.value,
        )
        return {
            "printState": PrintErrorState.OK.value,
            "status": "ok",
            "execute": False,
            "printRequest": print_req,
            "evidence": evidence,
            "contract": contract.get("id"),
        }

    # Deep execute via existing StoryForge-boundary router (no SF PromptSpec).
    from route import route_render_request

    result = route_render_request(patched, execute=True, out_dir=out)
    if result.get("status") != "ok":
        err = result.get("error") or {}
        code = str(err.get("code") or "execute_failed")
        msg = str(err.get("message") or "print execute failed")
        # Map execute failures to print states when possible
        if "scene" in msg.lower() or "spec" in msg.lower():
            raise PrintError(PrintErrorState.SCENESPEC_GAP, msg)
        if "engine3d" in msg.lower():
            raise PrintError(PrintErrorState.ENGINE3D_BOUNDARY_FAIL, msg)
        raise PrintError(PrintErrorState.SURFACE_INVALID, f"{code}: {msg}")

    # Copy beauty (+ AOVs) to canonical names
    role_map = {
        "beauty-png": "beauty.png",
        "depth-png": "depth.png",
        "normal-png": "normal.png",
    }
    png_paths: list[str] = []
    for art in result.get("artifacts") or []:
        role = art.get("role")
        uri = art.get("uri")
        if role not in role_map or not uri:
            continue
        src = Path(uri)
        if not src.is_file():
            continue
        dest = out / role_map[role]
        if src.resolve() != dest.resolve():
            shutil.copy2(src, dest)
        png_paths.append(str(dest.resolve()))

    if not any(p.endswith("beauty.png") for p in (x.replace("\\", "/") for x in png_paths)):
        raise PrintError(
            PrintErrorState.AOV_MISMATCH,
            "print completed but beauty.png missing",
        )

    stages = {
        "sampling": "enforced",
        "reconstruction": "partial" if print_req.get("denoise") else "declared",
        "tonemap": "enforced",
        "color": "enforced",
        "encode": "enforced",
        "hash_provenance": "enforced",
    }
    evidence = write_evidence_bundle(
        out_dir=out,
        print_request=print_req,
        render_request=patched,
        route_result=result,
        print_state=PrintErrorState.OK.value,
        stages=stages,
    )

    return {
        "printState": PrintErrorState.OK.value,
        "status": "ok",
        "execute": True,
        "printRequest": print_req,
        "routeResult": result,
        "evidence": evidence,
        "pngs": png_paths,
        "contract": contract.get("id"),
        "printStages": stages,
    }
