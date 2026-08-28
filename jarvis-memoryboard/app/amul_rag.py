"""AMUL RAG — Adaptive / Modular / Universal / Logical retrieval stack.

    Adaptive   classify_query -> {intent_type, retrieval_config, generation_config}
    Modular    ingest | index (neural or hashed-TF vector + BM25-lite) | retrieval |
               context builder | generation
    Universal  one document schema for every source, incl. Continuity Ledger
               memories; QueryRAG -> answer + evidence contract
    Logical    hard evidence gate (no support above threshold =>
               insufficient_evidence — never fabricate), evidence records,
               append-only replay log

Maturity (honest tags):
    classifier/modes          - enforced (tests/test_amul_rag.py)
    lexical vector + BM25     - enforced (deterministic fallback)
    neural embedding index    - enforced when configured/provider-ready
    LLM generation            - enforced adapter with cited extractive fallback
    trust/conflict membrane   - enforced for declared authority + explicit conflicts
    evidence gate + replay    - enforced, redacted, retention-bounded
"""

from __future__ import annotations

import hashlib
import json
import math
import os
import re
import threading
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Literal
from urllib import request as urllib_request

from pydantic import BaseModel, Field

from app.emr import estimate_tokens

EVIDENCE_SCHEMA = "amul-rag-evidence-v1"

RAG_DOCS_PATH = os.getenv("JARVIS_RAG_DOCS_PATH") or os.path.join("data", "amul-rag-docs.jsonl")
RAG_LOG_PATH = os.getenv("JARVIS_RAG_LOG_PATH") or os.path.join("data", "amul-rag-log.jsonl")
RAG_LLM_URL = os.getenv("JARVIS_RAG_LLM_URL") or ""
RAG_LLM_MODEL = os.getenv("JARVIS_RAG_LLM_MODEL") or "extractive-v0"
RAG_LLM_REQUIRED = os.getenv("JARVIS_RAG_LLM_REQUIRED", "false").lower() == "true"
RAG_EMBED_URL = os.getenv("JARVIS_RAG_EMBED_URL") or ""
RAG_EMBED_MODEL = os.getenv("JARVIS_RAG_EMBED_MODEL") or "hashed-tf-v0"
RAG_EMBED_REQUIRED = os.getenv("JARVIS_RAG_EMBED_REQUIRED", "false").lower() == "true"
RAG_API_KEY_FILE = os.getenv("JARVIS_RAG_API_KEY_FILE") or ""
RAG_LOG_REDACT = os.getenv("JARVIS_RAG_LOG_REDACT", "true").lower() != "false"
RAG_LOG_RETENTION_DAYS = max(1, int(os.getenv("JARVIS_RAG_LOG_RETENTION_DAYS", "30")))
RAG_LOG_MAX_BYTES = max(1024, int(os.getenv("JARVIS_RAG_LOG_MAX_BYTES", str(16 * 1024 * 1024))))
RAG_PROVIDER_TIMEOUT = max(1.0, float(os.getenv("JARVIS_RAG_PROVIDER_TIMEOUT", "60")))

EMBED_DIM = 128
_WORD_RE = re.compile(r"[a-z0-9_]{2,}", re.I)
_IO_LOCK = threading.RLock()
_EMBED_LOCK = threading.RLock()
_EMBED_CACHE: dict[tuple[str, str, str, str], list[float]] = {}

AuthorityClass = Literal["untrusted", "working", "verified", "constitutional"]
DocumentStatus = Literal["draft", "verified", "archived"]
TRUST_WEIGHTS: dict[str, float] = {
    "untrusted": 0.55,
    "working": 0.75,
    "verified": 1.0,
    "constitutional": 1.0,
}


class RagProviderError(OSError):
    """A configured required embedding/generation provider is unavailable."""


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
    authority_class: AuthorityClass = "untrusted"
    status: DocumentStatus = "draft"
    subject: str | None = None
    supersedes: str | None = None
    conflict_ids: list[str] = Field(default_factory=list)
    content_sha256: str = ""


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
        authority_class=str(raw.get("authority_class", "untrusted")),
        status=str(raw.get("status", "draft")),
        subject=str(raw["subject"]) if raw.get("subject") else None,
        supersedes=str(raw["supersedes"]) if raw.get("supersedes") else None,
        conflict_ids=sorted({str(v) for v in raw.get("conflict_ids", []) if v}),
        content_sha256=hashlib.sha256(body.encode()).hexdigest(),
    )


