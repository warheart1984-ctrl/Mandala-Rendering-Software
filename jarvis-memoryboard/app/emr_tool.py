"""EMR Recall Protocol — read-only tool boundary for agent function calling.

v1 exposes ``emr_recall`` only. Write paths (propose/commit) are reserved for
governed endpoints — not exposed through this tool surface.
"""

from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, Field, model_validator

from app.emr import (
    ExciteRequest,
    MetadataFilters,
    RetrievalWeights,
    excite,
)
from app.models import MemoryRecord, MemoryStatus, MemoryType
from app.store import JarvisStore

# Operation → resonance trigger preset (recall wave band)
INTENT_TRIGGER_MAP: dict[str, str] = {
    "image_generation": "project",
    "creative": "project",
    "code": "technical-domain",
    "technical": "technical-domain",
    "constitutional": "constitutional-chain",
    "governance": "constitutional-chain",
    "user_preferences": "user-identity",
    "identity": "user-identity",
    "procedure": "procedural",
    "task": "procedural",
}

# authority_required → prefer verified + type hints
AUTHORITY_TYPE_HINTS: dict[str, list[MemoryType]] = {
    "user_preferences": ["preference"],
    "constitutional": ["decision", "architecture"],
    "verified_only": [],
}


class EmrIntentDetail(BaseModel):
    """Structured recall wave — maps to EMR resonance channels."""

    operation: str = Field(..., min_length=1, max_length=128)
    domain: str | None = Field(default=None, max_length=128)
    project: str | None = Field(default=None, max_length=256)
    authority_required: str | None = Field(default=None, max_length=128)


class EmrRecallRequest(BaseModel):
    """Read-only EMR tool input (EMR Recall Protocol v1)."""

    intent: str | EmrIntentDetail
    query: str = Field(..., min_length=1, max_length=2000)
    subjects: list[str] = Field(default_factory=list, max_length=32)
    tags_any: list[str] = Field(default_factory=list, max_length=32)
    types: list[MemoryType] = Field(default_factory=list, max_length=8)
    statuses: list[MemoryStatus] = Field(default_factory=list, max_length=4)
    max_memories: int = Field(default=8, ge=1, le=32)
    truth_scope: str = Field(default="live", max_length=32)
    session_key: str = Field(default="tool-emr-recall", max_length=128)
    include_provenance: bool = True

    @model_validator(mode="before")
    @classmethod
    def _coerce_intent_dict(cls, data: Any) -> Any:
        if isinstance(data, dict):
            intent = data.get("intent")
            if isinstance(intent, dict):
                data = {**data, "intent": EmrIntentDetail(**intent)}
        return data

    @model_validator(mode="after")
    def _normalize_subjects(self) -> "EmrRecallRequest":
        self.subjects = [s.strip() for s in self.subjects if s and s.strip()]
        return self


class EmrRecallBundleItem(BaseModel):
    memory_id: str
    content: str
    subject: str | None = None
    type: str
    status: str
    confidence: float
    activation: float
    tags: list[str] = Field(default_factory=list)


class EmrRecallProvenance(BaseModel):
    memory_id: str
    recalled_because: list[str] = Field(default_factory=list)
    activation: float
    components: dict[str, float] = Field(default_factory=dict)
    graph_path: list[str] = Field(default_factory=list)
    graph_edges: list[str] = Field(default_factory=list)


class EmrRecallConflict(BaseModel):
    subject: str
    memory_ids: list[str]
    unresolved: bool = True


class EmrRecallResponse(BaseModel):
    protocol: str = "emr-recall-v1"
    bundle: list[EmrRecallBundleItem]
    abstained: bool
    abstention_reason: str | None = None
    conflicts: list[EmrRecallConflict]
    provenance: list[EmrRecallProvenance] = Field(default_factory=list)
    recall_summary: list[str] = Field(default_factory=list)
    intent_resolved: dict[str, Any] = Field(default_factory=dict)
    excluded_conflicts: list[str] = Field(default_factory=list)


def _resolve_intent(intent: str | EmrIntentDetail) -> EmrIntentDetail:
    if isinstance(intent, EmrIntentDetail):
        return intent
    return EmrIntentDetail(operation=intent.strip())


