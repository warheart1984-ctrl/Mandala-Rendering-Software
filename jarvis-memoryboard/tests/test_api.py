from __future__ import annotations

import tempfile
from pathlib import Path
from unittest.mock import patch

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.store import JarvisStore


def _payload(**kwargs):
    base = {
        "content": "Hello world",
        "source_agent": "test-agent",
        "session_id": "sess-api",
        "type": "fact",
        "confidence": 0.5,
        "status": "draft",
    }
    base.update(kwargs)
    return base


@pytest.fixture(autouse=True)
def _fresh_store():
    tmp = Path(tempfile.mktemp(suffix=".json"))
    store = JarvisStore(str(tmp))
    with patch("app.main.get_store", return_value=store):
        yield


client = TestClient(app)


class TestBoardEndpoints:
    def test_get_board_default(self):
        resp = client.get("/api/jarvis/memory/board")
        assert resp.status_code == 200
        data = resp.json()
        assert "memory_board" in data
        assert data["memory_board"]["board_id"] == "default_board"

    def test_set_board(self):
        payload = {
            "board_id": "custom_board",
            "summary": "Custom board",
            "linked_subsystems": ["jarvis", "mrs"],
        }
        resp = client.post("/api/jarvis/memory/board", json=payload)
        assert resp.status_code == 200
        data = resp.json()
        assert data["memory_board"]["board_id"] == "custom_board"
        assert data["memory_board"]["summary"] == "Custom board"

    def test_patch_board(self):
        resp = client.patch("/api/jarvis/memory/board", json={"summary": "Patched"})
        assert resp.status_code == 200
        assert resp.json()["memory_board"]["summary"] == "Patched"


class TestMemoryEndpoints:
    def test_list_empty(self):
        resp = client.get("/api/jarvis/memory")
        assert resp.status_code == 200
        body = resp.json()
        assert body["memories"] == []
        assert body["selections"] == []

    def test_create_memory(self):
        resp = client.post("/api/jarvis/memory", json=_payload(content="Hello world"))
        assert resp.status_code == 200
        data = resp.json()["memory"]
        assert data["content"] == "Hello world"
        assert data["id"].startswith("mem-")
        assert data["source_agent"] == "test-agent"
        assert data["session_id"] == "sess-api"
        assert data["type"] == "fact"
        assert data["status"] == "draft"
        assert data["content_sha256"]

    def test_create_memory_validation(self):
        resp = client.post("/api/jarvis/memory", json={})
        assert resp.status_code == 422

    def test_create_requires_ledger_fields(self):
        resp = client.post("/api/jarvis/memory", json={"content": "only content"})
        assert resp.status_code == 422

    def test_get_memory(self):
        created = client.post("/api/jarvis/memory", json=_payload(content="Find me")).json()[
            "memory"
        ]
        resp = client.get(f"/api/jarvis/memory/{created['id']}")
        assert resp.status_code == 200
        body = resp.json()
        assert body["memory"]["content"] == "Find me"
        assert body["selection"]["session_id"] == "sess-api"
        assert body["selection"]["source_agent"] == "test-agent"
        assert "why_selected" in body["selection"]

    def test_get_memory_not_found(self):
        resp = client.get("/api/jarvis/memory/nonexistent")
        assert resp.status_code == 404

    def test_update_memory(self):
        created = client.post(
            "/api/jarvis/memory", json=_payload(content="Old", tags=["a"])
        ).json()["memory"]
        resp = client.patch(
            f"/api/jarvis/memory/{created['id']}",
            json={"content": "New", "tags": ["a", "b"], "status": "verified"},
        )
        assert resp.status_code == 200
        data = resp.json()["memory"]
        assert data["content"] == "New"
        assert data["tags"] == ["a", "b"]
        assert data["status"] == "verified"

    def test_update_memory_not_found(self):
        resp = client.patch("/api/jarvis/memory/nonexistent", json={"content": "New"})
        assert resp.status_code == 404

    def test_delete_memory(self):
        created = client.post("/api/jarvis/memory", json=_payload(content="Delete me")).json()[
            "memory"
        ]
        resp = client.delete(f"/api/jarvis/memory/{created['id']}")
        assert resp.status_code == 200
        assert resp.json()["status"] == "deleted"
        get_resp = client.get(f"/api/jarvis/memory/{created['id']}")
        assert get_resp.status_code == 404

    def test_delete_memory_not_found(self):
        resp = client.delete("/api/jarvis/memory/nonexistent")
        assert resp.status_code == 404

    def test_list_memories_returns_all(self):
        client.post("/api/jarvis/memory", json=_payload(content="A"))
        client.post("/api/jarvis/memory", json=_payload(content="B"))
        resp = client.get("/api/jarvis/memory")
        assert len(resp.json()["memories"]) == 2

    def test_list_filter_by_query(self):
        client.post("/api/jarvis/memory", json=_payload(content="Tesseract lattice"))
        client.post("/api/jarvis/memory", json=_payload(content="Glass cathedral"))
        resp = client.get("/api/jarvis/memory", params={"query": "tesseract"})
        assert len(resp.json()["memories"]) == 1

    def test_list_filter_by_truth_scope(self):
        client.post("/api/jarvis/memory", json=_payload(content="Live", status="draft"))
        client.post(
            "/api/jarvis/memory", json=_payload(content="Archived", status="archived")
        )
        resp = client.get("/api/jarvis/memory", params={"truth_scope": "live"})
        assert len(resp.json()["memories"]) == 1

    def test_health_reports_schema(self):
        resp = client.get("/health")
        assert resp.status_code == 200
        assert resp.json()["schema"] == "continuity-ledger-v1"
