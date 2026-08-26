"""EMR / STM unit tests — promotion, eviction, budget, resolution provenance."""

from __future__ import annotations

from datetime import datetime, timezone

import pytest

from app.emr import (
    ExpandRequest,
    ExciteRequest,
    activate,
    clear_stm,
    excite,
    expand_stm_entry,
    get_stm,
    make_summary,
    reset_stm_for_tests,
    resolve_record,
)
from app.models import EvidenceLink, MemoryRecord


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
def _clean_stm():
    reset_stm_for_tests()
    yield
    reset_stm_for_tests()


def test_activation_prefers_verified_query_match():
    hit = _rec(
        id="mem-hit",
        content="Axiom-X: deterministic governed GPU delegation; CPU authoritative; byte-parity required.",
        type="architecture",
        status="verified",
        confidence=0.95,
        subject="axiom-x",
        tags=["gpu", "governance"],
        evidence=[EvidenceLink(kind="path", ref="docs/axiom-x.md")],
    )
    miss = _rec(
        id="mem-miss",
        content="Tomato watering schedule for the garden beds.",
        type="fact",
        status="draft",
        confidence=0.3,
        subject="garden",
        tags=["plants"],
    )
    a_hit = activate(hit, query="GPU delegation byte-parity")
    a_miss = activate(miss, query="GPU delegation byte-parity")
    assert a_hit.A > a_miss.A
    assert a_hit.P > a_miss.P


def test_excite_promotes_relevant_into_stm():
    records = [
        _rec(
            id="mem-ax",
            content="Axiom-X: deterministic governed GPU delegation; CPU authoritative; byte-parity required.",
            type="architecture",
            status="verified",
            confidence=0.9,
            subject="axiom-x",
            tags=["gpu"],
        ),
        _rec(
            id="mem-noise",
            content="Unrelated grocery list: milk eggs bread.",
            status="draft",
            confidence=0.2,
            subject="groceries",
        ),
    ]
    resp = excite(
        records,
        ExciteRequest(query="GPU byte-parity axiom", token_budget=256, session_key="s1"),
    )
    ids = [e.memory_id for e in resp.stm]
    assert "mem-ax" in ids
    assert "mem-ax" in resp.promoted
    assert all(e.memory_id for e in resp.stm)  # provenance required
    assert resp.budget_used <= resp.budget_limit


def test_budget_caps_stm_token_cost():
    records = [
        _rec(
            id=f"mem-{i}",
            content=f"Governed GPU delegation axiom particle number {i} with byte-parity and CPU authority. " * 3,
            type="architecture",
            status="verified",
            confidence=0.9,
            subject="axiom-x",
            tags=["gpu", "delegation"],
        )
        for i in range(8)
    ]
    resp = excite(
        records,
        ExciteRequest(
            query="GPU delegation byte-parity",
            token_budget=60,
            theta_promote=0.01,
            session_key="budget",
        ),
    )
    assert resp.budget_used <= 60
    assert sum(e.token_cost for e in resp.stm) == resp.budget_used


def test_eviction_is_dormancy_not_delete():
    records = [
        _rec(
            id="mem-keep",
            content="Jarvis Continuity Ledger stores decisions with provenance.",
            type="architecture",
            status="verified",
            confidence=0.9,
            subject="jarvis",
            tags=["ledger", "continuity"],
        ),
        _rec(
            id="mem-fade",
            content="Temporary note about lunch plans.",
            status="draft",
            confidence=0.4,
            subject="lunch",
            tags=["temp"],
        ),
    ]
    excite(
        records,
        ExciteRequest(query="lunch plans", token_budget=200, session_key="evict", theta_promote=0.04),
    )
    assert any(e.memory_id == "mem-fade" for e in get_stm("evict"))

    resp2 = excite(
        records,
        ExciteRequest(
            query="Continuity Ledger provenance decisions",
            token_budget=200,
            session_key="evict",
            theta_promote=0.1,
            theta_evict=0.02,
        ),
    )
    # faded topic leaves STM but LTM records are untouched
    assert "mem-fade" in resp2.evicted or "mem-fade" not in [e.memory_id for e in resp2.stm]
    assert records[1].id == "mem-fade"
    assert records[1].content.startswith("Temporary note")


def test_resolve_levels_and_provenance():
    rec = _rec(
        id="mem-ev",
        content="Full detail about EMR excitation thresholds and STM budgets.",
        type="architecture",
        status="verified",
        confidence=0.88,
        evidence=[EvidenceLink(kind="path", ref="docs/CONSTITUTIONAL_MEMORY_CONTRACT.md", note="contract")],
        subject="emr",
        tags=["emr", "stm"],
        content_sha256="abc123",
    )
    summary = resolve_record(rec, "summary")
    detail = resolve_record(rec, "detail")
    evidence = resolve_record(rec, "evidence")

    assert summary["memory_id"] == "mem-ev"
    assert len(summary["payload"]) <= len(detail["payload"])
    assert detail["payload"] == rec.content
    assert "CONSTITUTIONAL_MEMORY_CONTRACT" in evidence["payload"]
    assert evidence["provenance"]["content_sha256"] == "abc123"
    assert evidence["evidence"][0]["ref"].endswith("CONSTITUTIONAL_MEMORY_CONTRACT.md")


def test_expand_stm_entry_raises_resolution():
    rec = _rec(
        id="mem-exp",
        content="Expandable memory about governed recall and activation scores.",
        type="decision",
        status="verified",
        confidence=0.9,
        evidence=[EvidenceLink(kind="url", ref="https://example.test/emr")],
        subject="emr",
        tags=["activation"],
    )
    excite(
        [rec],
        ExciteRequest(query="governed recall activation", token_budget=200, session_key="exp"),
    )
    assert get_stm("exp")[0].resolution == "summary"
    updated = expand_stm_entry(
        {"mem-exp": rec},
        ExpandRequest(memory_id="mem-exp", resolution="evidence", session_key="exp"),
    )
    assert updated is not None
    assert updated.resolution == "evidence"
    assert "example.test/emr" in updated.payload
    assert updated.memory_id == "mem-exp"


def test_summary_never_silently_replaces_ltm():
    long = "A" * 400 + " unique-marker-xyz"
    rec = _rec(id="mem-sum", content=long, status="verified", confidence=0.9, tags=["marker"])
    summary = make_summary(rec.content)
    assert "…" in summary or len(summary) < len(long)
    resolved = resolve_record(rec, "detail")
    assert resolved["payload"] == long
    assert "unique-marker-xyz" in resolved["payload"]


def test_clear_stm():
    rec = _rec(
        id="mem-c",
        content="Clearable STM entry about continuity ledger.",
        status="verified",
        confidence=0.9,
        tags=["continuity", "ledger"],
    )
    excite([rec], ExciteRequest(query="continuity ledger", session_key="clr"))
    assert get_stm("clr")
    clear_stm("clr")
    assert get_stm("clr") == []
