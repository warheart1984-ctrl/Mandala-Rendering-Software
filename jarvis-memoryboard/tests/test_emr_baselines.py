"""Baseline retriever comparison tests."""

from __future__ import annotations

from datetime import datetime, timezone

import pytest

from app.emr_baselines import compare_retrievers, rank_baseline
from app.emr import reset_stm_for_tests
from app.models import MemoryRecord


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _rec(**kwargs) -> MemoryRecord:
    now = _now()
    base = dict(
        id="mem-x",
        content="content",
        created_at=now,
        updated_at=now,
        source_agent="test",
        session_id="sess",
        type="fact",
        confidence=0.8,
        evidence=[],
        status="verified",
        subject=None,
        tags=[],
        content_sha256="abc",
    )
    base.update(kwargs)
    return MemoryRecord(**base)


@pytest.fixture(autouse=True)
def _clean():
    reset_stm_for_tests()
    yield
    reset_stm_for_tests()


def test_rank_baseline_modes_return_ids():
    records = [
        _rec(id="mem-gov", content="constitutional governance sovereign OS", content_sha256="h1"),
        _rec(id="mem-gpu", content="vulkan shader rendering", content_sha256="h2"),
    ]
    for mode in ("bm25", "hybrid", "emr_no_graph", "emr_no_reinforcement", "emr_full"):
        ranked = rank_baseline(records, "constitutional governance", mode=mode, k=2)
        assert isinstance(ranked, list)
        assert all(isinstance(mid, str) for mid in ranked)


def test_compare_retrievers_dashboard():
    records = [
        _rec(id="mem-gov", content="constitutional governance sovereign OS", content_sha256="h1"),
        _rec(id="mem-gpu", content="vulkan shader rendering", content_sha256="h2"),
    ]
    probes = [
        {
            "query": "constitutional governance",
            "relevant_ids": ["mem-gov"],
            "relevant_hashes": ["h1"],
        }
    ]
    report = compare_retrievers(records, probes, k=5)
    assert report["schema"] == "emr-baseline-comparison-v1"
    assert "bm25" in report["retrievers"]
    assert "emr_full" in report["retrievers"]
