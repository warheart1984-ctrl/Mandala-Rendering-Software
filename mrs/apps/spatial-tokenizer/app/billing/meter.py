"""
Stripe Billing Meter for successful HoloMath_Read only.

Production pattern:
  1. Successful tokenize completes
  2. Persist outbox row in the same DB as credits (transactional intent)
  3. Worker / flush sends stripe.billing.MeterEvent with stable identifier

Do NOT meter failed attempts. Do NOT make Stripe availability part of the
happy-path response unless METER_FAIL_CLOSED=1 and METER_SYNC_FLUSH=1.

Status: declared until STRIPE_SECRET_KEY + meter price are live-configured.
"""

from __future__ import annotations

import json
import sqlite3
import threading
import uuid
from contextlib import contextmanager
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Iterator, Optional

from .config import BillingConfig, get_billing_config


@dataclass
class MeterOutboxRow:
    id: str
    identifier: str
    stripe_customer_id: str
    event_name: str
    value: int
    status: str
    last_error: Optional[str]


class MeterOutbox:
    """SQLite outbox for Stripe Billing Meter events."""

    def __init__(self, db_path: str) -> None:
        self.db_path = db_path
        Path(db_path).parent.mkdir(parents=True, exist_ok=True)
        self._lock = threading.RLock()
        self._init_schema()

    @contextmanager
    def _conn(self) -> Iterator[sqlite3.Connection]:
        conn = sqlite3.connect(self.db_path, timeout=30.0, isolation_level=None)
        conn.row_factory = sqlite3.Row
        try:
            yield conn
        finally:
            conn.close()

    def _init_schema(self) -> None:
        with self._lock, self._conn() as conn:
            conn.executescript(
                """
                CREATE TABLE IF NOT EXISTS meter_outbox (
                    id TEXT PRIMARY KEY,
                    identifier TEXT NOT NULL UNIQUE,
                    stripe_customer_id TEXT NOT NULL,
                    event_name TEXT NOT NULL,
                    value INTEGER NOT NULL DEFAULT 1,
                    status TEXT NOT NULL CHECK (
                        status IN ('pending', 'sent', 'failed')
                    ),
                    attempts INTEGER NOT NULL DEFAULT 0,
                    last_error TEXT,
                    created_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP),
                    sent_at TEXT
                );
                CREATE INDEX IF NOT EXISTS idx_meter_outbox_pending
                    ON meter_outbox(status, created_at);
                """
            )

    def enqueue_successful_read(
        self,
        *,
        read_id: str,
        stripe_customer_id: str,
        event_name: str,
        value: int = 1,
    ) -> str:
        """Persist a pending meter event. identifier = read:<read_id> (idempotent)."""
        identifier = f"read:{read_id}"
        row_id = f"me_{uuid.uuid4().hex}"
        with self._lock, self._conn() as conn:
            try:
                conn.execute(
                    """
                    INSERT INTO meter_outbox (
                        id, identifier, stripe_customer_id, event_name, value, status
                    ) VALUES (?, ?, ?, ?, ?, 'pending')
                    """,
                    (row_id, identifier, stripe_customer_id, event_name, value),
                )
            except sqlite3.IntegrityError:
                # Same read_id already queued — economic exactly-once for retries.
                cur = conn.execute(
                    "SELECT id FROM meter_outbox WHERE identifier = ?",
                    (identifier,),
                )
                existing = cur.fetchone()
                return str(existing["id"]) if existing else row_id
        return row_id

    def list_pending(self, limit: int = 50) -> list[MeterOutboxRow]:
        with self._lock, self._conn() as conn:
            cur = conn.execute(
                """
                SELECT id, identifier, stripe_customer_id, event_name, value,
                       status, last_error
                FROM meter_outbox
                WHERE status = 'pending'
                ORDER BY created_at ASC
                LIMIT ?
                """,
                (limit,),
            )
            return [
                MeterOutboxRow(
                    id=r["id"],
                    identifier=r["identifier"],
                    stripe_customer_id=r["stripe_customer_id"],
                    event_name=r["event_name"],
                    value=int(r["value"]),
                    status=r["status"],
                    last_error=r["last_error"],
                )
                for r in cur.fetchall()
            ]

    def mark_sent(self, row_id: str) -> None:
        with self._lock, self._conn() as conn:
            conn.execute(
                """
                UPDATE meter_outbox
                SET status = 'sent', sent_at = CURRENT_TIMESTAMP, attempts = attempts + 1
                WHERE id = ?
                """,
                (row_id,),
            )

    def mark_failed(self, row_id: str, error: str) -> None:
        with self._lock, self._conn() as conn:
            conn.execute(
                """
                UPDATE meter_outbox
                SET status = 'failed', last_error = ?, attempts = attempts + 1
                WHERE id = ?
                """,
                (error[:2000], row_id),
            )

    def pending_count(self) -> int:
        with self._lock, self._conn() as conn:
            cur = conn.execute(
                "SELECT COUNT(*) AS n FROM meter_outbox WHERE status = 'pending'"
            )
            return int(cur.fetchone()["n"])


