"""AMUL RAG — Adaptive / Modular / Universal / Logical retrieval stack.

    Adaptive   classify_query -> {intent_type, retrieval_config, generation_config}
    Modular    ingest | index (hashed-TF vector + BM25-lite) | retrieval |
               context builder | generation
    Universal  one document schema for every source, incl. Continuity Ledger
               memories; QueryRAG -> answer + evidence contract
    Logical    hard evidence gate (no support above threshold =>
               insufficient_evidence — never fabricate), evidence records,
               append-only replay log

Maturity (honest tags):
    classifier/modes          - enforced (tests/test_amul_rag.py)
    lexical vector + BM25     - enforced (deterministic v0)
    neural embedding index    - DECLARED (swap-in point: embed/Index)
    LLM generation            - partial (extractive v0; optional
                                JARVIS_RAG_LLM_URL OpenAI-compatible hook)
    evidence gate + replay    - enforced
"""

from __future__ import annotations

import hashlib
import json
import math
import os
import re
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from pydantic import BaseModel, Field

from app.emr import estimate_tokens

EVIDENCE_SCHEMA = "amul-rag-evidence-v1"

RAG_DOCS_PATH = os.getenv("JARVIS_RAG_DOCS_PATH") or os.path.join("data", "amul-rag-docs.jsonl")
RAG_LOG_PATH = os.getenv("JARVIS_RAG_LOG_PATH") or os.path.join("data", "amul-rag-log.jsonl")
RAG_LLM_URL = os.getenv("JARVIS_RAG_LLM_URL") or ""
RAG_LLM_MODEL = os.getenv("JARVIS_RAG_LLM_MODEL") or "extractive-v0"

EMBED_DIM = 128
_WORD_RE = re.compile(r"[a-z0-9_]{2,}", re.I)


def tokenize(text: str) -> list[str]:
    return [m.group(0).lower() for m in _WORD_RE.finditer(text or "")]


# --- Adaptive layer -----------------------------------------------------------

MODE_CONFIGS: dict[str, dict[str, Any]] = {
    "fact_lookup": {
        "k": 5, "use_keyword": True, "use_vector": True, "vector_weight": 0.6,
        "min_support": 0.35, "max_context_tokens": 256, "style": "short",
    },
    "code_help": {
        "k": 6, "use_keyword": True, "use_vector": True, "vector_weight": 0.5,
        "min_support": 0.30, "max_context_tokens": 512, "style": "code",
    },
    "longform_explanation": {
        "k": 12, "use_keyword": True, "use_vector": True, "vector_weight": 0.5,
        "min_support": 0.20, "max_context_tokens": 1024, "style": "longform",
    },
    "chatty": {  # skips retrieval entirely — no citations without evidence need
        "k": 0, "use_keyword": False, "use_vector": False, "vector_weight": 0.0,
        "min_support": 1.01, "max_context_tokens": 0, "style": "chat",
    },
}

_CHATTY_MARKERS = {"hi", "hello", "hey", "thanks", "thank", "yo", "ok", "okay"}
_CODE_MARKERS = ("def ", "class ", "import ", "npm ", "git ", "pip ", "curl ",
                 "traceback", "exception", "compile", "syntax", "```")
_LONGFORM_STARTERS = ("explain", "why ", "walk me", "describe", "how does")


def classify_query(query: str) -> str:
    q = (query or "").strip()
    low = q.lower()
    words = tokenize(q)
    if len(words) <= 3 and not low.endswith("?") and (
        set(words) & _CHATTY_MARKERS or not words
    ):
        return "chatty"
    if any(m in low for m in _CODE_MARKERS):
        return "code_help"
    if any(low.startswith(s) for s in _LONGFORM_STARTERS) or len(words) > 25:
        return "longform_explanation"
    return "fact_lookup"


def routing_contract(query: str) -> dict[str, Any]:
    """Adaptive output contract: intent + retrieval/generation configs."""
    mode = MODE_CONFIGS[classify_query(query)]
    return {
        "intent_type": next(k for k, v in MODE_CONFIGS.items() if v is mode),
        "retrieval_config": {
            k: mode[k] for k in ("k", "use_keyword", "use_vector", "vector_weight", "min_support")
        },
        "generation_config": {
            "style": mode["style"],
            "max_context_tokens": mode["max_context_tokens"],
            "llm_model": RAG_LLM_MODEL,
        },
    }


