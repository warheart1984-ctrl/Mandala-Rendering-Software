"""
SME-Core — Authority Engine (SME-AUTH)
Constitutional Contract: contract.sme-auth.v1
Authority: coordinate
Status: declared
"""
from __future__ import annotations

import uuid
from dataclasses import dataclass, field
from datetime import datetime
from pathlib import Path
from typing import Any, Optional

from ..auth.policies import (
    ConstitutionalKnowledgeLayer,
    EvaluationContext,
    PolicyEvaluation,
)
from ..contracts import CONTRACTS, AuthorityResolution


@dataclass
class UserIntent:
    """User intent from request"""
    intent_id: str
    modality: list[str]
    goal: str
    constraints: dict[str, Any] = field(default_factory=dict)
    priority: int = 5
    deadline: Optional[str] = None
    actor: str = "user:anonymous"


@dataclass
class AuthorityRecord:
    """Authority evaluation record for evidence"""
    authority_id: str
    intent_id: str
    actor: str
    contract: str
    action: str
    granted: bool
    policy_results: list[PolicyEvaluation]
    timestamp: str
    modifications: dict[str, Any] = field(default_factory=dict)


class AuthorityEngine:
    """
    SME-AUTH — Authority Engine.
    Evaluates requests against constitutional rules and CIEMS sovereignty stack.
    Integrates CKL for policy evaluation.
    """
    
    def __init__(
        self,
        ckl: Optional[ConstitutionalKnowledgeLayer] = None,
        policy_path: Optional[Path] = None,
    ):
        self.ckl = ckl or ConstitutionalKnowledgeLayer(policy_path)
    
    def evaluate(
        self,
        intent: UserIntent,
        actor_contract: Optional[str] = None,
    ) -> AuthorityRecord:
        """
        Evaluate authority for a user intent.
        Returns AuthorityRecord with policy evaluation results.
        """
        authority_id = f"auth-{uuid.uuid4().hex[:12]}"
        timestamp = datetime.utcnow().isoformat() + "Z"
        
        # Resolve actor contract
        contract_id = actor_contract or "contract.user.v1"
        resolution = CONTRACTS.resolveAuthority(contract_id, "submit_intent")
        
        if not resolution["allowed"]:
            return AuthorityRecord(
                authority_id=authority_id,
                intent_id=intent.intent_id,
                actor=intent.actor,
                contract=contract_id,
                action="submit_intent",
                granted=False,
                policy_results=[
                    PolicyEvaluation(
                        policy_id="contract_resolution",
                        decision="deny",
                        reason=resolution["reason"],
                    )
                ],
                timestamp=timestamp,
            )
        
        # Build evaluation context
        context = EvaluationContext(
            intent={
                "intentId": intent.intent_id,
                "modality": intent.modality,
                "goal": intent.goal,
                "constraints": intent.constraints,
            },
            actor=intent.actor,
            action="submit_intent",
            modality=intent.modality[0] if intent.modality else "text",
        )
        
        # Evaluate all policies
        policy_results = self.ckl.evaluate_all(context)
        
        # Check critical denials
        critical_denial = self.ckl.check_critical_denials(policy_results)
        
        # Collect modifications
        modifications = self.ckl.collect_modifications(policy_results)
        
        # Determine grant
        granted = critical_denial is None and resolution["allowed"]
        
        record = AuthorityRecord(
            authority_id=authority_id,
            intent_id=intent.intent_id,
            actor=intent.actor,
            contract=contract_id,
            action="submit_intent",
            granted=granted,
            policy_results=policy_results,
            timestamp=timestamp,
            modifications=modifications,
        )
        
        return record
    
    def evaluate_director_action(
        self,
        director_id: str,
        action: str,
        context: dict[str, Any],
    ) -> AuthorityRecord:
        """Evaluate director-specific action"""
        authority_id = f"auth-dir-{uuid.uuid4().hex[:12]}"
        timestamp = datetime.utcnow().isoformat() + "Z"
        
        # Check director contract
        resolution = CONTRACTS.resolveAuthority("4dce.director", action)
        
        if not resolution["allowed"]:
            return AuthorityRecord(
                authority_id=authority_id,
                intent_id=context.get("intent_id", "unknown"),
                actor=director_id,
                contract="contract.director.v1",
                action=action,
                granted=False,
                policy_results=[
                    PolicyEvaluation(
                        policy_id="director_contract",
                        decision="deny",
                        reason=resolution["reason"],
                    )
                ],
                timestamp=timestamp,
            )
        
        # Build context for director policies
        eval_context = EvaluationContext(
            actor=director_id,
            action=action,
            director_action=action,
            director_contract="contract.director.v1",
            mcp_invocation=context.get("mcp_invocation", False),
            is_render=context.get("is_render", False),
        )
        
        policy_results = self.ckl.evaluate_all(eval_context)
        critical_denial = self.ckl.check_critical_denials(policy_results)
        
        granted = critical_denial is None and resolution["allowed"]
        
        return AuthorityRecord(
            authority_id=authority_id,
            intent_id=context.get("intent_id", "unknown"),
            actor=director_id,
            contract="contract.director.v1",
            action=action,
            granted=granted,
            policy_results=policy_results,
            timestamp=timestamp,
        )


if __name__ == "__main__":
    # Demo
    engine = AuthorityEngine()
    
    intent = UserIntent(
        intent_id="test-123",
        modality=["text", "image"],
        goal="Describe this image",
        constraints={"maxTokens": 256},
    )
    
    record = engine.evaluate(intent)
    print(f"Authority: {record.authority_id}")
    print(f"Granted: {record.granted}")
    print(f"Contract: {record.contract}")
    for p in record.policy_results:
        print(f"  {p.policy_id}: {p.decision} - {p.reason}")