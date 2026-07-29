"""Sovereign X Router — sole execution initiator (Director partial reference)."""

from __future__ import annotations

from typing import Any

import httpx

from app.config import Settings
from app.idac.core.charter_gate import (
    assert_idac_charter_loaded,
    evaluate_evidence_invariants,
    evaluate_intent_invariants,
    evaluate_learning_invariants,
    evaluate_plan_invariants,
)
from app.idac.core.constitution import CONSTITUTIONAL_INVARIANTS
from app.idac.core.contracts import EvidenceContract, ExecutionPlan, IntentContract, PlanViolationError
from app.idac.core.learning import record_learning_candidate
from app.idac.core.mission_registry import validate_mission_ref
from app.idac.core.optimizer import request_plan
from app.idac.core.validation import validate_intent_evidence
from app.idac.domains.rendering.runtime import RenderExecutor


def validate_intent(intent: IntentContract) -> None:
    if not intent.mission_ref or not intent.policy_ref:
        raise PlanViolationError(
            code="idac.intent_incomplete",
            message="Intent requires mission_ref and policy_ref",
            plan_ref="",
            intent_ref=intent.id,
        )
    if not intent.goal.statement or not intent.goal.justification:
        raise PlanViolationError(
            code="idac.intent_goal_invalid",
            message="Intent goal requires statement and justification",
            plan_ref="",
            intent_ref=intent.id,
        )
    validate_mission_ref(intent.mission_ref, intent_ref=intent.id)


def validate_plan(plan: ExecutionPlan, intent: IntentContract) -> None:
    if plan.intent_ref != intent.id:
        raise PlanViolationError(
            code="idac.plan_intent_mismatch",
            message="ExecutionPlan.intent_ref must match IntentContract.id",
            plan_ref=plan.plan_id,
            intent_ref=intent.id,
        )
    if plan.optimizer.get("must_not_execute") is not True:
        raise PlanViolationError(
            code="idac.optimizer_must_not_execute",
            message="Optimizer contract breach",
            plan_ref=plan.plan_id,
            intent_ref=intent.id,
        )


class IdacRouter:
    """Partial Render-domain router; `/api/direct` uses this for explicit IDAC/ATCM paths."""

    def __init__(self, settings: Settings) -> None:
        self._settings = settings
        self._executor = RenderExecutor(settings)

    def handle_intent(
        self,
        intent: IntentContract,
        *,
        policy: dict[str, Any] | None = None,
        constitution: dict[str, Any] | None = None,
        environment: dict[str, Any] | None = None,
        http_client: httpx.Client | None = None,
        prepass_png: bytes | None = None,
    ) -> dict[str, Any]:
        assert_idac_charter_loaded()
        validate_intent(intent)
        evaluate_intent_invariants(intent)
        plan = request_plan(
            intent,
            policy=policy,
            constitution=constitution,
            environment=environment,
            settings=self._settings,
            prepass_png=prepass_png,
        )
        validate_plan(plan, intent)
        evaluate_plan_invariants(plan, intent)
        evidence = self._executor.execute(plan, intent=intent, http_client=http_client)
        evaluate_evidence_invariants(intent, plan, evidence)
        validation = validate_intent_evidence(intent, evidence)
        evidence.validation = validation
        evaluate_learning_invariants(validation)
        learning = record_learning_candidate(intent=intent, evidence=evidence, validation=validation)
        return {
            "intent": intent.to_document(),
            "plan": plan.to_document(),
            "evidence": evidence.to_document(),
            "validation": validation,
            "learning": learning,
            "constitutional_invariants": list(CONSTITUTIONAL_INVARIANTS),
        }


def handle_intent(
    intent: IntentContract,
    *,
    settings: Settings,
    policy: dict[str, Any] | None = None,
    constitution: dict[str, Any] | None = None,
    environment: dict[str, Any] | None = None,
    http_client: httpx.Client | None = None,
    prepass_png: bytes | None = None,
) -> dict[str, Any]:
    return IdacRouter(settings).handle_intent(
        intent,
        policy=policy,
        constitution=constitution,
        environment=environment,
        http_client=http_client,
        prepass_png=prepass_png,
    )
