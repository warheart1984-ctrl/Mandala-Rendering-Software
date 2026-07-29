"""IDAC-local constitutional gate (Director scope — not MRS CKL SoT)."""

from __future__ import annotations

import json
from functools import lru_cache
from pathlib import Path
from typing import Any

from app.idac.core.constitution import CONSTITUTIONAL_INVARIANTS, DIRECTOR_ENFORCEMENT
from app.idac.core.contracts import EvidenceContract, ExecutionPlan, IntentContract, PlanViolationError

_IDAC_ROOT = Path(__file__).resolve().parent.parent
_INVARIANTS_JSON = _IDAC_ROOT / "data" / "idac-invariants.json"
_APP_ROOT = Path(__file__).resolve().parents[3]
_CONSTITUTION_MD = _APP_ROOT / "docs" / "IDAC_CONSTITUTION.md"


class IdacCharterLoadError(RuntimeError):
    """Charter artifacts missing or inconsistent."""


@lru_cache(maxsize=1)
def load_idac_invariants_document() -> dict[str, Any]:
    if not _INVARIANTS_JSON.is_file():
        raise IdacCharterLoadError(f"missing machine-readable invariants: {_INVARIANTS_JSON}")
    doc = json.loads(_INVARIANTS_JSON.read_text(encoding="utf-8"))
    ids = [row["id"] for row in doc.get("invariants") or []]
    if tuple(ids) != CONSTITUTIONAL_INVARIANTS:
        raise IdacCharterLoadError(
            "idac-invariants.json out of sync with app.idac.core.constitution.CONSTITUTIONAL_INVARIANTS",
        )
    return doc


def assert_idac_charter_loaded() -> dict[str, Any]:
    doc = load_idac_invariants_document()
    if not _CONSTITUTION_MD.is_file():
        raise IdacCharterLoadError(f"missing IDAC_CONSTITUTION.md: {_CONSTITUTION_MD}")
    text = _CONSTITUTION_MD.read_text(encoding="utf-8")
    for inv in CONSTITUTIONAL_INVARIANTS:
        if inv not in text:
            raise IdacCharterLoadError(f"IDAC_CONSTITUTION.md missing invariant reference: {inv}")
    return doc


def charter_gate_status() -> dict[str, Any]:
    """Operational probe for IDAC-local CKL substitute."""
    try:
        doc = assert_idac_charter_loaded()
        return {
            "loaded": True,
            "scope": doc.get("scope"),
            "invariant_count": len(doc.get("invariants") or []),
            "enforcement_map": dict(DIRECTOR_ENFORCEMENT),
            "mrs_ckl_binding": "out_of_scope",
        }
    except IdacCharterLoadError as exc:
        return {"loaded": False, "error": str(exc), "mrs_ckl_binding": "out_of_scope"}


def evaluate_intent_invariants(intent: IntentContract) -> None:
    assert_idac_charter_loaded()
    if not str(intent.id or "").strip():
        raise PlanViolationError(
            code="idac.charter.no_execution_without_intent",
            message="Invariant no_execution_without_intent: intent.id required",
            plan_ref="",
            intent_ref=intent.id or "",
        )
    if not intent.mission_ref or not intent.policy_ref:
        raise PlanViolationError(
            code="idac.charter.no_execution_without_intent",
            message="Invariant no_execution_without_intent: mission_ref and policy_ref required",
            plan_ref="",
            intent_ref=intent.id,
        )
    if not intent.goal.statement or not intent.goal.justification:
        raise PlanViolationError(
            code="idac.charter.no_execution_without_intent",
            message="Invariant no_execution_without_intent: goal statement and justification required",
            plan_ref="",
            intent_ref=intent.id,
        )


def evaluate_plan_invariants(plan: ExecutionPlan, intent: IntentContract) -> None:
    assert_idac_charter_loaded()
    if not str(plan.plan_id or "").strip() or not str(plan.intent_ref or "").strip():
        raise PlanViolationError(
            code="idac.charter.no_execution_without_validated_plan",
            message="Invariant no_execution_without_validated_plan: plan_id and intent_ref required",
            plan_ref=plan.plan_id or "",
            intent_ref=intent.id,
        )
    if plan.intent_ref != intent.id:
        raise PlanViolationError(
            code="idac.charter.no_execution_without_validated_plan",
            message="Invariant no_execution_without_validated_plan: intent_ref mismatch",
            plan_ref=plan.plan_id,
            intent_ref=intent.id,
        )
    if plan.optimizer.get("must_not_execute") is not True:
        raise PlanViolationError(
            code="idac.charter.no_optimization_without_constitutional_constraints",
            message="Invariant no_optimization_without_constitutional_constraints: optimizer must_not_execute",
            plan_ref=plan.plan_id,
            intent_ref=intent.id,
        )


def evaluate_evidence_invariants(
    intent: IntentContract,
    plan: ExecutionPlan,
    evidence: EvidenceContract,
) -> None:
    assert_idac_charter_loaded()
    if evidence.intent_ref != intent.id or evidence.plan_ref != plan.plan_id:
        raise PlanViolationError(
            code="idac.charter.no_result_without_replayable_evidence",
            message="Invariant no_result_without_replayable_evidence: evidence refs must match intent/plan",
            plan_ref=plan.plan_id,
            intent_ref=intent.id,
        )


def evaluate_learning_invariants(validation: dict[str, Any]) -> None:
    """Deny learning append when validation verdict is not pass."""
    assert_idac_charter_loaded()
    if validation.get("verdict") != "pass":
        raise PlanViolationError(
            code="idac.charter.no_learning_without_validated_evidence",
            message="Invariant no_learning_without_validated_evidence: "
            "learning append requires validation verdict == pass",
            plan_ref=validation.get("plan_ref", ""),
            intent_ref=validation.get("intent_ref", ""),
        )
