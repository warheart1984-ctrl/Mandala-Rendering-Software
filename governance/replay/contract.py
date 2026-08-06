# governance/replay/contract.py
"""
Replay Contracts - Replay Contract V1 and DRCv1
Mirror of the JS/C# replay contracts for Python runtime.
"""
from dataclasses import dataclass, field
from typing import Dict, List, Set, Optional, Any
from datetime import datetime
from enum import Enum


# Forbidden actions for replay/contract execution
FORBIDDEN_ACTIONS: frozenset = frozenset({
    "execute_specialist_work",
    "mutate_artifacts",
    "generate_artifacts",
    "invoke_external",
    "interpret",
    "escalate_authority",
    "alter_evidence",
    "bypass_governance",
    "bypass_validation",
    "mutate_evidence",
    "delete_audit_records",
    "bypass_authority",
    "modify_governance",
    "generate_media",
    "bypass_resource_limits",
    "bypass_safety_policy",
    "mutate_evidence",
    "delete_audit_records",
    "bypass_authority",
    "modify_governance",
    "generate_media",
    "bypass_resource_limits",
    "bypass_safety_policy",
})


# Required evidence fields for replay/contract execution
REQUIRED_EVIDENCE_FIELDS: frozenset = frozenset({
    "intent_declaration",
    "agent_dispatch_log",
    "output_collection",
    "policy_validation",
    "approval_record",
    "timestamp_chain",
    "authority_chain",
    "evidence_chain",
    "mcp_provenance_chain",
    "conformance_snapshot",
})


class ContractType(Enum):
    """Types of constitutional contracts."""
    REPLAY = "replay"
    EXECUTION = "execution"
    AUTHORITY = "authority"
    VALIDATION = "validation"


@dataclass
class ContractBase:
    """Base class for all constitutional contracts."""
    contract_id: str
    version: str = "1.0"
    contract_type: str = "execution"
    status: str = "declared"  # declared, enforced, deprecated
    created_at: str = field(default_factory=lambda: datetime.now().isoformat())
    
    def to_dict(self) -> dict:
        return {
            "contract_id": self.contract_id,
            "version": self.version,
            "contract_type": self.contract_type,
            "status": self.status,
            "created_at": self.created_at,
        }


class ContractType(Enum):
    REPLAY = "replay"
    EXECUTION = "execution"
    AUTHORITY = "authority"
    VALIDATION = "validation"


@dataclass
class ReplayContractV1:
    """Replay Contract v1 - Governs replay operations."""
    
    contract_id: str = "replay-contract-v1"
    version: str = "1.0"
    contract_type: str = "replay"
    status: str = "enforced"
    
    # Forbidden actions for replay
    forbidden_actions: Set[str] = field(default_factory=lambda: FORBIDDEN_ACTIONS.copy())
    
    # Required evidence fields
    required_evidence_fields: Set[str] = field(default_factory=lambda: REQUIRED_EVIDENCE_FIELDS.copy())
    
    # Conformance flags
    conformance_flags: Dict[str, bool] = field(default_factory=lambda: {
        "authority": True,
        "forbidden_actions": True,
        "required_evidence": True,
        "conformance_snapshot": True,
    })
    
    def validate(self, replay_request: Dict[str, Any]) -> tuple[bool, Optional[str]]:
        """Validate a replay request against contract."""
        
        # Check authority
        if replay_request.get("authority") != "replay-only":
            return False, "authority_invalid"
        
        # Check forbidden actions
        action = replay_request.get("action", "")
        if action in self.forbidden_actions:
            return False, f"forbidden_action: {action}"
        
        # Check required evidence
        evidence = replay_request.get("evidence", {})
        missing = [
            field for field in self.required_evidence_fields
            if field not in evidence
        ]
        if missing:
            return False, f"evidence_incomplete: missing {missing}"
        
        return True, None
    
    def get_conformance_flags(self) -> Dict[str, bool]:
        """Get conformance flags for this contract."""
        return self.conformance_flags.copy()


@dataclass
class DRCv1:
    """Distributed Replay Contract v1 - For distributed replay operations."""
    
    contract_id: str = "drc-v1"
    version: str = "1.0"
    contract_type: str = "replay"
    status: str = "declared"
    
    # DRC-specific fields
    required_node_quorum: int = 3
    max_replay_depth: int = 1000
    timeout_seconds: int = 300
    
    def validate(self, replay_request: Dict[str, Any]) -> tuple[bool, Optional[str]]:
        """Validate a distributed replay request."""
        # Check node quorum
        nodes = replay_request.get("nodes", [])
        if len(nodes) < self.required_node_quorum:
            return False, f"insufficient_node_quorum: need {self.required_node_quorum}, got {len(nodes)}"
        
        return True, None
    
    def to_dict(self) -> dict:
        return {
            "contract_id": "drc-v1",
            "version": "1.0",
            "required_node_quorum": self.required_node_quorum,
            "max_replay_depth": self.max_replay_depth,
            "timeout_seconds": self.timeout_seconds,
        }


# Global contract instances
REPLAY_CONTRACT_V1 = ReplayContractV1()
DRC_V1 = DRCv1()


def get_replay_contract() -> 'ReplayContractV1':
    """Get the global replay contract instance."""
    return ReplayContractV1()


def get_drc() -> 'DRCv1':
    """Get the global DRC instance."""
    return DRCv1()


# Export key symbols
__all__ = [
    "FORBIDDEN_ACTIONS",
    "REQUIRED_EVIDENCE_FIELDS",
    "ReplayContractV1",
    "DRCv1",
    "get_replay_contract",
    "get_drc",
]