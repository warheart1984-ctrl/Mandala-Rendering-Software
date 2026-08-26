"""EMR dynamics layer tests — sidecar persistence, resonance vectors, bonds.

Covers the three declared→partial upgrades:
  1. Reinforcement overlay survives restart via data/emr-dynamics.json
     (sidecar OUTSIDE the Continuity Ledger; LTM remains sole truth source).
  2. Multichannel resonance vectors F_i + named triggers + cos(F,R) coupling.
  3. Bond dynamics B_ij: constructive bundling + contradiction membrane.
"""

from __future__ import annotations

import json
from datetime import datetime, timezone

import pytest
from fastapi.testclient import TestClient
from unittest.mock import patch

import app.emr as emr
from app.emr import (
    CHANNELS,
    ExciteRequest,
    TRIGGER_PRESETS,
    activate,
    bond_strength,
    excite,
    get_reinforcement,
    intent_vector,
    is_contradiction,
    resonance_vector,
    reset_stm_for_tests,
    save_dynamics,
    sim_rf,
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
def _clean():
    reset_stm_for_tests()
    yield
    reset_stm_for_tests()


# --- 1. Sidecar persistence ---


def test_reinforcement_survives_simulated_restart():
    rec = _rec(id="mem-persist", status="verified", confidence=0.9)
    emr.reinforce_ids({"mem-persist"}, ["mem-persist", "mem-persist"])
    assert save_dynamics() is True

    # Simulate process restart: wipe memory + load flag, then reload from disk.
    reset_stm_for_tests()
    emr._dynamics_loaded = False
    emr._ensure_dynamics()

    state = get_reinforcement("mem-persist")
    assert state is not None
    assert state.use_count == 2
    assert state.salience == pytest.approx(emr.SALIENCE_GAIN * 2)


def test_corrupt_sidecar_starts_fresh_ltm_unaffected():
    from pathlib import Path

    p = Path(emr.DYNAMICS_PATH)
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text("{not valid json!!", encoding="utf-8")
    emr._dynamics_loaded = False
    emr._ensure_dynamics()
    assert get_reinforcement("anything") is None  # fresh overlay, no crash


def test_sidecar_stays_outside_ledger_store(tmp_path):
    """Sidecar write must never touch jarvis-store.json."""
    store_path = tmp_path / "jarvis-store.json"
    store = JarvisStore(str(store_path))
    created = store.create_memory(
        MemoryCreate(
            content="Ledger truth stays here.",
            source_agent="t",
            session_id="s",
            type="decision",
            confidence=0.9,
            status="verified",
        )
    )
    before = store_path.read_text()
    emr.reinforce_ids({created.id}, [created.id])
    assert store_path.read_text() == before  # ledger bytes untouched


# --- 2. Resonance vectors ---


def test_particle_resonance_vector_channels_and_semantics():
    constitution = _rec(
        id="mem-const",
        content="Constitutional charter clause enforced by governance engine.",
        type="architecture",
        status="verified",
        tags=["charter"],
        subject="ccs",
    )
    vec = resonance_vector(constitution)
    assert set(vec.keys()) == set(CHANNELS)
    grocery = _rec(id="mem-groc", content="Tomato watering schedule.")
    gv = resonance_vector(grocery)
    assert vec["authority"] > gv["authority"]
    assert vec["project"] > gv["project"]  # subject set => project affinity


def test_trigger_boosts_intent_vector_channel():
    plain = intent_vector("memory recall system")
    trig = intent_vector("memory recall system", trigger="constitutional-chain")
    assert trig["authority"] >= plain["authority"]
    assert any(v > 0 for v in trig.values())


def test_rf_coupling_raises_matching_activation_more():
    tech = _rec(
        id="mem-tech",
        content="HoloRT4D PhaseEncode GPU dispatch byte-parity kernel.",
        type="architecture",
        status="verified",
        confidence=0.9,
        tags=["gpu", "holort4d"],
    )
    off_topic = _rec(id="mem-off", content="Garden tomato schedule.", subject="garden")
    q = "HoloRT4D PhaseEncode GPU"
    a0_tech = activate(tech, query=q).A
    a1_tech = activate(tech, query=q, intent_f=intent_vector(q), rf_kappa=0.5).A
    a0_off = activate(off_topic, query=q).A
    a1_off = activate(
        off_topic, query=q, intent_f=intent_vector(q), rf_kappa=0.5
    ).A
    assert a1_tech > a0_tech
    assert a1_off <= a0_off * (1 + 0.5)  # bounded coupling
    assert sim_rf(resonance_vector(tech), intent_vector(q)) > sim_rf(
        resonance_vector(off_topic), intent_vector(q)
    )


def test_unknown_trigger_rejected_by_engine_and_route():
    rec = _rec(id="mem-t")
    with pytest.raises(ValueError):
        excite([rec], ExciteRequest(query="x", trigger="turbo-encabulator"))
    store = JarvisStore(str(emr.Path(emr.DYNAMICS_PATH).with_name("s.json")))
    with patch("app.main.get_store", return_value=store):
        client = TestClient(app)
        resp = client.post(
            "/api/jarvis/memory/emr/excite",
            json={"query": "x", "trigger": "turbo-encabulator"},
        )
    assert resp.status_code == 400


# --- 3. Bond dynamics ---


def test_bond_strength_shared_subject_and_tags():
    a = _rec(id="a", subject="holo", tags=["gpu", "render"])
    b = _rec(id="b", subject="holo", tags=["gpu"])
    far = _rec(id="c", subject="garden", tags=["plants"])
    assert bond_strength(a, b) > bond_strength(a, far)
    assert bond_strength(a, a) == 0.0


def test_contradiction_same_subject_different_content():
    a = _rec(id="a", subject="map", content_sha256="111")
    b = _rec(id="b", subject="map", content_sha256="222")
    c = _rec(id="c", subject="map", content_sha256="111")
    d = _rec(id="d", subject=None, content_sha256="999")
    e = _rec(id="e", subject=None, content_sha256="888")
    assert is_contradiction(a, b)
    assert not is_contradiction(a, c)
    assert not is_contradiction(d, e)  # no subject => no grouping key


def test_bundle_prefers_mutually_supporting_pair_under_budget():
    def _particle(mid: str, subject: str | None, tags: list[str], content: str):
        return _rec(
            id=mid,
            subject=subject,
            tags=tags,
            content=content,
            type="decision",
            status="verified",
            confidence=0.9,
            content_sha256=mid,
        )

    digits = "01234567890123456789012345678901234567890123456789012345"  # 56 chars → 14 tokens
    z_first = _particle("z-loner", None, [], digits)
    w_loner = _particle("w-loner", None, [], digits)
    # Same sha => mutually supporting pair, NOT a contradiction dispute.
    x_bond = _particle("x-bond", "holo", ["gpu"], digits)
    x_bond = x_bond.model_copy(update={"content_sha256": "holo-shared"})
    y_bond = _particle("y-bond", "holo", ["gpu"], digits)
    y_bond = y_bond.model_copy(update={"content_sha256": "holo-shared"})

    # Budget fits exactly two 14-token particles. Bonded pair outranks loners:
    # higher query alignment + B_ij bonus makes the partner the next marginal pick.
    req = ExciteRequest(
        query="holo gpu",
        token_budget=41,
        theta_promote=0.001,
        bond_weight=0.15,
        session_key="bundle",
        rf_kappa=0.0,
    )
    resp = excite([z_first, w_loner, x_bond, y_bond], req)
    ids = {e.memory_id for e in resp.stm}
    assert {"x-bond", "y-bond"} <= ids
    assert len(ids) == 2


def test_contradiction_membrane_excludes_disputing_particle():
    a = _rec(
        id="ver-a",
        subject="phase-map",
        content="R/G = tanh(real/imag)",
        content_sha256="aaa",
        type="decision",
        status="verified",
        confidence=0.9,
    )
    b = _rec(
        id="ver-b",
        subject="phase-map",
        content="R/G = atan2(imag, real)",
        content_sha256="bbb",
        type="decision",
        status="verified",
        confidence=0.85,
    )
    base = dict(query="phase map", token_budget=8000, theta_promote=0.001, rf_kappa=0.0)

    resp_excl = excite([a, b], ExciteRequest(session_key="m-ex", **base))
    ids_excl = {e.memory_id for e in resp_excl.stm}
    assert len(ids_excl) == 1
    assert resp_excl.excluded_conflicts == ["ver-b"]

    resp_allow = excite([a, b], ExciteRequest(session_key="m-al", contradiction_policy="allow", **base))
    assert len({e.memory_id for e in resp_allow.stm}) == 2


# --- Route-level integration ---


def test_route_excite_reports_trigger_and_conflict_fields():
    store = JarvisStore(str(emr.Path(emr.DYNAMICS_PATH).with_name("route.json")))
    with patch("app.main.get_store", return_value=store):
        client = TestClient(app)
        resp = client.post(
            "/api/jarvis/memory/emr/excite",
            json={"query": "constitutional chain authority", "trigger": "authority"},
        )
    assert resp.status_code == 200
    data = resp.json()
    assert data["trigger"] == "authority"
    assert "excluded_conflicts" in data
