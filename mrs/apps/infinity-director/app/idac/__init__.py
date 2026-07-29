"""IDAC package — governed execution reference (Director scope)."""

from app.idac.core.constitution import ARTICLE_STATUS, CONSTITUTIONAL_INVARIANTS, DIRECTOR_ENFORCEMENT
from app.idac.core.contracts import (
    CONTRACT_VERSION,
    EvidenceContract,
    ExecutionPlan,
    IdacEvidence,
    IdacExecutionPlan,
    IdacIntent,
    IntentContract,
    IntentGoal,
    PlanViolationError,
)
from app.idac.core.optimizer import request_plan
from app.idac.core.router import IdacRouter, handle_intent
from app.idac.core.validation import validate_intent_evidence
from app.idac.domains.rendering.runtime import RenderExecutor

__all__ = [
    "CONTRACT_VERSION",
    "CONSTITUTIONAL_INVARIANTS",
    "DIRECTOR_ENFORCEMENT",
    "ARTICLE_STATUS",
    "IntentContract",
    "IntentGoal",
    "IdacIntent",
    "ExecutionPlan",
    "IdacExecutionPlan",
    "EvidenceContract",
    "IdacEvidence",
    "PlanViolationError",
    "request_plan",
    "handle_intent",
    "IdacRouter",
    "validate_intent_evidence",
    "RenderExecutor",
]