def _intent_to_trigger(detail: EmrIntentDetail) -> str | None:
    for key in (detail.operation, detail.domain or "", detail.authority_required or ""):
        k = (key or "").strip().lower().replace(" ", "_")
        if k in INTENT_TRIGGER_MAP:
            return INTENT_TRIGGER_MAP[k]
    return None


def _build_filters(req: EmrRecallRequest, detail: EmrIntentDetail) -> MetadataFilters:
    types = list(req.types)
    statuses = list(req.statuses)
    if detail.authority_required:
        hint = AUTHORITY_TYPE_HINTS.get(detail.authority_required.replace(" ", "_"), [])
        for t in hint:
            if t not in types:
                types.append(t)
        if detail.authority_required == "verified_only" and "verified" not in statuses:
            statuses.append("verified")
    if detail.operation in ("user_preferences", "image_generation", "creative"):
        if "preference" not in types and not req.types:
            types.append("preference")
    subjects = list(req.subjects)
    if detail.project and detail.project not in subjects:
        subjects.append(detail.project)
    return MetadataFilters(
        types=types,
        statuses=statuses,
        subjects=subjects,
        tags_any=list(req.tags_any),
    )


def _provenance_reasons(
    entry_components: dict[str, float],
    rec: MemoryRecord,
    *,
    intent_detail: EmrIntentDetail,
    subject_match: bool,
    graph_boosted: bool,
) -> list[str]:
    reasons: list[str] = []
    if rec.status == "verified":
        reasons.append("verified ledger record")
    if rec.type == "preference" and intent_detail.operation in (
        "image_generation",
        "creative",
        "user_preferences",
    ):
        reasons.append(f"{intent_detail.operation} operation")
    if subject_match:
        reasons.append("strong subject match")
    if entry_components.get("Q", 0) >= 0.3:
        reasons.append("query alignment")
    if entry_components.get("P", 0) >= 0.5:
        reasons.append("provenance / authority weight")
    if graph_boosted:
        reasons.append("graph-bond expansion")
    if not reasons:
        reasons.append("resonance activation above threshold")
    return reasons


