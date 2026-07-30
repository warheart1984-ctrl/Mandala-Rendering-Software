"""Acceptance tests for Continuity Ledger trustworthiness.

1. Continuity — store in chat A, restore identical in B and C
2. Replay — every retrieval answers why / where / when / session
3. Conflict — disagreeing memories both surfaced; no silent merge
4. Drift — hash fidelity check + protocol reference (partial)
"""

from __future__ import annotations

import json
import tempfile
from pathlib import Path
from unittest.mock import patch

import pytest
from fastapi.testclient import TestClient

from app.continuity import content_sha256, drift_check
from app.main import app
from app.store import JarvisStore


FIXTURES = Path(__file__).parent / "fixtures"


def _payload(**kwargs):
    base = {
        "content": "x",
        "source_agent": "agent",
        "session_id": "sess",
        "type": "decision",
        "confidence": 0.9,
        "status": "verified",
        "evidence": [],
    }
    base.update(kwargs)
    return base


@pytest.fixture()
def client():
    tmp = Path(tempfile.mktemp(suffix=".json"))
    store = JarvisStore(str(tmp))
    with patch("app.main.get_store", return_value=store):
        yield TestClient(app), store


class TestContinuityAcceptance:
    """Chat A stores → Chat B and Chat C restore the same ledger row."""

    def test_continuity_across_simulated_chats(self, client):
        api, store = client
        # Chat A — write a decision
        created = api.post(
            "/api/jarvis/memory",
            json=_payload(
                content="Use Continuity Ledger as shared SoT for agent memory.",
                source_agent="cursor-chat-a",
                session_id="chat-a",
                type="decision",
                subject="memory-sot",
                evidence=[{"kind": "doc", "ref": "jarvis-memoryboard/README.md"}],
            ),
        ).json()["memory"]
        mem_id = created["id"]
        sha = created["content_sha256"]

        # Chat B — independent retrieve
        b = api.get(
            "/api/jarvis/memory/retrieve",
            params={"query": "Continuity Ledger", "truth_scope": "live"},
        ).json()
        assert len(b["memories"]) == 1
        assert b["memories"][0]["id"] == mem_id
        assert b["memories"][0]["content_sha256"] == sha
        assert b["memories"][0]["session_id"] == "chat-a"

        # Chat C — same result via fresh list + by id
        c_list = api.get(
            "/api/jarvis/memory",
            params={"session_id": "chat-a", "type": "decision"},
        ).json()
        assert len(c_list["memories"]) == 1
        assert c_list["memories"][0]["id"] == mem_id

        c_get = api.get(f"/api/jarvis/memory/{mem_id}").json()["memory"]
        assert c_get["content"] == created["content"]
        assert c_get["content_sha256"] == sha
        assert c_get["source_agent"] == "cursor-chat-a"

        # Store-level third read (simulates process restart within same file)
        again = store.get_memory(mem_id)
        assert again is not None
        assert again.content_sha256 == sha


class TestReplayAcceptance:
    """Every retrieved memory must answer why / where / when / session."""

    def test_retrieve_includes_full_provenance(self, client):
        api, _ = client
        api.post(
            "/api/jarvis/memory",
            json=_payload(
                content="Prefer decision records over chat dumps.",
                source_agent="architect",
                session_id="sess-replay-1",
                type="architecture",
                subject="memory-model",
            ),
        )
        body = api.get(
            "/api/jarvis/memory/retrieve",
            params={"query": "decision records", "type": "architecture"},
        ).json()
        assert len(body["memories"]) == 1
        assert len(body["selections"]) == 1
        sel = body["selections"][0]
        assert sel["memory_id"] == body["memories"][0]["id"]
        assert "why_selected" in sel and sel["why_selected"]
        assert "content matched query" in sel["why_selected"] or "query" in sel["why_selected"]
        assert sel["source_agent"] == "architect"  # where from
        assert sel["created_at"]  # when
        assert sel["session_id"] == "sess-replay-1"  # which session
        assert sel["type"] == "architecture"
        assert sel["status"] == "verified"

    def test_get_by_id_includes_selection(self, client):
        api, _ = client
        mid = api.post(
            "/api/jarvis/memory",
            json=_payload(content="Single get provenance", session_id="sess-g"),
        ).json()["memory"]["id"]
        body = api.get(f"/api/jarvis/memory/{mid}").json()
        assert body["selection"]["session_id"] == "sess-g"
        assert body["selection"]["created_at"]
        assert body["selection"]["source_agent"]


