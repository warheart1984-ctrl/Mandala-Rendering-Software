"""Adversarial EMR Recall Protocol tests — subject-targeted abstention gates."""

from __future__ import annotations

import pytest

from app.emr import reset_stm_for_tests
from app.emr_tool import EmrRecallRequest, emr_recall
from app.models import MemoryCreate
from app.store import JarvisStore


@pytest.fixture(autouse=True)
def _clean():
    reset_stm_for_tests()
    yield
    reset_stm_for_tests()


@pytest.fixture
def store(tmp_path, monkeypatch):
    db = tmp_path / "ledger.json"
    monkeypatch.setenv("JARVIS_STORE_PATH", str(db))
    return JarvisStore(path=str(db))


def _create(
    store: JarvisStore,
    *,
    content: str,
    subject: str | None = None,
    status: str = "verified",
    type_: str = "preference",
    confidence: float = 0.9,
) -> None:
    store.create_memory(
        MemoryCreate(
            content=content,
            source_agent="test",
            session_id="adv",
            type=type_,
            confidence=confidence,
            evidence=[],
            status=status,
            subject=subject,
        )
    )


def test_known_subject_strong_evidence_recalls(store: JarvisStore):
    _create(
        store,
        content="All generated images must be signed J Halstead bottom-right unless overridden.",
        subject="image-signature",
    )
    resp = emr_recall(
        store,
        EmrRecallRequest(
            intent="image_generation",
            query="fantasy portrait image signature placement",
            subjects=["image-signature"],
            max_memories=8,
        ),
    )
    assert resp.abstained is False
    assert len(resp.bundle) >= 1
    assert any("Halstead" in item.content for item in resp.bundle)


def test_unknown_subject_abstains_or_empty(store: JarvisStore):
    _create(
        store,
        content="Unrelated ledger note about GPU tuning.",
        subject="gpu-tuning",
    )
    resp = emr_recall(
        store,
        EmrRecallRequest(
            intent="technical",
            query="gpu tuning voltage curve",
            subjects=["nonexistent-subject"],
            max_memories=8,
        ),
    )
    assert resp.abstained is True or len(resp.bundle) == 0
    if resp.abstained:
        assert resp.abstention_reason in ("no-candidates", "top-score-below-floor")


def test_known_subject_archived_only_does_not_recall(store: JarvisStore):
    _create(
        store,
        content="Old archived preference about image style.",
        subject="creative-style",
        status="archived",
    )
    resp = emr_recall(
        store,
        EmrRecallRequest(
            intent="image_generation",
            query="cinematic style high contrast",
            subjects=["creative-style"],
            max_memories=8,
        ),
    )
    assert resp.abstained is True or len(resp.bundle) == 0


def test_known_subject_unresolved_conflict_surfaces_no_coadmission(store: JarvisStore):
    _create(
        store,
        content="Preferred aspect ratio is 16:9 for all renders.",
        subject="render-aspect",
    )
    _create(
        store,
        content="Preferred aspect ratio is 4:3 for all renders.",
        subject="render-aspect",
    )
    resp = emr_recall(
        store,
        EmrRecallRequest(
            intent="creative",
            query="render aspect ratio preference",
            subjects=["render-aspect"],
            max_memories=8,
        ),
    )
    assert any(c.subject == "render-aspect" and c.unresolved for c in resp.conflicts)
    bundled_ids = {item.memory_id for item in resp.bundle}
    conflict_ids = {
        mid
        for c in resp.conflicts
        if c.subject == "render-aspect"
        for mid in c.memory_ids
    }
    assert len(bundled_ids & conflict_ids) <= 1


def test_known_subject_unrelated_query_does_not_force_recall(store: JarvisStore):
    _create(
        store,
        content="Garden irrigation runs at dawn on Tuesdays.",
        subject="garden-schedule",
    )
    resp = emr_recall(
        store,
        EmrRecallRequest(
            intent="procedure",
            query="quantum chromodynamics lattice constants renormalization",
            subjects=["garden-schedule"],
            max_memories=8,
        ),
    )
    assert resp.abstained is True or len(resp.bundle) == 0
    if resp.abstained:
        assert resp.abstention_reason in (
            "top-score-below-floor",
            "query-alignment-below-floor",
            "no-candidates",
        )
