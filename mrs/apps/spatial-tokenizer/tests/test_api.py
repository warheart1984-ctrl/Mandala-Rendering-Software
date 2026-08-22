"""
Tests for $1 Spatial Plugin FastAPI gateway (Holo-Scheme V1 + paywall stub).
"""

from __future__ import annotations

import os

import pytest
from fastapi.testclient import TestClient

# Ensure default: no credit required unless test sets it
os.environ.pop("REQUIRE_CREDIT", None)

from app.main import PAYMENT_REQUIRED_MSG, app  # noqa: E402


@pytest.fixture()
def client():
    return TestClient(app)


def test_health(client: TestClient):
    r = client.get("/health")
    assert r.status_code == 200
    body = r.json()
    assert body["status"] == "ok"
    assert body["scheme_auth"] == "VERIFIED_MATH_ENGINE_RX580"


def test_tokenize_200_without_credit_when_require_credit_off(client: TestClient, monkeypatch):
    monkeypatch.delenv("REQUIRE_CREDIT", raising=False)
    # synthetic path (no depth → ramp)
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


def test_tokenize_depth_grid(client: TestClient, monkeypatch):
    monkeypatch.delenv("REQUIRE_CREDIT", raising=False)
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


def test_402_when_credit_required_and_missing(client: TestClient, monkeypatch):
    monkeypatch.setenv("REQUIRE_CREDIT", "1")
    r = client.post("/v1/spatial-tokenize", json={"resolution": 8})
    assert r.status_code == 402
    body = r.json()
    assert body["error"] == "payment_required"
    assert body["price_usd"] == 1
    assert "checkout_url" in body
    assert PAYMENT_REQUIRED_MSG in body["message"]


def test_200_with_valid_credit_when_required(client: TestClient, monkeypatch):
    monkeypatch.setenv("REQUIRE_CREDIT", "1")
    r = client.post(
        "/v1/spatial-tokenize",
        json={"resolution": 8, "credit_token": "credit_ok_testfixture"},
    )
    assert r.status_code == 200
    assert r.json()["structuredContent"]["scheme_auth"] == "VERIFIED_MATH_ENGINE_RX580"


def test_credits_status_and_checkout(client: TestClient):
    bad = client.get("/v1/credits/status", params={"key": "nope"})
    assert bad.status_code == 200
    assert bad.json()["valid"] is False

    co = client.post("/v1/credits/checkout", json={})
    assert co.status_code == 200
    data = co.json()
    assert data["price_usd"] == 1.0
    assert "checkout_url" in data
    assert data["billing_status"] == "declared"
    demo = data["demo_credit_token"]
    ok = client.get("/v1/credits/status", params={"key": demo})
    assert ok.json()["valid"] is True
