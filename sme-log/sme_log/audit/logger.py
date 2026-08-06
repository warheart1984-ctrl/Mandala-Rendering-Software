"""
SME-LOG — Audit Log (Append-only, Signed)
Constitutional Contract: contract.sme-log.v1
Authority: audit
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

from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import ed25519


@dataclass
class AuditRecord:
    """Immutable audit record"""
    record_id: str
    bundle_id: str
    intent_id: str
    world_id: str
    timeline_id: str
    event_type: str  # "intent_received", "authority_granted", "validation_passed", "generation_completed", etc.
    event_data: dict[str, Any]
    previous_hash: str  # Hash of previous record (chain)
    record_hash: str   # Hash of this record
    signature: str     # Ed25519 signature
    public_key: str    # Public key for verification
    timestamp: str = field(default_factory=lambda: datetime.utcnow().isoformat() + "Z")


class SigningKeyPair:
    """Ed25519 signing key pair for audit log"""
    
    def __init__(self, private_key: Optional[ed25519.Ed25519PrivateKey] = None):
        if private_key:
            self.private_key = private_key
        else:
            self.private_key = ed25519.Ed25519PrivateKey.generate()
        self.public_key = self.private_key.public_key()
    
    def sign(self, data: bytes) -> bytes:
        return self.private_key.sign(data)
    
    def verify(self, data: bytes, signature: bytes) -> bool:
        try:
            self.public_key.verify(signature, data)
            return True
        except Exception:
            return False
    
    def public_key_pem(self) -> str:
        return self.public_key.public_bytes(
            encoding=serialization.Encoding.PEM,
            format=serialization.PublicFormat.SubjectPublicKeyInfo,
        ).decode()
    
    def private_key_pem(self) -> str:
        return self.private_key.private_bytes(
            encoding=serialization.Encoding.PEM,
            format=serialization.PrivateFormat.PKCS8,
            encryption_algorithm=serialization.NoEncryption(),
        ).decode()
    
    @classmethod
    def from_pem(cls, pem: str) -> "SigningKeyPair":
        private_key = serialization.load_pem_private_key(
            pem.encode(),
            password=None,
        )
        return cls(private_key)


class AuditLog:
    """
    Append-only, signed audit log with Merkle chain.
    Constitutional requirement: tamper-evident, immutable audit trail.
    """
    
    def __init__(
        self,
        db_path: Path,
        signing_key: Optional[SigningKeyPair] = None,
    ):
        self.db_path = Path(db_path)
        self.db_path.parent.mkdir(parents=True, exist_ok=True)
        self.signing_key = signing_key or SigningKeyPair()
        self._init_db()
        self._last_hash = self._get_last_hash()
    
    def _init_db(self) -> None:
        with self._get_conn() as conn:
            conn.executescript("""
                CREATE TABLE IF NOT EXISTS audit_records (
                    record_id TEXT PRIMARY KEY,
                    bundle_id TEXT NOT NULL,
                    intent_id TEXT NOT NULL,
                    world_id TEXT NOT NULL,
                    timeline_id TEXT NOT NULL,
                    event_type TEXT NOT NULL,
                    event_data_json TEXT NOT NULL,
                    previous_hash TEXT NOT NULL,
                    record_hash TEXT NOT NULL,
                    signature TEXT NOT NULL,
                    public_key TEXT NOT NULL,
                    timestamp TEXT NOT NULL
                );
                
                CREATE INDEX IF NOT EXISTS idx_audit_bundle ON audit_records(bundle_id);
                CREATE INDEX IF NOT EXISTS idx_audit_intent ON audit_records(intent_id);
                CREATE INDEX IF NOT EXISTS idx_audit_world ON audit_records(world_id);
                CREATE INDEX IF NOT EXISTS idx_audit_timeline ON audit_records(timeline_id);
                CREATE INDEX IF NOT EXISTS idx_audit_timestamp ON audit_records(timestamp);
            """)
    
    @contextmanager
    def _get_conn(self):
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
    
    def _get_last_hash(self) -> str:
        """Get hash of last record in chain"""
        with self._get_conn() as conn:
            row = conn.execute(
                "SELECT record_hash FROM audit_records ORDER BY timestamp DESC LIMIT 1"
            ).fetchone()
        return row["record_hash"] if row else "genesis"
    
    def _compute_record_hash(self, record: AuditRecord) -> str:
        """Compute hash of record (excluding signature)"""
        data = {
            "record_id": record.record_id,
            "bundle_id": record.bundle_id,
            "intent_id": record.intent_id,
            "world_id": record.world_id,
            "timeline_id": record.timeline_id,
            "event_type": record.event_type,
            "event_data": record.event_data,
            "previous_hash": record.previous_hash,
            "timestamp": record.timestamp,
        }
        data_json = json.dumps(data, sort_keys=True)
        return hashlib.sha256(data_json.encode()).hexdigest()
    
    def append(
        self,
        bundle_id: str,
        intent_id: str,
        world_id: str,
        timeline_id: str,
        event_type: str,
        event_data: dict[str, Any],
    ) -> AuditRecord:
        """Append audit record (append-only)"""
        record_id = f"audit-{uuid.uuid4().hex[:12]}"
        timestamp = datetime.utcnow().isoformat() + "Z"
        
        record = AuditRecord(
            record_id=record_id,
            bundle_id=bundle_id,
            intent_id=intent_id,
            world_id=world_id,
            timeline_id=timeline_id,
            event_type=event_type,
            event_data=event_data,
            previous_hash=self._last_hash,
            record_hash="",  # Will be computed
            signature="",    # Will be computed
            public_key=self.signing_key.public_key_pem(),
            timestamp=timestamp,
        )
        
        # Compute hash
        record.record_hash = self._compute_record_hash(record)
        
        # Sign
        record_data = f"{record.record_hash}{record.previous_hash}".encode()
        signature = self.signing_key.sign(record_data)
        record.signature = signature.hex()
        
        # Store
        with self._get_conn() as conn:
            conn.execute(
                """INSERT INTO audit_records
                   (record_id, bundle_id, intent_id, world_id, timeline_id,
                    event_type, event_data_json, previous_hash, record_hash,
                    signature, public_key, timestamp)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                (
                    record.record_id,
                    record.bundle_id,
                    record.intent_id,
                    record.world_id,
                    record.timeline_id,
                    record.event_type,
                    json.dumps(record.event_data),
                    record.previous_hash,
                    record.record_hash,
                    record.signature,
                    record.public_key,
                    record.timestamp,
                ),
            )
        
        self._last_hash = record.record_hash
        return record
    
    def verify_chain(self) -> tuple[bool, Optional[str]]:
        """Verify entire audit chain integrity"""
        with self._get_conn() as conn:
            rows = conn.execute(
                "SELECT * FROM audit_records ORDER BY timestamp ASC"
            ).fetchall()
        
        expected_prev = "genesis"
        
        for row in rows:
            # Reconstruct record
            record = AuditRecord(
                record_id=row["record_id"],
                bundle_id=row["bundle_id"],
                intent_id=row["intent_id"],
                world_id=row["world_id"],
                timeline_id=row["timeline_id"],
                event_type=row["event_type"],
                event_data=json.loads(row["event_data_json"]),
                previous_hash=row["previous_hash"],
                record_hash=row["record_hash"],
                signature=row["signature"],
                public_key=row["public_key"],
                timestamp=row["timestamp"],
            )
            
            # Verify chain link
            if record.previous_hash != expected_prev:
                return False, f"Chain broken at {record.record_id}: expected {expected_prev}, got {record.previous_hash}"
            
            # Verify record hash
            computed_hash = self._compute_record_hash(record)
            if computed_hash != record.record_hash:
                return False, f"Hash mismatch at {record.record_id}"
            
            # Verify signature
            public_key = serialization.load_pem_public_key(record.public_key.encode())
            try:
                record_data = f"{record.record_hash}{record.previous_hash}".encode()
                public_key.verify(bytes.fromhex(record.signature), record_data)
            except Exception:
                return False, f"Signature verification failed at {record.record_id}"
            
            expected_prev = record.record_hash
        
        return True, None
    
    def verify_record(self, record_id: str) -> tuple[bool, Optional[str]]:
        """Verify single record"""
        with self._get_conn() as conn:
            row = conn.execute(
                "SELECT * FROM audit_records WHERE record_id = ?",
                (record_id,),
            ).fetchone()
        
        if not row:
            return False, "Record not found"
        
        record = AuditRecord(
            record_id=row["record_id"],
            bundle_id=row["bundle_id"],
            intent_id=row["intent_id"],
            world_id=row["world_id"],
            timeline_id=row["timeline_id"],
            event_type=row["event_type"],
            event_data=json.loads(row["event_data_json"]),
            previous_hash=row["previous_hash"],
            record_hash=row["record_hash"],
            signature=row["signature"],
            public_key=row["public_key"],
            timestamp=row["timestamp"],
        )
        
        # Verify hash
        computed_hash = self._compute_record_hash(record)
        if computed_hash != record.record_hash:
            return False, "Hash mismatch"
        
        # Verify signature
        public_key = serialization.load_pem_public_key(record.public_key.encode())
        try:
            record_data = f"{record.record_hash}{record.previous_hash}".encode()
            public_key.verify(bytes.fromhex(record.signature), record_data)
        except Exception:
            return False, "Signature verification failed"
        
        return True, None
    
    def query(
        self,
        bundle_id: Optional[str] = None,
        intent_id: Optional[str] = None,
        world_id: Optional[str] = None,
        timeline_id: Optional[str] = None,
        event_type: Optional[str] = None,
        limit: int = 100,
    ) -> list[AuditRecord]:
        """Query audit records"""
        conditions = []
        params = []
        
        if bundle_id:
            conditions.append("bundle_id = ?")
            params.append(bundle_id)
        if intent_id:
            conditions.append("intent_id = ?")
            params.append(intent_id)
        if world_id:
            conditions.append("world_id = ?")
            params.append(world_id)
        if timeline_id:
            conditions.append("timeline_id = ?")
            params.append(timeline_id)
        if event_type:
            conditions.append("event_type = ?")
            params.append(event_type)
        
        where = "WHERE " + " AND ".join(conditions) if conditions else ""
        params.append(limit)
        
        with self._get_conn() as conn:
            rows = conn.execute(
                f"SELECT * FROM audit_records {where} ORDER BY timestamp DESC LIMIT ?",
                params,
            ).fetchall()
        
        return [
            AuditRecord(
                record_id=row["record_id"],
                bundle_id=row["bundle_id"],
                intent_id=row["intent_id"],
                world_id=row["world_id"],
                timeline_id=row["timeline_id"],
                event_type=row["event_type"],
                event_data=json.loads(row["event_data_json"]),
                previous_hash=row["previous_hash"],
                record_hash=row["record_hash"],
                signature=row["signature"],
                public_key=row["public_key"],
                timestamp=row["timestamp"],
            )
            for row in rows
        ]


if __name__ == "__main__":
    # Demo
    log = AuditLog(Path("./test_audit.db"))
    
    # Append records
    for i in range(5):
        log.append(
            bundle_id="bundle-123",
            intent_id=f"intent-{i}",
            world_id="world-default",
            timeline_id="timeline-1",
            event_type="intent_received" if i == 0 else "processing_step",
            event_data={"step": i, "data": f"step_{i}_data"},
        )
    
    print("Audit records appended")
    
    # Verify chain
    valid, error = log.verify_chain()
    print(f"Chain valid: {valid}")
    if not valid:
        print(f"Error: {error}")
    
    # Query
    records = log.query(bundle_id="bundle-123")
    print(f"Records for bundle: {len(records)}")
    for r in records:
        print(f"  {r.record_id}: {r.event_type} @ {r.timestamp}")