"""EMR write gateway — governed ``emr_remember`` / ``emr_upsert`` for MCP + REST tools.

Constitutional rules (write-side contract, status **partial** until tests pass):
- Agent → EMR → Continuity Ledger (never agent → ledger via this tool surface)
- Draft-only commits (never auto-verified)
- Full provenance on every accepted write
- Supersession preserves lineage (create + archive; no destructive overwrite)
- Abstention on unsupported / ambiguous / contradictory / authority-invalid writes
- Conflict membranes: no silent co-admission under the same subject
- Clause V: reject transcript dumps / oversized content
- STM / LLM cannot write ledger directly — only via this gateway
"""

from __future__ import annotations

import hashlib
import os
import re
from typing import Any, Literal

from pydantic import BaseModel, Field, field_validator, model_validator

from app.auth import mcp_write_enabled
from app.continuity import content_sha256, detect_conflicts, normalize_content
from app.models import EvidenceLink, MemoryCreate, MemoryRecord, MemoryType, MemoryUpdate
from app.store import JarvisStore

PROTOCOL = "emr-write-v1"

# MCP path always forces draft — verification is operator/off-band.
MCP_WRITE_STATUS = "draft"

# Server-side provenance when model-supplied agent must not elevate trust.
DEFAULT_FIXED_SOURCE_AGENT = "user-requested-mcp"

_SOURCE_AGENT_RE = re.compile(r"^[A-Za-z0-9._:@+/-]{1,128}$")
_TRANSCRIPT_MARKERS = re.compile(
    r"^(?:user|assistant|system|human|chatgpt)\s*:\s|"
    r"\b(transcript|conversation dump|chat log)\b|"
    r"(?:\n.*){25,}",
    re.IGNORECASE | re.MULTILINE,
)


RefuseReason = Literal[
    "mcp-write-disabled",
    "user-intent-required",
    "missing-required-fields",
    "unsupported-content",
    "clause-v-transcript-dump",
    "authority-invalid",
    "conflict-membrane",
    "ambiguous-write",
    "target-not-found",
    "supersedes-not-found",
]


class EmrRememberRequest(BaseModel):
    """Create a governed durable memory via EMR."""

    content: str = Field(..., min_length=1, max_length=2000)
    source_agent: str = Field(default="", max_length=128)
    session_id: str = Field(..., min_length=1, max_length=128)
    type: MemoryType
    subject: str | None = Field(default=None, max_length=256)
    tags: list[str] = Field(default_factory=list, max_length=32)
    evidence: list[EvidenceLink] = Field(default_factory=list, max_length=32)
    confidence: float = Field(default=0.5, ge=0.0, le=1.0)
    # Explicit user intent — required True for MCP/ChatGPT path
    user_requested: bool = False
    user_statement: str | None = Field(default=None, max_length=2000)
    # Rejected if present and not draft
    status: str | None = Field(default=None, max_length=32)

    @field_validator("confidence")
    @classmethod
    def _round_confidence(cls, v: float) -> float:
        return round(float(v), 4)

    @model_validator(mode="after")
    def _strip_subject(self) -> "EmrRememberRequest":
        if self.subject is not None:
            self.subject = self.subject.strip() or None
        return self


class EmrUpsertRequest(BaseModel):
    """Supersede an existing memory — creates a new record with lineage (no destructive overwrite)."""

    id: str = Field(..., min_length=1, max_length=64)
    content: str = Field(..., min_length=1, max_length=2000)
    supersedes: str | None = Field(default=None, max_length=64)
    source_agent: str = Field(default="", max_length=128)
    session_id: str | None = Field(default=None, max_length=128)
    type: MemoryType | None = None
    subject: str | None = Field(default=None, max_length=256)
    tags: list[str] | None = Field(default=None, max_length=32)
    evidence: list[EvidenceLink] | None = None
    confidence: float | None = Field(default=None, ge=0.0, le=1.0)
    user_requested: bool = False
    user_statement: str | None = Field(default=None, max_length=2000)
    status: str | None = Field(default=None, max_length=32)

    @model_validator(mode="after")
    def _strip_subject(self) -> "EmrUpsertRequest":
        if self.subject is not None:
            self.subject = self.subject.strip() or None
        return self


