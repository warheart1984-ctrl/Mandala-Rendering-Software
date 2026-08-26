"""Stripe Billing Meter outbox — meter successful reads only."""

from __future__ import annotations

import os
from pathlib import Path
from unittest.mock import MagicMock, patch

import pytest
from fastapi.testclient import TestClient

os.environ.pop("REQUIRE_CREDIT", None)
os.environ.pop("STRIPE_SECRET_KEY", None)
os.environ["ALLOW_STUB_PAY"] = "1"
os.environ["PUBLIC_BASE_URL"] = "http://testserver"
os.environ["STRIPE_METER_ENABLED"] = "0"


@pytest.fixture()
def credit_db(tmp_path: Path, monkeypatch: pytest.MonkeyPatch):
    db = tmp_path / "credits.sqlite3"
    monkeypatch.setenv("SPATIAL_CREDITS_DB", str(db))
    monkeypatch.setenv("ALLOW_STUB_PAY", "1")
    monkeypatch.setenv("REQUIRE_CREDIT", "0")
    monkeypatch.setenv("STRIPE_METER_ENABLED", "1")
    monkeypatch.setenv("STRIPE_METER_EVENT", "successful_read")
    monkeypatch.setenv("STRIPE_DEFAULT_CUSTOMER_ID", "cus_test_123")
    monkeypatch.setenv("METER_SYNC_FLUSH", "0")
    monkeypatch.setenv("METER_FAIL_CLOSED", "0")
    monkeypatch.delenv("STRIPE_SECRET_KEY", raising=False)

    from app.billing.config import reset_billing_config_cache
    from app.billing.credits import reset_credit_store
    from app.billing.meter import reset_meter_outbox

    reset_billing_config_cache()
    reset_credit_store()
    reset_meter_outbox()
    yield db
    reset_billing_config_cache()
    reset_credit_store()
    reset_meter_outbox()


@pytest.fixture()
def client(credit_db: Path):
    from app.main import app

    return TestClient(app)


def test_successful_read_enqueues_outbox(client: TestClient, credit_db: Path):
    r = client.post("/v1/spatial-tokenize", json={"resolution": 8})
    assert r.status_code == 200
    body = r.json()
    assert "read_id" in body
    assert body["meter"]["metered"] is True
    assert body["meter"]["queued"] is True
    assert body["meter"]["identifier"] == f"read:{body['read_id']}"

    from app.billing.meter import get_meter_outbox

    pending = get_meter_outbox(str(credit_db)).pending_count()
    assert pending == 1


def test_duplicate_enqueue_same_read_id_is_idempotent(credit_db: Path):
    from app.billing.meter import get_meter_outbox

    outbox = get_meter_outbox(str(credit_db))
    a = outbox.enqueue_successful_read(
        read_id="same-read",
        stripe_customer_id="cus_1",
        event_name="successful_read",
    )
    b = outbox.enqueue_successful_read(
        read_id="same-read",
        stripe_customer_id="cus_1",
        event_name="successful_read",
    )
    assert a == b
    assert outbox.pending_count() == 1


def test_flush_without_stripe_skips(client: TestClient):
    client.post("/v1/spatial-tokenize", json={"resolution": 8})
    r = client.post("/v1/billing/meter-flush")
    assert r.status_code == 200
    body = r.json()
    assert body["sent"] == 0
    assert body["reason"] == "stripe_not_configured"
    assert body["status"] == "declared"


def test_flush_sends_with_mock_stripe(client: TestClient, monkeypatch):
    monkeypatch.setenv("STRIPE_SECRET_KEY", "sk_test_fake")
    from app.billing.config import reset_billing_config_cache

    reset_billing_config_cache()

    client.post("/v1/spatial-tokenize", json={"resolution": 8})

    mock_create = MagicMock(return_value={"identifier": "ok"})
    with patch("stripe.billing.MeterEvent.create", mock_create):
        # Need stripe module present for send_meter_event import path
        r = client.post("/v1/billing/meter-flush")
    assert r.status_code == 200
    body = r.json()
    assert body["sent"] == 1
    assert body["failed"] == 0
    assert mock_create.called
    kwargs = mock_create.call_args.kwargs
    assert kwargs["event_name"] == "successful_read"
    assert kwargs["identifier"].startswith("read:")
    assert kwargs["payload"]["value"] == "1"


def test_meter_status(client: TestClient):
    r = client.get("/v1/billing/meter-status")
    assert r.status_code == 200
    body = r.json()
    assert body["meter_enabled"] is True
    assert body["meter_event"] == "successful_read"
    assert body["billing_status"] == "declared"


def test_no_meter_when_disabled(client: TestClient, monkeypatch, credit_db: Path):
    monkeypatch.setenv("STRIPE_METER_ENABLED", "0")
    from app.billing.config import reset_billing_config_cache
    from app.billing.meter import reset_meter_outbox

    reset_billing_config_cache()
    reset_meter_outbox()

    r = client.post("/v1/spatial-tokenize", json={"resolution": 8})
    assert r.status_code == 200
    assert r.json()["meter"]["metered"] is False

    from app.billing.meter import get_meter_outbox

    # Outbox may still exist from schema init but should have 0 pending for this run
    assert get_meter_outbox(str(credit_db)).pending_count() == 0
