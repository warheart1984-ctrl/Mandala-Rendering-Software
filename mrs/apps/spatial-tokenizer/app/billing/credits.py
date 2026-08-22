"""SQLite Spatial Credit store — webhook mints; atomic consume for HoloMath_Read."""

from __future__ import annotations

import hashlib
import secrets
import sqlite3
import threading
import uuid
from contextlib import contextmanager
from dataclasses import dataclass
from pathlib import Path
from typing import Iterator, Optional

# uuid used by mint_credit_from_session


TOKEN_PREFIX = "holo_"


@dataclass
class MintedCredit:
    credit_id: str
    plaintext_token: str
    token_hash: str
    stripe_session_id: str
    stripe_event_id: str


class CreditStore:
    """Persists pending checkouts + one-use Spatial Credits with uniqueness constraints."""

    def __init__(self, db_path: str) -> None:
        self.db_path = db_path
        Path(db_path).parent.mkdir(parents=True, exist_ok=True)
        self._lock = threading.RLock()
        self._init_schema()

    @contextmanager
    def _conn(self) -> Iterator[sqlite3.Connection]:
        conn = sqlite3.connect(self.db_path, timeout=30.0, isolation_level=None)
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA foreign_keys = ON")
        try:
            yield conn
        finally:
            conn.close()

    def _init_schema(self) -> None:
        with self._lock, self._conn() as conn:
            conn.executescript(
                """
                CREATE TABLE IF NOT EXISTS stripe_events (
                    event_id TEXT PRIMARY KEY,
                    event_type TEXT NOT NULL,
                    created_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP)
                );

                CREATE TABLE IF NOT EXISTS pending_credits (
                    pending_credit_id TEXT PRIMARY KEY,
                    stripe_session_id TEXT UNIQUE,
                    status TEXT NOT NULL CHECK (status IN ('pending', 'paid', 'canceled')),
                    created_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP)
                );

                CREATE TABLE IF NOT EXISTS spatial_credits (
                    id TEXT PRIMARY KEY,
                    token_hash TEXT NOT NULL UNIQUE,
                    stripe_session_id TEXT NOT NULL UNIQUE,
                    stripe_event_id TEXT NOT NULL,
                    amount_paid_cents INTEGER NOT NULL DEFAULT 100,
                    currency TEXT NOT NULL DEFAULT 'usd',
                    reads_remaining INTEGER NOT NULL DEFAULT 1,
                    created_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP),
                    consumed_at TEXT,
                    account_id TEXT
                );

                CREATE INDEX IF NOT EXISTS idx_spatial_credits_token
                    ON spatial_credits(token_hash);
                """
            )

    @staticmethod
    def hash_token(plaintext: str) -> str:
        return hashlib.sha256(plaintext.encode("utf-8")).hexdigest()

    @staticmethod
    def generate_plaintext_token() -> str:
        return TOKEN_PREFIX + secrets.token_urlsafe(32)

    def create_pending_credit(self) -> str:
        pending_id = f"pc_{uuid.uuid4().hex}"
        with self._lock, self._conn() as conn:
            conn.execute(
                "INSERT INTO pending_credits (pending_credit_id, status) VALUES (?, 'pending')",
                (pending_id,),
            )
        return pending_id

    def bind_stripe_session(self, pending_credit_id: str, stripe_session_id: str) -> None:
        with self._lock, self._conn() as conn:
            conn.execute(
                """
                UPDATE pending_credits
                SET stripe_session_id = ?
                WHERE pending_credit_id = ? AND status = 'pending'
                """,
                (stripe_session_id, pending_credit_id),
            )

    def record_stripe_event(self, event_id: str, event_type: str) -> bool:
        """Insert event id. Returns False if duplicate (idempotent webhook)."""
        with self._lock, self._conn() as conn:
            try:
                conn.execute(
                    "INSERT INTO stripe_events (event_id, event_type) VALUES (?, ?)",
                    (event_id, event_type),
                )
                return True
            except sqlite3.IntegrityError:
                return False

    def mint_credit_from_session(
        self,
        *,
        stripe_session_id: str,
        stripe_event_id: str,
        pending_credit_id: Optional[str] = None,
        amount_paid_cents: int = 100,
        currency: str = "usd",
        account_id: Optional[str] = None,
    ) -> Optional[MintedCredit]:
        """
        Mint exactly one credit for a paid Checkout session.
        Returns None if this session already minted (UNIQUE stripe_session_id).
        Plaintext token is returned once to the caller (webhook handler / stub-pay).
        """
        plaintext = self.generate_plaintext_token()
        token_hash = self.hash_token(plaintext)
        credit_id = f"sc_{uuid.uuid4().hex}"

        with self._lock, self._conn() as conn:
            conn.execute("BEGIN IMMEDIATE")
            try:
                # Already minted for this session?
                existing = conn.execute(
                    "SELECT id FROM spatial_credits WHERE stripe_session_id = ?",
                    (stripe_session_id,),
                ).fetchone()
                if existing:
                    conn.execute("COMMIT")
                    return None

                conn.execute(
                    """
                    INSERT INTO spatial_credits (
                        id, token_hash, stripe_session_id, stripe_event_id,
                        amount_paid_cents, currency, reads_remaining, account_id
                    ) VALUES (?, ?, ?, ?, ?, ?, 1, ?)
                    """,
                    (
                        credit_id,
                        token_hash,
                        stripe_session_id,
                        stripe_event_id,
                        amount_paid_cents,
                        currency,
                        account_id,
                    ),
                )

                if pending_credit_id:
                    conn.execute(
                        """
                        UPDATE pending_credits
                        SET status = 'paid', stripe_session_id = COALESCE(stripe_session_id, ?)
                        WHERE pending_credit_id = ?
                        """,
                        (stripe_session_id, pending_credit_id),
                    )
                else:
                    # Mark any pending row bound to this session
                    conn.execute(
                        """
                        UPDATE pending_credits
                        SET status = 'paid'
                        WHERE stripe_session_id = ? AND status = 'pending'
                        """,
                        (stripe_session_id,),
                    )

                conn.execute("COMMIT")
            except sqlite3.IntegrityError:
                conn.execute("ROLLBACK")
                return None
            except Exception:
                conn.execute("ROLLBACK")
                raise

        return MintedCredit(
            credit_id=credit_id,
            plaintext_token=plaintext,
            token_hash=token_hash,
            stripe_session_id=stripe_session_id,
            stripe_event_id=stripe_event_id,
        )

    def credit_status(self, plaintext_token: str) -> dict:
        token_hash = self.hash_token(plaintext_token)
        with self._lock, self._conn() as conn:
            row = conn.execute(
                """
                SELECT id, reads_remaining, consumed_at, amount_paid_cents, currency
                FROM spatial_credits WHERE token_hash = ?
                """,
                (token_hash,),
            ).fetchone()
        if not row:
            return {"valid": False, "reads_remaining": 0}
        return {
            "valid": int(row["reads_remaining"]) > 0,
            "reads_remaining": int(row["reads_remaining"]),
            "consumed_at": row["consumed_at"],
            "amount_paid_cents": row["amount_paid_cents"],
            "currency": row["currency"],
        }

    def atomic_consume(self, plaintext_token: str) -> Optional[str]:
        """
        Atomically consume one read.
        Returns credit id on success, None if missing/exhausted (race-safe).
        """
        token_hash = self.hash_token(plaintext_token)
        with self._lock, self._conn() as conn:
            conn.execute("BEGIN IMMEDIATE")
            try:
                cur = conn.execute(
                    """
                    UPDATE spatial_credits
                    SET reads_remaining = reads_remaining - 1,
                        consumed_at = CASE
                            WHEN reads_remaining = 1 THEN CURRENT_TIMESTAMP
                            ELSE consumed_at
                        END
                    WHERE token_hash = ? AND reads_remaining > 0
                    """,
                    (token_hash,),
                )
                if cur.rowcount != 1:
                    conn.execute("COMMIT")
                    return None
                row = conn.execute(
                    "SELECT id FROM spatial_credits WHERE token_hash = ?",
                    (token_hash,),
                ).fetchone()
                conn.execute("COMMIT")
            except Exception:
                conn.execute("ROLLBACK")
                raise
        return str(row["id"]) if row else None

    def refund_credit(self, plaintext_token: str) -> bool:
        """Restore one read after tokenize failure (one-use token refund)."""
        token_hash = self.hash_token(plaintext_token)
        with self._lock, self._conn() as conn:
            conn.execute("BEGIN IMMEDIATE")
            try:
                cur = conn.execute(
                    """
                    UPDATE spatial_credits
                    SET reads_remaining = reads_remaining + 1,
                        consumed_at = NULL
                    WHERE token_hash = ? AND reads_remaining = 0
                    """,
                    (token_hash,),
                )
                conn.execute("COMMIT")
                return cur.rowcount == 1
            except Exception:
                conn.execute("ROLLBACK")
                raise

    def count_credits_for_session(self, stripe_session_id: str) -> int:
        with self._lock, self._conn() as conn:
            row = conn.execute(
                "SELECT COUNT(*) AS n FROM spatial_credits WHERE stripe_session_id = ?",
                (stripe_session_id,),
            ).fetchone()
        return int(row["n"])

    def mark_pending_canceled(self, pending_credit_id: str) -> None:
        with self._lock, self._conn() as conn:
            conn.execute(
                """
                UPDATE pending_credits SET status = 'canceled'
                WHERE pending_credit_id = ? AND status = 'pending'
                """,
                (pending_credit_id,),
            )


_store: Optional[CreditStore] = None
_store_lock = threading.Lock()


def get_credit_store(db_path: Optional[str] = None) -> CreditStore:
    global _store
    with _store_lock:
        if _store is None or (db_path and _store.db_path != db_path):
            from .config import get_billing_config

            path = db_path or get_billing_config().credits_db_path
            _store = CreditStore(path)
        return _store


def reset_credit_store() -> None:
    global _store
    with _store_lock:
        _store = None