class TestConflictAcceptance:
    """Disagreeing memories are both surfaced; ledger never merges or picks truth."""

    def test_conflict_surfaces_both_no_merge(self, client):
        api, _ = client
        a = api.post(
            "/api/jarvis/memory",
            json=_payload(
                content="Renderer backend must be WebGPU-only.",
                source_agent="agent-a",
                session_id="sess-1",
                subject="renderer-backend",
                confidence=0.7,
            ),
        ).json()["memory"]
        b = api.post(
            "/api/jarvis/memory",
            json=_payload(
                content="Renderer backend must support CPU fallback.",
                source_agent="agent-b",
                session_id="sess-2",
                subject="renderer-backend",
                confidence=0.7,
            ),
        ).json()["memory"]

        conflicts = api.get(
            "/api/jarvis/memory/conflicts", params={"subject": "renderer-backend"}
        ).json()["conflicts"]
        assert len(conflicts) == 1
        cset = conflicts[0]
        assert cset["unresolved"] is True
        ids = {m["id"] for m in cset["memories"]}
        assert ids == {a["id"], b["id"]}
        # Contents remain distinct — no silent merge
        texts = {m["content"] for m in cset["memories"]}
        assert len(texts) == 2
        assert "Do not merge" in cset["policy_hint"]

        # Retrieve also attaches conflicts without collapsing rows
        retrieved = api.get(
            "/api/jarvis/memory/retrieve",
            params={"subject": "renderer-backend", "truth_scope": "live"},
        ).json()
        assert len(retrieved["memories"]) == 2
        assert len(retrieved["conflicts"]) == 1

    def test_supersedes_records_replacement_claim(self, client):
        """supersedes is a continuity edge, not a truth verdict from the ledger."""
        api, _ = client
        old = api.post(
            "/api/jarvis/memory",
            json=_payload(
                content="Use SQLite for memory store.",
                subject="store-engine",
                session_id="s1",
            ),
        ).json()["memory"]
        newer = api.post(
            "/api/jarvis/memory",
            json=_payload(
                content="Use JSON file Continuity Ledger store.",
                subject="store-engine",
                session_id="s2",
                supersedes=old["id"],
                status="verified",
            ),
        ).json()["memory"]
        conflicts = api.get(
            "/api/jarvis/memory/conflicts", params={"subject": "store-engine"}
        ).json()["conflicts"]
        # Recorded supersedes claim → no unresolved multi-hash conflict set
        unresolved = [c for c in conflicts if c["unresolved"]]
        assert unresolved == []
        # Both rows still readable; nothing deleted/merged
        assert api.get(f"/api/jarvis/memory/{old['id']}").status_code == 200
        assert api.get(f"/api/jarvis/memory/{newer['id']}").status_code == 200


class TestDriftAcceptance:
    """Partial: hash fidelity vs baseline fixture. Multi-day protocol is documented."""

    def test_drift_hash_fidelity_against_fixture(self, client):
        api, _ = client
        fixture = json.loads((FIXTURES / "drift_baseline.json").read_text("utf-8"))
        created = api.post(
            "/api/jarvis/memory",
            json=_payload(
                content=fixture["content"],
                source_agent=fixture["source_agent"],
                session_id=fixture["session_id"],
                type=fixture["type"],
                subject=fixture["subject"],
                status="verified",
                confidence=1.0,
            ),
        ).json()["memory"]

        # Simulate later-day retrieve
        retrieved = api.get(f"/api/jarvis/memory/{created['id']}").json()["memory"]
        from app.models import MemoryRecord

        rec = MemoryRecord(**retrieved)
        report = drift_check(fixture["content"], rec)
        assert report["match"] is True
        assert report["expected_sha256"] == fixture["content_sha256"]
        assert report["actual_sha256"] == fixture["content_sha256"]

    def test_drift_detects_mutation(self, client):
        api, _ = client
        fixture = json.loads((FIXTURES / "drift_baseline.json").read_text("utf-8"))
        created = api.post(
            "/api/jarvis/memory",
            json=_payload(content=fixture["content"], subject=fixture["subject"]),
        ).json()["memory"]
        # Mutate content (would be a governance violation in production operators)
        mutated = api.patch(
            f"/api/jarvis/memory/{created['id']}",
            json={"content": fixture["content"] + " [altered]"},
        ).json()["memory"]
        from app.models import MemoryRecord

        report = drift_check(fixture["content"], MemoryRecord(**mutated))
        assert report["match"] is False