def emr_recall(
    store: JarvisStore,
    req: EmrRecallRequest,
) -> EmrRecallResponse:
    """Read-only governed recall — EMR excite → agent-facing bundle."""
    detail = _resolve_intent(req.intent)
    trigger = _intent_to_trigger(detail)
    filters = _build_filters(req, detail)

    # Token budget: ~64 tokens per summary target
    token_budget = max(128, req.max_memories * 64)

    weights = RetrievalWeights()
    if detail.authority_required in ("user_preferences", "constitutional", "verified_only"):
        weights = weights.model_copy(update={"provenance": 1.2})

    query = req.query
    if detail.domain:
        query = f"{query} {detail.domain}"

    candidates = store.list_memories(truth_scope=req.truth_scope, limit=9999)
    records_by_id = {r.id: r for r in candidates}

    excite_req = ExciteRequest(
        query=query,
        token_budget=token_budget,
        candidate_limit=max(200, req.max_memories * 25),
        session_key=req.session_key,
        trigger=trigger,
        filters=filters,
        weights=weights,
        reinforce_selected=False,
        theta_promote=0.001,
    )

    # Subject-targeted calls narrow candidates via metadata filters but abstention
    # stays fully enforced — naming a subject must not bypass the evidence gate.
    try:
        result = excite(candidates, excite_req, enforce_abstention=True)
    except ValueError as exc:
        raise ValueError(str(exc)) from exc

    bundle: list[EmrRecallBundleItem] = []
    provenance: list[EmrRecallProvenance] = []
    recall_summary: list[str] = []

    for entry in result.stm[: req.max_memories]:
        rec = records_by_id.get(entry.memory_id)
        if rec is None:
            continue
        bundle.append(
            EmrRecallBundleItem(
                memory_id=entry.memory_id,
                content=rec.content,
                subject=rec.subject,
                type=rec.type,
                status=rec.status,
                confidence=rec.confidence,
                activation=round(entry.activation, 4),
                tags=list(rec.tags),
            )
        )
        comp = entry.components
        subject_match = bool(
            req.subjects and rec.subject and rec.subject.casefold() in {s.casefold() for s in req.subjects}
        )
        graph_boosted = comp.graph_boost > 0
        reasons = _provenance_reasons(
            {"Q": comp.Q, "P": comp.P},
            rec,
            intent_detail=detail,
            subject_match=subject_match,
            graph_boosted=graph_boosted,
        )
        if req.include_provenance:
            provenance.append(
                EmrRecallProvenance(
                    memory_id=entry.memory_id,
                    recalled_because=reasons,
                    activation=round(entry.activation, 4),
                    components={
                        "Q": comp.Q,
                        "R": comp.R,
                        "P": comp.P,
                        "decay": comp.decay,
                        "sim_rf": comp.sim_rf,
                        "reinforcement_multiplier": comp.reinforcement_multiplier,
                        "graph_boost": comp.graph_boost,
                        "A": comp.A,
                    },
                    graph_path=list(comp.graph_path),
                    graph_edges=list(comp.graph_edges),
                )
            )
        recall_summary.extend(f"✓ {reason}" for reason in reasons[:2])

    # Surface conflicts for requested or bundled subjects (read-only inspection)
    conflict_rows: list[EmrRecallConflict] = []
    bundled_subjects = {b.subject for b in bundle if b.subject}
    conflict_subjects = bundled_subjects | {s for s in req.subjects}
    for conflict in store.conflicts():
        if not conflict.unresolved:
            continue
        if conflict.subject and conflict.subject in conflict_subjects:
            conflict_rows.append(
                EmrRecallConflict(
                    subject=conflict.subject,
                    memory_ids=[m.id for m in conflict.memories],
                    unresolved=True,
                )
            )

    if result.abstained:
        recall_summary = ["abstained — insufficient evidence or ambiguous recall"]

    return EmrRecallResponse(
        bundle=bundle,
        abstained=result.abstained,
        abstention_reason=result.abstention_reason,
        conflicts=conflict_rows,
        provenance=provenance if req.include_provenance else [],
        recall_summary=sorted(set(recall_summary))[:12],
        intent_resolved={
            "operation": detail.operation,
            "domain": detail.domain,
            "project": detail.project,
            "authority_required": detail.authority_required,
            "trigger": trigger,
            "filters": filters.model_dump(mode="json", exclude_defaults=True),
        },
        excluded_conflicts=result.excluded_conflicts,
    )


# OpenAI / tool-calling schema export
EMR_RECALL_TOOL_SCHEMA: dict[str, Any] = {
    "type": "function",
    "function": {
        "name": "emr_recall",
        "description": (
            "Read-only Electrom-Matic Recall over the Continuity Ledger. "
            "Returns a governed memory bundle for the given intent and query. "
            "Does not write, reinforce, or mutate ledger truth."
        ),
        "parameters": {
            "type": "object",
            "properties": {
                "intent": {
                    "description": "Recall wave: operation string or structured intent object",
                    "oneOf": [
                        {"type": "string", "examples": ["image_generation", "constitutional"]},
                        {
                            "type": "object",
                            "properties": {
                                "operation": {"type": "string"},
                                "domain": {"type": "string"},
                                "project": {"type": "string"},
                                "authority_required": {"type": "string"},
                            },
                            "required": ["operation"],
                        },
                    ],
                },
                "query": {"type": "string", "description": "Natural-language recall query"},
                "subjects": {
                    "type": "array",
                    "items": {"type": "string"},
                    "description": "Subject filters (e.g. image-signature, creative-style)",
                },
                "max_memories": {
                    "type": "integer",
                    "minimum": 1,
                    "maximum": 32,
                    "default": 8,
                },
            },
            "required": ["intent", "query"],
        },
    },
}


def tool_catalog() -> dict[str, Any]:
    """Exported tool catalog for agent hosts (read-only v1)."""
    return {
        "schema": "emr-tool-catalog-v1",
        "tools": [EMR_RECALL_TOOL_SCHEMA],
        "write_policy": {
            "emr_recall": "read",
            "emr_propose_memory": "propose (not exposed v1)",
            "emr_commit_memory": "governed (not exposed v1)",
        },
    }
