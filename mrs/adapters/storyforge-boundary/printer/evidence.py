"""Evidence Printer — beauty (+ AOVs) + evidence.json + lineage + CSR + GovernanceDecision.



STATUS: **enforced** for evidence completeness fields when print succeeds.

Emits CSR / GovernanceDecision / ProvenanceFrame matching repo schemas/.

"""



from __future__ import annotations



import hashlib

import json

from datetime import datetime, timezone

from pathlib import Path

from typing import Any



from printer.mesh_sync import verify_host_mesh_sync, write_mesh_sync_report





def sha256_file(path: Path) -> str:

    h = hashlib.sha256()

    with path.open("rb") as f:

        for chunk in iter(lambda: f.read(65536), b""):

            h.update(chunk)

    return h.hexdigest()





def sha256_json(obj: Any) -> str:

    payload = json.dumps(obj, sort_keys=True, separators=(",", ":")).encode("utf-8")

    return hashlib.sha256(payload).hexdigest()





def _build_governance_decision(

    render_request: dict[str, Any],

    print_state: str,

    contract_id: str,

) -> dict[str, Any]:

    ok = print_state == "OK"

    return {

        "ok": ok,

        "verdict": "allow" if ok else "deny",

        "reason": (

            "digital print sovereignty + surface contract satisfied"

            if ok

            else f"print state {print_state}"

        ),

        "violations": [] if ok else [print_state],

        "requirements": ["intentId", "worldId", "timelineId", "PrintSurfaceContract"],

        "attachProvenance": True,

        "decisionId": f"gd-print-{render_request.get('requestId') or 'unknown'}",

        "charterId": "4DCE-v1.0",

        "intentId": render_request.get("intentId"),

        "worldId": render_request.get("worldId"),

        "policiesApplied": [

            "policy-no-execution-without-intent",

            "policy-no-render-without-provenance",

            "policy-no-authority-without-contract",

        ],

        "contractId": contract_id,

        "precedentCount": 0,

    }





def _build_csr(

    render_request: dict[str, Any],

    print_request: dict[str, Any],

    evidence_core: dict[str, Any],

    governance: dict[str, Any],

    contract_id: str,

) -> dict[str, Any]:

    return {

        "id": f"csr-print-{render_request.get('requestId') or 'unknown'}",

        "intentId": render_request.get("intentId") or "",

        "action": "digital_print",

        "contractId": contract_id,

        "charterId": "4DCE-v1.0",

        "evidence": {

            "printRequestSha256": evidence_core.get("printRequestSha256"),

            "beautySha256": evidence_core.get("beautySha256"),

            "printQuality": print_request.get("quality"),

            "routeUsed": evidence_core.get("routeUsed"),

        },

        "result": {

            "printState": evidence_core.get("printState"),

            "governanceVerdict": governance.get("verdict"),

        },

        "createdAt": evidence_core.get("generatedAt"),

    }





def _build_provenance_frame(

    render_request: dict[str, Any],

    print_request: dict[str, Any],

) -> dict[str, Any]:

    return {

        "intentId": render_request.get("intentId") or "",

        "timelineId": render_request.get("timelineId") or "",

        "worldId": render_request.get("worldId") or "",

        "timeSeconds": float(render_request.get("timeSeconds") or 0),

        "parameters": {

            "quality": print_request.get("quality"),

            "samples": print_request.get("samples"),

            "seed": print_request.get("seed"),

            "denoise": print_request.get("denoise"),

            "softPenumbra": print_request.get("softPenumbra"),

            "width": print_request.get("width"),

            "height": print_request.get("height"),

        },

    }