# --- Modular layer: index -------------------------------------------------------

EMBED_SWAP_NOTE = "OpenAI-compatible neural embeddings with deterministic hashed-TF fallback"


def embed(text: str) -> list[float]:
    """Deterministic fallback embedding retained for offline/replay stability."""
    vec = [0.0] * EMBED_DIM
    for tok in tokenize(text):
        idx = int(hashlib.md5(tok.encode()).hexdigest(), 16) % EMBED_DIM
        vec[idx] += 1.0
    norm = math.sqrt(sum(v * v for v in vec)) or 1.0
    return [round(v / norm, 6) for v in vec]


def cosine(a: list[float], b: list[float]) -> float:
    return sum(x * y for x, y in zip(a, b))


def _post_json(url: str, payload: dict[str, Any]) -> dict[str, Any]:
    body = json.dumps(payload, separators=(",", ":")).encode("utf-8")
    req = urllib_request.Request(
        url,
        data=body,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    with urllib_request.urlopen(req, timeout=RAG_PROVIDER_TIMEOUT) as response:
        return json.loads(response.read().decode("utf-8"))


def _normalized(values: list[Any]) -> list[float]:
    vector = [float(v) for v in values]
    if not vector or not all(math.isfinite(v) for v in vector):
        raise ValueError("embedding provider returned an invalid vector")
    norm = math.sqrt(sum(v * v for v in vector))
    if norm <= 0:
        raise ValueError("embedding provider returned a zero vector")
    return [v / norm for v in vector]


def neural_embed_many(texts: list[str], *, task: str) -> list[list[float]]:
    """Use an OpenAI-compatible embeddings endpoint with bounded batching/cache."""
    if not RAG_EMBED_URL:
        raise RagProviderError("neural embedding provider is not configured")
    if task not in {"document", "query"}:
        raise ValueError("embedding task must be document or query")

    prefix = ""
    if "nomic" in RAG_EMBED_MODEL.lower():
        prefix = "search_document: " if task == "document" else "search_query: "

    keys = [
        (RAG_EMBED_URL, RAG_EMBED_MODEL, task, hashlib.sha256(text.encode()).hexdigest())
        for text in texts
    ]
    with _EMBED_LOCK:
        missing = [(i, text, key) for i, (text, key) in enumerate(zip(texts, keys)) if key not in _EMBED_CACHE]
        for start in range(0, len(missing), 16):
            batch = missing[start:start + 16]
            try:
                data = _post_json(
                    RAG_EMBED_URL.rstrip("/") + "/embeddings",
                    {"model": RAG_EMBED_MODEL, "input": [prefix + text for _, text, _ in batch]},
                )
                rows = sorted(data["data"], key=lambda row: int(row.get("index", 0)))
                if len(rows) != len(batch):
                    raise ValueError("embedding provider returned the wrong row count")
                for (_, _, key), row in zip(batch, rows):
                    _EMBED_CACHE[key] = _normalized(row["embedding"])
            except Exception as exc:
                raise RagProviderError(f"neural embedding provider failed: {exc}") from exc
        return [list(_EMBED_CACHE[key]) for key in keys]


def append_jsonl(path: str, payload: dict[str, Any]) -> bool:
    try:
        with _IO_LOCK:
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
        self.embedding_backend = "hashed-tf-v0"
        self.embedding_model = "hashed-tf-v0"
        self.vector_dimensions = EMBED_DIM

    def _prepare(self, docs: list[RagDocument]) -> tuple[dict[str, RagDocument], dict[str, list[float]], str, str]:
        latest = {doc.id: doc for doc in docs}
        ordered = list(latest.values())
        if RAG_EMBED_URL and ordered:
            try:
                vectors = neural_embed_many(
                    [f"{doc.title} {doc.body}" for doc in ordered], task="document"
                )
                return latest, dict(zip(latest, vectors)), "neural-openai-compatible", RAG_EMBED_MODEL
            except RagProviderError:
                if RAG_EMBED_REQUIRED:
                    raise
        vectors = [embed(f"{doc.title} {doc.body}") for doc in ordered]
        return latest, dict(zip(latest, vectors)), "hashed-tf-v0", "hashed-tf-v0"

    def _commit(self, docs: dict[str, RagDocument], vectors: dict[str, list[float]], backend: str, model: str) -> None:
        self.docs = docs
        self.vectors = vectors
        self._df = {}
        for doc in docs.values():
            for tok in set(tokenize(f"{doc.title} {doc.body}")):
                self._df[tok] = self._df.get(tok, 0) + 1
        self.embedding_backend = backend
        self.embedding_model = model
        self.vector_dimensions = len(next(iter(vectors.values()))) if vectors else EMBED_DIM

    def rebuild(self, docs: list[RagDocument]) -> None:
        self._commit(*self._prepare(docs))

    def add(self, doc: RagDocument, persist: bool = False) -> None:
        candidate = list(self.docs.values()) + [doc]
        prepared = self._prepare(candidate)
        if persist and not append_jsonl(RAG_DOCS_PATH, doc.model_dump()):
            raise OSError(f"failed to persist RAG document {doc.id}")
        self._commit(*prepared)

    def embed_query(self, query: str) -> list[float]:
        if self.embedding_backend == "neural-openai-compatible":
            return neural_embed_many([query], task="query")[0]
        return embed(query)

    def search_vector(self, vec: list[float], k: int) -> list[tuple[str, float]]:
        scored = [(did, cosine(vec, dv)) for did, dv in self.vectors.items()]
        scored.sort(key=lambda t: (-t[1], t[0]))
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
        out.sort(key=lambda t: (-t[1], t[0]))
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
    vec_scores = dict(index.search_vector(index.embed_query(query), k)) if rcfg["use_vector"] else {}
    kw_scores = dict(index.search_keyword(query, k)) if rcfg["use_keyword"] else {}

    def _sat(x: float) -> float:
        return x / (x + 1.0)

    vw_base = rcfg["vector_weight"]
    w_v = vw_base if vec_scores else 0.0
    w_k = (1.0 - vw_base) if kw_scores else 0.0
    total_w = w_v + w_k

    results = []
    for did in set(vec_scores) | set(kw_scores):
        doc = index.docs[did]
        if doc.status == "archived":
            continue
        if total_w == 0:
            retrieval_score = 0.0
        else:
            v = vec_scores.get(did, 0.0)
            kk = _sat(kw_scores.get(did, 0.0))
            retrieval_score = (w_v * v + w_k * kk) / total_w
        trust_weight = TRUST_WEIGHTS[doc.authority_class]
        final = retrieval_score * trust_weight
        results.append({
            "id": did,
            "final": round(final, 6),
            "retrieval_score": round(retrieval_score, 6),
            "trust_weight": trust_weight,
            "authority_class": doc.authority_class,
            "vector": round(vec_scores.get(did, 0.0), 6),
            "keyword": round(_sat(kw_scores.get(did, 0.0)), 6),
        })
    results.sort(key=lambda r: (-r["final"], r["id"]))
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


def llm_generate(
    query: str, context: str, style: str, allowed_doc_ids: list[str]
) -> tuple[str, str] | None:
    """Cited OpenAI-compatible generation with deterministic safe fallback."""
    if not RAG_LLM_URL or not allowed_doc_ids:
        return None
    try:
        data = _post_json(
            RAG_LLM_URL.rstrip("/") + "/chat/completions",
            {
                "model": RAG_LLM_MODEL,
                "messages": [
                    {
                        "role": "system",
                        "content": (
                            f"Answer using ONLY the provided context. Style: {style}. "
                            "Return a concise answer whose final characters are at least "
                            "one allowed citation marker copied exactly. Never invent a "
                            "citation. If unsupported, say insufficient evidence. Do not "
                            "reveal hidden reasoning."
                        ),
                    },
                    {
                        "role": "user",
                        "content": (
                            "/no_think\nAllowed citation markers: "
                            + " ".join(f"[{doc_id}]" for doc_id in allowed_doc_ids)
                            + f"\nContext:\n{context}\n\nQuery: {query}"
                            + f"\nRequired format: <answer> [{allowed_doc_ids[0]}]"
                        ),
                    },
                ],
                "temperature": 0,
                "max_tokens": 512,
            },
        )
        message = data["choices"][0]["message"]
        answer = str(message.get("content") or "").strip()
        citations = set(re.findall(r"\[([^\[\]]+)\]", answer))
        allowed = set(allowed_doc_ids)
        if not answer or not citations or not citations <= allowed:
            raise ValueError("LLM output failed the exact-citation contract")
        return answer, str(data.get("model") or RAG_LLM_MODEL)
    except Exception as exc:
        if RAG_LLM_REQUIRED:
            raise RagProviderError(f"LLM generation provider failed: {exc}") from exc
        return None


# --- Logical layer -----------------------------------------------------------------


class EvidenceRecord(BaseModel):
    schema_version: str = EVIDENCE_SCHEMA
    query: str
    intent_type: str
    retrieval_config: dict[str, Any]
    docs_used: list[dict[str, Any]] = Field(default_factory=list)
    scores: dict[str, float] = Field(default_factory=dict)
    conflicts: list[dict[str, Any]] = Field(default_factory=list)
    answer: str
    llm_model: str = "extractive-v0"
    embedding_backend: str = "hashed-tf-v0"
    epistemic_status: str = "unsupported"
    truth_notice: str = (
        "Retrieved support is evidence, not an adjudication of factual truth."
    )
    query_sha256: str = ""
    status: str  # answered | insufficient_evidence | conflicted_evidence | chatty
    timestamp: str


def ledger_docs(store) -> list[RagDocument]:
    """Continuity Ledger memories as a first-class corpus (Universal layer)."""
    out: list[RagDocument] = []
    try:
        records = store.list_memories(limit=999)
        conflict_map: dict[str, set[str]] = {}
        for conflict in store.conflicts():
            if not conflict.unresolved:
                continue
            ids = {m.id for m in conflict.memories}
            for memory_id in ids:
                conflict_map.setdefault(memory_id, set()).update(ids - {memory_id})
        for m in records:
            out.append(RagDocument(
                id=m.id,
                title=m.subject or m.type,
                body=m.content,
                source="continuity-ledger",
                tags=list(m.tags),
                created_at=m.created_at,
                authority_class="verified" if m.status == "verified" else "working",
                status=m.status,
                subject=m.subject,
                supersedes=m.supersedes,
                conflict_ids=sorted(conflict_map.get(m.id, set())),
                content_sha256=m.content_sha256 or hashlib.sha256(m.content.encode()).hexdigest(),
            ))
    except Exception:
        pass
    return out


INSUFFICIENT_TEMPLATE = (
    "Insufficient evidence to answer (top support {top:.3f} < threshold "
    "{thr:.2f}). The governed policy forbids answering without a supporting "
    "document; refine the query or ingest relevant sources."
)

CONTEXT_BUDGET_TEMPLATE = (
    "Insufficient evidence to answer: retrieved documents exceed the context "
    "token budget ({max_tokens} tokens) and none could be admitted. Refine "
    "the query or ingest shorter sources."
)

CONFLICT_TEMPLATE = (
    "Conflicting evidence prevents a single answer. Review the cited records "
    "and their provenance before adjudication."
)

_SECRET_VALUE_RE = re.compile(
    r"(?i)\b(api[_ -]?key|password|passwd|token|authorization|secret)\b\s*[:=]\s*([^\s,;]+)"
)
_BEARER_RE = re.compile(r"(?i)\bbearer\s+[a-z0-9._~+/=-]{12,}")
_KEYLIKE_RE = re.compile(r"\b(?:sk|pk|ghp|github_pat)_[A-Za-z0-9_-]{12,}\b")


def redact_query(query: str) -> str:
    value = _SECRET_VALUE_RE.sub(lambda m: f"{m.group(1)}=[REDACTED]", query)
    value = _BEARER_RE.sub("Bearer [REDACTED]", value)
    return _KEYLIKE_RE.sub("[REDACTED_KEY]", value)


def _archive_paths(path: Path) -> list[Path]:
    return sorted(path.parent.glob(path.name + ".*.archive"))


def maintain_replay_log(*, apply: bool = True) -> dict[str, Any]:
    """Rotate by size and expire only rotated archives by configured age."""
    path = Path(RAG_LOG_PATH)
    now = datetime.now(timezone.utc)
    rotate = path.exists() and path.stat().st_size >= RAG_LOG_MAX_BYTES
    expired = [
        p for p in _archive_paths(path)
        if datetime.fromtimestamp(p.stat().st_mtime, timezone.utc)
        < now - timedelta(days=RAG_LOG_RETENTION_DAYS)
    ]
    rotated_to: str | None = None
    if apply:
        with _IO_LOCK:
            path.parent.mkdir(parents=True, exist_ok=True)
            if rotate:
                stamp = now.strftime("%Y%m%dT%H%M%S.%fZ")
                target = path.with_name(f"{path.name}.{stamp}.archive")
                os.replace(path, target)
                rotated_to = str(target)
            for archive in expired:
                archive.unlink(missing_ok=True)
    return {
        "rotated": bool(rotated_to),
        "rotated_to": rotated_to,
        "expired_archives": [str(p) for p in expired],
        "retention_days": RAG_LOG_RETENTION_DAYS,
        "max_bytes": RAG_LOG_MAX_BYTES,
    }


def _persist_replay(record: EvidenceRecord) -> None:
    payload = record.model_dump()
    payload["query"] = redact_query(record.query) if RAG_LOG_REDACT else record.query
    maintain_replay_log(apply=True)
    if not append_jsonl(RAG_LOG_PATH, payload):
        raise OSError("failed to persist RAG replay record")


def _conflicts_for_hits(index: RagIndex, hits: list[dict[str, Any]]) -> list[dict[str, Any]]:
    groups: set[tuple[str, ...]] = set()
    for hit in hits:
        doc = index.docs[hit["id"]]
        present = sorted({doc.id, *(cid for cid in doc.conflict_ids if cid in index.docs)})
        if len(present) > 1:
            groups.add(tuple(present))
    return [
        {
            "document_ids": list(ids),
            "subject": next((index.docs[i].subject for i in ids if index.docs[i].subject), None),
            "policy": "do_not_merge_or_choose_without_adjudication",
        }
        for ids in sorted(groups)
    ]


def answer_query(query: str, index: RagIndex, extra_docs: list[RagDocument] | None = None) -> EvidenceRecord:
    """Full AMUL-RAG loop with the Logical-layer gate and replay logging."""
    contract = routing_contract(query)
    intent = contract["intent_type"]
    rcfg = contract["retrieval_config"]
    gcfg = contract["generation_config"]
    now = datetime.now(timezone.utc).isoformat()
    query_sha = hashlib.sha256(query.encode()).hexdigest()

    if intent == "chatty":
        record = EvidenceRecord(
            query=query, intent_type=intent, retrieval_config=rcfg,
            answer="Hello! Ask me about the workspace and I will retrieve governed evidence.",
            llm_model=gcfg["llm_model"], status="chatty", timestamp=now,
            epistemic_status="not_applicable", query_sha256=query_sha,
        )
        _persist_replay(record)
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
            embedding_backend=work_index.embedding_backend,
            epistemic_status="unsupported", query_sha256=query_sha,
        )
        _persist_replay(record)
        return record

    conflicts = _conflicts_for_hits(work_index, hits)
    if conflicts:
        conflict_ids = {doc_id for group in conflicts for doc_id in group["document_ids"]}
        conflict_hits = [h for h in hits if h["id"] in conflict_ids]
        record = EvidenceRecord(
            query=query, intent_type=intent, retrieval_config=rcfg,
            docs_used=conflict_hits,
            scores={h["id"]: h["final"] for h in conflict_hits},
            conflicts=conflicts, answer=CONFLICT_TEMPLATE,
            llm_model="logical-conflict-membrane-v1",
            embedding_backend=work_index.embedding_backend,
            epistemic_status="conflicted", status="conflicted_evidence",
            query_sha256=query_sha, timestamp=now,
        )
        _persist_replay(record)
        return record

    context, used_ids = build_context(work_index, hits, gcfg["max_context_tokens"])
    if not used_ids:
        top = hits[0]["final"] if hits else 0.0
        record = EvidenceRecord(
            query=query,
            intent_type=intent,
            retrieval_config=rcfg,
            docs_used=[],
            scores={"top_support": round(top, 6)},
            answer=CONTEXT_BUDGET_TEMPLATE.format(
                max_tokens=gcfg["max_context_tokens"]
            ),
            llm_model=gcfg["llm_model"],
            status="insufficient_evidence",
            timestamp=now,
            embedding_backend=work_index.embedding_backend,
            epistemic_status="unsupported",
            query_sha256=query_sha,
        )
        _persist_replay(record)
        return record

    gen = llm_generate(query, context, gcfg["style"], used_ids)
    if gen is None:
        answer, model = extractive_answer(query, work_index, used_ids), "extractive-v0"
    else:
        answer, model = gen

    record = EvidenceRecord(
        query=query, intent_type=intent, retrieval_config=rcfg,
        docs_used=[h for h in hits if h["id"] in used_ids],
        scores={h["id"]: h["final"] for h in hits if h["id"] in used_ids},
        answer=answer, llm_model=model, status="answered", timestamp=now,
        embedding_backend=work_index.embedding_backend,
        epistemic_status="supported_not_adjudicated", query_sha256=query_sha,
    )
    _persist_replay(record)
    return record


