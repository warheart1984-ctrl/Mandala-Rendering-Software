"""Deployment auth tests — EMR_RECALL_API_KEY and write gate."""

from __future__ import annotations

import tempfile
from pathlib import Path
from unittest.mock import patch

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.store import JarvisStore, reset_store_for_tests


@pytest.fixture(autouse=True)
def _fresh_store(monkeypatch):
    reset_store_for_tests()
    tmp = Path(tempfile.mktemp(suffix=".json"))
    store = JarvisStore(str(tmp))
    monkeypatch.delenv("EMR_RECALL_API_KEY", raising=False)
    monkeypatch.setenv("JARVIS_MEMORY_WRITE_ENABLED", "true")
    with patch("app.main.get_store", return_value=store):
        yield


client = TestClient(app)


def test_emr_recall_open_without_key():
    resp = client.post(
        "/api/jarvis/tools/emr_recall",
        json={"intent": "code", "query": "test query"},
    )
    assert resp.status_code == 200


def test_emr_recall_requires_key_when_configured(monkeypatch):
    monkeypatch.setenv("EMR_RECALL_API_KEY", "secret-key")
    resp = client.post(
        "/api/jarvis/tools/emr_recall",
        json={"intent": "code", "query": "test query"},
    )
    assert resp.status_code == 401

    resp = client.post(
        "/api/jarvis/tools/emr_recall",
        json={"intent": "code", "query": "test query"},
        headers={"Authorization": "Bearer secret-key"},
    )
    assert resp.status_code == 200


def test_memory_write_disabled(monkeypatch):
    monkeypatch.setenv("JARVIS_MEMORY_WRITE_ENABLED", "false")
    resp = client.post(
        "/api/jarvis/memory",
        json={
            "content": "blocked",
            "source_agent": "test",
            "session_id": "s",
            "type": "fact",
            "confidence": 0.5,
            "status": "draft",
        },
    )
    assert resp.status_code == 403


def test_health_reports_auth_flags(monkeypatch):
    monkeypatch.setenv("EMR_RECALL_API_KEY", "k")
    monkeypatch.setenv("JARVIS_MEMORY_WRITE_ENABLED", "false")
    monkeypatch.setenv("JARVIS_PROTECT_LEDGER_READ", "true")
    monkeypatch.setenv("RENDER", "true")
    resp = client.get("/health")
    body = resp.json()
    assert body["auth"]["emr_recall_key_required"] is True
    assert body["auth"]["ledger_read_protected"] is True
    assert body["memory_write_enabled"] is False
    assert body["deployment"] == "render"


def test_ledger_list_requires_key_when_read_protected(monkeypatch):
    monkeypatch.setenv("EMR_RECALL_API_KEY", "secret-key")
    monkeypatch.setenv("JARVIS_PROTECT_LEDGER_READ", "true")
    resp = client.get("/api/jarvis/memory")
    assert resp.status_code == 401
    resp = client.get(
        "/api/jarvis/memory",
        headers={"Authorization": "Bearer secret-key"},
    )
    assert resp.status_code == 200
