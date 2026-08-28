from __future__ import annotations

import json
import os
import secrets
from pathlib import Path

from fastapi import Depends, FastAPI, Header, HTTPException, Query, Request
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from app.amul import (
    anchor_memory,
    get_field,
    verify_field,
)
import app.amul_rag as amul_rag
from app.amul_rag import (
    AuthorityClass,
    DocumentStatus,
    answer_query,
    get_index,
    ledger_docs,
    maintain_replay_log,
    normalize_document,
)
from app.emr import (
    CorrectRequest,
    ExpandRequest,
    ExciteRequest,
    ReinforceRequest,
    clear_stm,
    correct_memory_ids,
    emr_status,
    excite,
    expand_stm_entry,
    get_stm,
    reinforce_ids,
    resolve_record,
    stm_context_block,
)
from app.emr_tool import EmrRecallRequest, emr_recall, tool_catalog
from app.models import (
    BoardUpdate,
    MemoryBoard,
    MemoryCreate,
    MemoryUpdate,
)
from app.auth import (
    deployment_label,
    emr_recall_api_key,
    ledger_read_protected,
    ledger_read_protection_middleware,
    memory_write_enabled,
    require_emr_recall_api_key,
    require_memory_write,
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


@app.middleware("http")
async def _ledger_read_auth(request: Request, call_next):
    return await ledger_read_protection_middleware(request, call_next)


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
                "correct": "POST /api/jarvis/memory/emr/correct",
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
            },
            "rag": {
                "documents": "POST /api/jarvis/rag/documents",
                "query": "POST /api/jarvis/rag/query",
                "log": "GET /api/jarvis/rag/log",
                "status": "GET /api/jarvis/rag/status",
                "maintenance": "POST /api/jarvis/rag/maintenance",
            },
            "tools": {
                "catalog": "GET /api/jarvis/tools",
                "emr_recall": "POST /api/jarvis/tools/emr_recall",
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
        "memory_write_enabled": memory_write_enabled(),
        "deployment": deployment_label(),
        "auth": {
            "emr_recall_key_required": emr_recall_api_key() is not None,
            "ledger_read_protected": ledger_read_protected(),
        },
        "store_path": os.getenv("JARVIS_STORE_PATH", "data/jarvis-store.json"),
    }


# --- Board endpoints ---


@app.get("/api/jarvis/memory/board")
def get_board():
    store = get_store()
    board = store.get_board()
    return {"memory_board": board.model_dump()}


@app.post("/api/jarvis/memory/board")
def set_board(body: MemoryBoard, _: None = Depends(require_memory_write)):
    store = get_store()
    board = store.set_board(body)
    return {"memory_board": board.model_dump()}


@app.patch("/api/jarvis/memory/board")
def patch_board(body: BoardUpdate, _: None = Depends(require_memory_write)):
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
def create_memory(body: MemoryCreate, _: None = Depends(require_memory_write)):
    store = get_store()
    try:
        rec = store.create_memory(body)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return {"memory": rec.model_dump()}


# --- EMR / STM (LTM stays the store; STM is an activated view) ---


@app.post("/api/jarvis/tools/emr_recall", dependencies=[Depends(require_emr_recall_api_key)])
def tool_emr_recall(body: EmrRecallRequest):
    """Read-only EMR Recall Protocol — governed bundle for agent tool calling."""
    store = get_store()
    try:
        result = emr_recall(store, body)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return result.model_dump()


@app.get("/api/jarvis/tools")
def list_tools():
    """Tool catalog (OpenAI-compatible function schemas, read-only v1)."""
    return tool_catalog()


@app.get("/api/jarvis/memory/emr/status")
def get_emr_status():
    return emr_status()


@app.post("/api/jarvis/memory/emr/excite", dependencies=[Depends(require_memory_write)])
def emr_excite(body: ExciteRequest):
    """Governed recall: score LTM → bundle → promote/evict STM under budget."""
    store = get_store()
    candidates = store.list_memories(
        truth_scope=body.truth_scope,
        # Filters must see the whole local ledger cohort before candidate_limit
        # is applied; otherwise older exact metadata matches can be hidden by
        # the store's recency ordering and graph traversal becomes incomplete.
        limit=9999,
    )
    try:
        result = excite(candidates, body)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return result.model_dump()


@app.post("/api/jarvis/memory/emr/reinforce", dependencies=[Depends(require_memory_write)])
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
    reinforced, unknown, replayed = reinforce_ids(
        known,
        body.memory_ids,
        outcome=body.outcome,
    )
    return {
        "reinforced": [r.model_dump() for r in reinforced],
        "unknown_ids": unknown,
        "replayed_memory_ids": replayed,
        "ltm_mutations": 0,
        "rule": (
            "Reinforcement requires an explicit positive outcome signal and "
            "strengthens retrievability within separate and combined hard caps; "
            "truth/authority remain independently certified by the Continuity "
            "Ledger and are never mutated."
        ),
    }


