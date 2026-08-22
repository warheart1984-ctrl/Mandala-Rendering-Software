"""
Billing security tests — webhook authority, no success-URL mint, atomic consume.
"""

from __future__ import annotations

import os
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

os.environ.pop("REQUIRE_CREDIT", None)
os.environ.pop("STRIPE_SECRET_KEY", None)
os.environ.pop("STRIPE_WEBHOOK_SECRET", None)
os.environ.pop("STRIPE_HOLOMATH_PRICE_ID", None)
os.environ["ALLOW_STUB_PAY"] = "1"
os.environ["PUBLIC_BASE_URL"] = "http://testserver"


@pytest.fixture()
def credit_db(tmp_path: Path, monkeypatch: pytest.MonkeyPatch):
    db = tmp_path / "credits.sqlite3"
    monkeypatch.setenv("SPATIAL_CREDITS_DB", str(db))
    monkeypatch.setenv("ALLOW_STUB_PAY", "1")
    monkeypatch.delenv("STRIPE_SECRET_KEY", raising=False)
    monkeypatch.delenv("STRIPE_WEBHOOK_SECRET", raising=False)
    monkeypatch.delenv("STRIPE_HOLOMATH_PRICE_ID", raising=False)
    monkeypatch.setenv("REQUIRE_CREDIT", "0")

    from app.billing.config import reset_billing_config_cache
    from app.billing.credits import reset_credit_store

    reset_billing_config_cache()
    reset_credit_store()
    yield db
    reset_billing_config_cache()
    reset_credit_store()


@pytest.fixture()
def client(credit_db: Path):
    from app.main import app

    return TestClient(app)


def test_health_declared_billing(client: TestClient):
    r = client.get("/health")
    assert r.status_code == 200
    body = r.json()
    assert body["status"] == "ok"
    assert body["scheme_auth"] == "VERIFIED_MATH_ENGINE_RX580"
    assert body["billing"] == "declared"
    assert body["stripe_configured"] is False


def test_tokenize_without_credit_when_require_off(client: TestClient, monkeypatch):
    monkeypatch.setenv("REQUIRE_CREDIT", "0")
    from app.billing.config import reset_billing_config_cache

    reset_billing_config_cache()
    r = client.post("/v1/spatial-tokenize", json={"resolution": 8, "mode": "auto"})
    assert r.status_code == 200
    scheme = r.json()["structuredContent"]
    assert scheme["scheme_auth"] == "VERIFIED_MATH_ENGINE_RX580"
    assert len(scheme["spatial_grid_8x8"]) == 8


def test_402_when_credit_required_and_missing(client: TestClient, monkeypatch):
    monkeypatch.setenv("REQUIRE_CREDIT", "1")
    from app.billing.config import reset_billing_config_cache

    reset_billing_config_cache()
    r = client.post("/v1/spatial-tokenize", json={"resolution": 8})
    assert r.status_code == 402
    body = r.json()
    assert body["error"] == "payment_required"
    assert body["price_usd"] == 1.0
    assert "checkout_url" in body
    assert body["billing_status"] == "declared"


def test_success_url_does_not_mint(client: TestClient):
    from app.billing.config import get_billing_config
    from app.billing.credits import get_credit_store

    store = get_credit_store(get_billing_config().credits_db_path)
    pending = store.create_pending_credit()

    r = client.get(f"/v1/billing/success?pending={pending}&session_id=cs_fake")
    assert r.status_code == 200
    assert store.count_credits_for_session("cs_fake") == 0


def test_stub_pay_mints_once_and_tokenize_consumes(client: TestClient, monkeypatch):
    monkeypatch.setenv("REQUIRE_CREDIT", "1")
    monkeypatch.setenv("ALLOW_STUB_PAY", "1")
    from app.billing.config import get_billing_config, reset_billing_config_cache
    from app.billing.credits import get_credit_store, reset_credit_store

    reset_billing_config_cache()
    reset_credit_store()

    co = client.post("/v1/billing/checkout", json={})
    assert co.status_code == 200
    pending = co.json()["pending_credit_id"]
    assert "stub-pay" in co.json()["checkout_url"]

    pay = client.post(f"/v1/billing/stub-pay?pending={pending}")
    assert pay.status_code == 200
    token = pay.json()["credit_token"]
    assert token.startswith("holo_")

    pay2 = client.post(f"/v1/billing/stub-pay?pending={pending}")
    assert pay2.status_code == 200
    assert pay2.json()["minted"] is False

    r = client.post(
        "/v1/spatial-tokenize",
        json={"resolution": 8, "credit_token": token},
    )
    assert r.status_code == 200
    assert r.json()["structuredContent"]["scheme_auth"] == "VERIFIED_MATH_ENGINE_RX580"

    r2 = client.post(
        "/v1/spatial-tokenize",
        json={"resolution": 8, "credit_token": token},
    )
    assert r2.status_code == 402

    store = get_credit_store(get_billing_config().credits_db_path)
    st = store.credit_status(token)
    assert st["valid"] is False
    assert st["reads_remaining"] == 0