class EmrWriteProvenance(BaseModel):
    id: str
    created_at: str
    updated_at: str
    content_sha256: str
    source_agent: str
    session_id: str
    type: str
    status: str
    subject: str | None = None
    tags: list[str] = Field(default_factory=list)
    evidence: list[dict[str, Any]] = Field(default_factory=list)
    supersedes: str | None = None
    superseded_target_archived: str | None = None


class EmrWriteResponse(BaseModel):
    protocol: str = PROTOCOL
    accepted: bool
    refused: bool = False
    refuse_reason: str | None = None
    refuse_detail: str | None = None
    memory: dict[str, Any] | None = None
    provenance: EmrWriteProvenance | None = None
    conflicts: list[dict[str, Any]] = Field(default_factory=list)


def _looks_like_transcript(content: str) -> bool:
    text = content or ""
    if len(text) > 1800 and text.count("\n") >= 12:
        return True
    if _TRANSCRIPT_MARKERS.search(text):
        return True
    # High turn-taking density
    speaker_hits = len(re.findall(r"(?im)^(?:user|assistant|system)\s*:", text))
    return speaker_hits >= 3


def _resolve_source_agent(requested: str) -> str:
    """Fixed/validated source_agent — never trust model for trust elevation."""
    fixed = (os.getenv("JARVIS_MCP_FIXED_SOURCE_AGENT") or "").strip()
    if fixed:
        return fixed[:128]
    cleaned = (requested or "").strip()
    if not cleaned or not _SOURCE_AGENT_RE.match(cleaned):
        return DEFAULT_FIXED_SOURCE_AGENT
    # Block elevation-looking labels from becoming trust roots
    lowered = cleaned.lower()
    if lowered in {"operator", "governance", "verified", "admin", "root", "stm", "llm"}:
        return DEFAULT_FIXED_SOURCE_AGENT
    if cleaned.startswith("mcp:") or cleaned == DEFAULT_FIXED_SOURCE_AGENT:
        return cleaned
    return f"mcp:{cleaned}"[:128]


def _evidence_with_user_statement(
    evidence: list[EvidenceLink],
    user_statement: str | None,
) -> list[EvidenceLink]:
    out = list(evidence)
    if user_statement and user_statement.strip():
        digest = hashlib.sha256(user_statement.strip().encode("utf-8")).hexdigest()[:24]
        out.append(
            EvidenceLink(
                kind="user-request",
                ref=f"user-statement-sha256:{digest}",
                note=user_statement.strip()[:500],
            )
        )
    return out


def _provenance_from_record(
    rec: MemoryRecord,
    *,
    superseded_target_archived: str | None = None,
) -> EmrWriteProvenance:
    return EmrWriteProvenance(
        id=rec.id,
        created_at=rec.created_at,
        updated_at=rec.updated_at,
        content_sha256=rec.content_sha256,
        source_agent=rec.source_agent,
        session_id=rec.session_id,
        type=rec.type,
        status=rec.status,
        subject=rec.subject,
        tags=list(rec.tags),
        evidence=[e.model_dump() if hasattr(e, "model_dump") else e for e in rec.evidence],
        supersedes=rec.supersedes,
        superseded_target_archived=superseded_target_archived,
    )


def _refuse(
    reason: RefuseReason,
    detail: str,
    *,
    conflicts: list[dict[str, Any]] | None = None,
) -> EmrWriteResponse:
    return EmrWriteResponse(
        accepted=False,
        refused=True,
        refuse_reason=reason,
        refuse_detail=detail,
        conflicts=conflicts or [],
    )


def _gate_common(
    *,
    user_requested: bool,
    content: str,
    status: str | None,
    require_write_flag: bool,
) -> EmrWriteResponse | None:
    if require_write_flag and not mcp_write_enabled():
        return _refuse(
            "mcp-write-disabled",
            "JARVIS_MCP_WRITE_ENABLED is not true — MCP/tool writes are recall-only on this deployment",
        )
    if not user_requested:
        return _refuse(
            "user-intent-required",
            "user_requested must be true (explicit user intent). Hosts should also requireApproval.",
        )
    if status is not None and status != MCP_WRITE_STATUS:
        return _refuse(
            "authority-invalid",
            f"MCP writes are draft-only; refusing status={status!r}",
        )
    normalized = normalize_content(content)
    if len(normalized) < 8:
        return _refuse("unsupported-content", "Content too short after normalization")
    if _looks_like_transcript(content):
        return _refuse(
            "clause-v-transcript-dump",
            "Content looks like a chat transcript dump (Clause V) — store decisions/evidence only",
        )
    return None