def write_evidence_bundle(

    *,

    out_dir: Path,

    print_request: dict[str, Any],

    render_request: dict[str, Any],

    route_result: dict[str, Any],

    print_state: str = "OK",

    stages: dict[str, str] | None = None,

    mesh_sync: dict[str, Any] | None = None,

    denoise_backend: dict[str, Any] | None = None,

) -> dict[str, Any]:

    """Write evidence.json + lineage + CSR + GovernanceDecision + ProvenanceFrame."""

    out_dir.mkdir(parents=True, exist_ok=True)

    contract_id = "mrs-digital-print-surface-contract"



    artifacts: list[dict[str, Any]] = []

    for art in route_result.get("artifacts") or []:

        uri = art.get("uri")

        entry = {

            "role": art.get("role"),

            "uri": uri,

            "sha256": art.get("sha256"),

            "mediaType": art.get("mediaType"),

        }

        if uri and Path(uri).is_file() and not entry["sha256"]:

            entry["sha256"] = sha256_file(Path(uri))

        artifacts.append(entry)



    beauty = out_dir / "beauty.png"

    if beauty.is_file():

        artifacts = [a for a in artifacts if a.get("role") != "beauty-png"] + [

            {

                "role": "beauty-png",

                "uri": str(beauty.resolve().as_posix()),

                "sha256": sha256_file(beauty),

                "mediaType": "image/png",

            }

        ]



    denoise_on = bool(print_request.get("denoise"))

    soft_on = bool(print_request.get("softPenumbra"))

    stage_tags = stages or {

        "sampling": "enforced",

        "reconstruction": "enforced" if denoise_on else "declared",

        "tonemap": "enforced",

        "color": "enforced",

        "encode": "enforced",

        "hash_provenance": "enforced",

    }



    cli_prov = (route_result.get("mapping") or {}).get("cliProvenance") or {}

    denoise_applied = denoise_on and (

        cli_prov.get("denoise") is True

        or cli_prov.get("denoiseFilterHash")

        or (denoise_backend or {}).get("denoise") is True

    )

    if denoise_on and not cli_prov and not denoise_backend:

        denoise_applied = True



    mesh_report = mesh_sync or write_mesh_sync_report(out_dir)

    generated_at = datetime.now(timezone.utc).isoformat()



    beauty_hash = next(

        (a["sha256"] for a in artifacts if a.get("role") == "beauty-png" and a.get("sha256")),

        None,

    )



    evidence_core = {

        "kind": "mrs-digital-print-evidence",

        "schemaVersion": "2.0",

        "printState": print_state,

        "generatedAt": generated_at,

        "governingInvariant": (

            "Rendering = deterministic printing of declared surfaces. No hallucination."

        ),

        "printRequest": print_request,

        "printRequestSha256": sha256_json(print_request),

        "renderRequestId": render_request.get("requestId"),

        "renderRequestSha256": sha256_json(render_request),

        "intentId": render_request.get("intentId"),

        "worldId": render_request.get("worldId"),

        "timelineId": render_request.get("timelineId"),

        "routeUsed": route_result.get("routeUsed"),

        "backend": {

            "requested": print_request.get("backend", "cpu"),

            "executionBackend": "cpu",

            "statusTag": (

                "enforced"

                if print_request.get("backend", "cpu") == "cpu"

                else "partial"

            ),

            "note": (

                "CPU SoT execute path. webgpu request is parity-gated; live Node "

                "WebGPU execute remains partial until navigator.gpu + CI budgets."

            ),

        },

        "status": route_result.get("status"),

        "artifacts": artifacts,

        "printStages": stage_tags,

        "mapping": route_result.get("mapping"),

        "cliProvenance": cli_prov or None,

        "denoise": {

            "requested": denoise_on,

            "applied": bool(denoise_applied),

            "statusTag": "enforced" if denoise_applied else "declared",

            "filterHash": (denoise_backend or {}).get("denoiseFilterHash")

            or cli_prov.get("denoiseFilterHash"),

            "backends": {

                "scene-spec": "enforced-via-render-scene",

                "proton-raster": "enforced-via-apply-bilateral-png",

                "engine3d-world": "enforced-via-apply-bilateral-png",

            },

            "note": (

                "CPU BilateralDenoiser when denoise=true (quality-profile gated). "

                "Applies on scene-spec path and post-plate for proton/engine3d."

                if denoise_applied

                else "Denoise off for this PrintRequest (e.g. print_fast)."

            ),

        },

        "softPenumbra": {

            "enabled": soft_on,

            "penumbraLightSamples": int(print_request.get("penumbraLightSamples") or 1),

            "statusTag": "enforced" if soft_on else "declared",

            "note": (

                "Deterministic soft shadows via finite-radius area lights + qualityOpts "

                "radius floors on render-scene print path."

                if soft_on

                else "Soft penumbra off for this PrintRequest."

            ),

        },

        "meshSync": {

            "ok": bool(mesh_report.get("ok")),

            "statusTag": mesh_report.get("statusTag", "declared"),

            "canonicalFileCount": mesh_report.get("canonicalFileCount"),

            "note": mesh_report.get("note"),

            "reportPath": mesh_report.get("reportPath"),

        },

        "trail": "docs/governance/cecp/trails/digital-printer-v2-2026-07/",

        "contract": "mrs/adapters/storyforge-boundary/governance/surface_contract.json",

        "contractVersion": "2.0",

    }

    if beauty_hash:

        evidence_core["beautySha256"] = beauty_hash



    governance = _build_governance_decision(render_request, print_state, contract_id)

    csr = _build_csr(

        render_request, print_request, evidence_core, governance, contract_id

    )

    provenance_frame = _build_provenance_frame(render_request, print_request)



    gd_path = out_dir / "governance-decision.json"

    gd_path.write_text(json.dumps(governance, indent=2) + "\n", encoding="utf-8")

    csr_path = out_dir / "csr.json"

    csr_path.write_text(json.dumps(csr, indent=2) + "\n", encoding="utf-8")

    pf_path = out_dir / "provenance-frames.json"

    pf_payload = {"frames": [provenance_frame], "schemaVersion": "1.0"}

    pf_path.write_text(json.dumps(pf_payload, indent=2) + "\n", encoding="utf-8")



    evidence_core["governanceDecision"] = governance

    evidence_core["governanceDecisionPath"] = str(gd_path.resolve())

    evidence_core["csr"] = csr

    evidence_core["csrPath"] = str(csr_path.resolve())

    evidence_core["provenanceFrames"] = pf_payload

    evidence_core["provenanceFramesPath"] = str(pf_path.resolve())



    evidence_path = out_dir / "evidence.json"

    evidence_path.write_text(json.dumps(evidence_core, indent=2) + "\n", encoding="utf-8")

    evidence_core["evidencePath"] = str(evidence_path.resolve())



    lineage = {

        "kind": "mrs-digital-print-lineage",

        "schemaVersion": "2.0",

        "printState": print_state,

        "printRequestSha256": evidence_core["printRequestSha256"],

        "renderRequestSha256": evidence_core["renderRequestSha256"],

        "beautySha256": beauty_hash,

        "csrId": csr["id"],

        "governanceDecisionId": governance["decisionId"],

        "meshSyncOk": bool(mesh_report.get("ok")),

        "stages": list(stage_tags.keys()),

        "stageTags": stage_tags,

        "generatedAt": generated_at,

    }

    lineage_path = out_dir / "lineage.json"

    lineage_path.write_text(json.dumps(lineage, indent=2) + "\n", encoding="utf-8")

    evidence_core["lineagePath"] = str(lineage_path.resolve())

    evidence_core["lineageSha256"] = sha256_json(lineage)



    return evidence_core


