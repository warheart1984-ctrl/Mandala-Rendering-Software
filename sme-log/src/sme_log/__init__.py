"""
SME-LOG - Evidence, Replay, Audit Subsystem
"""
from .store.sqlite_store import (
    SQLiteEvidenceStore,
    PostgresEvidenceStore,
    EvidenceBundle,
    EvidenceArtifact,
    create_evidence_store,
)
from .index.merkle import MerkleTree, MerkleIndex
from .index.replay_index import ReplayIndex, ReplayService, ReplayFrame, ReplayResult
from .audit.logger import AuditLog, AuditRecord, SigningKeyPair
from .api.evidence_api import (
    EvidenceAPI,
    ReplayAPI,
    EvidenceQuery,
    EvidenceResponse,
    create_evidence_api,
)

__all__ = [
    # Store
    "SQLiteEvidenceStore",
    "PostgresEvidenceStore",
    "EvidenceBundle",
    "EvidenceArtifact",
    "create_evidence_store",
    # Index
    "MerkleTree",
    "MerkleIndex",
    # Replay
    "ReplayIndex",
    "ReplayService",
    "ReplayFrame",
    "ReplayResult",
    # Audit
    "AuditLog",
    "AuditRecord",
    "SigningKeyPair",
    # API
    "EvidenceAPI",
    "ReplayAPI",
    "EvidenceQuery",
    "EvidenceResponse",
    "create_evidence_api",
]

__version__ = "1.0.0"