"""Baseline retriever comparison for EMR evaluation.

Same ledger corpus, same probes — compare governed EMR against optional
lexical/vector signals from amul_rag (not a separate RAG product beside EMR).
"""

from __future__ import annotations

from typing import Any, Literal

from app.amul_rag import RagDocument, RagIndex, hybrid_retrieve, tokenize
from app.emr import (
    ExciteRequest,
    GraphExpansionConfig,
    RetrievalWeights,
    excite,
)
from app.models import MemoryRecord

RetrieverMode = Literal[
    "bm25",
    "hybrid",
    "emr_no_graph",
    "emr_no_reinforcement",
    "emr_full",
]


def records_to_index(records: list[MemoryRecord]) -> RagIndex:
    """Build an in-memory RAG index from Continuity Ledger records."""
    docs: list[RagDocument] = []
    for rec in records:
        if rec.status == "archived":
            continue
        docs.append(
            RagDocument(
                id=rec.id,
                title=rec.subject or rec.type,
                body=rec.content,
                source="continuity-ledger",
                tags=list(rec.tags),
                created_at=rec.created_at,
                authority_class="verified" if rec.status == "verified" else "working",
                status=rec.status,
                subject=rec.subject,
                supersedes=rec.supersedes,
                conflict_ids=[],
                content_sha256=rec.content_sha256,
            )
        )
    index = RagIndex()
    for doc in docs:
        index.add(doc)
    return index


def rank_baseline(
    records: list[MemoryRecord],
    query: str,
    *,
    mode: RetrieverMode,
    k: int = 5,
    token_budget: int = 8000,
) -> list[str]:
    """Return ordered memory ids for a probe under the requested retriever."""
    active = [r for r in records if r.status != "archived"]
    if mode == "bm25":
        index = records_to_index(active)
        hits = hybrid_retrieve(
            index,
            query,
            {"k": k, "use_keyword": True, "use_vector": False, "vector_weight": 0.0},
        )
        return [h["id"] for h in hits[:k]]
    if mode == "hybrid":
        index = records_to_index(active)
        hits = hybrid_retrieve(
            index,
            query,
            {"k": k, "use_keyword": True, "use_vector": True, "vector_weight": 0.5},
        )
        return [h["id"] for h in hits[:k]]

    req = ExciteRequest(
        query=query,
        token_budget=token_budget,
        theta_promote=0.001,
        candidate_limit=max(k * 20, 200),
        session_key=f"baseline-{mode}",
    )
    if mode == "emr_no_graph":
        req = req.model_copy(
            update={
                "graph": GraphExpansionConfig(enabled=False),
                "weights": RetrievalWeights(reinforcement=0.0),
            }
        )
    elif mode == "emr_no_reinforcement":
        req = req.model_copy(update={"weights": RetrievalWeights(reinforcement=0.0)})
    elif mode == "emr_full":
        pass

    result = excite(active, req, enforce_abstention=False)
    return [entry.memory_id for entry in result.stm[:k]]


def compare_retrievers(
    records: list[MemoryRecord],
    probes: list[dict[str, Any]],
    *,
    k: int = 5,
) -> dict[str, Any]:
    """Compare retriever modes on shared probes.

    Each probe: {query, relevant_ids?, relevant_hashes?}
    """
    modes: list[RetrieverMode] = [
        "bm25",
        "hybrid",
        "emr_no_graph",
        "emr_no_reinforcement",
        "emr_full",
    ]
    by_id = {r.id: r for r in records}
    summary: dict[str, dict[str, float]] = {m: {"hits": 0.0, "top1": 0.0, "n": 0.0} for m in modes}

    for probe in probes:
        query = probe["query"]
        relevant_ids = set(probe.get("relevant_ids") or [])
        relevant_hashes = set(probe.get("relevant_hashes") or [])

        def _is_relevant(mid: str) -> bool:
            rec = by_id.get(mid)
            if rec is None:
                return False
            return mid in relevant_ids or rec.content_sha256 in relevant_hashes

        for mode in modes:
            ranked = rank_baseline(records, query, mode=mode, k=k)
            summary[mode]["n"] += 1
            top = ranked[0] if ranked else None
            if top and _is_relevant(top):
                summary[mode]["top1"] += 1
            recall_hits = sum(1 for mid in ranked[:k] if _is_relevant(mid))
            summary[mode]["hits"] += recall_hits / max(1, min(k, len(relevant_ids) or 1))

    dashboard: dict[str, Any] = {}
    for mode, stats in summary.items():
        n = max(1, int(stats["n"]))
        dashboard[mode] = {
            "recall_at_k_proxy": round(stats["hits"] / n, 4),
            "top1_accuracy": round(stats["top1"] / n, 4),
            "probe_count": int(stats["n"]),
        }
    return {"schema": "emr-baseline-comparison-v1", "k": k, "retrievers": dashboard}