@app.post("/api/jarvis/memory/emr/correct", dependencies=[Depends(require_memory_write)])
def emr_correct(body: CorrectRequest):
    """Operator correction: immediately reset reinforcement overlay.

    Clears salience and decay damping on corrected memories so wrong recall
    cannot slowly outcompete a replacement. Never mutates LTM truth fields.
    """
    store = get_store()
    known: set[str] = set()
    for mid in body.memory_ids:
        if store.get_memory(mid) is not None:
            known.add(mid)
    corrected, unknown, replayed = correct_memory_ids(
        known,
        body.memory_ids,
        correction=body.correction,
    )
    return {
        "corrected": [r.model_dump() for r in corrected],
        "unknown_ids": unknown,
        "replayed_correction_ids": replayed,
        "ltm_mutations": 0,
        "rule": (
            "Operator correction resets reinforcement overlay immediately; "
            "LTM truth/authority remain independently certified."
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
        limit=9999,
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


@app.post("/api/jarvis/memory/stm/expand", dependencies=[Depends(require_memory_write)])
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


@app.delete("/api/jarvis/memory/stm", dependencies=[Depends(require_memory_write)])
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


@app.patch("/api/jarvis/memory/{memory_id}", dependencies=[Depends(require_memory_write)])
def update_memory(memory_id: str, body: MemoryUpdate):
    store = get_store()
    try:
        rec = store.update_memory(memory_id, body)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    if not rec:
        raise HTTPException(status_code=404, detail="Memory not found")
    return {"memory": rec.model_dump()}


@app.delete("/api/jarvis/memory/{memory_id}", dependencies=[Depends(require_memory_write)])
def delete_memory(memory_id: str):
    store = get_store()
    ok = store.delete_memory(memory_id)
    if not ok:
        raise HTTPException(status_code=404, detail="Memory not found")
    return {"status": "deleted", "id": memory_id}


# --- AMUL RAG (adaptive retrieval + evidence gate + replay) ---


class RagDocumentInput(BaseModel):
    id: str | None = Field(default=None, min_length=1, max_length=256)
    title: str = Field(default="", max_length=512)
    body: str = Field(..., min_length=1, max_length=200_000)
    source: str = Field(default="unknown", min_length=1, max_length=128)
    tags: list[str] = Field(default_factory=list, max_length=64)
    authority_class: AuthorityClass = "untrusted"
    status: DocumentStatus = "draft"
    subject: str | None = Field(default=None, max_length=256)
    supersedes: str | None = Field(default=None, max_length=256)
    conflict_ids: list[str] = Field(default_factory=list, max_length=64)


class RagDocumentsBody(BaseModel):
    documents: list[RagDocumentInput] = Field(..., min_length=1, max_length=256)


class RagQueryBody(BaseModel):
    query: str = Field(..., min_length=1, max_length=4000)


class RagMaintenanceBody(BaseModel):
    apply: bool = False


def require_rag_api_key(x_jarvis_rag_key: str | None = Header(default=None)) -> None:
    """Protect RAG content, queries, and replay data with a local secret file."""
    key_path = Path(amul_rag.RAG_API_KEY_FILE) if amul_rag.RAG_API_KEY_FILE else None
    try:
        expected = key_path.read_text(encoding="utf-8").strip() if key_path else ""
    except OSError as exc:
        raise HTTPException(status_code=503, detail="RAG access key is unavailable") from exc
    if not expected:
        raise HTTPException(status_code=503, detail="RAG access control is not configured")
    if not x_jarvis_rag_key or not secrets.compare_digest(x_jarvis_rag_key, expected):
        raise HTTPException(status_code=401, detail="Invalid RAG access key")


@app.post("/api/jarvis/rag/documents", dependencies=[Depends(require_rag_api_key)])
def rag_documents(body: RagDocumentsBody):
    index = get_index()
    documents = []
    for item in body.documents:
        raw = item.model_dump(exclude_none=True)
        requested_id = str(raw.get("id") or "")
        existing = index.docs.get(requested_id) if requested_id else None
        document = normalize_document(
            raw,
            existing_version=existing.version if existing else 0,
        )
        try:
            index.add(document, persist=True)
        except OSError as exc:
            raise HTTPException(status_code=503, detail=str(exc)) from exc
        documents.append(document.model_dump())
    return {"documents": documents, "count": len(documents)}


@app.post("/api/jarvis/rag/query", dependencies=[Depends(require_rag_api_key)])
def rag_query(body: RagQueryBody):
    try:
        record = answer_query(
            body.query,
            get_index(),
            extra_docs=ledger_docs(get_store()),
        )
    except OSError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    return record.model_dump()


@app.get("/api/jarvis/rag/log", dependencies=[Depends(require_rag_api_key)])
def rag_log(limit: int = Query(default=50, ge=1, le=1000)):
    records: list[dict] = []
    path = Path(amul_rag.RAG_LOG_PATH)
    if path.exists():
        for line in path.read_text(encoding="utf-8").splitlines()[-limit:]:
            try:
                records.append(json.loads(line))
            except (json.JSONDecodeError, TypeError):
                continue
    return {"records": records, "count": len(records)}


@app.get("/api/jarvis/rag/status")
def get_rag_status():
    return amul_rag.rag_status()


@app.post("/api/jarvis/rag/maintenance", dependencies=[Depends(require_rag_api_key)])
def rag_maintenance(body: RagMaintenanceBody):
    return maintain_replay_log(apply=body.apply)


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
            "scale_gc_index": "declared",
        },
    }


@app.post("/api/jarvis/memory/amul/field/verify")
def amul_field_verify():
    """Rehash the whole field + detect ledger drift since last anchors."""
    store = get_store()
    report = verify_field(get_field(), store.list_memories(limit=9999))
    return report.model_dump()
