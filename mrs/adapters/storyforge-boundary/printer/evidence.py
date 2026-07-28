"""Evidence Printer — beauty (+ AOVs) + evidence.json + lineage + hashes.

STATUS: **enforced** for evidence completeness fields when print succeeds.
"""

from __future__ import annotations

import hashlib
import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


def sha256_file(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(65536), b""):
            h.update(chunk)
    return h.hexdigest()


def sha256_json(obj: Any) -> str:
    payload = json.dumps(obj, sort_keys=True, separators=(",", ":")).encode("utf-8")
    return hashlib.sha256(payload).hexdigest()


def write_evidence_bundle(
    *,
    out_dir: Path,
    print_request: dict[str, Any],
    render_request: dict[str, Any],
    route_result: dict[str, Any],
    print_state: str = "OK",
    stages: dict[str, str] | None = None,
) -> dict[str, Any]:
    """Write evidence.json + lineage.json; return evidence dict."""
    out_dir.mkdir(parents=True, exist_ok=True)

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

    # Prefer canonical beauty.png copy path if present
    beauty = out_dir / "beauty.png"
    if beauty.is_file():
        artifacts = [
            a for a in artifacts if a.get("role") != "beauty-png"
        ] + [
            {
                "role": "beauty-png",
                "uri": str(beauty.resolve().as_posix()),
                "sha256": sha256_file(beauty),
                "mediaType": "image/png",
            }
        ]

    stage_tags = stages or {
        "sampling": "enforced",
        "reconstruction": "partial",  # denoise off / declared by default
        "tonemap": "enforced",
        "color": "enforced",
        "encode": "enforced",
        "hash_provenance": "enforced",
    }

    evidence = {
        "kind": "mrs-digital-print-evidence",
        "schemaVersion": "1.0",
        "printState": print_state,
        "generatedAt": datetime.now(timezone.utc).isoformat(),
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
        "status": route_result.get("status"),
        "artifacts": artifacts,
        "printStages": stage_tags,
        "mapping": route_result.get("mapping"),
        "cliProvenance": (route_result.get("mapping") or {}).get("cliProvenance"),
        "denoise": {
            "requested": bool(print_request.get("denoise")),
            "statusTag": "partial" if print_request.get("denoise") else "declared",
            "note": (
                "CPU denoise not applied by default; flag recorded for lineage. "
                "Full bilateral denoise remains partial until timed CI budget allows."
            ),
        },
        "trail": "docs/governance/cecp/trails/printer-mode-renderer-2026-07/",
        "contract": "mrs/adapters/storyforge-boundary/governance/surface_contract.json",
    }

    beauty_hash = next(
        (a["sha256"] for a in artifacts if a.get("role") == "beauty-png" and a.get("sha256")),
        None,
    )
    if beauty_hash:
        evidence["beautySha256"] = beauty_hash

    evidence_path = out_dir / "evidence.json"
    evidence_path.write_text(json.dumps(evidence, indent=2) + "\n", encoding="utf-8")
    evidence["evidencePath"] = str(evidence_path.resolve())

    lineage = {
        "kind": "mrs-digital-print-lineage",
        "schemaVersion": "1.0",
        "printState": print_state,
        "printRequestSha256": evidence["printRequestSha256"],
        "renderRequestSha256": evidence["renderRequestSha256"],
        "beautySha256": beauty_hash,
        "stages": list(stage_tags.keys()),
        "stageTags": stage_tags,
        "generatedAt": evidence["generatedAt"],
    }
    lineage_path = out_dir / "lineage.json"
    lineage_path.write_text(json.dumps(lineage, indent=2) + "\n", encoding="utf-8")
    evidence["lineagePath"] = str(lineage_path.resolve())
    evidence["lineageSha256"] = sha256_json(lineage)

    return evidence