# --- Universal layer -----------------------------------------------------------


class RagDocument(BaseModel):
    id: str
    title: str
    body: str
    source: str = "unknown"
    tags: list[str] = Field(default_factory=list)
    created_at: str
    version: int = 1


def normalize_document(raw: dict[str, Any], existing_version: int = 0) -> RagDocument:
    body = str(raw.get("body", ""))
    title = str(raw.get("title", "")) or body[:60]
    digest = hashlib.sha256(f"{raw.get('id') or ''}|{title}|{body}".encode()).hexdigest()
    return RagDocument(
        id=str(raw["id"]) if raw.get("id") else f"rag-{digest[:12]}",
        title=title,
        body=body,
        source=str(raw.get("source", "unknown")),
        tags=[str(t) for t in raw.get("tags", [])],
        created_at=datetime.now(timezone.utc).isoformat(),
        version=(existing_version + 1) if existing_version else 1,
    )


# --- Modular layer: index -------------------------------------------------------

EMBED_SWAP_NOTE = "neural embeddings declared; deterministic hashed-TF is the v0 stand-in"


def embed(text: str) -> list[float]:
    vec = [0.0] * EMBED_DIM
    for tok in tokenize(text):
        idx = int(hashlib.md5(tok.encode()).hexdigest(), 16) % EMBED_DIM
        vec[idx] += 1.0
    norm = math.sqrt(sum(v * v for v in vec)) or 1.0
    return [round(v / norm, 6) for v in vec]


def cosine(a: list[float], b: list[float]) -> float:
    return sum(x * y for x, y in zip(a, b))


def append_jsonl(path: str, payload: dict[str, Any]) -> bool:
    try:
        p = Path(path)
        p.parent.mkdir(parents=True, exist_ok=True)
        with p.open("a", encoding="utf-8") as f:
            f.write(json.dumps(payload, separators=(",", ":")) + "\n")
        return True
    except Exception:
        return False


class RagIndex:
    def __init__(self) -> None:
        self.docs: dict[str, RagDocument] = {}
        self.vectors: dict[str, list[float]] = {}
        self._df: dict[str, int] = {}

    def rebuild(self, docs: list[RagDocument]) -> None:
        self.docs, self.vectors, self._df = {}, {}, {}
        for d in docs:
            self.add(d)

    def add(self, doc: RagDocument, persist: bool = False) -> None:
        self.docs[doc.id] = doc
        self.vectors[doc.id] = embed(f"{doc.title} {doc.body}")
        for tok in set(tokenize(f"{doc.title} {doc.body}")):
            self._df[tok] = self._df.get(tok, 0) + 1
        if persist:
            append_jsonl(RAG_DOCS_PATH, doc.model_dump())

    def search_vector(self, vec: list[float], k: int) -> list[tuple[str, float]]:
        scored = [(did, cosine(vec, dv)) for did, dv in self.vectors.items()]
        scored.sort(key=lambda t: t[1], reverse=True)
        return scored[:k]

    def search_keyword(self, query: str, k: int) -> list[tuple[str, float]]:
        q_tokens = set(tokenize(query))
        n_docs = max(1, len(self.docs))
        out: list[tuple[str, float]] = []
        for did, doc in self.docs.items():
            tf: dict[str, int] = {}
            for t in tokenize(f"{doc.title} {doc.body}"):
                tf[t] = tf.get(t, 0) + 1
            score = 0.0
            for t in q_tokens:
                idf = math.log(1 + n_docs / (1 + self._df.get(t, 0)))
                score += idf * tf.get(t, 0) / (tf.get(t, 0) + 1)
            out.append((did, score))
        out.sort(key=lambda t: t[1], reverse=True)
        return out[:k]


def load_docs(path: str) -> list[RagDocument]:
    """Latest-wins fold over the append-only doc log."""
    latest: dict[str, RagDocument] = {}
    p = Path(path)
    if p.exists():
        try:
            for line in p.read_text(encoding="utf-8").splitlines():
                line = line.strip()
                if not line:
                    continue
                try:
                    d = RagDocument(**json.loads(line))
                    latest[d.id] = d
                except Exception:
                    continue
        except Exception:
            pass
    return list(latest.values())


_INDEX: RagIndex | None = None


def get_index() -> RagIndex:
    global _INDEX
    if _INDEX is None:
        _INDEX = RagIndex()
        _INDEX.rebuild(load_docs(RAG_DOCS_PATH))
    return _INDEX


