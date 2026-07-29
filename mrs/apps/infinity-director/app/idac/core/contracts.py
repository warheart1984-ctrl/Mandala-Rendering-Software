"""CIEMS IntentContract / ExecutionPlan / EvidenceContract."""

from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Any, Literal

from pydantic import BaseModel, Field

CONTRACT_VERSION = "0.1.0"
IdacDomain = Literal["render", "ai", "compile"]
IdacPriority = Literal["low", "normal", "high", "critical"]
IdacRiskProfile = Literal["conservative", "balanced", "aggressive"]
IdacOutcome = Literal["ok", "violation", "dispatch_error", "declared_stub"]
EnforcementTag = Literal["declared", "partial", "enforced"]

INTENT_INVARIANTS = (
    "intent_must_reference_mission_and_policy",
    "goal_requires_statement_and_justification",
    "immutable_once_optimization_begins",
)

EVIDENCE_INVARIANTS = (
    "must_reference_intent_and_plan",
    "must_support_replay_and_rejudge",
    "immutable_after_validation_authoritative",
)


def _utc_now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


class IntentGoal(BaseModel):
    statement: str = Field(min_length=1)
    justification: str = Field(min_length=1)


class IntentContract(BaseModel):
    kind: Literal["IntentContract"] = "IntentContract"
    contract_version: str = CONTRACT_VERSION
    contract: Literal["IDAC"] = "IDAC"
    id: str = Field(default_factory=lambda: f"intent-{uuid.uuid4()}")
    created_at: str = Field(default_factory=_utc_now)
    mission_ref: str
    policy_ref: str
    domain: IdacDomain
    goal: IntentGoal
    constraints: dict[str, Any] = Field(default_factory=dict)
    priority: IdacPriority = "normal"
    risk_profile: IdacRiskProfile = "conservative"
    invariants: tuple[str, ...] = Field(default=INTENT_INVARIANTS)
    enforcement: EnforcementTag = "partial"
    status: Literal["declared", "partial", "skeleton"] = "partial"

    def to_document(self) -> dict[str, Any]:
        return self.model_dump(mode="json")


IdacIntent = IntentContract


class ExecutionPlan(BaseModel):
    kind: Literal["ExecutionPlan"] = "ExecutionPlan"
    contract_version: str = CONTRACT_VERSION
    contract: Literal["IDAC"] = "IDAC"
    plan_id: str = Field(default_factory=lambda: f"iplan-{uuid.uuid4()}")
    created_at: str = Field(default_factory=_utc_now)
    intent_ref: str
    domain: IdacDomain
    domain_plan: dict[str, Any]
    resource_plan: dict[str, Any]
    risk_plan: dict[str, Any]
    evidence_plan: dict[str, Any]
    environment_spec: dict[str, Any] = Field(default_factory=dict)
    enforcement: EnforcementTag = "partial"
    status: Literal["declared", "partial", "skeleton"] = "partial"
    optimizer: dict[str, Any] = Field(
        default_factory=lambda: {"actor": "idac-optimizer", "must_not_execute": True},
    )

    @property
    def id(self) -> str:
        return self.plan_id

    def to_document(self) -> dict[str, Any]:
        return self.model_dump(mode="json")


IdacExecutionPlan = ExecutionPlan


class EvidenceContract(BaseModel):
    kind: Literal["EvidenceContract"] = "EvidenceContract"
    contract_version: str = CONTRACT_VERSION
    contract: Literal["IDAC"] = "IDAC"
    id: str = Field(default_factory=lambda: f"iev-{uuid.uuid4()}")
    created_at: str = Field(default_factory=_utc_now)
    intent_ref: str
    plan_ref: str
    execution_trace: dict[str, Any]
    artifacts: dict[str, Any]
    environment: dict[str, Any]
    outcome: IdacOutcome
    invariants: tuple[str, ...] = Field(default=EVIDENCE_INVARIANTS)
    enforcement: EnforcementTag = "partial"
    status: Literal["declared", "partial", "skeleton"] = "partial"
    validation: dict[str, Any] | None = None

    def to_document(self) -> dict[str, Any]:
        return self.model_dump(mode="json")


IdacEvidence = EvidenceContract


class PlanViolationError(Exception):
    def __init__(
        self,
        *,
        code: str,
        message: str,
        plan_ref: str,
        intent_ref: str | None = None,
        details: dict[str, Any] | None = None,
    ) -> None:
        super().__init__(message)
        self.code = code
        self.message = message
        self.plan_ref = plan_ref
        self.intent_ref = intent_ref
        self.details = details or {}

    def to_violation(self) -> dict[str, Any]:
        return build_plan_violation(
            code=self.code,
            message=self.message,
            plan_ref=self.plan_ref,
            intent_ref=self.intent_ref,
            details=self.details,
        )


def build_plan_violation(
    *,
    code: str,
    message: str,
    plan_ref: str,
    intent_ref: str | None = None,
    details: dict[str, Any] | None = None,
) -> dict[str, Any]:
    return {
        "kind": "PlanViolation",
        "contract_version": CONTRACT_VERSION,
        "contract": "IDAC",
        "id": f"pvio-{uuid.uuid4()}",
        "created_at": _utc_now(),
        "code": code,
        "message": message,
        "plan_ref": plan_ref,
        "intent_ref": intent_ref,
        "no_plan_mutation_without_replan": True,
        "no_non_constitutional_fallback": True,
        "enforcement": "partial",
        "details": details or {},
    }
