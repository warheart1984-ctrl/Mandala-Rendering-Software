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
    GraphExpansionConfig,
    MetadataFilters,
    PositiveOutcomeSignal,
    RetrievalWeights,
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


def _outcome(outcome_id: str) -> PositiveOutcomeSignal:
    return PositiveOutcomeSignal(
        signal="positive",
        source="task",
        outcome_id=outcome_id,
    )


@pytest.fixture(autouse=True)
def _clean():
    reset_stm_for_tests()
    yield
    reset_stm_for_tests()


# --- 1. Sidecar persistence ---


def test_reinforcement_survives_simulated_restart():
    rec = _rec(id="mem-persist", status="verified", confidence=0.9)
    emr.reinforce_ids(
        {"mem-persist"}, ["mem-persist"], outcome=_outcome("persist-1")
    )
    emr.reinforce_ids(
        {"mem-persist"}, ["mem-persist"], outcome=_outcome("persist-2")
    )
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
    emr.reinforce_ids(
        {created.id}, [created.id], outcome=_outcome("ledger-isolation")
    )
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
    base = dict(
        query="phase map",
        token_budget=8000,
        theta_promote=0.001,
        rf_kappa=0.0,
    )

    resp_excl = excite(
        [a, b],
        ExciteRequest(session_key="m-ex", **base),
        enforce_abstention=False,
    )
    ids_excl = {e.memory_id for e in resp_excl.stm}
    assert len(ids_excl) == 1
    assert resp_excl.excluded_conflicts == ["ver-b"]

    resp_allow = excite(
        [a, b],
        ExciteRequest(session_key="m-al", contradiction_policy="allow", **base),
        enforce_abstention=False,
    )
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


# --- 4. Weighted retrieval, metadata filters, and graph expansion ---


def test_metadata_filters_run_before_scoring_and_are_reported():
    matching = _rec(
        id="mem-match",
        content="Governed EMR graph retrieval contract.",
        type="architecture",
        status="verified",
        confidence=0.95,
        source_agent="architect",
        session_id="sess-emr",
        subject="memoryboard",
        tags=["emr", "graph"],
    )
    wrong_agent = _rec(
        id="mem-agent",
        content="Governed EMR graph retrieval contract.",
        type="architecture",
        status="verified",
        confidence=0.95,
        source_agent="other",
        session_id="sess-emr",
        subject="memoryboard",
        tags=["emr", "graph"],
    )
    low_confidence = matching.model_copy(
        update={"id": "mem-low", "confidence": 0.4}
    )
    filters = MetadataFilters(
        types=["architecture"],
        statuses=["verified"],
        source_agents=["ARCHITECT"],
        session_ids=["sess-emr"],
        subjects=["MemoryBoard"],
        tags_any=["EMR"],
        tags_all=["emr", "graph"],
        min_confidence=0.9,
    )
    response = excite(
        [wrong_agent, low_confidence, matching],
        ExciteRequest(
            query="EMR graph contract",
            filters=filters,
            graph=GraphExpansionConfig(enabled=False),
            theta_promote=0.001,
            session_key="filtered",
        ),
    )
    assert response.input_candidates == 3
    assert response.filtered_candidates == 1
    assert response.scored == 1
    assert [entry.memory_id for entry in response.stm] == ["mem-match"]
    assert response.filters_applied["min_confidence"] == 0.9
    assert response.filters_applied["tags_all"] == ["emr", "graph"]


def test_metadata_filter_ranges_validate_mixed_iso_timezones():
    filters = MetadataFilters(
        created_after="2026-08-01T00:00:00",
        created_before="2026-08-02T00:00:00Z",
    )
    assert filters.created_after is not None
    with pytest.raises(ValueError, match="min_confidence"):
        MetadataFilters(min_confidence=0.9, max_confidence=0.2)
    with pytest.raises(ValueError, match="updated_after"):
        MetadataFilters(
            updated_after="2026-08-03T00:00:00Z",
            updated_before="2026-08-02T00:00:00Z",
        )


def test_bounded_graph_expansion_recalls_two_hop_lineage():
    seed = _rec(
        id="mem-seed",
        content="Asterion constitutional memory reactor.",
        type="architecture",
        status="verified",
        confidence=0.95,
        content_sha256="seed-sha",
    )
    linked = _rec(
        id="mem-linked",
        content="Rotor calibration note with no matching query terms.",
        type="architecture",
        status="verified",
        confidence=0.9,
        supersedes="mem-seed",
        content_sha256="linked-sha",
    )
    grandchild = _rec(
        id="mem-grandchild",
        content="Ceramic bearing tolerance table.",
        type="architecture",
        status="verified",
        confidence=0.9,
        supersedes="mem-linked",
        content_sha256="grandchild-sha",
    )
    request = dict(
        query="Asterion constitutional memory reactor",
        token_budget=512,
        theta_promote=0.05,
        rf_kappa=0.0,
        weights=RetrievalWeights(graph=0.5),
    )
    without_graph = excite(
        [seed, linked, grandchild],
        ExciteRequest(
            **request,
            graph=GraphExpansionConfig(enabled=False),
            session_key="no-graph",
        ),
    )
    assert {entry.memory_id for entry in without_graph.stm} == {"mem-seed"}

    with_graph = excite(
        [seed, linked, grandchild],
        ExciteRequest(
            **request,
            graph=GraphExpansionConfig(enabled=True, max_depth=2),
            session_key="graph",
        ),
    )
    entries = {entry.memory_id: entry for entry in with_graph.stm}
    assert {"mem-seed", "mem-linked", "mem-grandchild"} <= set(entries)
    assert with_graph.graph_expanded >= 2
    assert entries["mem-linked"].components.graph_seed_id == "mem-seed"
    assert entries["mem-grandchild"].components.graph_hops == 2
    assert entries["mem-grandchild"].components.graph_path == [
        "mem-seed",
        "mem-linked",
        "mem-grandchild",
    ]
    assert entries["mem-grandchild"].components.graph_boost > 0


