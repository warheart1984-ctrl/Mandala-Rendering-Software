"""IDAC v0.1 constitutional invariants (Director scope — not MRS CHARTER)."""

from __future__ import annotations

from typing import Literal

EnforcementLevel = Literal["declared", "partial", "enforced", "skeleton"]

# Six cross-cutting invariants (Formal Spec + Constitution)
CONSTITUTIONAL_INVARIANTS: tuple[str, ...] = (
    "no_execution_without_intent",
    "no_optimization_without_constitutional_constraints",
    "no_execution_without_validated_plan",
    "no_result_without_replayable_evidence",
    "no_plan_deviation_without_violation",
    "no_learning_without_validated_evidence",
)

DIRECTOR_ENFORCEMENT: dict[str, EnforcementLevel] = {
    "no_execution_without_intent": "partial",
    "no_optimization_without_constitutional_constraints": "partial",
    "no_execution_without_validated_plan": "partial",
    "no_result_without_replayable_evidence": "partial",
    "no_plan_deviation_without_violation": "partial",
    "no_learning_without_validated_evidence": "partial",
}

ARTICLE_STATUS: dict[str, EnforcementLevel] = {
    "I_purpose": "partial",
    "II_supremacy": "partial",
    "III_mission": "partial",
    "IV_policy": "partial",
    "V_intent": "partial",
    "VI_optimization": "partial",
    "VII_execution": "partial",
    "VIII_evidence": "partial",
    "IX_validation": "partial",
    "X_learning": "partial",
}
