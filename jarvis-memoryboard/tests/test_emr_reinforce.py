"""Reinforcement dynamics tests — retrievability strengthens, truth never moves.

Constitutional rule under test: reinforcement must NOT become
"recalled often = true". Salience/decay-damping are bounded EMR-side
overlay effects; ledger status/confidence/content stay byte-identical.
"""

from __future__ import annotations

import tempfile
from datetime import datetime, timezone
from pathlib import Path
from unittest.mock import patch

import pytest
from fastapi.testclient import TestClient

from app.emr import (
    DAMP_CAP,
    DAMP_GAIN,
    SALIENCE_CAP,
    SALIENCE_GAIN,
    ExciteRequest,
    activate,
    excite,
    get_reinforcement,
    reinforce_ids,
    reset_stm_for_tests,
)
from app.main import app
from app.models import MemoryCreate, MemoryRecord
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


@pytest.fixture(autouse=True)
def _clean_dynamics():
    reset_stm_for_tests()
    yield
    reset_stm_for_tests()


def _snapshot(rec: MemoryRecord) -> dict:
    return {
        "status": rec.status,
        "confidence": rec.confidence,
        "content": rec.content,
        "content_sha256": rec.content_sha256,
        "type": rec.type,
        "evidence": [e.model_dump() for e in rec.evidence],
    }


def test_reinforcement_raises_activation_ltm_untouched():
    rec = _rec(
        id="mem-r1",
        content="HoloRT4D PhaseEncode uses tanh of real over imag.",
        type="decision",
        status="verified",
        confidence=0.9,
        tags=["holort4d"],
    )
    before = activate(rec, query="PhaseEncode tanh")
    snap = _snapshot(rec)

    reinforced, unknown = reinforce_ids({"mem-r1"}, ["mem-r1"])
    assert len(reinforced) == 1 and unknown == []
    assert reinforced[0].use_count == 1
    assert reinforced[0].salience == pytest.approx(SALIENCE_GAIN)
    assert reinforced[0].decay_damp == pytest.approx(DAMP_GAIN)

    after = activate(rec, query="PhaseEncode tanh")
    assert after.A > before.A
    assert after.salience > 0
    assert after.D_eff < after.D  # decay damped, particle persists longer
    assert _snapshot(rec) == snap  # truth/authority byte-identical


def test_reinforcement_is_bounded_no_runaway_dominance():
    rec = _rec(id="mem-cap", type="decision", status="verified", confidence=0.9)
    base = activate(rec, query="x").A
    for _ in range(50):
        reinforce_ids({"mem-cap"}, ["mem-cap"])
    state = get_reinforcement("mem-cap")
    assert state.salience == SALIENCE_CAP
    assert state.decay_damp == DAMP_CAP
    assert state.use_count == 50
    boosted = activate(rec, query="x")
    # Hard ceiling: at most (1+0.5) activation multiple, never unbounded.
    assert boosted.salience == SALIENCE_CAP
    assert boosted.A <= base * (1.0 + SALIENCE_CAP) * 1.000001


def test_unknown_ids_reported_not_silently_created():
    reinforced, unknown = reinforce_ids(set(), ["mem-ghost", "mem-ghost2"])
    assert reinforced == []
    assert sorted(unknown) == ["mem-ghost", "mem-ghost2"]
    assert get_reinforcement("mem-ghost") is None


def test_reinforced_archived_particle_stays_dead():
    """Excitation ≠ admission: archived (P=0) can be reinforced yet never enters STM."""
    rec = _rec(id="mem-dead", status="archived", confidence=0.99)
    for _ in range(20):
        reinforce_ids({"mem-dead"}, ["mem-dead"])
    resp = excite(
        [rec],
        ExciteRequest(query="Default memory content", token_budget=256, session_key="dead"),
    )
    assert all(e.memory_id != "mem-dead" for e in resp.stm)


def test_reinforced_stale_beats_fresher_noise_in_budget():
    stale = _rec(
        id="mem-stale",
        content="Sovereign X router useful-FLOPs delegation contract.",
        created_at="2026-08-01T00:00:00+00:00",
        updated_at="2026-08-01T00:00:00+00:00",
        type="architecture",
        status="verified",
        confidence=0.9,
        tags=["sovereign-x"],
    )
    fresh_noise = _rec(
        id="mem-fresh",
        content="Scratch note about sovereign router debugging session.",
        type="fact",
        status="draft",
        confidence=0.4,
        tags=["sovereign-x"],
    )
    q = "sovereign router"
    for _ in range(10):
        reinforce_ids({"mem-stale"}, ["mem-stale"])
    resp = excite(
        [stale, fresh_noise],
        ExciteRequest(query=q, token_budget=64, theta_promote=0.05, session_key="revive"),
    )
    ids = [e.memory_id for e in resp.stm]
    assert "mem-stale" in ids


def test_route_reinforce_preserves_ledger_bytes():
    tmp = Path(tempfile.mktemp(suffix=".json"))
    store = JarvisStore(str(tmp))
    created = store.create_memory(
        MemoryCreate(
            content="Continuity Ledger decision about governed recall.",
            source_agent="test-agent",
            session_id="sess-reinforce",
            type="decision",
            confidence=0.9,
            status="verified",
            subject="emr-reinforce",
            tags=["emr"],
        )
    )
    before = store.get_memory(created.id).model_dump()

    with patch("app.main.get_store", return_value=store):
        client = TestClient(app)
        resp = client.post(
            "/api/jarvis/memory/emr/reinforce",
            json={"memory_ids": [created.id, "mem-nonexistent"], "session_key": "rt"},
        )
    assert resp.status_code == 200
    data = resp.json()
    assert data["ltm_mutations"] == 0
    assert data["unknown_ids"] == ["mem-nonexistent"]
    assert data["reinforced"][0]["memory_id"] == created.id
    assert "never mutated" in data["rule"]

    after = store.get_memory(created.id).model_dump()
    assert after == before  # LTM byte-identical across reinforcement


def test_route_excite_sees_reinforcement_effect():
    tmp = Path(tempfile.mktemp(suffix=".json"))
    store = JarvisStore(str(tmp))
    created = store.create_memory(
        MemoryCreate(
            content="Mythar ascension requires dual evidence artifacts.",
            source_agent="test-agent",
            session_id="sess-reinforce2",
            type="decision",
            confidence=0.8,
            status="draft",
            subject="mythar",
            tags=["mythar"],
        )
    )

    with patch("app.main.get_store", return_value=store):
        client = TestClient(app)
        r1 = client.post(
            "/api/jarvis/memory/emr/excite",
            json={
                "query": "mythar ascension evidence",
                "token_budget": 256,
                "theta_promote": 0.03,
                "session_key": "dyn",
            },
        ).json()
        a_before = next(e["activation"] for e in r1["stm"] if e["memory_id"] == created.id)
        client.post(
            "/api/jarvis/memory/emr/reinforce", json={"memory_ids": [created.id]}
        )
        r2 = client.post(
            "/api/jarvis/memory/emr/excite",
            json={
                "query": "mythar ascension evidence",
                "token_budget": 256,
                "theta_promote": 0.03,
                "session_key": "dyn",
            },
        ).json()
        a_after = next(e["activation"] for e in r2["stm"] if e["memory_id"] == created.id)
    assert a_after > a_before