def test_weight_controls_are_echoed_and_auto_reinforcement_is_explicit():
    rec = _rec(
        id="mem-weighted",
        content="Weighted EMR retrieval with bounded reinforcement.",
        type="decision",
        status="verified",
        confidence=0.9,
    )
    weights = RetrievalWeights(query=1.4, decay=0.7, graph=0.2)
    response = excite(
        [rec],
        ExciteRequest(
            query="weighted EMR retrieval",
            theta_promote=0.001,
            weights=weights,
            reinforce_selected=True,
            reinforcement_outcome=_outcome("auto-weighted"),
            session_key="weighted",
        ),
    )
    assert response.retrieval_weights == weights.model_dump()
    assert response.stm[0].components.weights == weights.model_dump()
    assert response.auto_reinforced == ["mem-weighted"]
    state = get_reinforcement("mem-weighted")
    assert state is not None and state.use_count == 1
    assert rec.status == "verified" and rec.confidence == 0.9


def test_abstention_rejects_unsupported_query_on_evidence_floor():
    rec = _rec(
        id="mem-garden",
        content="Garden irrigation runs at dawn.",
        type="fact",
        status="verified",
        confidence=0.9,
    )
    response = excite(
        [rec],
        ExciteRequest(
            query="quantum chromodynamics lattice constants",
            theta_promote=0.0,
            session_key="abstain-floor",
        ),
    )
    assert response.abstained is True
    assert response.abstention_reason == "top-score-below-floor"
    assert response.stm == []


def test_abstention_rejects_ambiguous_distinct_claims():
    first = _rec(
        id="mem-ambiguous-a",
        content="Phase router chooses path alpha.",
        content_sha256="hash-a",
        type="decision",
        status="verified",
        confidence=0.9,
    )
    second = first.model_copy(
        update={
            "id": "mem-ambiguous-b",
            "content": "Phase router chooses path beta.",
            "content_sha256": "hash-b",
        }
    )
    response = excite(
        [first, second],
        ExciteRequest(
            query="phase router chooses path",
            theta_promote=0.0,
            graph=GraphExpansionConfig(enabled=False),
            session_key="abstain-margin",
        ),
    )
    assert response.abstained is True
    assert response.abstention_reason == "ambiguous-score-margin"
    assert response.score_margin == 0.0


def test_reinforcement_cannot_make_unsupported_query_pass_abstention():
    rec = _rec(
        id="mem-noise",
        content="Garden irrigation runs at dawn.",
        type="architecture",
        status="verified",
        confidence=0.95,
    )
    before = excite(
        [rec],
        ExciteRequest(
            query="quantum chromodynamics lattice constants",
            theta_promote=0.0,
            session_key="gate-before",
        ),
    )
    for index in range(20):
        emr.reinforce_ids(
            {rec.id},
            [rec.id],
            outcome=_outcome(f"unsupported-{index}"),
        )
    after = excite(
        [rec],
        ExciteRequest(
            query="quantum chromodynamics lattice constants",
            theta_promote=0.0,
            session_key="gate-after",
        ),
    )
    assert before.abstained is True and after.abstained is True
    assert after.top_evidence_score == before.top_evidence_score


def test_auto_reinforcement_requires_positive_outcome_signal():
    with pytest.raises(ValueError, match="reinforcement_outcome"):
        ExciteRequest(query="governed recall", reinforce_selected=True)


def test_abstention_floor_cannot_be_disabled_or_weakened_by_request():
    with pytest.raises(ValueError):
        ExciteRequest(query="governed recall", abstention={"enabled": False})
    with pytest.raises(ValueError):
        ExciteRequest(query="governed recall", abstention={"min_top_score": 0.01})


def test_custom_retrieval_weights_cannot_bypass_abstention_gate():
    rec = _rec(
        id="mem-weight-bypass",
        content="Garden irrigation runs at dawn.",
        type="fact",
        status="verified",
        confidence=0.9,
    )
    response = excite(
        [rec],
        ExciteRequest(
            query="quantum chromodynamics lattice constants",
            theta_promote=0.0,
            weights=RetrievalWeights(
                query=0.0,
                trajectory=0.0,
                provenance=0.0,
                decay=0.0,
                reinforcement=0.0,
                resonance=0.0,
                graph=0.0,
            ),
            session_key="weight-bypass",
        ),
    )
    assert response.abstained is True
    assert response.abstention_reason == "top-score-below-floor"
