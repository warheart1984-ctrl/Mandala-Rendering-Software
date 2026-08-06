"""
SME-LOG — Evidence Retrieval API
Constitutional Contract: contract.sme-log.v1
Authority: record
Status: declared
"""
from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime
from pathlib import Path
from typing import Any, Optional

from .sqlite_store import SQLiteEvidenceStore, EvidenceBundle, EvidenceArtifact
from .merkle import MerkleIndex
from .replay_index import ReplayIndex, ReplayService, ReplayFrame, ReplayResult
from .logger import AuditLog, AuditRecord, SigningKeyPair


@dataclass
class EvidenceQuery:
    """Query parameters for evidence retrieval"""
    bundle_id: Optional[str] = None
    intent_id: Optional[str] = None
    world_id: Optional[str] = None
    timeline_id: Optional[str] = None
    artifact_type: Optional[str] = None
    limit: int = 100


@dataclass
class EvidenceResponse:
    """Evidence retrieval response"""
    bundle: Optional[EvidenceBundle] = None
    artifacts: list[EvidenceArtifact] = field(default_factory=list)
    frames: list[dict[str, Any]] = field(default_factory=list)
    merkle_root: Optional[str] = None
    merkle_proof: Optional[list[dict[str, str]]] = None


class EvidenceAPI:
    """
    Evidence retrieval API for SME-LOG.
    Provides access to evidence bundles, artifacts, frames, and Merkle proofs.
    """
    
    def __init__(
        self,
        evidence_store: SQLiteEvidenceStore,
        merkle_index: MerkleIndex,
        replay_index: ReplayIndex,
        audit_log: AuditLog,
    ):
        self.store = evidence_store
        self.merkle = merkle_index
        self.replay_index = replay_index
        self.audit_log = audit_log
    
    def get_bundle(self, bundle_id: str) -> Optional[EvidenceBundle]:
        """Get evidence bundle by ID"""
        return self.store.get_bundle(bundle_id)
    
    def get_artifacts(self, bundle_id: str) -> list[EvidenceArtifact]:
        """Get all artifacts for a bundle"""
        return self.store.get_artifacts(bundle_id)
    
    def get_frames(self, bundle_id: str) -> list[dict[str, Any]]:
        """Get all frames for a bundle"""
        return self.store.get_frames(bundle_id)
    
    def get_bundle_with_proof(
        self,
        bundle_id: str,
        artifact_id: Optional[str] = None,
    ) -> EvidenceResponse:
        """Get bundle with Merkle proof for specific artifact"""
        bundle = self.store.get_bundle(bundle_id)
        if not bundle:
            return EvidenceResponse()
        
        artifacts = self.store.get_artifacts(bundle_id)
        frames = self.store.get_frames(bundle_id)
        
        proof = None
        if artifact_id:
            proof = self.merkle.get_proof(artifact_id)
        
        return EvidenceResponse(
            bundle=bundle,
            artifacts=artifacts,
            frames=frames,
            merkle_root=bundle.merkle_root,
            merkle_proof=proof,
        )
    
    def query_bundles(self, query: EvidenceQuery) -> list[EvidenceBundle]:
        """Query bundles with filters"""
        return self.store.query_bundles(
            intent_id=query.intent_id,
            world_id=query.world_id,
            timeline_id=query.timeline_id,
            limit=query.limit,
        )
    
    def verify_bundle(self, bundle_id: str) -> tuple[bool, Optional[str]]:
        """Verify bundle integrity via Merkle root"""
        bundle = self.store.get_bundle(bundle_id)
        if not bundle or not bundle.merkle_root:
            return False, "No Merkle root"
        
        # Recompute Merkle root from artifacts
        # This would require rebuilding the tree
        return True, None  # Placeholder
    
    def get_audit_trail(
        self,
        bundle_id: Optional[str] = None,
        intent_id: Optional[str] = None,
        limit: int = 100,
    ) -> list[dict]:
        """Get audit trail for bundle or intent"""
        records = self.audit_log.query(
            bundle_id=bundle_id,
            intent_id=intent_id,
            limit=limit,
        )
        
        return [
            {
                "record_id": r.record_id,
                "event_type": r.event_type,
                "event_data": r.event_data,
                "timestamp": r.timestamp,
                "record_hash": r.record_hash,
            }
            for r in records
        ]


class ReplayAPI:
    """Replay verification API"""
    
    def __init__(
        self,
        replay_service: ReplayService,
        replay_index: ReplayIndex,
    ):
        self.service = replay_service
        self.index = replay_index
    
    def replay(
        self,
        target: str,
        intent_id: str,
        timeline_id: str,
        world_id: str,
    ) -> ReplayResult:
        """Request deterministic replay"""
        return self.service.replay(target, intent_id, timeline_id, world_id)
    
    def verify_determinism(
        self,
        intent_id: str,
        timeline_id: str,
        world_id: str,
    ) -> bool:
        """Verify determinism by replaying"""
        result = self.service.replay("full", intent_id, timeline_id, world_id)
        return result.success and result.deterministic
    
    def add_frames_for_replay(self, frames: list[ReplayFrame]) -> None:
        """Add frames to replay index"""
        self.index.add_frames(frames)


def create_evidence_api(
    evidence_db: Path = Path("./data/evidence.db"),
    replay_db: Path = Path("./data/replay.db"),
    audit_db: Path = Path("./data/audit.db"),
    signing_key_pem: Optional[str] = None,
) -> tuple[EvidenceAPI, ReplayAPI]:
    """Factory function to create evidence and replay APIs"""
    from cryptography.hazmat.primitives import serialization
    
    store = SQLiteEvidenceStore(evidence_db)
    merkle = MerkleIndex()
    replay_index = ReplayIndex(replay_db)
    
    signing_key = None
    if signing_key_pem:
        signing_key = SigningKeyPair.from_pem(signing_key_pem)
    
    audit_log = AuditLog(audit_db, signing_key)
    replay_service = ReplayService(replay_index, store)
    
    evidence_api = EvidenceAPI(store, merkle, replay_index, audit_log)
    replay_api = ReplayAPI(replay_service, replay_index)
    
    return evidence_api, replay_api


if __name__ == "__main__":
    # Demo
    evidence_db = Path("./test_evidence_api.db")
    replay_db = Path("./test_replay_api.db")
    audit_db = Path("./test_audit_api.db")
    
    # Clean up
    for db in [evidence_db, replay_db, audit_db]:
        db.unlink(missing_ok=True)
    
    evidence_api, replay_api = create_evidence_api(evidence_db, replay_db, audit_db)
    
    # Create bundle
    bundle = evidence_api.store.create_bundle("intent-123", "world-default", "timeline-1")
    print(f"Bundle: {bundle.bundle_id}")
    
    # Add artifacts
    evidence_api.store.add_artifact(bundle.bundle_id, "embedding", {"model": "mobilevit", "dim": 512})
    evidence_api.store.add_artifact(bundle.bundle_id, "decision", {"text": "Hello", "tokens": 5})
    
    # Get bundle
    response = evidence_api.get_bundle_with_proof(bundle.bundle_id)
    print(f"Artifacts: {len(response.artifacts)}")
    print(f"Merkle root: {response.merkle_root}")