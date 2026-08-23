from __future__ import annotations

import os
from typing import Any

from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from app.amul import (
    anchor_memory,
    get_field,
    verify_field,
)
import app.amul_gc as amul_gc
from app.amul_rag import (
    answer_query,
    get_index,
    normalize_document,
    rag_status,
)
from app.amul_llm import (
    PromptContract,
    ToolCallContract,
    execute_tool,
    generate as llm_generate_record,
    llm_status,
)
from app.emr import (
    ExpandRequest,
    ExciteRequest,
    ReinforceRequest,
    clear_stm,
    emr_status,
    excite,
    expand_stm_entry,
    get_stm,
    reinforce_ids,
    resolve_record,
    stm_context_block,
)
from app.models import (
    BoardUpdate,
    MemoryBoard,
    MemoryCreate,
    MemoryUpdate,
)
from app.store import get_store

app = FastAPI(
    title="Jarvis Continuity Ledger",
    description=(
        "Jarvis Memoryboard — LTM access/API over Continuity Ledger SoT. "
        "Stack: AMUL (LTM substrate) → Memoryboard → EMR → STM → LLM. "
        "EMR decides active cognition; does not invent persistent LTM."
    ),
    version="0.2.0",
)

cors_origins = (os.getenv("JARVIS_CORS_ORIGINS") or "*").split(",")
app.add_middleware(
    CORSMiddleware,
    allow_origins=[o.strip() for o in cors_origins],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/")
def index():
    return {
        "service": "jarvis-memoryboard",
        "schema": "continuity-ledger-v1",
        "version": "0.2.0",
        "docs": "/docs",
        "maturity": {
            "continuity": "enforced",
            "replay": "enforced",
            "conflict": "enforced",
            "drift": "partial",
            "emr_stm": "partial",
        },
        "architecture": {
            "AMUL": "LTM substrate (persistence/structure/lineage) — declared/partial",
            "Memoryboard": "LTM access/API — Continuity Ledger SoT (this service)",
            "EMR": "governed activation — POST /api/jarvis/memory/emr/excite | GET /active",
            "STM": "budgeted working set — GET /api/jarvis/memory/stm (+ context/expand)",
            "LLM": "reasoning surface (consumer of STM)",
        },
        "endpoints": {
            "board": {
                "GET": "/api/jarvis/memory/board",
                "POST": "/api/jarvis/memory/board",
                "PATCH": "/api/jarvis/memory/board",
            },
            "memories": {
                "list": "GET /api/jarvis/memory",
                "retrieve": "GET /api/jarvis/memory/retrieve",
                "conflicts": "GET /api/jarvis/memory/conflicts",
                "create": "POST /api/jarvis/memory",
                "read": "GET /api/jarvis/memory/{id}",
                "update": "PATCH /api/jarvis/memory/{id}",
                "delete": "DELETE /api/jarvis/memory/{id}",
            },
            "emr_stm": {
                "active": "GET /api/jarvis/memory/active",
                "excite": "POST /api/jarvis/memory/emr/excite",
                "reinforce": "POST /api/jarvis/memory/emr/reinforce",
                "status": "GET /api/jarvis/memory/emr/status",
                "stm": "GET /api/jarvis/memory/stm",
                "stm_context": "GET /api/jarvis/memory/stm/context",
                "expand": "POST /api/jarvis/memory/stm/expand",
                "resolve": "GET /api/jarvis/memory/{id}/resolve",
                "clear": "DELETE /api/jarvis/memory/stm",
            },
            "amul": {
                "anchor": "POST /api/jarvis/memory/amul/anchor",
                "artifact": "GET /api/jarvis/memory/amul/artifacts/{id}",
                "lineage": "GET /api/jarvis/memory/amul/lineage/{memory_id}",
                "field_status": "GET /api/jarvis/memory/amul/field/status",
                "verify": "POST /api/jarvis/memory/amul/field/verify",
                "gc_compact": "POST /api/jarvis/memory/amul/gc/compact",
                "gc_status": "GET /api/jarvis/memory/amul/gc/status",
                "gc_verify": "POST /api/jarvis/memory/amul/gc/verify",
            },
            "rag": {
                "store_documents": "POST /api/jarvis/rag/documents",
                "query": "POST /api/jarvis/rag/query",
                "replay_log": "GET /api/jarvis/rag/log",
                "status": "GET /api/jarvis/rag/status",
            },
            "llm": {
                "generate": "POST /api/jarvis/llm/generate",
                "classify": "POST /api/jarvis/llm/classify?query=",
                "tools": "GET /api/jarvis/llm/tools",
                "tools_call": "POST /api/jarvis/llm/tools/call",
                "status": "GET /api/jarvis/llm/status",
            },
        },
    }


@app.get("/health")
def health():
    store = get_store()
    board = store.get_board()
    return {
        "status": "ok",
        "service": "jarvis-memoryboard",
        "schema": "continuity-ledger-v1",
        "memory_count": len(store.list_memories(limit=9999)),
        "board_id": board.board_id,
        "memory_write_enabled": True,
    }


# --- Board endpoints ---


@app.get("/api/jarvis/memory/board")
def get_board():
    store = get_store()
    board = store.get_board()
    return {"memory_board": board.model_dump()}


@app.post("/api/jarvis/memory/board")
def set_board(body: MemoryBoard):
    store = get_store()
    board = store.set_board(body)
    return {"memory_board": board.model_dump()}


@app.patch("/api/jarvis/memory/board")
def patch_board(body: BoardUpdate):
    store = get_store()
    updates = {k: v for k, v in body.model_dump().items() if v is not None}
    board = store.patch_board(updates)
    return {"memory_board": board.model_dump()}


# --- Continuity Ledger (LTM) endpoints ---


@app.get("/api/jarvis/memory/retrieve")
def retrieve_memories(
    truth_scope: str | None = Query(default=None),
    query: str | None = Query(default=None),
    limit: int = Query(default=50, ge=1, le=200),
    type: str | None = Query(default=None, alias="type"),
    status: str | None = Query(default=None),
    session_id: str | None = Query(default=None),
    subject: str | None = Query(default=None),
):
    """Replay-grade retrieval: memories + why/where/when/session + conflicts."""
    store = get_store()
    memories, selections, conflicts = store.retrieve(
        truth_scope=truth_scope,
        query=query,
        limit=limit,
        memory_type=type,
        status=status,
        session_id=session_id,
        subject=subject,
    )
    return {
        "memories": [m.model_dump() for m in memories],
        "selections": [s.model_dump() for s in selections],
        "conflicts": [c.model_dump() for c in conflicts],
    }


@app.get("/api/jarvis/memory/conflicts")
def list_conflicts(subject: str | None = Query(default=None)):
    store = get_store()
    conflicts = store.conflicts(subject=subject)
    return {"conflicts": [c.model_dump() for c in conflicts]}


@app.get("/api/jarvis/memory")
def list_memories(
    truth_scope: str | None = Query(default=None),
    query: str | None = Query(default=None),
    limit: int = Query(default=50, ge=1, le=200),
    type: str | None = Query(default=None, alias="type"),
    status: str | None = Query(default=None),
    session_id: str | None = Query(default=None),
    subject: str | None = Query(default=None),
    with_provenance: bool = Query(default=True),
):
    """List memories. By default includes selection provenance (Replay Test)."""
    store = get_store()
    if with_provenance:
        memories, selections, conflicts = store.retrieve(
            truth_scope=truth_scope,
            query=query,
            limit=limit,
            memory_type=type,
            status=status,
            session_id=session_id,
            subject=subject,
        )
        return {
            "memories": [m.model_dump() for m in memories],
            "selections": [s.model_dump() for s in selections],
            "conflicts": [c.model_dump() for c in conflicts],
        }
    memories = store.list_memories(
        truth_scope=truth_scope,
        query=query,
        limit=limit,
        memory_type=type,
        status=status,
        session_id=session_id,
        subject=subject,
    )
    return {"memories": [m.model_dump() for m in memories]}


@app.post("/api/jarvis/memory")
def create_memory(body: MemoryCreate):
    store = get_store()
    try:
        rec = store.create_memory(body)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return {"memory": rec.model_dump()}


# --- EMR / STM (LTM stays the store; STM is an activated view) ---


@app.get("/api/jarvis/memory/emr/status")
def get_emr_status():
    return emr_status()


@app.post("/api/jarvis/memory/emr/excite")
def emr_excite(body: ExciteRequest):
    """Governed recall: score LTM → bundle → promote/evict STM under budget."""
    store = get_store()
    candidates = store.list_memories(
        truth_scope=body.truth_scope,
        limit=body.candidate_limit,
    )
    try:
        result = excite(candidates, body)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return result.model_dump()


@app.post("/api/jarvis/memory/emr/reinforce")
def emr_reinforce(body: ReinforceRequest):
    """Bounded reinforcement of retrievability (Q+, D−).

    Constitutional guard: mutates only the EMR dynamics overlay. LTM fields
    carrying truth/authority (status, confidence, content, content_sha256)
    are never written by this endpoint.
    """
    store = get_store()
    known: set[str] = set()
    for mid in body.memory_ids:
        if store.get_memory(mid) is not None:
            known.add(mid)
    reinforced, unknown = reinforce_ids(known, body.memory_ids)
    return {
        "reinforced": [r.model_dump() for r in reinforced],
        "unknown_ids": unknown,
        "ltm_mutations": 0,
        "rule": (
            "Reinforcement strengthens retrievability (salience up, decay damped) "
            "within hard caps; truth/authority (status, confidence, content) remain "
            "independently certified by the Continuity Ledger and are never mutated."
        ),
    }


@app.get("/api/jarvis/memory/active")
def active_stm(
    query: str = Query(..., min_length=1, max_length=2000),
    session_key: str = Query(default="default"),
    token_budget: int = Query(default=512, ge=32, le=8000),
    theta_promote: float = Query(default=0.12, ge=0.0, le=1.0),
    theta_evict: float = Query(default=0.04, ge=0.0, le=1.0),
    truth_scope: str = Query(default="live"),
    candidate_limit: int = Query(default=200, ge=1, le=2000),
    trajectory: list[str] | None = Query(default=None),
):
    """Contract surface: EMR excite → budgeted STM view in one GET."""
    store = get_store()
    body = ExciteRequest(
        query=query,
        trajectory=trajectory or [],
        token_budget=token_budget,
        theta_promote=theta_promote,
        theta_evict=theta_evict,
        truth_scope=truth_scope,
        candidate_limit=candidate_limit,
        session_key=session_key,
    )
    candidates = store.list_memories(
        truth_scope=body.truth_scope,
        limit=body.candidate_limit,
    )
    result = excite(candidates, body)
    return result.model_dump()


@app.get("/api/jarvis/memory/stm")
def read_stm(session_key: str = Query(default="default")):
    entries = get_stm(session_key)
    return {
        "session_key": session_key,
        "stm": [e.model_dump() for e in entries],
        "budget_used": sum(e.token_cost for e in entries),
        "count": len(entries),
    }


@app.get("/api/jarvis/memory/stm/context")
def read_stm_context(session_key: str = Query(default="default")):
    """LLM-ready STM block (summaries + LTM provenance ids)."""
    return {
        "session_key": session_key,
        "context": stm_context_block(session_key),
    }


@app.post("/api/jarvis/memory/stm/expand")
def stm_expand(body: ExpandRequest):
    """Raise resolution summary→detail→evidence; payload still points at LTM."""
    store = get_store()
    rec = store.get_memory(body.memory_id)
    if not rec:
        raise HTTPException(status_code=404, detail="LTM memory not found")
    if body.memory_id not in {e.memory_id for e in get_stm(body.session_key)}:
        raise HTTPException(
            status_code=400,
            detail="Memory not in STM; POST /emr/excite first to promote",
        )
    updated = expand_stm_entry({body.memory_id: rec}, body)
    if updated is None:
        raise HTTPException(status_code=404, detail="STM entry not found")
    return {"stm_entry": updated.model_dump()}


@app.delete("/api/jarvis/memory/stm")
def stm_clear(session_key: str | None = Query(default=None)):
    clear_stm(session_key)
    return {"status": "cleared", "session_key": session_key}


@app.get("/api/jarvis/memory/{memory_id}/resolve")
def resolve_memory(
    memory_id: str,
    resolution: str = Query(default="summary", pattern="^(summary|detail|evidence)$"),
):
    """Expand one LTM particle to summary|detail|evidence with provenance."""
    store = get_store()
    rec = store.get_memory(memory_id)
    if not rec:
        raise HTTPException(status_code=404, detail="LTM memory not found")
    return resolve_record(rec, resolution)  # type: ignore[arg-type]


@app.get("/api/jarvis/memory/{memory_id}")
def get_memory(memory_id: str):
    store = get_store()
    rec = store.get_memory(memory_id)
    if not rec:
        raise HTTPException(status_code=404, detail="Memory not found")
    from app.continuity import to_selection

    sel = to_selection(rec)
    return {"memory": rec.model_dump(), "selection": sel.model_dump()}


@app.patch("/api/jarvis/memory/{memory_id}")
def update_memory(memory_id: str, body: MemoryUpdate):
    store = get_store()
    try:
        rec = store.update_memory(memory_id, body)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    if not rec:
        raise HTTPException(status_code=404, detail="Memory not found")
    return {"memory": rec.model_dump()}


@app.delete("/api/jarvis/memory/{memory_id}")
def delete_memory(memory_id: str):
    store = get_store()
    ok = store.delete_memory(memory_id)
    if not ok:
        raise HTTPException(status_code=404, detail="Memory not found")
    return {"status": "deleted", "id": memory_id}


# --- AMUL Architect (LTM substrate: append-only field, lineage, drift) ---


class AnchorBody(BaseModel):
    memory_id: str | None = None
    anchor_all: bool = False
    actor: str = Field(default="amul", max_length=64)


@app.post("/api/jarvis/memory/amul/anchor")
def amul_anchor(body: AnchorBody):
    """Anchor ledger truth into immutable AMUL artifacts (idempotent)."""
    store = get_store()
    field = get_field()
    if body.anchor_all:
        records = store.list_memories(limit=9999)
        reports = [anchor_memory(r, field, body.actor) for r in records]
        return {
            "anchored": len(reports),
            "created_artifacts": sum(len(r.created) for r in reports),
            "unchanged_resolutions": sum(len(r.unchanged) for r in reports),
            "field_count": field.count,
        }
    if not body.memory_id:
        raise HTTPException(status_code=400, detail="memory_id or anchor_all required")
    rec = store.get_memory(body.memory_id)
    if not rec:
        raise HTTPException(status_code=404, detail="LTM memory not found")
    report = anchor_memory(rec, field, body.actor)
    return report.model_dump()


@app.get("/api/jarvis/memory/amul/artifacts/{artifact_id}")
def amul_artifact(artifact_id: str):
    art = get_field().get(artifact_id)
    if not art:
        raise HTTPException(status_code=404, detail="Artifact not found")
    return {"artifact": art.model_dump()}


@app.get("/api/jarvis/memory/amul/lineage/{memory_id}")
def amul_lineage(memory_id: str):
    lineage = get_field().lineage(memory_id)
    if lineage["depth"] == 0:
        raise HTTPException(status_code=404, detail="No artifacts anchored for this memory")
    return lineage


@app.get("/api/jarvis/memory/amul/field/status")
def amul_field_status():
    field = get_field()
    by_res: dict[str, int] = {}
    for a in field.all():
        by_res[a.resolution] = by_res.get(a.resolution, 0) + 1
    return {
        "schema": "amul-artifact-v1",
        "path": field.path,
        "artifact_count": field.count,
        "by_resolution": by_res,
        "append_only": True,
        "role": "AMUL LTM substrate beneath the Continuity Ledger (ledger = truth SoT)",
        "maturity": {
            "persistence": "enforced",
            "resolution_artifacts": "enforced",
            "lineage_provenance": "enforced",
            "verify_drift": "enforced",
            "gc_checkpoint_compaction": "enforced",
            "scale_gc_index": "declared",
        },
    }


@app.post("/api/jarvis/memory/amul/field/verify")
def amul_field_verify():
    """GC-aware integrity check + ledger drift detection since last anchors."""
    store = get_store()
    report = verify_field(get_field(), store.list_memories(limit=9999))
    return report.model_dump()


# --- AMUL-GC (Verifiable Checkpoint Compactor) ---


class GCCompactBody(BaseModel):
    actor: str = "amul-gc"


@app.post("/api/jarvis/memory/amul/gc/compact")
def amul_gc_compact(body: GCCompactBody | None = None):
    """Seal the uncheckpointed field prefix into a sha-linked checkpoint."""
    actor = body.actor if body else "amul-gc"
    store = get_store()
    try:
        report = amul_gc.compact(
            get_field(), store.list_memories(limit=9999), actor=actor
        )
    except amul_gc.GCViolation as exc:
        raise HTTPException(status_code=409, detail=str(exc))
    return report.model_dump()


@app.get("/api/jarvis/memory/amul/gc/status")
def amul_gc_status():
    """Checkpoint chain coverage, cold-tier census, retention law table."""
    return amul_gc.gc_status(get_field())


@app.post("/api/jarvis/memory/amul/gc/verify")
def amul_gc_verify():
    """Chain authentication + tail-only payload rehash (O(checkpoints+tail))."""
    return amul_gc.verify_gc(get_field()).model_dump()


# --- AMUL RAG (Adaptive/Modular/Universal/Logical retrieval) ---


class RagDocsBody(BaseModel):
    documents: list[dict[str, Any]] = Field(..., min_length=1, max_length=200)


@app.post("/api/jarvis/rag/documents")
def rag_store_documents(body: RagDocsBody):
    """StoreDocuments contract: normalize + append to the doc log."""
    index = get_index()
    stored = []
    for raw in body.documents:
        existing = index.docs.get(str(raw.get("id") or ""))
        doc = normalize_document(raw, existing_version=existing.version if existing else 0)
        index.add(doc, persist=True)
        stored.append(doc.model_dump())
    return {"stored": len(stored), "documents": stored}


class RagQueryBody(BaseModel):
    query: str = Field(..., min_length=1, max_length=2000)


@app.post("/api/jarvis/rag/query")
def rag_query(body: RagQueryBody):
    """QueryRAG contract: answer + evidence under the Logical-layer gate.

    Corpus = ingested documents + Continuity Ledger memories (Universal schema).
    """
    store = get_store()
    from app.amul_rag import ledger_docs

    corpus_extra = ledger_docs(store)
    record = answer_query(body.query, get_index(), extra_docs=corpus_extra)
    return record.model_dump()


@app.get("/api/jarvis/rag/log")
def rag_replay_log(limit: int = Query(default=20, ge=1, le=500)):
    """Replay tail: intent, config, docs returned, answer per query."""
    import json as _json
    from pathlib import Path as _Path

    from app.amul_rag import RAG_LOG_PATH

    p = _Path(RAG_LOG_PATH)
    if not p.exists():
        return {"records": []}
    lines = [ln for ln in p.read_text(encoding="utf-8").splitlines() if ln.strip()]
    out = []
    for ln in lines[-limit:]:
        try:
            out.append(_json.loads(ln))
        except Exception:
            continue
    return {"records": out}


@app.get("/api/jarvis/rag/status")
def rag_layer_status():
    return rag_status()


# --- AMUL LLM (Adaptive/Modular/Universal/Logical inference governance) ---


@app.post("/api/jarvis/llm/generate")
def llm_generate_route(body: PromptContract):
    """Universal prompt contract -> governed generation + replay record."""
    try:
        record = llm_generate_record(body)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return record


@app.post("/api/jarvis/llm/classify")
def llm_classify(query: str = Query(..., min_length=1, max_length=4000)):
    """Adaptive layer probe: intent + mode + generation_config."""
    from app.amul_llm import routing_contract

    return routing_contract(query)


@app.get("/api/jarvis/llm/tools")
def llm_tools():
    from app.amul_llm import TOOL_REGISTRY

    return {
        "tools": [
            {"name": n, "description": s["description"], "schema": s["schema"]}
            for n, s in sorted(TOOL_REGISTRY.items())
        ]
    }


@app.post("/api/jarvis/llm/tools/call")
def llm_tools_call(body: ToolCallContract):
    """Tool module: schema-validated execution in the registry sandbox."""
    store = get_store()
    return execute_tool(body.name, body.arguments, ctx={"store": store})


@app.get("/api/jarvis/llm/status")
def llm_layer_status():
    return llm_status()
