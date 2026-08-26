"""AMUL Architect tests — append-only LTM substrate, lineage, verify/drift.

Constitutional guarantees under test:
  1. Append-only: existing field bytes are never mutated.
  2. Immutability: ledger edits create NEW artifacts; old versions survive.
  3. Compression never becomes truth: every resolution is hash-addressed
     and derivable from the canonical detail artifact.
  4. Verify: rehash detects tampering; drift check detects unanchored
     ledger changes.
"""

from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path

import pytest

import app.amul as amul
from app.amul import (
    AmulField,
    anchor_memory,
    get_field,
    sha256_text,
    verify_field,
)
from app.models import MemoryCreate, MemoryRecord, MemoryUpdate
from app.store import JarvisStore


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _rec(**kwargs) -> MemoryRecord:
    now = _now()
    base = dict(
        id="mem-x",
        content="Default memory content",
        created_at=now,
        updated_at=now,
        source_agent="test",
        session_id="sess-test",
        type="fact",
        confidence=0.5,
        evidence=[],
        status="draft",
        subject=None,
        tags=[],
        content_sha256="deadbeef",
    )
    base.update(kwargs)
    return MemoryRecord(**base)


@pytest.fixture()
def field() -> AmulField:
    return get_field()


def _store(tmp_path: Path) -> JarvisStore:
    return JarvisStore(str(tmp_path / "ledger.json"))


# --- Persistence & append-only ---


def test_append_only_prefix_never_mutated(field: AmulField):
    rec = _rec(id="mem-a1")
    anchor_memory(rec, field)
    bytes_after_first = Path(field.path).read_bytes()

    rec2 = _rec(id="mem-a2", content="Second particle")
    anchor_memory(rec2, field)
    bytes_after_second = Path(field.path).read_bytes()

    assert bytes_after_second.startswith(bytes_after_first)  # prefix intact


def test_field_survives_reopen(field: AmulField):
    anchor_memory(_rec(id="mem-p", content="Durable truth"), field)
    n = field.count
    reopened = AmulField(field.path)
    assert reopened.count == n
    assert reopened.latest("mem-p", "detail").payload == "Durable truth"


# --- Resolution artifacts & idempotence ---


def test_anchor_creates_three_hashed_resolutions(field: AmulField):
    report = anchor_memory(_rec(id="mem-r", content="Long canonical decision text"), field)
    assert sorted(report.created) and len(report.created) == 3
    detail = field.latest("mem-r", "detail")
    summary = field.latest("mem-r", "summary")
    evidence = field.latest("mem-r", "evidence")
    for art in (detail, summary, evidence):
        assert sha256_text(art.payload) == art.payload_sha256
    # compression never silently becomes truth: summaries point at canonical detail
    assert summary.derived_from == [detail.artifact_id]
    assert evidence.derived_from == [detail.artifact_id]


def test_reanchor_unchanged_is_idempotent(field: AmulField):
    rec = _rec(id="mem-idem")
    first = anchor_memory(rec, field)
    count_after_first = field.count
    second = anchor_memory(rec, field)
    assert second.created == []
    assert sorted(second.unchanged) == ["detail", "evidence", "summary"]
    assert field.count == count_after_first


# --- Lineage & immutability across edits ---


def test_ledger_edit_creates_new_version_old_survives(field: AmulField):
    rec = _rec(id="mem-v", content="Version one of the decision")
    anchor_memory(rec, field)
    v1_detail = field.latest("mem-v", "detail")

    rec.content = "Version two of the decision"
    rec.updated_at = _now()
    report = anchor_memory(rec, field)
    assert len(report.created) == 3

    v2_detail = field.latest("mem-v", "detail")
    assert v2_detail.payload == "Version two of the decision"
    assert v2_detail.lineage_parent_ids == [v1_detail.artifact_id]
    # old version still retrievable — history not overwritten
    assert field.get(v1_detail.artifact_id).payload.startswith("Version one")


def test_supersedes_links_to_superseded_artifact(field: AmulField):
    old = _rec(id="mem-old", content="Superseded approach")
    anchor_memory(old, field)
    new = _rec(
        id="mem-new",
        content="Replacement approach with lineage",
        supersedes="mem-old",
    )
    anchor_memory(new, field)
    new_detail = field.latest("mem-new", "detail")
    old_detail = field.latest("mem-old", "detail")
    assert new_detail.lineage_parent_ids == [old_detail.artifact_id]


