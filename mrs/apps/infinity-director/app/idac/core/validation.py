"""Validation — authoritative/final in spec; skeleton in Director."""

from __future__ import annotations

from typing import Any

from app.idac.core.contracts import EvidenceContract, IntentContract


def validate_intent_evidence(
    intent: IntentContract,
    evidence: EvidenceContract,
) -> dict[str, Any]:
    checks: list[dict[str, Any]] = []

    checks.append(
        {
            "id": "intent_ref_match",
            "pass": evidence.intent_ref == intent.id,
            "enforcement": "partial",
        },
    )
    checks.append(
        {
            "id": "domain_match",
            "pass": intent.domain == "render" or evidence.outcome == "declared_stub",
            "enforcement": "partial",
        },
    )
    checks.append(
        {
            "id": "plan_ref_present",
            "pass": bool(str(evidence.plan_ref or "").strip()),
            "enforcement": "partial",
        },
    )
    if intent.domain == "render" and evidence.outcome == "ok":
        trace = evidence.execution_trace or {}
        accel = (evidence.artifacts or {}).get("render_accel")
        if intent.constraints.get("atcm") or str(intent.constraints.get("speed_profile") or "").lower() == "atcm":
            checks.append(
                {
                    "id": "render_accel_artifacts_when_atcm",
                    "pass": isinstance(accel, dict) and bool(accel.get("render_plan_id")),
                    "enforcement": "partial",
                },
            )
        checks.append(
            {
                "id": "execution_trace_present",
                "pass": bool(trace.get("endpoint")),
                "enforcement": "partial",
            },
        )
        checks.append(
            {
                "id": "dispatch_result_when_outcome_ok",
                "pass": isinstance((evidence.artifacts or {}).get("dispatch_result"), dict),
                "enforcement": "partial",
            },
        )
        checks.append(
            {
                "id": "no_error_in_trace_when_ok",
                "pass": not trace.get("error"),
                "enforcement": "partial",
            },
        )

    replay = (evidence.artifacts or {}).get("replay_record")
    checks.append(
        {
            "id": "bit_identical_replay",
            "pass": False,
            "skipped": True,
            "note": "Genblaze full-frame; tile-faithful replay declared future",
            "enforcement": "declared",
        },
    )
    checks.append(
        {
            "id": "replay_record_when_atcm",
            "pass": replay is not None or not intent.constraints.get("atcm"),
            "enforcement": "partial",
        },
    )

    failed = [c for c in checks if not c.get("pass") and not c.get("skipped")]
    verdict = "pass" if not failed else "fail"

    return {
        "verdict": verdict,
        "checks": checks,
        "enforcement": "partial",
        "status": "partial",
    }
