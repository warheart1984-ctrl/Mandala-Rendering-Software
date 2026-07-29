"""IDAC optimizer — request_plan only."""

from __future__ import annotations

from typing import Any

from app.atcm import plan_atcm, suggested_dims_for_profile
from app.config import Settings
from app.idac.core.charter_gate import assert_idac_charter_loaded
from app.idac.core.contracts import ExecutionPlan, IntentContract, PlanViolationError
from app.idac.domains.rendering.adapters import RenderOptimizerAdapter
from app.models import DirectRequest, MemoryContext, MemoryboardHints
from app.planner import PlannerError, build_plan
from app.render_accel import validate_atcm_prerequisites


def _declared_stub_plan(intent: IntentContract, domain: str) -> ExecutionPlan:
    return ExecutionPlan(
        intent_ref=intent.id,
        domain=intent.domain,
        domain_plan={"status": "declared", "domain": domain},
        resource_plan={"status": "declared", "execute": False},
        risk_plan={"on_violation": "PlanViolation", "enforcement": "declared"},
        evidence_plan={"collect": [], "status": "declared"},
        environment_spec={},
        enforcement="declared",
        status="declared",
    )


def _direct_request_from_intent(intent: IntentContract) -> DirectRequest:
    c = intent.constraints
    prompt = c.get("prompt")
    scene_spec = c.get("scene_spec")
    if not prompt and scene_spec is None:
        raise PlanViolationError(
            code="idac.missing_render_input",
            message="Render intent requires constraints.prompt or constraints.scene_spec",
            plan_ref="",
            intent_ref=intent.id,
        )
    memory_ctx = c.get("memory_context")
    mem = MemoryContext.model_validate(memory_ctx) if memory_ctx else None
    return DirectRequest(
        prompt=str(prompt) if prompt else None,
        quality=c.get("quality"),
        speed_profile=c.get("speed_profile"),
        atcm=bool(c.get("atcm")),
        mode=str(c.get("mode") or "auto"),
        memory_context=mem,
        source_run_id=c.get("source_run_id"),
        scene_spec=scene_spec if isinstance(scene_spec, dict) else None,
    )


def request_plan(
    intent: IntentContract,
    *,
    policy: dict[str, Any] | None = None,
    constitution: dict[str, Any] | None = None,
    environment: dict[str, Any] | None = None,
    settings: Settings,
    prepass_png: bytes | None = None,
) -> ExecutionPlan:
    assert_idac_charter_loaded()
    _ = policy, constitution
    env = environment or {}

    if intent.domain == "ai" or intent.domain == "compile":
        return _declared_stub_plan(intent, intent.domain)

    if intent.domain != "render":
        raise PlanViolationError(
            code="idac.unknown_domain",
            message=f"Unsupported domain: {intent.domain}",
            plan_ref="",
            intent_ref=intent.id,
        )

    request = _direct_request_from_intent(intent)
    render_adapter = RenderOptimizerAdapter(settings=settings, prepass_png=prepass_png)
    domain_plan = render_adapter.build_domain_plan(intent=intent, request=request)
    effective_request = render_adapter.effective_request or request

    hints = render_adapter.hints or MemoryboardHints()
    try:
        normalized = build_plan(effective_request, hints, settings)
    except PlannerError as exc:
        raise PlanViolationError(
            code="idac.planner_failed",
            message=str(exc),
            plan_ref="",
            intent_ref=intent.id,
        ) from exc

    from app.dispatch import build_dispatch_target

    target = build_dispatch_target(normalized, effective_request, settings)
    domain_plan["normalized_plan"] = normalized.model_dump(mode="json")
    domain_plan["effective_request"] = effective_request.model_dump(mode="json")

    return ExecutionPlan(
        intent_ref=intent.id,
        domain="render",
        domain_plan=domain_plan,
        resource_plan={
            "dispatch": target.model_dump(mode="json"),
            "genblaze_base_url": settings.genblaze_base_url,
            "lane": normalized.lane,
        },
        risk_plan={
            "on_violation": "PlanViolation",
            "render_accel_policy_ref": intent.policy_ref,
            "no_silent_fallback": True,
            "enforcement": "partial",
        },
        evidence_plan={
            "collect": ["dispatch_result", "replay_record_skeleton"],
            "render_accel": bool(domain_plan.get("atcm_activated")),
            "status": "partial",
        },
        environment_spec={"keys": sorted(env.keys())},
        enforcement="partial",
        status="partial",
        optimizer={
            "actor": "idac-optimizer",
            "must_not_execute": True,
        },
    )
