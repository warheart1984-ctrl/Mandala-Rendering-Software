"""
SME-Core — Decision Engine (SME-DEC)
Constitutional Contract: contract.sme-dec.v1
Authority: decide
Status: declared
"""
from __future__ import annotations

import uuid
from dataclasses import dataclass, field
from datetime import datetime
from typing import Any, Optional

from ..governance import GovernanceKernel, GovernanceContext, GovernanceDecision


@dataclass
class DecisionConfig:
    """Decision engine configuration"""
    max_generation_steps: int = 20
    default_temperature: float = 0.7


@dataclass
class DecisionRecord:
    """Decision record for evidence"""
    decision_id: str
    intent_id: str
    txt_decision: Optional[dict[str, Any]] = None
    gen_decision: Optional[dict[str, Any]] = None
    governance_decision: Optional[GovernanceDecision] = None
    timestamp: str = field(default_factory=lambda: datetime.utcnow().isoformat() + "Z")


class DecisionEngine:
    """
    SME-DEC — Decision Engine.
    Coordinates SME-TXT outputs and SME-GEN actions via GovernanceKernel.
    Enforces authority chain; no cross-layer mutation.
    """
    
    def __init__(
        self,
        config: Optional[DecisionConfig] = None,
        governance_kernel: Optional[GovernanceKernel] = None,
    ):
        self.config = config or DecisionConfig()
        self.governance = governance_kernel or GovernanceKernel()
    
    def decide(
        self,
        intent_id: str,
        fused_embedding: Any,  # Fused embeddings from SME-FUSE
        txt_response: Any,      # SME-TXT response
        gen_request: Optional[Any] = None,  # SME-GEN request if needed
        authority_record: Optional[Any] = None,
        validation_record: Optional[Any] = None,
        fusion_record: Optional[Any] = None,
    ) -> DecisionRecord:
        """
        Make governance decision coordinating text and generation.
        """
        decision_id = f"dec-{uuid.uuid4().hex[:12]}"
        timestamp = datetime.utcnow().isoformat() + "Z"
        
        # Build governance context
        gov_context = GovernanceContext(
            intent_id=intent_id,
            fused_embedding=fused_embedding,
            txt_response=txt_response,
            gen_request=gen_request,
            authority_record=authority_record,
            validation_record=validation_record,
            fusion_record=fusion_record,
        )
        
        # Run governance kernel
        gov_decision = self.governance.decide(gov_context)
        
        # Extract text decision
        txt_decision = {
            "text": getattr(txt_response, 'text', ''),
            "tokens_generated": getattr(txt_response, 'tokens_generated', 0),
            "finish_reason": getattr(txt_response, 'finish_reason', 'stop'),
        }
        
        # Extract generation decision
        gen_decision = None
        if gov_decision.requires_generation and gen_request:
            gen_decision = {
                "modality": gen_request.modality,
                "approved": gov_decision.generation_approved,
                "authority_grant_id": gov_decision.authority_grant_id,
                "fallback_to_cpu": gov_decision.fallback_to_cpu,
            }
        
        record = DecisionRecord(
            decision_id=decision_id,
            intent_id=intent_id,
            txt_decision=txt_decision,
            gen_decision=gen_decision,
            governance_decision=gov_decision,
            timestamp=timestamp,
        )
        
        return record


# Minimal GovernanceKernel implementation
class GovernanceKernel:
    """
    Governance decision pipeline.
    Evaluates authority, validation, fusion, and decides on generation.
    """
    
    def __init__(self):
        pass
    
    def decide(self, context: Any) -> "GovernanceDecision":
        """Make governance decision"""
        # Check authority grant for generation
        requires_generation = context.gen_request is not None
        generation_approved = False
        authority_grant_id = None
        fallback_to_cpu = False
        
        if requires_generation:
            # Check if authority record grants generation
            auth_record = context.authority_record
            if auth_record and auth_record.granted:
                # Check if generation was in modifications
                if "generation_approved" in auth_record.modifications:
                    generation_approved = True
                    authority_grant_id = auth_record.modifications.get("authority_grant_id")
                else:
                    # Require explicit authority grant
                    fallback_to_cpu = True
        
        return GovernanceDecision(
            requires_generation=requires_generation,
            generation_approved=generation_approved,
            authority_grant_id=authority_grant_id,
            fallback_to_cpu=fallback_to_cpu,
            reason="Governance decision based on authority chain",
        )


@dataclass
class GovernanceContext:
    """Context for governance decision"""
    intent_id: str
    fused_embedding: Any
    txt_response: Any
    gen_request: Any
    authority_record: Any
    validation_record: Any
    fusion_record: Any


@dataclass
class GovernanceDecision:
    """Governance decision output"""
    requires_generation: bool
    generation_approved: bool
    authority_grant_id: Optional[str]
    fallback_to_cpu: bool
    reason: str


if __name__ == "__main__":
    # Demo
    engine = DecisionEngine()
    
    # Mock records
    class MockTxtResponse:
        text = "This is a generated response."
        tokens_generated = 10
        finish_reason = "stop"
    
    class MockAuthRecord:
        granted = True
        modifications = {"generation_approved": True, "authority_grant_id": "grant-123"}
    
    record = engine.decide(
        intent_id="test-123",
        fused_embedding=None,
        txt_response=MockTxtResponse(),
        gen_request="gen-request",
        authority_record=MockAuthRecord(),
    )
    
    print(f"Decision: {record.decision_id}")
    print(f"Text: {record.txt_decision}")
    print(f"Gen: {record.gen_decision}")
    print(f"Gov: {record.governance_decision}")