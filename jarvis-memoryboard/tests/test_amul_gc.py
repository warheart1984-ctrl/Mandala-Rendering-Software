"""AMUL-GC tests — verifiable checkpoint compactor.

Constitutional guarantees under test:
  G1. Field bytes are never mutated by GC (append-only truth).
  G2. Dead stays dead: previously-cold particles cannot become hot via GC.
  G3. Checkpoint chain is contiguous and sha-linked.
  V1. Verify passes on intact fields after compaction (checkpoint mode).
  V2. Verify detects tampering of any checkpointed byte.
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone

import pytest

import app.amul as amul
from app.amul import AmulField, anchor_memory, get_field
from app.amul_gc import GCViolation, compact, gc_status, verify_gc
from app.models import MemoryRecord


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _iso(dt: datetime) -> str:
    return dt.isoformat()


def _rec(**kwargs) -> MemoryRecord:
    now = _now()
    base = dict(
        id="mem-x",
        content="Default memory content",
        created_at=_iso(now),
        updated_at=_iso(now),
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


def _anchor_n(field: AmulField, n: int, **rec_kwargs):
    recs = []
    for i in range(n):
        r = _rec(id=f"mem-{i:03d}", content=f"particle {i} body", **rec_kwargs)
        anchor_memory(r, field)
        recs.append(r)
    return recs


def test_g1_compact_never_mutates_field_bytes(tmp_path):
    field = AmulField(str(tmp_path / "field.jsonl"))
    recs = _anchor_n(field, 4)
    before = open(field.path, "rb").read()

    report = compact(field, recs, checkpoints_path=str(tmp_path / "cp.jsonl"))

    assert report.compacted is True
    assert open(field.path, "rb").read() == before
    assert report.range_end == 12  # 4 memories x detail/summary/evidence


def test_v1_verify_ok_after_compact(tmp_path):
    field = AmulField(str(tmp_path / "field.jsonl"))
    recs = _anchor_n(field, 3)
    cp = str(tmp_path / "cp.jsonl")

    compact(field, recs, checkpoints_path=cp)
    report = verify_gc(field, checkpoints_path=cp)

    assert report.integrity_ok is True, report.integrity_failures
    assert report.checkpoints_checked == 1
    assert report.rule_g2_dead_stays_dead is True
    assert report.rule_g3_chain_contiguous is True


def test_v2_verify_detects_tampering(tmp_path):
    field = AmulField(str(tmp_path / "field.jsonl"))
    recs = _anchor_n(field, 3)
    cp = str(tmp_path / "cp.jsonl")
    compact(field, recs, checkpoints_path=cp)

    raw = open(field.path, "rb").read().decode("utf-8")
    tampered = raw.replace("particle 0 body", "TAMPERED BODY", 1)
    open(field.path, "w", encoding="utf-8").write(tampered)

    report = verify_gc(field, checkpoints_path=cp)
    assert report.integrity_ok is False
    assert len(report.integrity_failures) > 0


def test_g2_dead_stays_dead(tmp_path):
    field = AmulField(str(tmp_path / "field.jsonl"))
    stale_time = _iso(_now() - timedelta(days=400))

    stale = _rec(id="mem-stale", content="ancient particle", updated_at=stale_time,
                 created_at=stale_time, type="fact")
    fresh = _rec(id="mem-fresh", content="brand new particle")
    anchor_memory(stale, field)
    anchor_memory(fresh, field)

    cp = str(tmp_path / "cp.jsonl")
    late = _now() + timedelta(days=400)
    report = compact(field, [stale, fresh], checkpoints_path=cp, now=late)
    assert report.cold_count >= 1

    # Now pretend the stale particle got reinforced/updated -> classifier calls it hot.
    # Revise the stale particle (new artifact lines -> uncheckpointed tail exists),
    # then attempt compaction at the present time when it classifies HOT again.
    revived = _rec(id="mem-stale", content="ancient particle (revised)", updated_at=_iso(_now()),
                   created_at=_iso(_now()))
    anchor_memory(revived, field)
    with pytest.raises(GCViolation):
        compact(field, [revived, fresh], checkpoints_path=cp, now=_now())


def test_g3_chain_contiguous_across_two_compactions(tmp_path):
    field = AmulField(str(tmp_path / "field.jsonl"))
    cp = str(tmp_path / "cp.jsonl")

    r1 = _anchor_n(field, 2)
    compact(field, r1, checkpoints_path=cp)
    r2 = _rec(id="mem-later", content="second wave")
    anchor_memory(r2, field)
    compact(field, r1 + [r2], checkpoints_path=cp)

    report = verify_gc(field, checkpoints_path=cp)
    assert report.checkpoints_checked == 2
    assert report.rule_g3_chain_contiguous is True
    assert report.integrity_ok is True


def test_status_reports_tail(tmp_path):
    field = AmulField(str(tmp_path / "field.jsonl"))
    recs = _anchor_n(field, 2)
    cp = str(tmp_path / "cp.jsonl")
    compact(field, recs, checkpoints_path=cp)
    st = gc_status(field, checkpoints_path=cp)
    assert st["total_checkpoints"] == 1