def _subject_conflict_block(
    store: JarvisStore,
    *,
    subject: str | None,
    new_hash: str,
    superseding_ids: set[str],
) -> EmrWriteResponse | None:
    """Refuse silent co-admission of contradictory claims under the same subject."""
    if not subject:
        return None
    conflicts = detect_conflicts(store.list_memories(limit=9999, truth_scope="live"), subject=subject)
    open_conflicts = [c for c in conflicts if c.unresolved]
    if not open_conflicts:
        # Also block adding a *new* distinct claim when an open peer already exists
        peers = [
            m
            for m in store.list_memories(limit=9999, truth_scope="live", subject=subject)
            if m.id not in superseding_ids and m.status != "archived"
        ]
        # Exclude peers that are themselves superseded by another live record
        superseded = {
            m.supersedes
            for m in store.list_memories(limit=9999, truth_scope="live")
            if m.supersedes and m.status != "archived"
        }
        active_peers = [m for m in peers if m.id not in superseded]
        distinct = {
            (m.content_sha256 or content_sha256(m.content))
            for m in active_peers
        }
        if active_peers and new_hash not in distinct and len(distinct) >= 1:
            return _refuse(
                "conflict-membrane",
                f"Subject {subject!r} already has active claim(s); supersede via emr_upsert instead of co-admitting",
                conflicts=[
                    {
                        "subject": subject,
                        "memory_ids": [m.id for m in active_peers],
                        "unresolved": True,
                    }
                ],
            )
        return None

    # Unresolved conflict exists — only allow if we supersede all open conflicting ids
    for conflict in open_conflicts:
        open_ids = {m.id for m in conflict.memories}
        if not open_ids.issubset(superseding_ids):
            return _refuse(
                "conflict-membrane",
                f"Unresolved conflict under subject {subject!r}; supersede conflicting ids explicitly",
                conflicts=[
                    {
                        "subject": conflict.subject,
                        "memory_ids": [m.id for m in conflict.memories],
                        "unresolved": True,
                    }
                ],
            )
    return None


def emr_remember(
    store: JarvisStore,
    req: EmrRememberRequest,
    *,
    require_write_flag: bool = True,
) -> EmrWriteResponse:
    """Governed create — draft Continuity Ledger record with provenance."""
    blocked = _gate_common(
        user_requested=req.user_requested,
        content=req.content,
        status=req.status,
        require_write_flag=require_write_flag,
    )
    if blocked:
        return blocked

    new_hash = content_sha256(req.content)
    conflict = _subject_conflict_block(
        store,
        subject=req.subject,
        new_hash=new_hash,
        superseding_ids=set(),
    )
    if conflict:
        return conflict

    # Idempotent: same subject + same hash → return existing live record
    if req.subject:
        for existing in store.list_memories(limit=9999, truth_scope="live", subject=req.subject):
            if (existing.content_sha256 or content_sha256(existing.content)) == new_hash:
                return EmrWriteResponse(
                    accepted=True,
                    memory=existing.model_dump(),
                    provenance=_provenance_from_record(existing),
                )

    source_agent = _resolve_source_agent(req.source_agent)
    evidence = _evidence_with_user_statement(req.evidence, req.user_statement)

    try:
        rec = store.create_memory(
            MemoryCreate(
                content=req.content,
                source_agent=source_agent,
                session_id=req.session_id,
                type=req.type,
                confidence=req.confidence,
                evidence=evidence,
                status=MCP_WRITE_STATUS,
                subject=req.subject,
                tags=list(req.tags),
            )
        )
    except ValueError as exc:
        return _refuse("ambiguous-write", str(exc))

    return EmrWriteResponse(
        accepted=True,
        memory=rec.model_dump(),
        provenance=_provenance_from_record(rec),
    )