def reset_index_for_tests() -> None:
    global _INDEX
    _INDEX = None


# --- Modular layer: retrieval + context builder ----------------------------------

def hybrid_retrieve(index: RagIndex, query: str, rcfg: dict[str, Any]) -> list[dict[str, Any]]:
    """Absolute-support hybrid scoring (gate-safe).

    Vector = raw cosine ∈ [0,1]; keyword = saturating x/(x+1) on BM25-lite.
    NO per-set max-normalization: that would rescale garbage to ~1.0 and
    defeat the Logical-layer min_support gate.
    """
    k = rcfg["k"]
    vec_scores = dict(index.search_vector(embed(query), k)) if rcfg["use_vector"] else {}
    kw_scores = dict(index.search_keyword(query, k)) if rcfg["use_keyword"] else {}

    def _sat(x: float) -> float:
        return x / (x + 1.0)

    vw_base = rcfg["vector_weight"]
    w_v = vw_base if vec_scores else 0.0
    w_k = (1.0 - vw_base) if kw_scores else 0.0
    total_w = w_v + w_k

    results = []
    for did in set(vec_scores) | set(kw_scores):
        if total_w == 0:
            final = 0.0
        else:
            v = vec_scores.get(did, 0.0)
            kk = _sat(kw_scores.get(did, 0.0))
            final = (w_v * v + w_k * kk) / total_w
        results.append({
            "id": did,
            "final": round(final, 6),
            "vector": round(vec_scores.get(did, 0.0), 6),
            "keyword": round(_sat(kw_scores.get(did, 0.0)), 6),
        })
    results.sort(key=lambda r: r["final"], reverse=True)
    return results[:k]


def build_context(index: RagIndex, hits: list[dict[str, Any]], max_tokens: int) -> tuple[str, list[str]]:
    lines: list[str] = []
    used: list[str] = []
    used_tokens = 0
    for hit in hits:
        doc = index.docs[hit["id"]]
        block = f"[Doc {doc.id} | {doc.title} | {doc.source}]\n{doc.body}"
        cost = estimate_tokens(block)
        if used_tokens + cost > max_tokens:
            continue
        lines.append(block)
        used.append(hit["id"])
        used_tokens += cost
    return "\n\n".join(lines), used


# --- Modular layer: generation ----------------------------------------------------

_SENT_RE = re.compile(r"(?<=[.!?])\s+")


def extractive_answer(query: str, index: RagIndex, used_ids: list[str]) -> str:
    """Deterministic extractive v0 — sentences from retrieved docs only."""
    if not used_ids:
        return "No supporting documents retrieved."
    q_tokens = set(tokenize(query))
    best: list[tuple[int, str, str]] = []  # (-overlap, doc_id, sentence)
    for did in used_ids[:3]:
        body = index.docs[did].body
        for sent in _SENT_RE.split(body):
            overlap = len(q_tokens & set(tokenize(sent)))
            if sent.strip():
                best.append((-overlap, did, sent.strip()))
    best.sort(key=lambda t: t[0])
    picks: list[str] = []
    seen: set[str] = set()
    for _, did, sent in best:
        if sent in seen:
            continue
        seen.add(sent)
        picks.append(f"{sent} [{did}]")
        if len(picks) == 2:
            break
    return "Based on retrieved documents: " + " ".join(picks)


def llm_generate(query: str, context: str, style: str) -> tuple[str, str] | None:
    """Optional OpenAI-compatible hook (JARVIS_RAG_LLM_URL). Declared/partial."""
    if not RAG_LLM_URL:
        return None
    try:
        import httpx

        resp = httpx.post(
            RAG_LLM_URL.rstrip("/") + "/chat/completions",
            json={
                "model": RAG_LLM_MODEL,
                "messages": [
                    {
                        "role": "system",
                        "content": (
                            f"Answer using ONLY the provided context. Style: {style}. "
                            "Cite [Doc id] markers. If unsupported, say insufficient evidence."
                        ),
                    },
                    {"role": "user", "content": f"Context:\n{context}\n\nQuery: {query}"},
                ],
                "temperature": 0,
            },
            timeout=20,
        )
        resp.raise_for_status()
        data = resp.json()
        return data["choices"][0]["message"]["content"], RAG_LLM_MODEL
    except Exception:
        return None  # graceful degradation to extractive


# --- Logical layer -----------------------------------------------------------------