def rag_status() -> dict[str, Any]:
    provider_error: str | None = None
    try:
        idx = get_index()
        document_count = len(idx.docs)
        sources = sorted({d.source for d in idx.docs.values()})
        embedding_backend = idx.embedding_backend
        embedding_model = idx.embedding_model
        vector_dimensions = idx.vector_dimensions
    except RagProviderError as exc:
        docs = load_docs(RAG_DOCS_PATH)
        document_count = len(docs)
        sources = sorted({d.source for d in docs})
        embedding_backend = "unavailable"
        embedding_model = RAG_EMBED_MODEL
        vector_dimensions = 0
        provider_error = str(exc)
    log_lines = 0
    p = Path(RAG_LOG_PATH)
    if p.exists():
        log_lines = sum(1 for ln in p.read_text(encoding="utf-8").splitlines() if ln.strip())
    return {
        "schema": EVIDENCE_SCHEMA,
        "documents": document_count,
        "by_source": sources,
        "replay_log": {"path": RAG_LOG_PATH, "records": log_lines, "append_only": True},
        "privacy": {
            "query_redaction": RAG_LOG_REDACT,
            "retention_days": RAG_LOG_RETENTION_DAYS,
            "rotation_max_bytes": RAG_LOG_MAX_BYTES,
            "archives": len(_archive_paths(p)),
        },
        "embedding": {
            "backend": embedding_backend,
            "model": embedding_model,
            "dimensions": vector_dimensions,
            "provider_configured": bool(RAG_EMBED_URL),
            "provider_required": RAG_EMBED_REQUIRED,
            "error": provider_error,
        },
        "generation": {
            "provider_configured": bool(RAG_LLM_URL),
            "provider_required": RAG_LLM_REQUIRED,
            "model": RAG_LLM_MODEL,
            "fallback": "extractive-v0",
            "citation_contract": "enforced",
        },
        "access_control": {"api_key_file_configured": bool(RAG_API_KEY_FILE)},
        "truth_boundary": {
            "trust_weighting": "enforced",
            "explicit_conflict_membrane": "enforced",
            "factual_truth_adjudication": "out_of_scope",
        },
        "modes": {k: v["min_support"] for k, v in MODE_CONFIGS.items()},
        "maturity": {
            "classifier_modes": "enforced",
            "lexical_vector_bm25": "enforced",
            "neural_embeddings": "enforced" if embedding_backend == "neural-openai-compatible" else embedding_backend,
            "llm_generation": "enforced-adapter" if RAG_LLM_URL else "extractive-v0",
            "trust_conflict_membrane": "enforced",
            "privacy_retention": "enforced",
            "evidence_gate_replay": "enforced",
        },
    }
