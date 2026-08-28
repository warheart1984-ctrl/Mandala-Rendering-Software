"""EMR Recall Protocol tool tests (read-only v1)."""

from __future__ import annotations

from datetime import datetime, timezone

import pytest
from fastapi.testclient import TestClient

from app.emr import reset_stm_for_tests
from app.emr_tool import EmrRecallRequest, emr_recall, tool_catalog
from app.main import app
from app.models import MemoryCreate
from app.store import JarvisStore


@pytest.fixture(autouse=True)
def _clean():
    reset_stm_for_tests()
    yield
    reset_stm_for_tests()


@pytest.fixture
def store(tmp_path, monkeypatch):
    db = tmp_path / "ledger.json"
    monkeypatch.setenv("JARVIS_STORE_PATH", str(db))
    return JarvisStore(path=str(db))


def test_tool_catalog_exposes_emr_recall():
    cat = tool_catalog()
    assert cat["schema"] == "emr-tool-catalog-v1"
    names = [t["function"]["name"] for t in cat["tools"]]
    assert names[0] == "emr_recall"
    assert "emr_remember" in names
    assert "emr_upsert" in names
    assert cat["write_policy"]["emr_recall"] == "read"


def test_emr_recall_returns_bundle(store: JarvisStore):
    store.create_memory(
        MemoryCreate(
            content="All generated images must be signed J Halstead bottom-right unless overridden.",
            source_agent="test",
            session_id="s1",
            type="preference",
            confidence=0.95,
            evidence=[],
            status="verified",
            subject="image-signature",
            tags=["creative", "image"],
        )
    )
    store.create_memory(
        MemoryCreate(
            content="Unrelated gpu shader tuning note.",
            source_agent="test",
            session_id="s1",
            type="fact",
            confidence=0.5,
            evidence=[],
            status="draft",
        )
    )
    resp = emr_recall(
        store,
        EmrRecallRequest(
            intent="image_generation",
            query="image signature Halstead bottom-right portrait",
            subjects=["image-signature"],
            max_memories=8,
        ),
    )
    assert resp.protocol == "emr-recall-v1"
    assert resp.abstained is False
    assert len(resp.bundle) >= 1
    assert any("Halstead" in item.content for item in resp.bundle)
    assert resp.provenance
    assert any("verified" in " ".join(p.recalled_because) for p in resp.provenance)


def test_emr_recall_structured_intent(store: JarvisStore):
    store.create_memory(
        MemoryCreate(
            content="Constitutional chain requires dual evidence for ascension.",
            source_agent="test",
            session_id="s1",
            type="decision",
            confidence=0.9,
            evidence=[],
            status="verified",
            subject="constitutional-chain",
        )
    )
    resp = emr_recall(
        store,
        EmrRecallRequest(
            intent={
                "operation": "constitutional",
                "domain": "governance",
                "authority_required": "constitutional",
            },
            query="constitutional chain evidence",
            max_memories=4,
        ),
    )
    assert resp.intent_resolved["trigger"] == "constitutional-chain"


def test_emr_recall_api_endpoint(store: JarvisStore, monkeypatch, tmp_path):
    db = tmp_path / "api-ledger.json"
    monkeypatch.setenv("JARVIS_STORE_PATH", str(db))
    import app.store as store_mod
    store_mod._store = None
    client = TestClient(app)
    client.post(
        "/api/jarvis/memory",
        json={
            "content": "Preferred cinematic style: high contrast, volumetric light.",
            "source_agent": "test",
            "session_id": "s1",
            "type": "preference",
            "confidence": 0.9,
            "evidence": [],
            "status": "verified",
            "subject": "creative-style",
        },
    )
    r = client.post(
        "/api/jarvis/tools/emr_recall",
        json={
            "intent": "image_generation",
            "query": "epic dragon fantasy portrait",
            "subjects": ["creative-style"],
            "max_memories": 8,
        },
    )
    assert r.status_code == 200
    body = r.json()
    assert body["protocol"] == "emr-recall-v1"
    assert "bundle" in body
