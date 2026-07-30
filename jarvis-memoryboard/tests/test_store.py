from __future__ import annotations

import tempfile
from pathlib import Path

from app.models import MemoryBoard, MemoryCreate, MemoryUpdate, migrate_legacy_record
from app.store import JarvisStore
from app.continuity import content_sha256


def _store() -> JarvisStore:
    tmp = Path(tempfile.mktemp(suffix=".json"))
    return JarvisStore(str(tmp))


def _create(**kwargs) -> MemoryCreate:
    base = dict(
        content="Test memory",
        source_agent="test-agent",
        session_id="sess-test",
        type="fact",
        confidence=0.5,
        status="draft",
    )
    base.update(kwargs)
    return MemoryCreate(**base)


def test_default_board():
    s = _store()
    board = s.get_board()
    assert board.board_id == "default_board"
    assert isinstance(board.slots, list)
    assert isinstance(board.governance, list)


def test_set_board():
    s = _store()
    board = MemoryBoard(
        board_id="test-board",
        summary="Test board",
        linked_subsystems=["jarvis", "mrs"],
    )
    s.set_board(board)
    loaded = s.get_board()
    assert loaded.board_id == "test-board"
    assert loaded.summary == "Test board"


def test_patch_board():
    s = _store()
    s.patch_board({"summary": "Patched summary"})
    assert s.get_board().summary == "Patched summary"


def test_patch_board_ignores_none():
    s = _store()
    s.patch_board({"summary": "New", "linked_subsystems": None})
    assert s.get_board().summary == "New"


def test_create_memory_ledger_fields():
    s = _store()
    rec = s.create_memory(
        _create(
            content="Ship Continuity Ledger",
            type="decision",
            source_agent="ops",
            session_id="chat-a",
            confidence=0.9,
            status="verified",
            subject="continuity-ledger",
        )
    )
    assert rec.id.startswith("mem-")
    assert rec.type == "decision"
    assert rec.source_agent == "ops"
    assert rec.session_id == "chat-a"
    assert rec.status == "verified"
    assert rec.confidence == 0.9
    assert rec.content_sha256 == content_sha256("Ship Continuity Ledger")
    assert rec.created_at
    assert rec.updated_at == rec.created_at
    assert rec.evidence == []


def test_get_memory():
    s = _store()
    rec = s.create_memory(_create(content="Find me"))
    found = s.get_memory(rec.id)
    assert found is not None
    assert found.content == "Find me"


def test_get_memory_missing():
    s = _store()
    assert s.get_memory("nonexistent") is None


def test_update_memory():
    s = _store()
    rec = s.create_memory(_create(content="Original", tags=["a"]))
    updated = s.update_memory(rec.id, MemoryUpdate(content="Updated", tags=["a", "b"]))
    assert updated is not None
    assert updated.content == "Updated"
    assert updated.tags == ["a", "b"]
    assert updated.content_sha256 == content_sha256("Updated")


def test_update_memory_partial():
    s = _store()
    rec = s.create_memory(_create(content="Original", tags=["a"]))
    updated = s.update_memory(rec.id, MemoryUpdate(content="New content only"))
    assert updated is not None
    assert updated.content == "New content only"
    assert updated.tags == ["a"]


def test_update_memory_missing():
    s = _store()
    assert s.update_memory("nope", MemoryUpdate(content="x")) is None


def test_delete_memory():
    s = _store()
    rec = s.create_memory(_create(content="Delete me"))
    assert s.delete_memory(rec.id) is True
    assert s.get_memory(rec.id) is None


def test_delete_memory_missing():
    s = _store()
    assert s.delete_memory("nope") is False


def test_list_memories_empty():
    s = _store()
    assert s.list_memories() == []


def test_list_memories_orders_by_created_desc():
    s = _store()
    a = s.create_memory(_create(content="A"))
    b = s.create_memory(_create(content="B"))
    results = s.list_memories()
    assert [r.id for r in results] == [b.id, a.id]


