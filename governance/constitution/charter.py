# governance/constitution/charter.py
"""
Charter - Constitutional Charter for SME
"""
from dataclasses import dataclass, field
from typing import Dict, List, Optional
from datetime import datetime


@dataclass
class Charter:
    """Constitutional Charter defining the governance framework."""
    
    version: str = "1.0"
    preamble: str = (
        "This Charter establishes the constitutional governance framework "
        "for the Sovereign Multimodal Engine (SME). All nodes, actors, "
        "and operations must comply with this Charter."
    )
    
    # Constitutional principles
    principles: List[str] = field(default_factory=lambda: [
        "No execution without intent",
        "No state change without evidence",
        "No authority without contract",
        "Replayable reality",
        "Sovereign independence",
        "Modality neutrality",
    ])
    
    # Constitutional chain
    constitutional_chain: List[str] = field(default_factory=lambda: [
        "Authority",
        "Validation", 
        "Fusion",
        "Decision",
        "Evidence",
        "Verification",
        "Replay",
        "Audit",
    ])
    
    # Constitutional invariants
    invariants: Dict[str, str] = field(default_factory=lambda: {
        "no_execution_without_intent": "Every operation must have declared intent",
        "no_state_change_without_evidence": "Every state change produces evidence",
        "no_authority_without_contract": "Actors must hold valid authority contracts",
        "replayable_reality": "Deterministic execution given identical inputs",
        "framework_independence": "Constitution governs behavior, not libraries",
        "modality_neutrality": "No modality bypasses constitutional review",
    })
    
    # Node roles
    node_roles: Dict[str, str] = field(default_factory=lambda: {
        "sme-txt": "text_reasoning",
        "sme-vis": "vision_encoding",
        "sme-aud": "audio_transcription",
        "sme-vid": "video_encoding",
        "sme-gen": "generative_media",
        "sme-log": "evidence_replay_audit",
        "sme-core": "orchestration",
    })
    
    # Authority contracts
    authority_contracts: Dict[str, Dict] = field(default_factory=lambda: {
        "sme-core": {"authority": "coordinate", "status": "declared"},
        "sme-txt": {"authority": "infer", "status": "declared"},
        "sme-vis": {"authority": "encode", "status": "declared"},
        "sme-aud": {"authority": "transcribe", "status": "declared"},
        "sme-vid": {"authority": "encode", "status": "declared"},
        "sme-gen": {"authority": "generate", "status": "declared"},
        "sme-log": {"authority": "record", "status": "declared"},
        "director": {"authority": "coordinate", "status": "declared"},
        "user": {"authority": "request", "status": "enforced"},
    })
    
    def __post_init__(self):
        self.created_at = datetime.now().isoformat()
    
    def get_node_role(self, node_id: str) -> Optional[str]:
        """Get the constitutional role for a node."""
        return self.node_roles.get(node_id)
    
    def get_authority(self, node_id: str) -> Optional[Dict]:
        """Get authority contract for a node."""
        return self.authority_contracts.get(node_id)
    
    def validate_node_authority(self, node_id: str, action: str) -> bool:
        """Check if node has authority for action."""
        contract = self.authority_contracts.get(node_id)
        if not contract:
            return False
        # Simplified: would check specific action against contract
        return True
    
    def to_dict(self) -> dict:
        """Serialize charter to dictionary."""
        return {
            "version": self.version,
            "preamble": self.preamble,
            "principles": self.principles,
            "constitutional_chain": self.constitutional_chain,
            "invariants": self.invariants,
            "node_roles": self.node_roles,
            "authority_contracts": self.authority_contracts,
            "created_at": self.created_at,
        }


# Global charter instance
CHARTER = Charter()


def get_charter() -> Charter:
    """Get the global charter instance."""
    return CHARTER