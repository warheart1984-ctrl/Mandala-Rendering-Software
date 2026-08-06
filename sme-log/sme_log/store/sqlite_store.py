"""
SME-LOG — Evidence Store (SQLite/PostgreSQL)
Constitutional Contract: contract.sme-log.v1
Authority: record
Status: declared
"""
from __future__ import annotations

import hashlib
import json
import sqlite3
import uuid
from contextlib import contextmanager
from dataclasses import dataclass, field
from datetime import datetime
from pathlib import Path
from typing import Any, Optional

import numpy as np


@dataclass
class EvidenceBundle:
    """Complete evidence bundle"""
    bundle_id: str
    intent_id: str
    world_id: str
    timeline_id: str
    artifacts: dict[str, Any] = field(default_factory=dict)
    frames: list[dict[str, Any]] = field(default_factory=list)
    merkle_root: Optional[str] = None
    created_at: str = field(default_factory=lambda: datetime.utcnow().isoformat() + "Z")
    updated_at: str = field(default_factory=lambda: datetime.utcnow().isoformat() + "Z")


@dataclass
class EvidenceArtifact:
    """Individual evidence artifact"""
    artifact_id: str
    bundle_id: str
    artifact_type: str  # "embedding", "transcript", "generation", "decision", etc.
    data: dict[str, Any]
    checksum: str
    created_at: str = field(default_factory=lambda: datetime.utcnow().isoformat() + "Z")