def test_list_memories_limit():
    s = _store()
    for i in range(10):
        s.create_memory(_create(content=f"Mem {i}"))
    assert len(s.list_memories(limit=3)) == 3


def test_list_filter_by_truth_scope_live():
    s = _store()
    s.create_memory(_create(content="Live one", status="draft"))
    s.create_memory(_create(content="Archived one", status="archived"))
    live = s.list_memories(truth_scope="live")
    assert len(live) == 1
    assert live[0].content == "Live one"


def test_list_filter_by_query_content():
    s = _store()
    s.create_memory(_create(content="Tesseract lattice is canonical", tags=["tesseract"]))
    s.create_memory(_create(content="Prefer glass cathedrals", tags=["glass"]))
    results = s.list_memories(query="tesseract")
    assert len(results) == 1


def test_list_filter_by_query_tag():
    s = _store()
    s.create_memory(_create(content="Some memory", tags=["tesseract", "lattice"]))
    s.create_memory(_create(content="Other memory", tags=["glass"]))
    results = s.list_memories(query="lattice")
    assert len(results) == 1


def test_persistence():
    tmp = Path(tempfile.mktemp(suffix=".json"))
    s1 = JarvisStore(str(tmp))
    s1.create_memory(_create(content="Survive restart"))
    del s1
    s2 = JarvisStore(str(tmp))
    results = s2.list_memories()
    assert len(results) == 1
    assert results[0].content == "Survive restart"
    assert results[0].source_agent == "test-agent"
    tmp.unlink(missing_ok=True)


def test_load_corrupted_store():
    tmp = Path(tempfile.mktemp(suffix=".json"))
    tmp.write_text("{bad json", "utf-8")
    s = JarvisStore(str(tmp))
    board = s.get_board()
    assert board.board_id == "default_board"
    tmp.unlink(missing_ok=True)


def test_migrate_legacy_record():
    legacy = {
        "id": "mem-legacy1",
        "content": "Old signal",
        "category": "signal",
        "tags": ["x"],
        "scope": "session",
        "state_class": "live",
        "truth_status": "stable_user",
        "created_at": "2026-07-01T00:00:00+00:00",
        "updated_at": "2026-07-01T00:00:00+00:00",
    }
    migrated = migrate_legacy_record(legacy)
    assert migrated["source_agent"] == "legacy-migration"
    assert migrated["type"] == "fact"
    assert migrated["status"] == "verified"
    assert migrated["session_id"] == "legacy-unknown-session"
    assert "category" not in migrated


def test_load_migrates_legacy_store():
    import json

    tmp = Path(tempfile.mktemp(suffix=".json"))
    tmp.write_text(
        json.dumps(
            {
                "board": {"board_id": "default_board", "summary": ""},
                "memories": [
                    {
                        "id": "mem-old",
                        "content": "Legacy row",
                        "category": "decision",
                        "tags": [],
                        "scope": "persistent",
                        "state_class": "live",
                        "truth_status": "pending",
                        "created_at": "2026-07-01T00:00:00+00:00",
                        "updated_at": "2026-07-01T00:00:00+00:00",
                    }
                ],
            }
        ),
        "utf-8",
    )
    s = JarvisStore(str(tmp))
    rec = s.get_memory("mem-old")
    assert rec is not None
    assert rec.type == "decision"
    assert rec.source_agent == "legacy-migration"
    assert rec.status == "draft"
    assert rec.content_sha256
    # re-saved with schema marker
    raw = json.loads(tmp.read_text("utf-8"))
    assert raw.get("schema") == "continuity-ledger-v1"
    tmp.unlink(missing_ok=True)


def test_supersedes_unknown_raises():
    s = _store()
    try:
        s.create_memory(_create(content="x", supersedes="mem-missing"))
        assert False, "expected ValueError"
    except ValueError as exc:
        assert "supersedes" in str(exc)