class EvidenceRecord(BaseModel):
    schema_version: str = EVIDENCE_SCHEMA
    query: str
    intent_type: str
    retrieval_config: dict[str, Any]
    docs_used: list[dict[str, Any]] = Field(default_factory=list)
    scores: dict[str, float] = Field(default_factory=dict)
    answer: str
    llm_model: str = "extractive-v0"
    status: str  # answered | insufficient_evidence | chatty
    timestamp: str


def ledger_docs(store) -> list[RagDocument]:
    """Continuity Ledger memories as a first-class corpus (Universal layer)."""
    out: list[RagDocument] = []
    try:
        for m in store.list_memories(limit=999):
            out.append(RagDocument(
                id=m.id,
                title=m.subject or m.type,
                body=m.content,
                source="continuity-ledger",
                tags=list(m.tags),
                created_at=m.created_at,
            ))
    except Exception:
        pass
    return out


INSUFFICIENT_TEMPLATE = (
    "Insufficient evidence to answer (top support {top:.3f} < threshold "
    "{thr:.2f}). The governed policy forbids answering without a supporting "
    "document; refine the query or ingest relevant sources."
)


def answer_query(query: str, index: RagIndex, extra_docs: list[RagDocument] | None = None) -> EvidenceRecord:
    """Full AMUL-RAG loop with the Logical-layer gate and replay logging."""
    contract = routing_contract(query)
    intent = contract["intent_type"]
    rcfg = contract["retrieval_config"]
    gcfg = contract["generation_config"]
    now = datetime.now(timezone.utc).isoformat()

    if intent == "chatty":
        record = EvidenceRecord(
            query=query, intent_type=intent, retrieval_config=rcfg,
            answer="Hello! Ask me about the workspace and I will retrieve governed evidence.",
            llm_model=gcfg["llm_model"], status="chatty", timestamp=now,
        )
        append_jsonl(RAG_LOG_PATH, record.model_dump())
        return record

    work_index = RagIndex()
    work_index.rebuild(list(index.docs.values()) + list({d.id: d for d in extra_docs or []}.values()))
    # Logical filter: zero-support hits are context noise, never admitted.
    hits = [h for h in hybrid_retrieve(work_index, query, rcfg) if h["final"] > 0.0]

    if not hits or hits[0]["final"] < rcfg["min_support"]:
        top = hits[0]["final"] if hits else 0.0
        record = EvidenceRecord(
            query=query, intent_type=intent, retrieval_config=rcfg,
            docs_used=[], scores={"top_support": round(top, 6)},
            answer=INSUFFICIENT_TEMPLATE.format(top=top, thr=rcfg["min_support"]),
            llm_model=gcfg["llm_model"], status="insufficient_evidence", timestamp=now,
        )
        append_jsonl(RAG_LOG_PATH, record.model_dump())
        return record

    context, used_ids = build_context(work_index, hits, gcfg["max_context_tokens"])
    gen = llm_generate(query, context, gcfg["style"])
    if gen is None:
        answer, model = extractive_answer(query, work_index, used_ids), "extractive-v0"
    else:
        answer, model = gen

    record = EvidenceRecord(
        query=query, intent_type=intent, retrieval_config=rcfg,
        docs_used=[h for h in hits if h["id"] in used_ids],
        scores={h["id"]: h["final"] for h in hits if h["id"] in used_ids},
        answer=answer, llm_model=model, status="answered", timestamp=now,
    )
    append_jsonl(RAG_LOG_PATH, record.model_dump())
    return record


def rag_status() -> dict[str, Any]:
    idx = get_index()
    log_lines = 0
    p = Path(RAG_LOG_PATH)
    if p.exists():
        log_lines = sum(1 for ln in p.read_text(encoding="utf-8").splitlines() if ln.strip())
    return {
        "schema": EVIDENCE_SCHEMA,
        "documents": len(idx.docs),
        "by_source": sorted({d.source for d in idx.docs.values()}),
        "replay_log": {"path": RAG_LOG_PATH, "records": log_lines, "append_only": True},
        "modes": {k: v["min_support"] for k, v in MODE_CONFIGS.items()},
        "maturity": {
            "classifier_modes": "enforced",
            "lexical_vector_bm25": "enforced",
            "neural_embeddings": "declared",
            "llm_generation": "partial" if RAG_LLM_URL else "extractive-v0",
            "evidence_gate_replay": "enforced",
        },
    }
