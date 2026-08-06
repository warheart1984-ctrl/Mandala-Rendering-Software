"""
SME-Core — Constitutional Runtime Package
"""
from .auth.engine import AuthorityEngine, UserIntent, AuthorityRecord
from .auth.policies import ConstitutionalKnowledgeLayer, EvaluationContext, PolicyEvaluation
from .val.engine import ValidationEngine, ValidationConfig, ValidationRecord, ValidationCheck, ResourceQuota
from .fuse.engine import FusionEngine, FusionConfig, FusionRecord, BindingResolver
from .dec.engine import DecisionEngine, DecisionConfig, DecisionRecord
from .evr.engine import ProvenanceRecorder, Frame, ReplayService, ReplayResult, EvidenceBundle
from .contracts import CONTRACTS, resolveAuthority, AuthorityResolution

__all__ = [
    # Auth
    "AuthorityEngine",
    "UserIntent",
    "AuthorityRecord",
    "ConstitutionalKnowledgeLayer",
    "EvaluationContext",
    "PolicyEvaluation",
    # Val
    "ValidationEngine",
    "ValidationConfig",
    "ValidationRecord",
    "ValidationCheck",
    "ResourceQuota",
    # Fuse
    "FusionEngine",
    "FusionConfig",
    "FusionRecord",
    "BindingResolver",
    # Dec
    "DecisionEngine",
    "DecisionConfig",
    "DecisionRecord",
    # EVR
    "ProvenanceRecorder",
    "Frame",
    "ReplayService",
    "ReplayResult",
    "EvidenceBundle",
    # Contracts
    "CONTRACTS",
    "resolveAuthority",
    "AuthorityResolution",
]

__version__ = "1.0.0"