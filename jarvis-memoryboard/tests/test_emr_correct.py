"""Tests for operator correction and retrieval receipt."""

from __future__ import annotations

from datetime import datetime, timezone

import pytest
from fastapi.testclient import TestClient

from app.emr import (
    ExciteRequest,
    OperatorCorrectionSignal,
    PositiveOutcomeSignal,
    activate,
    build_retrieval_receipt,
    correct_memory_ids,
    excite,
    reinforce_ids,
    reset_stm_for_tests,
)
from app.main import app
from app.models import MemoryRecord


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


def _outcome(oid: str) -> PositiveOutcomeSignal:
    return PositiveOutcomeSignal(
        signal="positive", source="operator", outcome_id=oid
    )


def _correction(cid: str) -> OperatorCorrectionSignal:
    return OperatorCorrectionSignal(
        source="operator", correction_id=cid, reason="wrong recall"
    )


def test_correction_clears_reinforcement_immediately():
    rec = _rec(id="mem-wrong", content="wrong preference about theme")
    reinforce_ids({"mem-wrong"}, ["mem-wrong"], outcome=_outcome("task-1"))
    state = reinforce_ids({"mem-wrong"}, ["mem-wrong"], outcome=_outcome("task-2"))[0][0]
    assert state.salience > 0

    corrected, unknown, replayed = correct_memory_ids(
        {"mem-wrong"},
        ["mem-wrong"],
        correction=_correction("corr-1"),
    )
    assert unknown == []
    assert replayed == []
    assert corrected[0].salience == 0.0
    assert corrected[0].decay_damp == 0.0

    br = activate(rec, query="theme preference")
    assert br.salience == 0.0


def test_correction_replay_is_idempotent():
    correct_memory_ids(
        {"mem-wrong"},
        ["mem-wrong"],
        correction=_correction("corr-dup"),
    )
    _corrected, _unknown, replayed = correct_memory_ids(
        {"mem-wrong"},
        ["mem-wrong"],
        correction=_correction("corr-dup"),
    )
    assert replayed == ["mem-wrong"]


def test_excite_includes_retrieval_receipt():
    records = [
        _rec(id="mem-a", content="constitutional chain sovereign OS governance"),
        _rec(id="mem-b", content="unrelated gpu shader note"),
    ]
    result = excite(
        records,
        ExciteRequest(
            query="constitutional chain",
            trigger="constitutional-chain",
            token_budget=512,
            theta_promote=0.001,
            session_key="receipt-test",
        ),
        enforce_abstention=False,
    )
    assert result.retrieval_receipt
    assert result.retrieval_receipt[0].rank == 1
    assert result.retrieval_receipt[0].Q >= 0
    assert result.retrieval_receipt[0].memory_id == "mem-a"


def test_correct_api_endpoint():
    client = TestClient(app)
    create = client.post(
        "/api/jarvis/memory",
        json={
            "content": "bad memory to correct",
            "source_agent": "test",
            "session_id": "s1",
            "type": "preference",
            "confidence": 0.5,
            "evidence": [],
            "status": "draft",
        },
    )
    mid = create.json()["memory"]["id"]
    client.post(
        "/api/jarvis/memory/emr/reinforce",
        json={
            "memory_ids": [mid],
            "outcome": {"signal": "positive", "source": "user", "outcome_id": "o1"},
        },
    )
    resp = client.post(
        "/api/jarvis/memory/emr/correct",
        json={
            "memory_ids": [mid],
            "correction": {
                "source": "user",
                "correction_id": "c1",
                "reason": "operator override",
            },
        },
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["ltm_mutations"] == 0
    assert body["corrected"][0]["salience"] == 0.0
