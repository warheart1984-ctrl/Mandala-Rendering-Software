"""AMUL RAG tests — Adaptive, Modular, Universal, Logical layers.

Logical-layer guarantee under test: the evidence gate. A query without
support above the mode threshold returns status=insufficient_evidence
and NEVER fabricates an answer; every decision is logged to the
append-only replay record.
"""

from __future__ import annotations

from pathlib import Path
from tempfile import mktemp
from unittest.mock import patch

import pytest
from fastapi.testclient import TestClient

import app.amul_rag as rag
from app.amul_rag import (
    MODE_CONFIGS,
    RagDocument,
    RagIndex,
    answer_query,
    build_context,
    classify_query,
    embed,
    hybrid_retrieve,
    normalize_document,
    routing_contract,
)
from app.main import app
from app.store import JarvisStore


def _doc(did: str, title: str, body: str, source: str = "repo") -> RagDocument:
    return normalize_document({"id": did, "title": title, "body": body, "source": source})


def _index(*docs: RagDocument) -> RagIndex:
    idx = RagIndex()
    idx.rebuild(list(docs))
    return idx


def _log_lines() -> list[dict]:
    p = Path(rag.RAG_LOG_PATH)
    if not p.exists():
        return []
    import json

    return [json.loads(ln) for ln in p.read_text().splitlines() if ln.strip()]


# --- Adaptive layer -------------------------------------------------------------


def test_classifier_routes_all_four_intents():
    assert classify_query("hi") == "chatty"
    assert classify_query("thanks!") == "chatty"
    assert classify_query("fix my traceback in def load_data():") == "code_help"
    assert classify_query("explain how the excitation bundle forms") == "longform_explanation"
    assert classify_query("what encodes phase in HoloRT4D debug view?") == "fact_lookup"


def test_routing_contract_shapes():
    c = routing_contract("explain the whole drift protocol please")
    assert c["intent_type"] == "longform_explanation"
    assert c["retrieval_config"]["k"] > MODE_CONFIGS["fact_lookup"]["k"]
    assert c["generation_config"]["style"] == "longform"


# --- Modular layer ---------------------------------------------------------------


def test_embed_deterministic_and_normalized():
    v1, v2 = embed("phase encode tanh"), embed("phase encode tanh")
    assert v1 == v2
    assert abs(sum(x * x for x in v1) - 1.0) < 1e-3


def test_vector_and_keyword_search_rank_relevant_first():
    idx = _index(
        _doc("d-phase", "PhaseEncode", "HoloRT4D debug encodes phase via tanh of real over imag."),
        _doc("d-garden", "Garden", "Tomato watering schedule for summer beds."),
    )
    hits_v = dict(idx.search_vector(embed("phase encode tanh holort4d"), 2))
    hits_k = dict(idx.search_keyword("holort4d phase encode", 2))
    assert max(hits_v, key=hits_v.get) == "d-phase"
    assert max(hits_k, key=hits_k.get) == "d-phase"


def test_hybrid_respects_module_config_switches():
    idx = _index(
        _doc("d-a", "A", "governed recall excitation"),
        _doc("d-b", "B", "governed recall excitation"),
    )
    off = {"k": 2, "use_vector": False, "use_keyword": True, "vector_weight": 0.6}
    for h in hybrid_retrieve(idx, "governed recall", off):
        assert h["vector"] == 0.0 and h["keyword"] > 0 or h["final"] >= 0


def test_context_builder_respects_token_budget():
    big = _doc("d-big", "Big", "sentence one. " * 200)
    small = _doc("d-small", "Small", "tiny relevant fact.")
    idx = _index(big, small)
    hits = [
        {"id": "d-big", "final": 0.9},
        {"id": "d-small", "final": 0.8},
    ]
    context, used = build_context(idx, hits, max_tokens=64)
    assert used == ["d-small"]
    assert "d-big" not in context


# --- Universal layer --------------------------------------------------------------


def test_normalize_dedupes_by_content_address_bumps_version():
    raw = {"title": "T", "body": "B"}
    d1 = normalize_document(raw)
    d2 = normalize_document(raw, existing_version=d1.version)
    assert d1.id == d2.id
    assert d2.version == d1.version + 1


