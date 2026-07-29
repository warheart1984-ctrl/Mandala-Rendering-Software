"""Map POST /api/direct ↔ IdacRouter for governed ATCM / IDAC paths."""

from __future__ import annotations

from typing import Any

from app.dispatch import ENGINE_BY_LANE, attach_profile_meta
from app.idac.core.contracts import IntentContract, IntentGoal
from app.models import DirectRequest, DirectResponse, DispatchTarget, NormalizedPlan
from app.render_accel import atcm_explicitly_requested

DEFAULT_MISSION_REF = "cecp/idac-stack-2026-07"
DEFAULT_POLICY_REF = "RenderAccelContract/0.1.0"


def idac_path_requested(body: DirectRequest) -> bool:
    """Route through IdacRouter when client explicitly enables IDAC or ATCM."""
    if body.idac:
        return True
    return atcm_explicitly_requested(atcm_flag=body.atcm, speed_profile=body.speed_profile)


def direct_request_to_intent(body: DirectRequest) -> IntentContract:
    return IntentContract(
        mission_ref=DEFAULT_MISSION_REF,
        policy_ref=DEFAULT_POLICY_REF,
        domain="render",
        goal=IntentGoal(
            statement="Produce governed preview still via Infinity Director",
            justification=f"HTTP /api/direct under {DEFAULT_MISSION_REF} and {DEFAULT_POLICY_REF}",
        ),
        constraints={
            "prompt": body.prompt,
            "scene_spec": body.scene_spec,
            "quality": body.quality,
            "speed_profile": body.speed_profile,
            "atcm": body.atcm,
            "idac": body.idac,
            "mode": body.mode,
            "source_run_id": body.source_run_id,
            "memory_context": (
                body.memory_context.model_dump(mode="json") if body.memory_context else None
            ),
        },
    )


def idac_bundle_to_direct_response(
    bundle: dict[str, Any],
    *,
    original: DirectRequest,
    use_atcm: bool,
) -> DirectResponse:
    plan_doc = bundle["plan"]
    evidence_doc = bundle["evidence"]
    domain_plan = plan_doc.get("domain_plan") or {}
    normalized = NormalizedPlan.model_validate(domain_plan.get("normalized_plan") or {})
    dispatch_doc = (plan_doc.get("resource_plan") or {}).get("dispatch") or {}
    target = DispatchTarget.model_validate(dispatch_doc)
    artifacts = evidence_doc.get("artifacts") or {}
    result = artifacts.get("dispatch_result") or {}
    trace = evidence_doc.get("execution_trace") or {}

    effective_raw = domain_plan.get("effective_request")
    if isinstance(effective_raw, dict):
        effective = DirectRequest.model_validate(effective_raw)
    else:
        effective = original

    speed_meta = attach_profile_meta(normalized, effective)

    atcm_out = None
    render_plan_out = domain_plan.get("render_plan")
    complexity_out = None
    replay_out = artifacts.get("replay_record")

    if domain_plan.get("atcm_activated") and isinstance(render_plan_out, dict):
        summary = domain_plan.get("atcm_summary") or {}
        atcm_out = {
            **summary,
            "render_plan_id": render_plan_out.get("id"),
        }
        stored_ce = domain_plan.get("complexity_evidence")
        if isinstance(stored_ce, dict):
            complexity_out = stored_ce

    return DirectResponse(
        lane=normalized.lane,
        engine=ENGINE_BY_LANE[normalized.lane],
        plan=normalized,
        context_used={
            "memoryboard": bool(effective.memory_context and effective.memory_context.memoryboard_id),
            "source_run_id": effective.source_run_id,
            "speed_profile": getattr(effective, "speed_profile", None) or "auto",
            "atcm": use_atcm or bool(domain_plan.get("atcm_activated")),
            "idac": True,
        },
        dispatch=target,
        result=result,
        speed_profile=speed_meta,
        atcm=atcm_out,
        render_plan=render_plan_out if isinstance(render_plan_out, dict) else None,
        complexity_evidence=complexity_out,
        replay_record=replay_out if isinstance(replay_out, dict) else None,
        idac={
            "intent": bundle.get("intent"),
            "plan": plan_doc,
            "evidence": evidence_doc,
            "validation": bundle.get("validation"),
            "learning": bundle.get("learning"),
        },
    )
