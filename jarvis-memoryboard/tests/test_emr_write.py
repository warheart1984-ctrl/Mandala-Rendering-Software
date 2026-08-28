"""Governed EMR write tools — remember / upsert / abstention / conflict membrane."""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from app.emr import reset_stm_for_tests
from app.emr_tool import tool_catalog
from app.emr_write import EmrRememberRequest, EmrUpsertRequest, emr_remember, emr_upsert
from app.main import app
from app.models import MemoryCreate
from app.store import JarvisStore, reset_store_for_tests


@pytest.fixture(autouse=True)
def _clean(monkeypatch):
    reset_stm_for_tests()
    reset_store_for_tests()
    monkeypatch.setenv("JARVIS_MCP_WRITE_ENABLED", "true")
    monkeypatch.delenv("EMR_RECALL_API_KEY", raising=False)
    monkeypatch.delenv("JARVIS_MCP_FIXED_SOURCE_AGENT", raising=False)
    yield
    reset_stm_for_tests()
    reset_store_for_tests()


@pytest.fixture
def store(tmp_path, monkeypatch):
    db = tmp_path / "ledger.json"
    monkeypatch.setenv("JARVIS_STORE_PATH", str(db))
    return JarvisStore(path=str(db))


def test_tool_catalog_includes_three_tools():
    cat = tool_catalog()
    names = [t["function"]["name"] for t in cat["tools"]]
    assert names == ["emr_recall", "emr_remember", "emr_upsert"]
    assert cat["write_policy"]["emr_recall"] == "read"
    assert "write-draft" in cat["write_policy"]["emr_remember"]


def test_remember_creates_draft(store: JarvisStore):
    resp = emr_remember(
        store,
        EmrRememberRequest(
            content="Prefer signed Halstead images bottom-right.",
            source_agent="chatgpt",
            session_id="sess-1",
            type="preference",
            subject="image-signature",
            tags=["creative"],
            user_requested=True,
            user_statement="Please remember my signature preference",
        ),
    )
    assert resp.accepted is True
    assert resp.refused is False
    assert resp.memory is not None
    assert resp.memory["status"] == "draft"
    assert resp.provenance is not None
    assert resp.provenance.content_sha256
    assert resp.provenance.source_agent.startswith("mcp:")
    assert any(e.get("kind") == "user-request" for e in resp.provenance.evidence)


def test_remember_refuses_without_user_requested(store: JarvisStore):
    resp = emr_remember(
        store,
        EmrRememberRequest(
            content="Should not persist without explicit intent.",
            session_id="sess-1",
            type="fact",
            user_requested=False,
        ),
    )
    assert resp.accepted is False
    assert resp.refuse_reason == "user-intent-required"


def test_remember_refuses_when_mcp_write_disabled(store: JarvisStore, monkeypatch):
    monkeypatch.setenv("JARVIS_MCP_WRITE_ENABLED", "false")
    resp = emr_remember(
        store,
        EmrRememberRequest(
            content="Blocked by write flag.",
            session_id="sess-1",
            type="fact",
            user_requested=True,
        ),
    )
    assert resp.accepted is False
    assert resp.refuse_reason == "mcp-write-disabled"


def test_remember_refuses_verified_status(store: JarvisStore):
    resp = emr_remember(
        store,
        EmrRememberRequest(
            content="Trying to sneak verified status.",
            session_id="sess-1",
            type="decision",
            user_requested=True,
            status="verified",
        ),
    )
    assert resp.accepted is False
    assert resp.refuse_reason == "authority-invalid"


def test_remember_refuses_transcript_dump(store: JarvisStore):
    dump = "\n".join(
        [
            "User: hello",
            "Assistant: hi",
            "User: remember all of this chat",
            "Assistant: sure",
            "User: more chatter",
            "Assistant: more reply",
        ]
        + [f"User: line {i}" for i in range(30)]
    )
    resp = emr_remember(
        store,
        EmrRememberRequest(
            content=dump[:2000],
            session_id="sess-1",
            type="fact",
            user_requested=True,
        ),
    )
    assert resp.accepted is False
    assert resp.refuse_reason == "clause-v-transcript-dump"


def test_remember_conflict_membrane(store: JarvisStore):
    store.create_memory(
        MemoryCreate(
            content="Claim A: Polaris is the live demo GPU.",
            source_agent="test",
            session_id="s0",
            type="fact",
            status="verified",
            subject="demo-gpu",
        )
    )
    resp = emr_remember(
        store,
        EmrRememberRequest(
            content="Claim B: Tonga is the live demo GPU.",
            session_id="sess-1",
            type="fact",
            subject="demo-gpu",
            user_requested=True,
            user_statement="Remember the GPU is Tonga",
        ),
    )
    assert resp.accepted is False
    assert resp.refuse_reason == "conflict-membrane"
    assert resp.conflicts


def test_upsert_supersedes_with_lineage(store: JarvisStore):
    old = store.create_memory(
        MemoryCreate(
            content="Old preference: cream background.",
            source_agent="test",
            session_id="s0",
            type="preference",
            status="draft",
            subject="ui-theme",
        )
    )
    resp = emr_upsert(
        store,
        EmrUpsertRequest(
            id=old.id,
            content="Updated preference: charcoal background with amber accent.",
            session_id="sess-2",
            user_requested=True,
            user_statement="Update my theme preference",
        ),
    )
    assert resp.accepted is True
    assert resp.memory is not None
    assert resp.memory["id"] != old.id
    assert resp.memory["supersedes"] == old.id
    assert resp.memory["status"] == "draft"
    archived = store.get_memory(old.id)
    assert archived is not None
    assert archived.status == "archived"
    assert archived.content == "Old preference: cream background."


def test_upsert_refuses_missing_target(store: JarvisStore):
    resp = emr_upsert(
        store,
        EmrUpsertRequest(
            id="mem-does-not-exist",
            content="Orphan update that should fail target lookup.",
            user_requested=True,
        ),
    )
    assert resp.accepted is False
    assert resp.refuse_reason == "target-not-found"


def test_remember_api_endpoint(store: JarvisStore, monkeypatch, tmp_path):
    db = tmp_path / "api-ledger.json"
    monkeypatch.setenv("JARVIS_STORE_PATH", str(db))
    import app.store as store_mod

    store_mod._store = None
    client = TestClient(app)
    r = client.post(
        "/api/jarvis/tools/emr_remember",
        json={
            "content": "Remember to use Vulkan on Polaris for demos.",
            "session_id": "api-sess",
            "type": "decision",
            "subject": "demo-gpu-path",
            "user_requested": True,
            "user_statement": "Please store that",
        },
    )
    assert r.status_code == 200
    body = r.json()
    assert body["accepted"] is True
    assert body["memory"]["status"] == "draft"
    assert body["provenance"]["content_sha256"]


def test_remember_api_refuses_when_flag_off(monkeypatch, tmp_path):
    monkeypatch.setenv("JARVIS_MCP_WRITE_ENABLED", "false")
    monkeypatch.setenv("JARVIS_STORE_PATH", str(tmp_path / "off.json"))
    import app.store as store_mod

    store_mod._store = None
    client = TestClient(app)
    r = client.post(
        "/api/jarvis/tools/emr_remember",
        json={
            "content": "Should be refused by flag.",
            "session_id": "api-sess",
            "type": "fact",
            "user_requested": True,
        },
    )
    assert r.status_code == 200
    body = r.json()
    assert body["accepted"] is False
    assert body["refuse_reason"] == "mcp-write-disabled"
