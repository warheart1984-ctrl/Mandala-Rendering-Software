"""Dustjacket Agent Service Grafana-track tests (offline)."""

from __future__ import annotations

import os
import asyncio
import sys
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

AGENT_SERVICE_DIR = Path(__file__).resolve().parents[1] / "agent-service"
if str(AGENT_SERVICE_DIR) not in sys.path:
    sys.path.insert(0, str(AGENT_SERVICE_DIR))

from main import (  # noqa: E402
    build_prometheus_lines,
    push_frame_metrics,
)
from main import app as agent_app  # noqa: E402


def test_build_prometheus_lines_format():
    payload = build_prometheus_lines(
        shot_id="shot-001",
        backend="rt4d-render",
        anime_claim=True,
        total_ms=12.7,
        structure_render_ms=7.6,
        beauty_render_ms=5.1,
        api_latency_ms=12.7,
        tokens_used=120,
    )
    assert payload.endswith("\n")
    assert 'mrs_frame_duration_ms{shot="shot-001",backend="rt4d-render",anime_claim="true"} 12.7 ' in payload
    assert 'mrs_structure_render_ms{shot="shot-001"} 7.6 ' in payload
    assert 'mrs_beauty_render_ms{shot="shot-001",backend="rt4d-render"} 5.1 ' in payload
    assert 'mrs_api_latency_ms{shot="shot-001",backend="rt4d-render"} 12.7 ' in payload
    assert 'mrs_tokens_used{shot="shot-001",backend="rt4d-render"} 120 ' in payload


def test_build_prometheus_lines_no_optionals():
    payload = build_prometheus_lines(
        shot_id="s", backend="rt4d", anime_claim=False, total_ms=1.0,
        structure_render_ms=0.6, beauty_render_ms=0.4,
    )
    assert "mrs_api_latency_ms" not in payload
    assert "mrs_tokens_used" not in payload


def test_push_frame_metrics_unconfigured_returns_false(monkeypatch):
    monkeypatch.setattr("main.GRAFANA_INSTANCE", "")
    monkeypatch.setattr("main.GRAFANA_PROMETHEUS_URL", "")
    monkeypatch.setattr("main.GRAFANA_API_KEY", "")
    ok = asyncio.run(push_frame_metrics(
        shot_id="s", backend="rt4d", anime_claim=False, total_ms=1.0,
        structure_render_ms=0.6, beauty_render_ms=0.4,
    ))
    assert ok is False


class _FakeResp:
    def raise_for_status(self):
        pass

    def json(self):
        return {"run_id": "run-1", "provider": "rt4d-render", "status": "ok"}


class _FakeClient:
    def __init__(self, *args, **kwargs):
        pass

    async def __aenter__(self):
        return self

    async def __aexit__(self, *args):
        return False

    async def post(self, url, json=None):
        return _FakeResp()


def test_query_reports_grafana_pushed(monkeypatch):
    import httpx
    monkeypatch.setattr(httpx, "AsyncClient", _FakeClient)

    async def _fake_push(*args, **kwargs):
        return True

    monkeypatch.setattr("main.push_frame_metrics", _fake_push)

    client = TestClient(agent_app)
    resp = client.post("/query", json={"prompt": "anime cyberpunk tesseract", "frame_count": 1})
    assert resp.status_code == 200
    body = resp.json()
    assert body["status"] == "completed"
    assert body["grafana_pushed"] is True
    assert body["frames"][0]["provider"] == "rt4d-render"


def test_query_reports_grafana_not_pushed(monkeypatch):
    import httpx
    monkeypatch.setattr(httpx, "AsyncClient", _FakeClient)

    async def _fake_push(*args, **kwargs):
        return False

    monkeypatch.setattr("main.push_frame_metrics", _fake_push)

    client = TestClient(agent_app)
    resp = client.post("/query", json={"prompt": "tesseract lattice", "frame_count": 2})
    assert resp.status_code == 200
    assert resp.json()["grafana_pushed"] is False