_outbox: Optional[MeterOutbox] = None
_outbox_lock = threading.Lock()


def get_meter_outbox(db_path: Optional[str] = None) -> MeterOutbox:
    global _outbox
    path = db_path or get_billing_config().credits_db_path
    with _outbox_lock:
        if _outbox is None or _outbox.db_path != path:
            _outbox = MeterOutbox(path)
        return _outbox


def reset_meter_outbox() -> None:
    global _outbox
    with _outbox_lock:
        _outbox = None


def resolve_stripe_customer(
    *,
    account_id: Optional[str] = None,
    stripe_customer_id: Optional[str] = None,
) -> Optional[dict[str, str]]:
    """
    Customer lookup for metering.

    Production: replace with OAuth → Stripe Customer mapping.
    Declared stub: STRIPE_DEFAULT_CUSTOMER_ID or explicit stripe_customer_id.
    """
    if stripe_customer_id:
        return {
            "user_id": account_id or "anonymous",
            "stripe_customer_id": stripe_customer_id,
        }
    cfg = get_billing_config()
    if cfg.stripe_default_customer_id:
        return {
            "user_id": account_id or "default",
            "stripe_customer_id": cfg.stripe_default_customer_id,
        }
    return None


def send_meter_event(
    *,
    stripe_customer_id: str,
    identifier: str,
    event_name: str,
    value: int = 1,
    stripe_secret_key: Optional[str] = None,
) -> None:
    """Call Stripe Billing Meter API. Raises on StripeError."""
    try:
        import stripe
    except ImportError as exc:
        raise RuntimeError("stripe package not installed") from exc

    key = stripe_secret_key or get_billing_config().stripe_secret_key
    if not key:
        raise RuntimeError("STRIPE_SECRET_KEY not configured")

    stripe.api_key = key
    # stripe.billing.MeterEvent (API 2024+)
    stripe.billing.MeterEvent.create(
        event_name=event_name,
        payload={
            "stripe_customer_id": stripe_customer_id,
            "value": str(value),
        },
        identifier=identifier,
    )


def flush_meter_outbox(
    *,
    limit: int = 50,
    cfg: Optional[BillingConfig] = None,
) -> dict[str, Any]:
    """Send pending outbox rows to Stripe. Idempotent via identifier."""
    cfg = cfg or get_billing_config()
    outbox = get_meter_outbox(cfg.credits_db_path)
    pending = outbox.list_pending(limit=limit)
    sent = 0
    failed = 0
    errors: list[str] = []

    if not cfg.stripe_secret_key:
        return {
            "sent": 0,
            "failed": 0,
            "skipped": len(pending),
            "reason": "stripe_not_configured",
            "status": "declared",
        }

    for row in pending:
        try:
            send_meter_event(
                stripe_customer_id=row.stripe_customer_id,
                identifier=row.identifier,
                event_name=row.event_name,
                value=row.value,
                stripe_secret_key=cfg.stripe_secret_key,
            )
            outbox.mark_sent(row.id)
            sent += 1
        except Exception as exc:  # noqa: BLE001 — persist and continue batch
            outbox.mark_failed(row.id, str(exc))
            failed += 1
            errors.append(f"{row.identifier}: {exc}")

    return {
        "sent": sent,
        "failed": failed,
        "errors": errors[:10],
        "status": cfg.billing_status,
    }


def record_successful_read_usage(
    *,
    read_id: str,
    stripe_customer_id: str,
    cfg: Optional[BillingConfig] = None,
) -> dict[str, Any]:
    """
    Enqueue meter event for a completed successful read.

    Always writes outbox first. Optionally sync-flushes when METER_SYNC_FLUSH=1.
    If sync flush fails and METER_FAIL_CLOSED=1 → raise (caller should 503).
    """
    cfg = cfg or get_billing_config()
    if not cfg.meter_enabled:
        return {"metered": False, "reason": "meter_disabled"}

    outbox = get_meter_outbox(cfg.credits_db_path)
    outbox.enqueue_successful_read(
        read_id=read_id,
        stripe_customer_id=stripe_customer_id,
        event_name=cfg.stripe_meter_event,
        value=1,
    )

    result: dict[str, Any] = {
        "metered": True,
        "queued": True,
        "identifier": f"read:{read_id}",
        "sync_flushed": False,
    }

    if cfg.meter_sync_flush:
        flush = flush_meter_outbox(limit=1, cfg=cfg)
        result["sync_flushed"] = True
        result["flush"] = flush
        if flush.get("failed", 0) > 0 and cfg.meter_fail_closed:
            raise RuntimeError(
                "Unable to record billing usage: "
                + json.dumps(flush.get("errors") or [])
            )

    return result