def test_lineage_walk_returns_ordered_versions(field: AmulField):
    rec = _rec(id="mem-chain", content="gen 0")
    for gen in range(3):
        rec.content = f"gen {gen}"
        anchor_memory(rec, field)
    lin = field.lineage("mem-chain")
    assert lin["depth"] >= 6  # 3 generations x (detail+summary+evidence at least detail rows)
    details = [v for v in lin["versions"] if v["resolution"] == "detail"]
    payloads = {field.get(v["artifact_id"]).payload for v in details}
    assert payloads == {"gen 0", "gen 1", "gen 2"}
    parents = {v["parent"] for v in details[1:]}
    assert parents == {details[i]["artifact_id"] for i in range(len(details) - 1)}


# --- Provenance ---


def test_provenance_chain_records_anchor_event(field: AmulField):
    anchor_memory(_rec(id="mem-prov"), field, actor="test-actor")
    art = field.latest("mem-prov", "detail")
    ev = art.provenance_chain[0]
    assert ev.actor == "test-actor"
    assert ev.action == "anchored"
    assert ev.ref.startswith("ledger:mem-prov@")
    assert art.authority_class == "draft"


# --- Verify / drift ---


def test_verify_detects_tampering(field: AmulField):
    anchor_memory(_rec(id="mem-tamper"), field)
    ok = verify_field(field, [])
    assert ok.integrity_ok

    p = Path(field.path)
    lines = p.read_text().splitlines()
    tampered = json.loads(lines[0])
    tampered["payload"] = tampered["payload"] + " EVIL EDIT"
    lines[0] = json.dumps(tampered, separators=(",", ":"))
    p.write_text("\n".join(lines) + "\n")

    bad = verify_field(AmulField(str(p)), [])
    assert not bad.integrity_ok
    assert bad.integrity_failures


def test_drift_detection_and_reanchor_cycle(tmp_path, field: AmulField):
    store = _store(tmp_path)
    created = store.create_memory(
        MemoryCreate(
            content="Original governed decision.",
            source_agent="t",
            session_id="s",
            type="decision",
            confidence=0.9,
            status="verified",
        )
    )
    anchor_memory(store.get_memory(created.id), field)

    # verify: clean — no drift, nothing unanchored
    r1 = verify_field(field, store.list_memories(limit=999))
    assert r1.drifted_ledger_ids == [] and r1.unanchored_ledger_ids == []

    # ledger mutates WITHOUT re-anchor -> drift detected, artifact untouched
    store.update_memory(
        created.id, MemoryUpdate(content="Mutated decision after the fact.")
    )
    r2 = verify_field(field, store.list_memories(limit=999))
    assert r2.drifted_ledger_ids == [created.id]
    assert field.latest(created.id, "detail").payload == "Original governed decision."

    # re-anchor records drift as a new lineage version (never overwrite)
    anchor_memory(store.get_memory(created.id), field)
    r3 = verify_field(field, store.list_memories(limit=999))
    assert r3.drifted_ledger_ids == []
    assert len([a for a in field.by_ledger(created.id) if a.resolution == "detail"]) == 2


def test_unanchored_memories_reported(field: AmulField):
    anchored = _rec(id="mem-anch")
    floating = _rec(id="mem-float", content="Never anchored particle")
    anchor_memory(anchored, field)
    report = verify_field(field, [anchored, floating])
    assert "mem-float" in report.unanchored_ledger_ids
    assert "mem-anch" not in report.unanchored_ledger_ids


# deleted-from-ledger histories remain verifiable in the field
def test_deleted_ledger_history_preserved(field: AmulField):
    ghost = _rec(id="mem-ghost-field", content="Only the field remembers")
    anchor_memory(ghost, field)
    report = verify_field(field, [])  # empty live ledger
    assert report.integrity_ok
    assert field.latest("mem-ghost-field", "detail").payload == "Only the field remembers"


def test_route_anchor_and_status():
    from unittest.mock import patch
    from tempfile import mktemp
    from fastapi.testclient import TestClient
    from app.main import app

    store = JarvisStore(mktemp(suffix=".json"))
    created = store.create_memory(
        MemoryCreate(
            content="Route-level anchoring decision.",
            source_agent="t",
            session_id="s",
            type="decision",
            confidence=0.9,
            status="verified",
        )
    )
    with patch("app.main.get_store", return_value=store), patch(
        "app.main.get_field", return_value=get_field()
    ):
        client = TestClient(app)
        resp = client.post(
            "/api/jarvis/memory/amul/anchor",
            json={"memory_id": created.id},
        )
        assert resp.status_code == 200
        data = resp.json()
        assert len(data["created"]) == 3

        status = client.get("/api/jarvis/memory/amul/field/status").json()
        assert status["artifact_count"] >= 3
        assert status["append_only"] is True

        lin = client.get(f"/api/jarvis/memory/amul/lineage/{created.id}").json()
        assert lin["depth"] == 3

        missing = client.get("/api/jarvis/memory/amul/artifacts/art-nope")
        assert missing.status_code == 404