def test_atomic_double_consume_only_one_succeeds(credit_db: Path):
    from app.billing.credits import CreditStore

    store = CreditStore(str(credit_db))
    pending = store.create_pending_credit()
    store.record_stripe_event("evt_atomic", "checkout.session.completed")
    minted = store.mint_credit_from_session(
        stripe_session_id="cs_atomic",
        stripe_event_id="evt_atomic",
        pending_credit_id=pending,
    )
    assert minted is not None
    token = minted.plaintext_token

    assert store.atomic_consume(token) is not None
    assert store.atomic_consume(token) is None


def test_duplicate_stripe_event_no_second_mint(credit_db: Path):
    from app.billing.credits import CreditStore

    store = CreditStore(str(credit_db))
    pending = store.create_pending_credit()
    assert store.record_stripe_event("evt_dup", "checkout.session.completed") is True
    assert store.record_stripe_event("evt_dup", "checkout.session.completed") is False

    m1 = store.mint_credit_from_session(
        stripe_session_id="cs_dup",
        stripe_event_id="evt_dup",
        pending_credit_id=pending,
    )
    m2 = store.mint_credit_from_session(
        stripe_session_id="cs_dup",
        stripe_event_id="evt_dup",
        pending_credit_id=pending,
    )
    assert m1 is not None
    assert m2 is None
    assert store.count_credits_for_session("cs_dup") == 1


def test_forged_webhook_signature_rejected(client: TestClient, monkeypatch):
    monkeypatch.setenv("STRIPE_SECRET_KEY", "sk_test_fake")
    monkeypatch.setenv("STRIPE_WEBHOOK_SECRET", "whsec_fake")
    monkeypatch.setenv("STRIPE_HOLOMATH_PRICE_ID", "price_fake")
    from app.billing.config import reset_billing_config_cache

    reset_billing_config_cache()

    r = client.post(
        "/v1/billing/stripe-webhook",
        content=b'{"id":"evt_x","type":"checkout.session.completed"}',
        headers={"Stripe-Signature": "t=1,v1=deadbeef"},
    )
    assert r.status_code == 400


def test_webhook_duplicate_event_returns_200(client: TestClient, monkeypatch):
    monkeypatch.setenv("STRIPE_SECRET_KEY", "sk_test_fake")
    monkeypatch.setenv("STRIPE_WEBHOOK_SECRET", "whsec_test")
    monkeypatch.setenv("STRIPE_HOLOMATH_PRICE_ID", "price_test")
    from app.billing.config import get_billing_config, reset_billing_config_cache
    from app.billing.credits import get_credit_store, reset_credit_store
    from app.billing import stripe_ops

    reset_billing_config_cache()
    reset_credit_store()

    store = get_credit_store(get_billing_config().credits_db_path)
    pending = store.create_pending_credit()

    event = {
        "id": "evt_once",
        "type": "checkout.session.completed",
        "data": {
            "object": {
                "id": "cs_wh_1",
                "payment_status": "paid",
                "amount_total": 100,
                "currency": "usd",
                "metadata": {
                    "product": "holomath_spatial_read",
                    "credits": "1",
                    "pending_credit_id": pending,
                },
            }
        },
    }

    monkeypatch.setattr(
        stripe_ops,
        "construct_webhook_event",
        lambda cfg, payload, sig: event,
    )

    r1 = client.post(
        "/v1/billing/stripe-webhook",
        content=b"{}",
        headers={"Stripe-Signature": "t=1,v1=ok"},
    )
    assert r1.status_code == 200
    assert r1.json()["minted"] is True

    r2 = client.post(
        "/v1/billing/stripe-webhook",
        content=b"{}",
        headers={"Stripe-Signature": "t=1,v1=ok"},
    )
    assert r2.status_code == 200
    assert r2.json().get("duplicate") is True or r2.json().get("minted") is False
    assert store.count_credits_for_session("cs_wh_1") == 1


def test_checkout_does_not_mint(client: TestClient):
    co = client.post("/v1/billing/checkout", json={})
    assert co.status_code == 200
    data = co.json()
    assert "checkout_url" in data
    assert "demo_credit_token" not in data
    assert data["billing_status"] == "declared"
