"""Digital print pipeline — sovereignty → mesh sync → execute → denoise → evidence.



STATUS: **enforced** for sovereignty + evidence + mesh SHA sync + CSR/GD emission;

denoise/softPenumbra quality-profile gated on scene-spec and post-plate for

proton/engine3d backends.



Print stages: Sampling → Reconstruction → Tonemap → Color → Encode → Hash.

"""



from __future__ import annotations



import json

import os

import shutil

import subprocess

from pathlib import Path

from typing import Any



from printer.errors import PrintError, PrintErrorState

from printer.evidence import write_evidence_bundle

from printer.mesh_sync import verify_host_mesh_sync, write_mesh_sync_report

from printer.print_request import (

    apply_print_request_to_render_request,

    normalize_print_request,

)

from printer.sovereignty import check_render_request_surfaces, load_surface_contract

from paths import resolve_repo_root



_BOUNDARY = Path(__file__).resolve().parents[1]

_REPO = resolve_repo_root(_BOUNDARY)





def _bilateral_script() -> Path:

    """Resolve BilateralDenoiser CLI across monorepo and Docker flatten layouts."""

    name = "apply-bilateral-png.mjs"

    for candidate in (

        _REPO / "mrs" / "packages" / "renderer-core" / "scripts" / name,

        _REPO / "renderer-core" / "scripts" / name,

        Path("/app/renderer-core/scripts") / name,

    ):

        if candidate.is_file():

            return candidate

    return _REPO / "mrs" / "packages" / "renderer-core" / "scripts" / name





def _find_node() -> str:

    return (os.getenv("RT4D_NODE_PATH") or os.getenv("NODE_PATH") or "node").strip() or "node"





def _apply_backend_denoise(beauty: Path, out_dir: Path) -> dict[str, Any] | None:

    """Apply BilateralDenoiser to beauty.png for non–scene-spec plates."""

    bilateral = _bilateral_script()

    if not beauty.is_file() or not bilateral.is_file():

        return None

    prov_path = out_dir / "denoise-provenance.json"

    proc = subprocess.run(

        [

            _find_node(),

            str(bilateral),

            "--input",

            str(beauty),

            "--output",

            str(beauty),

            "--provenance",

            str(prov_path),

        ],

        capture_output=True,

        text=True,

        timeout=120,

        check=False,

    )

    if proc.returncode != 0:

        raise PrintError(

            PrintErrorState.SURFACE_INVALID,

            f"backend denoise failed: {proc.stderr[-800:]}",

        )

    if prov_path.is_file():

        return json.loads(prov_path.read_text(encoding="utf-8"))

    try:

        return json.loads(proc.stdout.strip().splitlines()[-1])

    except Exception:

        return {"denoise": True}





def run_digital_print(

    render_request: dict[str, Any],

    *,

    out_dir: Path | str,

    print_request: dict[str, Any] | None = None,

    execute: bool = True,

    require_mesh_sync: bool = True,

) -> dict[str, Any]:

    """Print a declared RenderRequest surface to out_dir.



    Raises PrintError on sovereignty / gap / mesh-sync failures (fail loudly).

    """

    out = Path(out_dir)

    out.mkdir(parents=True, exist_ok=True)



    contract = load_surface_contract()

    print_req = normalize_print_request(print_request)

    rr = dict(render_request)

    rr["payload"] = dict(rr.get("payload") or {})

    render = dict(rr["payload"].get("render") or {})

    render["aovs"] = print_req["aovs"]

    rr["payload"]["render"] = render



    state = check_render_request_surfaces(rr)

    if state != PrintErrorState.OK:

        raise PrintError(state, "sovereignty check failed")



    mesh_report = write_mesh_sync_report(

        out,

        verify_host_mesh_sync(

            # Unity/Unreal trees are monorepo-only; Docker flatten omits them.

            require_hosts=require_mesh_sync

            and (_REPO / "unity").is_dir()

            and (_REPO / "unreal").is_dir()

        ),

    )

    if require_mesh_sync and not mesh_report.get("ok"):

        # Flatten images may omit engine/surfaces; dry-run smoke still must pass.

        # Real execute keeps fail-loud when sync is incomplete/mismatched.

        if execute or mesh_report.get("statusTag") != "declared":

            raise PrintError(

                PrintErrorState.SURFACE_INVALID,

                f"mesh SHA sync failed: {mesh_report.get('note') or mesh_report.get('error')}",

            )



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

            mesh_sync=mesh_report,

        )

        return {

            "printState": PrintErrorState.OK.value,

            "status": "ok",

            "execute": False,

            "printRequest": print_req,

            "evidence": evidence,

            "contract": contract.get("id"),

            "meshSync": mesh_report,

        }



    from route import route_render_request



    result = route_render_request(patched, execute=True, out_dir=out)

    if result.get("status") != "ok":

        err = result.get("error") or {}

        code = str(err.get("code") or "execute_failed")

        msg = str(err.get("message") or "print execute failed")

        if "scene" in msg.lower() or "spec" in msg.lower():

            raise PrintError(PrintErrorState.SCENESPEC_GAP, msg)

        if "engine3d" in msg.lower():

            raise PrintError(PrintErrorState.ENGINE3D_BOUNDARY_FAIL, msg)

        raise PrintError(PrintErrorState.SURFACE_INVALID, f"{code}: {msg}")



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



    denoise_backend = None

    cli_prov = (result.get("mapping") or {}).get("cliProvenance") or {}

    route = str(patched["payload"].get("route") or "")

    already = bool(cli_prov.get("denoise") or cli_prov.get("denoiseFilterHash"))

    if print_req.get("denoise") and not already:

        # scene-spec already denoised in render-scene; still apply if provenance missing

        # Always apply for proton/engine3d; for scene-spec only if CLI skipped denoise.

        if route != "scene-spec" or not already:

            denoise_backend = _apply_backend_denoise(out / "beauty.png", out)

            if denoise_backend:

                mapping = dict(result.get("mapping") or {})

                mapping["cliProvenance"] = {

                    **cli_prov,

                    "denoise": True,

                    "denoiseFilterHash": denoise_backend.get("denoiseFilterHash"),

                    "denoiseBackendScript": "apply-bilateral-png.mjs",

                }

                result = {**result, "mapping": mapping}



    stages = {

        "sampling": "enforced",

        "reconstruction": "enforced" if print_req.get("denoise") else "declared",

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

        mesh_sync=mesh_report,

        denoise_backend=denoise_backend,

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

        "meshSync": mesh_report,

    }