def emr_upsert(
    store: JarvisStore,
    req: EmrUpsertRequest,
    *,
    require_write_flag: bool = True,
) -> EmrWriteResponse:
    """Governed supersede — new record + archive target (lineage preserved)."""
    blocked = _gate_common(
        user_requested=req.user_requested,
        content=req.content,
        status=req.status,
        require_write_flag=require_write_flag,
    )
    if blocked:
        return blocked

    target = store.get_memory(req.id)
    if target is None:
        return _refuse("target-not-found", f"Memory id not found: {req.id}")

    if req.supersedes is not None and req.supersedes.strip() and req.supersedes.strip() != req.id:
        return _refuse(
            "ambiguous-write",
            "Provide id as the record being superseded; omit supersedes or set it equal to id",
        )

    new_hash = content_sha256(req.content)
    subject = req.subject if req.subject is not None else target.subject
    conflict = _subject_conflict_block(
        store,
        subject=subject,
        new_hash=new_hash,
        superseding_ids={req.id},
    )
    if conflict:
        return conflict

    source_agent = _resolve_source_agent(req.source_agent or target.source_agent)
    session_id = (req.session_id or target.session_id).strip()
    if not session_id:
        return _refuse("missing-required-fields", "session_id required for lineage")

    mem_type: MemoryType = req.type or target.type
    tags = list(req.tags) if req.tags is not None else list(target.tags)
    base_evidence = list(req.evidence) if req.evidence is not None else list(target.evidence)
    evidence = _evidence_with_user_statement(base_evidence, req.user_statement)
    confidence = req.confidence if req.confidence is not None else target.confidence

    try:
        rec = store.create_memory(
            MemoryCreate(
                content=req.content,
                source_agent=source_agent,
                session_id=session_id,
                type=mem_type,
                confidence=confidence,
                evidence=evidence,
                supersedes=req.id,
                status=MCP_WRITE_STATUS,
                subject=subject,
                tags=tags,
            )
        )
        # Archive prior record — preserves content; no destructive overwrite
        store.update_memory(req.id, MemoryUpdate(status="archived"))
    except ValueError as exc:
        return _refuse("ambiguous-write", str(exc))

    return EmrWriteResponse(
        accepted=True,
        memory=rec.model_dump(),
        provenance=_provenance_from_record(rec, superseded_target_archived=req.id),
    )


# --- OpenAI / MCP schema exports ---

EMR_REMEMBER_TOOL_SCHEMA: dict[str, Any] = {
    "type": "function",
    "function": {
        "name": "emr_remember",
        "description": (
            "Create a governed durable memory record via EMR. "
            "Writes to Continuity Ledger through constitutional gatekeeping. "
            "Requires user_requested=true; always stores as draft."
        ),
        "parameters": {
            "type": "object",
            "properties": {
                "content": {"type": "string", "description": "Memory content"},
                "source_agent": {"type": "string", "description": "Agent writing the memory"},
                "session_id": {"type": "string", "description": "Session identifier"},
                "type": {
                    "type": "string",
                    "description": "MemoryType literal",
                    "enum": [
                        "decision",
                        "fact",
                        "task",
                        "preference",
                        "architecture",
                        "research",
                    ],
                },
                "subject": {"type": "string", "description": "Subject domain"},
                "tags": {"type": "array", "items": {"type": "string"}},
                "user_requested": {
                    "type": "boolean",
                    "description": "Must be true — explicit user intent to store",
                },
                "user_statement": {
                    "type": "string",
                    "description": "Verbatim user wording requesting storage",
                },
            },
            "required": ["content", "session_id", "type", "user_requested"],
        },
    },
}

EMR_UPSERT_TOOL_SCHEMA: dict[str, Any] = {
    "type": "function",
    "function": {
        "name": "emr_upsert",
        "description": (
            "Update or supersede an existing memory record. "
            "EMR enforces lineage, provenance, and conflict membranes "
            "(creates a new draft and archives the prior id — no destructive overwrite)."
        ),
        "parameters": {
            "type": "object",
            "properties": {
                "id": {"type": "string", "description": "Existing memory id being superseded"},
                "content": {"type": "string", "description": "Updated content"},
                "supersedes": {
                    "type": "string",
                    "description": "Optional id of record being superseded (defaults to id)",
                },
                "source_agent": {"type": "string"},
                "session_id": {"type": "string"},
                "type": {
                    "type": "string",
                    "enum": [
                        "decision",
                        "fact",
                        "task",
                        "preference",
                        "architecture",
                        "research",
                    ],
                },
                "subject": {"type": "string"},
                "tags": {"type": "array", "items": {"type": "string"}},
                "user_requested": {
                    "type": "boolean",
                    "description": "Must be true — explicit user intent",
                },
                "user_statement": {"type": "string"},
            },
            "required": ["id", "content", "user_requested"],
        },
    },
}