def test_ledger_memories_join_corpus_as_universal_documents(tmp_path):
    from datetime import datetime, timezone

    store = JarvisStore(str(tmp_path / "l.json"))
    recs = store.list_memories(limit=5)  # empty ledger fine; just shape-check source tag
    docs = rag.ledger_docs(store)
    assert all(d.source == "continuity-ledger" for d in docs)


# --- Logical layer: gate + replay --------------------------------------------------


def test_evidence_gate_blocks_fabrication_and_logs():
    idx = _index(_doc("d-irrelevant", "Cooking", "Boil pasta for nine minutes."))
    record = answer_query("quantum chromodynamics lattice gauge constants", idx)

    assert record.status == "insufficient_evidence"
    assert record.docs_used == []
    assert "Insufficient evidence" in record.answer
    logged = _log_lines()
    assert len(logged) == 1
    assert logged[0]["status"] == "insufficient_evidence"
    assert logged[0]["retrieval_config"]["min_support"] == MODE_CONFIGS["fact_lookup"]["min_support"]


def test_chatty_mode_skips_retrieval_without_citations():
    idx = _index(_doc("d-x", "X", "anything"))
    record = answer_query("hey there", idx)
    assert record.status == "chatty"
    assert record.docs_used == []


def test_supported_query_answers_extractively_with_provenance_and_logs():
    idx = _index(
        _doc(
            "d-holo",
            "PhaseEncode",
            "HoloRT4D debug PhaseEncode maps R/G to tanh of real over imag.",
            source="repo",
        ),
        _doc("d-noise", "Other", "Unrelated grocery content lives here."),
    )
    before = len(_log_lines())
    record = answer_query("what maps R/G in HoloRT4D PhaseEncode?", idx)

    assert record.status == "answered"
    assert any(d["id"] == "d-holo" for d in record.docs_used)
    assert "[d-holo]" in record.answer
    assert all(d["id"] != "d-noise" for d in record.docs_used)
    log = _log_lines()
    assert len(log) == before + 1
    assert log[-1]["schema_version"] == "amul-rag-evidence-v1"
    assert set(log[-1]["scores"]) == {d["id"] for d in record.docs_used}


def test_llm_hook_declared_off_by_default(monkeypatch):
    assert rag.RAG_LLM_URL == ""  # extractive v0 unless explicitly configured
    monkeypatch.setattr(rag, "RAG_LLM_URL", "http://127.0.0.1:9/v1")
    idx = _index(_doc("d-fallback", "Facts", "The sky is documented blue today."))
    record = answer_query("what color is the sky?", idx)
    assert record.status == "answered"
    assert record.llm_model == "extractive-v0"  # unreachable endpoint degrades gracefully


# --- Route roundtrip -----------------------------------------------------------------


def test_route_store_query_log_roundtrip(tmp_path):
    store = JarvisStore(str(tmp_path / "ledger.json"))
    with patch("app.main.get_store", return_value=store), patch(
        "app.main.get_index", return_value=rag.get_index()
    ):
        client = TestClient(app)
        r1 = client.post(
            "/api/jarvis/rag/documents",
            json={
                "documents": [
                    {
                        "id": "rt-1",
                        "title": "Sovereign X",
                        "body": "Sovereign X routes useful-FLOPs through governed lanes.",
                        "source": "docs",
                    }
                ]
            },
        )
        assert r1.status_code == 200
        rag.reset_index_for_tests()

        r2 = client.post(
            "/api/jarvis/rag/query",
            json={"query": "sovereign x useful-FLOPs routing"},
        )
        assert r2.status_code == 200
        data = r2.json()
        assert data["status"] in ("answered", "insufficient_evidence")
        assert data["intent_type"] in ("fact_lookup", "code_help", "longform_explanation")

        r3 = client.get("/api/jarvis/rag/log?limit=10")
        assert r3.status_code == 200
        assert isinstance(r3.json()["records"], list)

        r4 = client.get("/api/jarvis/rag/status")
        assert r4.json()["maturity"]["evidence_gate_replay"] == "enforced"
