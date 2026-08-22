"""
API smoke tests for Holo-Scheme V1 gateway (paywall off by default).
"""

from __future__ import annotations

import os

import pytest
from fastapi.testclient import TestClient

os.environ.pop("REQUIRE_CREDIT", None)
os.environ.pop("STRIPE_SECRET_KEY", None)
os.environ.pop("STRIPE_WEBHOOK_SECRET", None)
os.environ.pop("STRIPE_HOLOMATH_PRICE_ID", None)

from app.billing.config import reset_billing_config_cache  # noqa: E402
from app.billing.credits import reset_credit_store  # noqa: E402
from app.billing.routes import PAYMENT_REQUIRED_MSG  # noqa: E402
from app.main import app  # noqa: E402


@pytest.fixture()
def client(tmp_path, monkeypatch):
    monkeypatch.setenv("SPATIAL_CREDITS_DB", str(tmp_path / "t.sqlite3"))
    monkeypatch.setenv("REQUIRE_CREDIT", "0")
    monkeypatch.setenv("ALLOW_STUB_PAY", "0")
    reset_billing_config_cache()
    reset_credit_store()
    return TestClient(app)


def test_health(client: TestClient):
    r = client.get("/health")
    assert r.status_code == 200
    body = r.json()
    assert body["status"] == "ok"
    assert body["scheme_auth"] == "VERIFIED_MATH_ENGINE_RX580"
    assert body["billing"] == "declared"


def test_tokenize_200_without_credit_when_require_credit_off(client: TestClient):
    r = client.post("/v1/spatial-tokenize", json={"resolution": 8, "mode": "auto"})
    assert r.status_code == 200
    body = r.json()
    scheme = body["structuredContent"]
    assert scheme["scheme_auth"] == "VERIFIED_MATH_ENGINE_RX580"
    assert scheme["unit_cost"] == "$1.00"
    assert len(scheme["spatial_grid_8x8"]) == 8
    assert all(len(row) == 8 for row in scheme["spatial_grid_8x8"])
    flat = [v for row in scheme["spatial_grid_8x8"] for v in row]
    assert len(flat) == 64
    assert all(0 <= v <= 255 for v in flat)
    assert "llm_summary" in body
    assert "execution_instruction" in scheme


def test_tokenize_depth_grid(client: TestClient):
    w = h = 16
    depth = [((x + y) / 32.0) for y in range(h) for x in range(w)]
    r = client.post(
        "/v1/spatial-tokenize",
        json={"depth_f32": depth, "width": w, "height": h, "resolution": 8},
    )
    assert r.status_code == 200
    scheme = r.json()["holo_scheme"]
    assert scheme["spatial_metadata"]["dimensions"] == [16, 16]
    assert len(scheme["hash"]) == 64


def test_402_message_constant(client: TestClient, monkeypatch):
    monkeypatch.setenv("REQUIRE_CREDIT", "1")
    reset_billing_config_cache()
    r = client.post("/v1/spatial-tokenize", json={"resolution": 8})
    assert r.status_code == 402
    assert PAYMENT_REQUIRED_MSG in r.json()["message"]
    assert "checkout_url" in r.json()


def test_credits_status_invalid(client: TestClient):
    bad = client.get("/v1/credits/status", params={"key": "nope"})
    assert bad.status_code == 200
    assert bad.json()["valid"] is False


def test_checkout_declared_no_instant_credit(client: TestClient):
    co = client.post("/v1/credits/checkout", json={})
    assert co.status_code == 200
    data = co.json()
    assert data["price_usd"] == 1.0
    assert "checkout_url" in data
    assert data["billing_status"] == "declared"
    assert "demo_credit_token" not in data