class SQLiteEvidenceStore:
    """
    SQLite-backed evidence store with Merkle tree indexing.
    Constitutional requirement: append-only, tamper-evident.
    """
    
    def __init__(self, db_path: Path):
        self.db_path = Path(db_path)
        self.db_path.parent.mkdir(parents=True, exist_ok=True)
        self._init_db()
    
    def _init_db(self) -> None:
        """Initialize database schema"""
        with self._get_conn() as conn:
            conn.executescript("""
                CREATE TABLE IF NOT EXISTS evidence_bundles (
                    bundle_id TEXT PRIMARY KEY,
                    intent_id TEXT NOT NULL,
                    world_id TEXT NOT NULL,
                    timeline_id TEXT NOT NULL,
                    merkle_root TEXT,
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL
                );
                
                CREATE TABLE IF NOT EXISTS evidence_artifacts (
                    artifact_id TEXT PRIMARY KEY,
                    bundle_id TEXT NOT NULL,
                    artifact_type TEXT NOT NULL,
                    data_json TEXT NOT NULL,
                    checksum TEXT NOT NULL,
                    created_at TEXT NOT NULL,
                    FOREIGN KEY (bundle_id) REFERENCES evidence_bundles(bundle_id)
                );
                
                CREATE TABLE IF NOT EXISTS frames (
                    frame_id TEXT PRIMARY KEY,
                    bundle_id TEXT NOT NULL,
                    frame_json TEXT NOT NULL,
                    created_at TEXT NOT NULL,
                    FOREIGN KEY (bundle_id) REFERENCES evidence_bundles(bundle_id)
                );
                
                CREATE INDEX IF NOT EXISTS idx_bundles_intent ON evidence_bundles(intent_id);
                CREATE INDEX IF NOT EXISTS idx_bundles_world ON evidence_bundles(world_id);
                CREATE INDEX IF NOT EXISTS idx_bundles_timeline ON evidence_bundles(timeline_id);
                CREATE INDEX IF NOT EXISTS idx_artifacts_bundle ON evidence_artifacts(bundle_id);
                CREATE INDEX IF NOT EXISTS idx_frames_bundle ON frames(bundle_id);
            """)
    
    @contextmanager
    def _get_conn(self):
        """Get database connection with row factory"""
        conn = sqlite3.connect(self.db_path)
        conn.row_factory = sqlite3.Row
        try:
            yield conn
            conn.commit()
        except Exception:
            conn.rollback()
            raise
        finally:
            conn.close()
    
    def create_bundle(
        self,
        intent_id: str,
        world_id: str,
        timeline_id: str,
    ) -> EvidenceBundle:
        """Create new evidence bundle"""
        bundle_id = f"bundle-{uuid.uuid4().hex[:12]}"
        now = datetime.utcnow().isoformat() + "Z"
        
        bundle = EvidenceBundle(
            bundle_id=bundle_id,
            intent_id=intent_id,
            world_id=world_id,
            timeline_id=timeline_id,
            created_at=now,
            updated_at=now,
        )
        
        with self._get_conn() as conn:
            conn.execute(
                """INSERT INTO evidence_bundles 
                   (bundle_id, intent_id, world_id, timeline_id, created_at, updated_at)
                   VALUES (?, ?, ?, ?, ?, ?)""",
                (bundle_id, intent_id, world_id, timeline_id, now, now),
            )
        
        return bundle
    
    def get_bundle(self, bundle_id: str) -> Optional[EvidenceBundle]:
        """Retrieve evidence bundle by ID"""
        with self._get_conn() as conn:
            row = conn.execute(
                "SELECT * FROM evidence_bundles WHERE bundle_id = ?",
                (bundle_id,),
            ).fetchone()
        
        if not row:
            return None
        
        return EvidenceBundle(
            bundle_id=row["bundle_id"],
            intent_id=row["intent_id"],
            world_id=row["world_id"],
            timeline_id=row["timeline_id"],
            merkle_root=row["merkle_root"],
            created_at=row["created_at"],
            updated_at=row["updated_at"],
        )
    
    def add_artifact(
        self,
        bundle_id: str,
        artifact_type: str,
        data: dict[str, Any],
    ) -> EvidenceArtifact:
        """Add artifact to bundle"""
        artifact_id = f"art-{uuid.uuid4().hex[:12]}"
        now = datetime.utcnow().isoformat() + "Z"
        data_json = json.dumps(data, sort_keys=True)
        checksum = hashlib.sha256(data_json.encode()).hexdigest()
        
        artifact = EvidenceArtifact(
            artifact_id=artifact_id,
            bundle_id=bundle_id,
            artifact_type=artifact_type,
            data=data,
            checksum=checksum,
            created_at=now,
        )
        
        with self._get_conn() as conn:
            conn.execute(
                """INSERT INTO evidence_artifacts
                   (artifact_id, bundle_id, artifact_type, data_json, checksum, created_at)
                   VALUES (?, ?, ?, ?, ?, ?)""",
                (artifact_id, bundle_id, artifact_type, data_json, checksum, now),
            )
            # Update bundle timestamp
            conn.execute(
                "UPDATE evidence_bundles SET updated_at = ? WHERE bundle_id = ?",
                (now, bundle_id),
            )
        
        return artifact
    
    def get_artifacts(self, bundle_id: str) -> list[EvidenceArtifact]:
        """Get all artifacts for a bundle"""
        with self._get_conn() as conn:
            rows = conn.execute(
                "SELECT * FROM evidence_artifacts WHERE bundle_id = ? ORDER BY created_at",
                (bundle_id,),
            ).fetchall()
        
        return [
            EvidenceArtifact(
                artifact_id=row["artifact_id"],
                bundle_id=row["bundle_id"],
                artifact_type=row["artifact_type"],
                data=json.loads(row["data_json"]),
                checksum=row["checksum"],
                created_at=row["created_at"],
            )
            for row in rows
        ]
    
    def add_frame(self, bundle_id: str, frame: dict[str, Any]) -> None:
        """Add execution frame to bundle"""
        frame_id = frame.get("frame_id", f"frame-{uuid.uuid4().hex[:12]}")
        now = datetime.utcnow().isoformat() + "Z"
        frame_json = json.dumps(frame, sort_keys=True)
        
        with self._get_conn() as conn:
            conn.execute(
                """INSERT INTO frames (frame_id, bundle_id, frame_json, created_at)
                   VALUES (?, ?, ?, ?)""",
                (frame_id, bundle_id, frame_json, now),
            )
    
    def get_frames(self, bundle_id: str) -> list[dict[str, Any]]:
        """Get all frames for a bundle"""
        with self._get_conn() as conn:
            rows = conn.execute(
                "SELECT frame_json FROM frames WHERE bundle_id = ? ORDER BY created_at",
                (bundle_id,),
            ).fetchall()
        
        return [json.loads(row["frame_json"]) for row in rows]
    
    def update_merkle_root(self, bundle_id: str, merkle_root: str) -> None:
        """Update bundle's Merkle root"""
        with self._get_conn() as conn:
            conn.execute(
                "UPDATE evidence_bundles SET merkle_root = ?, updated_at = ? WHERE bundle_id = ?",
                (merkle_root, datetime.utcnow().isoformat() + "Z", bundle_id),
            )
    
    def query_bundles(
        self,
        intent_id: Optional[str] = None,
        world_id: Optional[str] = None,
        timeline_id: Optional[str] = None,
        limit: int = 100,
    ) -> list[EvidenceBundle]:
        """Query bundles with filters"""
        conditions = []
        params = []
        
        if intent_id:
            conditions.append("intent_id = ?")
            params.append(intent_id)
        if world_id:
            conditions.append("world_id = ?")
            params.append(world_id)
        if timeline_id:
            conditions.append("timeline_id = ?")
            params.append(timeline_id)
        
        where = "WHERE " + " AND ".join(conditions) if conditions else ""
        params.append(limit)
        
        with self._get_conn() as conn:
            rows = conn.execute(
                f"SELECT * FROM evidence_bundles {where} ORDER BY created_at DESC LIMIT ?",
                params,
            ).fetchall()
        
        return [
            EvidenceBundle(
                bundle_id=row["bundle_id"],
                intent_id=row["intent_id"],
                world_id=row["world_id"],
                timeline_id=row["timeline_id"],
                merkle_root=row["merkle_root"],
                created_at=row["created_at"],
                updated_at=row["updated_at"],
            )
            for row in rows
        ]


class PostgresEvidenceStore:
    """PostgreSQL-backed evidence store (for production)"""
    
    def __init__(self, dsn: str):
        self.dsn = dsn
        # Implementation would use asyncpg
        raise NotImplementedError("Use SQLiteEvidenceStore for development")


def create_evidence_store(
    db_path: Path = Path("./data/evidence.db"),
) -> SQLiteEvidenceStore:
    """Factory function"""
    return SQLiteEvidenceStore(db_path)


if __name__ == "__main__":
    # Demo
    store = create_evidence_store(Path("./test_evidence.db"))
    
    # Create bundle
    bundle = store.create_bundle("intent-123", "world-default", "timeline-1")
    print(f"Created bundle: {bundle.bundle_id}")
    
    # Add artifacts
    store.add_artifact(bundle.bundle_id, "embedding", {"model": "mobilevit", "dim": 512})
    store.add_artifact(bundle.bundle_id, "decision", {"text": "Hello world", "tokens": 10})
    
    # Retrieve
    retrieved = store.get_bundle(bundle.bundle_id)
    artifacts = store.get_artifacts(bundle.bundle_id)
    print(f"Artifacts: {len(artifacts)}")
    for art in artifacts:
        print(f"  {art.artifact_type}: {art.checksum[:16]}...")