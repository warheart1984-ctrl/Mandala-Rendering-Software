"""EMR — Excitation / Memory Recall (governed activation over Memoryboard).

Canonical stack:
  AMUL Architect     = LTM substrate (persistence / structure / lineage) — declared/partial
  Jarvis Memoryboard = LTM access / API / Continuity Ledger SoT
  EMR (this module)  = excitation, bonding, certification, bundle formation
  STM                = token-budgeted active working set (view, not a store)
  LLM                = reasoning / generation over STM

EMR does not invent persistent LTM. It reads Memoryboard and decides what
becomes active cognition. Promotion / eviction are dormancy transitions —
never deletes from LTM. Compression never becomes truth: every STM entry
retains memory_id provenance.

Activation:
  A_evidence = Q * R * P * unreinforced_decay * resonance
  A_base = A_evidence * min(total_reinforcement_cap, reinforcement_effect)
  A = A_base + bounded_graph_boost
"""

from __future__ import annotations

import json
import math
import os
import re
import threading
from collections import deque
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Literal

from pydantic import BaseModel, Field, model_validator

from app.models import MemoryRecord, MemoryStatus, MemoryType

Resolution = Literal["summary", "detail", "evidence"]

_WORD_RE = re.compile(r"[a-z0-9_]{2,}", re.I)

_TYPE_DECAY: dict[str, float] = {
    # Per-hour decay; calibrated for multi-day continuity (README drift goal).
    # Half-life = ln(2)/D: architecture ~35d, decision ~7d, preference ~4d,
    # research/fact ~2d, task ~23h (tasks legitimately go stale fastest).
    "architecture": 0.0008,
    "decision": 0.004,
    "preference": 0.006,
    "research": 0.012,
    "fact": 0.012,
    "task": 0.03,
}

_STATUS_P: dict[str, float] = {
    "verified": 1.0,
    "draft": 0.55,
    "archived": 0.0,
}


class RetrievalWeights(BaseModel):
    """Auditable component weights for governed activation.

    A weight of 1 preserves the canonical EMR factor, 0 disables that soft
    factor, and values up to 2 sharpen it. Ledger admission remains hard-gated
    by provenance/status regardless of these weights.
    """

    query: float = Field(default=1.0, ge=0.0, le=2.0)
    trajectory: float = Field(default=1.0, ge=0.0, le=2.0)
    provenance: float = Field(default=1.0, ge=0.0, le=2.0)
    decay: float = Field(default=1.0, ge=0.0, le=2.0)
    reinforcement: float = Field(default=1.0, ge=0.0, le=2.0)
    resonance: float = Field(default=1.0, ge=0.0, le=2.0)
    graph: float = Field(default=0.30, ge=0.0, le=1.0)


class MetadataFilters(BaseModel):
    """Exact, pre-scoring filters over canonical ledger metadata."""

    types: list[MemoryType] = Field(default_factory=list, max_length=16)
    statuses: list[MemoryStatus] = Field(default_factory=list, max_length=8)
    source_agents: list[str] = Field(default_factory=list, max_length=64)
    session_ids: list[str] = Field(default_factory=list, max_length=64)
    subjects: list[str] = Field(default_factory=list, max_length=64)
    tags_any: list[str] = Field(default_factory=list, max_length=64)
    tags_all: list[str] = Field(default_factory=list, max_length=64)
    min_confidence: float | None = Field(default=None, ge=0.0, le=1.0)
    max_confidence: float | None = Field(default=None, ge=0.0, le=1.0)
    created_after: datetime | None = None
    created_before: datetime | None = None
    updated_after: datetime | None = None
    updated_before: datetime | None = None

    @model_validator(mode="after")
    def _ordered_ranges(self) -> "MetadataFilters":
        if (
            self.min_confidence is not None
            and self.max_confidence is not None
            and self.min_confidence > self.max_confidence
        ):
            raise ValueError("min_confidence must be <= max_confidence")
        for lo_name, hi_name in (
            ("created_after", "created_before"),
            ("updated_after", "updated_before"),
        ):
            lo = getattr(self, lo_name)
            hi = getattr(self, hi_name)
            lo_utc = (
                lo.replace(tzinfo=timezone.utc)
                if lo is not None and lo.tzinfo is None
                else lo
            )
            hi_utc = (
                hi.replace(tzinfo=timezone.utc)
                if hi is not None and hi.tzinfo is None
                else hi
            )
            if lo_utc is not None and hi_utc is not None and lo_utc > hi_utc:
                raise ValueError(f"{lo_name} must be <= {hi_name}")
        return self


class GraphExpansionConfig(BaseModel):
    """Bounded traversal of recorded/derived Continuity Ledger bonds."""

    enabled: bool = True
    max_depth: int = Field(default=2, ge=1, le=4)
    seed_limit: int = Field(default=8, ge=1, le=32)
    max_nodes: int = Field(default=48, ge=1, le=256)
    min_edge_weight: float = Field(default=0.35, ge=0.0, le=1.0)
    hop_decay: float = Field(default=0.8, ge=0.1, le=1.0)


class AbstentionConfig(BaseModel):
    """Evidence-only floor and ambiguity gate for answer-bearing recall.

    The gate deliberately ignores graph and reinforcement boosts. Those
    mechanisms may improve ordering, but cannot manufacture enough evidence to
    turn an unsupported query into an answer.
    """

    enabled: Literal[True] = True
    min_top_score: float = Field(default=0.05, ge=0.05, le=1.0)
    min_top_query_alignment: float = Field(default=0.2, ge=0.2, le=1.0)
    min_score_margin: float = Field(default=0.0005, ge=0.0005, le=1.0)
    min_relative_margin: float = Field(default=0.005, ge=0.005, le=1.0)


class ActivationBreakdown(BaseModel):
    Q: float
    R: float
    P: float
    decay: float
    A: float
    age_hours: float
    D: float
    D_eff: float = 0.0
    salience: float = 0.0
    use_count: int = 0
    F: dict[str, float] = Field(default_factory=dict)  # resonance vector F_i
    sim_rf: float = 0.0  # cos(F_i, R_intent); scales A by (1 + kappa*sim)
    base_A: float = 0.0
    evidence_A: float = 0.0
    gate_A: float = 0.0
    reinforcement_multiplier: float = 1.0
    reinforcement_multiplier_raw: float = 1.0
    graph_boost: float = 0.0
    graph_hops: int = 0
    graph_seed_id: str | None = None
    graph_path: list[str] = Field(default_factory=list)
    graph_edges: list[str] = Field(default_factory=list)
    weights: dict[str, float] = Field(default_factory=dict)


class ReinforcementState(BaseModel):
    """EMR-side dynamics overlay — retrievability only, never truth.

    Constitutional rule: reinforcement must NOT become "recalled often = true".
    This state lives outside the Continuity Ledger; LTM status/confidence/
    content are independently certified and untouched by reinforcement.
    """

    memory_id: str
    use_count: int = 0
    salience: float = 0.0  # bounded multiplier boost: A *= (1 + salience)
    decay_damp: float = 0.0  # fraction of D removed: D_eff = D * (1 - damp)
    last_reinforced_at: str | None = None
    outcome_ids: list[str] = Field(default_factory=list)
    correction_ids: list[str] = Field(default_factory=list)


class PositiveOutcomeSignal(BaseModel):
    """Auditable evidence that a recalled memory helped produce a good result."""

    signal: Literal["positive"]
    source: Literal["user", "operator", "task", "tool"]
    outcome_id: str = Field(..., min_length=1, max_length=256)
    evidence_ref: str | None = Field(default=None, max_length=1024)


class OperatorCorrectionSignal(BaseModel):
    """Auditable operator correction — immediately dampens wrong-memory reinforcement."""

    source: Literal["user", "operator"]
    correction_id: str = Field(..., min_length=1, max_length=256)
    reason: str | None = Field(default=None, max_length=1024)


# Bounded gains — a particle can never dominate context by repetition alone.
SALIENCE_GAIN = 0.05
SALIENCE_CAP = 0.5
DAMP_GAIN = 0.03
DAMP_CAP = 0.5
TOTAL_REINFORCEMENT_CAP = 1.25

REINFORCEMENT_RULE = (
    "Reinforcement requires an explicit positive outcome signal and strengthens "
    "retrievability (salience up, decay damped) within separate and combined "
    "hard caps; truth/authority (status, confidence, content) remain independently "
    "certified by the Continuity Ledger and are never mutated."
)

_REINFORCEMENT: dict[str, ReinforcementState] = {}
_DYNAMICS_LOCK = threading.RLock()

# --- Dynamics sidecar (survives restarts; lives OUTSIDE the Continuity Ledger) ---

DYNAMICS_PATH = os.getenv("JARVIS_EMR_DYNAMICS_PATH") or os.path.join(
    "data", "emr-dynamics.json"
)
_dynamics_loaded = False


def _ensure_dynamics() -> None:
    """Lazily load the sidecar overlay once per process.

    Corrupt/unreadable sidecar => fresh overlay; LTM is never affected
    (the ledger remains the sole truth source).
    """
    with _DYNAMICS_LOCK:
        global _dynamics_loaded
        if _dynamics_loaded:
            return
        _dynamics_loaded = True
        try:
            p = Path(DYNAMICS_PATH)
            if p.exists():
                data = json.loads(p.read_text(encoding="utf-8"))
                for mid, state in (data.get("reinforcement") or {}).items():
                    _REINFORCEMENT[mid] = ReinforcementState(**state)
        except Exception:
            pass  # sidecar is disposable dynamics, not truth


def save_dynamics() -> bool:
    """Atomic sidecar write (tmp + rename). Returns success flag."""
    with _DYNAMICS_LOCK:
        try:
            p = Path(DYNAMICS_PATH)
            p.parent.mkdir(parents=True, exist_ok=True)
            tmp = p.with_suffix(p.suffix + ".tmp")
            payload = {
                "schema": "emr-dynamics-v1",
                "saved_at": datetime.now(timezone.utc).isoformat(),
                "note": "EMR retrieval dynamics only — NOT truth; ledger is authoritative.",
                "reinforcement": {
                    k: v.model_dump() for k, v in sorted(_REINFORCEMENT.items())
                },
            }
            tmp.write_text(json.dumps(payload, indent=2), encoding="utf-8")
            os.replace(tmp, p)
            return True
        except Exception:
            return False


# --- Resonance vectors F_i (multichannel) and trigger presets ---

CHANNELS = ("domain", "authority", "project", "temporal", "procedural", "identity")

_AUTHORITY_TERMS = {
    "constitution", "constitutional", "charter", "policy", "governance",
    "governed", "authority", "contract", "clause", "lawbook", "sovereign",
    "certified", "verified", "enforced", "binding", "ledger",
}
_TECH_TERMS = {
    "gpu", "rocm", "vulkan", "render", "rendering", "shader", "math", "api",
    "engine", "holography", "holort4d", "phaseencode", "tanh", "bvh", "sd",
    "token", "scaffold", "dispatch", "byte", "parity", "router", "kernel",
}
_PROCEDURAL_TERMS = {
    "run", "start", "restart", "install", "recover", "fix", "deploy",
    "migrate", "wire", "hook", "test", "execute", "launch", "reload",
}
_IDENTITY_TERMS = {"jon", "jonhalstead", "zeronull1983", "jarvis"}

TRIGGER_PRESETS: dict[str, dict[str, float]] = {
    # Named resonance keys — each emits a different excitation vector.
    "authority": {"authority": 1.0},
    "constitutional-chain": {"authority": 1.0, "project": 0.3},
    "technical-domain": {"domain": 1.0},
    "user-identity": {"identity": 1.0},
    "project": {"project": 1.0},
    "procedural": {"procedural": 1.0},
    "temporal": {"temporal": 1.0},
}

DEFAULT_RF_KAPPA = 0.5


def resonance_vector(rec: MemoryRecord, now: datetime | None = None) -> dict[str, float]:
    """Deterministic multichannel signature of an LTM particle (heuristic v0)."""
    now = now or datetime.now(timezone.utc)
    text_blob = " ".join([rec.content or "", rec.subject or "", " ".join(rec.tags)]).lower()
    tokens = set(_WORD_RE.findall(text_blob))

    authority = 0.4 if rec.type in ("decision", "architecture") else 0.2
    if rec.status == "verified":
        authority += 0.2
    authority += 0.15 * len(tokens & _AUTHORITY_TERMS)
    domain = 0.2 + 0.1 * min(5, len(rec.tags)) + 0.12 * len(tokens & _TECH_TERMS)
    project = 0.8 if rec.subject else 0.1

    ts = _parse_ts(rec.updated_at) or _parse_ts(rec.created_at)
    age_h = 0.0
    if ts is not None:
        if ts.tzinfo is None:
            ts = ts.replace(tzinfo=timezone.utc)
        age_h = max(0.0, (now - ts).total_seconds() / 3600.0)
    temporal = max(0.0, 1.0 - age_h / (24 * 14))  # linear over ~14 days

    procedural = 0.8 if rec.type == "task" else 0.15
    procedural += 0.12 * len(tokens & _PROCEDURAL_TERMS)
    identity = 0.9 if tokens & _IDENTITY_TERMS else 0.05

    raw = {
        "domain": domain,
        "authority": authority,
        "project": project,
        "temporal": temporal,
        "procedural": procedural,
        "identity": identity,
    }
    return {c: round(max(0.0, min(1.0, v)), 4) for c, v in raw.items()}


def intent_vector(query: str, trigger: str | None = None) -> dict[str, float]:
    """Excitation vector for an intent: lexical channel hits × trigger weights."""
    tokens = set(_WORD_RE.findall((query or "").lower()))
    vec = {
        "domain": min(1.0, 0.12 * len(tokens & _TECH_TERMS)),
        "authority": min(1.0, 0.25 * len(tokens & _AUTHORITY_TERMS)),
        "project": 0.3 if ("project" in tokens or "feat" in tokens) else 0.1,
        "temporal": 0.2 if any(w in tokens for w in ("latest", "recent", "today", "now")) else 0.05,
        "procedural": min(1.0, 0.25 * len(tokens & _PROCEDURAL_TERMS)),
        "identity": min(1.0, 0.6 * len(tokens & _IDENTITY_TERMS)),
    }
    preset = TRIGGER_PRESETS.get(trigger or "", {})
    for c, w in preset.items():
        vec[c] = min(1.0, vec[c] + w)
    norm = math.sqrt(sum(v * v for v in vec.values()))
    if norm > 0:
        vec = {c: round(v / norm, 6) for c, v in vec.items()}
    return vec


def sim_rf(f: dict[str, float], r_vec: dict[str, float]) -> float:
    """Cosine similarity between particle vector F_i and intent vector R."""
    num = sum(f.get(c, 0.0) * r_vec.get(c, 0.0) for c in CHANNELS)
    nf = math.sqrt(sum(f.get(c, 0.0) ** 2 for c in CHANNELS))
    nr = math.sqrt(sum(r_vec.get(c, 0.0) ** 2 for c in CHANNELS))
    if nf == 0 or nr == 0:
        return 0.0
    return round(num / (nf * nr), 6)


# --- Bond dynamics B_ij (constructive interference / contradiction membrane) ---

BOND_SUBJECT = 0.6
BOND_TAG_WEIGHT = 0.4


def bond_strength(a: MemoryRecord, b: MemoryRecord) -> float:
    """B_ij ∈ [0,1]: verified/derived relationship between two particles."""
    if a.id == b.id:
        return 0.0
    bond = 0.0
    if a.subject and a.subject == b.subject:
        bond += BOND_SUBJECT
    ta, tb = set(a.tags), set(b.tags)
    if ta or tb:
        jac = len(ta & tb) / len(ta | tb)
        bond += BOND_TAG_WEIGHT * jac
    return round(min(1.0, bond), 4)


def is_contradiction(a: MemoryRecord, b: MemoryRecord) -> bool:
    """Ledger conflict rule: same subject + different content = dispute."""
    return bool(
        a.subject
        and a.subject == b.subject
        and a.content_sha256 != b.content_sha256
    )


class STMEntry(BaseModel):
    """Activated working-set particle — short payload, LTM provenance required."""

    memory_id: str
    summary: str
    payload: str
    resolution: Resolution = "summary"
    activation: float
    components: ActivationBreakdown
    type: str
    status: str
    subject: str | None = None
    confidence: float = 0.0
    token_cost: int = 0
    evidence_refs: list[str] = Field(default_factory=list)


class ExciteRequest(BaseModel):
    query: str = Field(..., min_length=1, max_length=2000)
    trajectory: list[str] = Field(default_factory=list)
    token_budget: int = Field(default=512, ge=32, le=8000)
    theta_promote: float = Field(default=0.12, ge=0.0, le=1.0)
    theta_evict: float = Field(default=0.04, ge=0.0, le=1.0)
    truth_scope: str = "live"
    candidate_limit: int = Field(default=200, ge=1, le=2000)
    session_key: str = Field(default="default", max_length=128)
    prior_stm_ids: list[str] = Field(default_factory=list)
    # Resonance vectors: named trigger key (TRIGGER_PRESETS) + coupling strength
    trigger: str | None = Field(default=None, max_length=64)
    rf_kappa: float = Field(default=DEFAULT_RF_KAPPA, ge=0.0, le=1.0)
    # Bond dynamics: bundle bonus weight + contradiction membrane policy
    bond_weight: float = Field(default=0.15, ge=0.0, le=1.0)
    contradiction_policy: Literal["exclude", "allow"] = "exclude"
    # EMR v1 retrieval controls. Filters run before scoring; graph expansion
    # runs after base activation and before budgeted bundle selection.
    filters: MetadataFilters = Field(default_factory=MetadataFilters)
    weights: RetrievalWeights = Field(default_factory=RetrievalWeights)
    graph: GraphExpansionConfig = Field(default_factory=GraphExpansionConfig)
    abstention: AbstentionConfig = Field(default_factory=AbstentionConfig)
    # Selection alone is not a positive outcome. Automatic reinforcement is
    # legal only when the caller supplies an auditable positive result.
    reinforce_selected: bool = False
    reinforcement_outcome: PositiveOutcomeSignal | None = None

    @model_validator(mode="after")
    def _positive_outcome_required_for_auto_reinforcement(self) -> "ExciteRequest":
        if self.reinforce_selected and self.reinforcement_outcome is None:
            raise ValueError(
                "reinforcement_outcome is required when reinforce_selected=true"
            )
        return self


class ExciteResponse(BaseModel):
    session_key: str
    stm: list[STMEntry]
    promoted: list[str]
    evicted: list[str]
    scored: int
    budget_used: int
    budget_limit: int
    formula: str = (
        "A_evidence = Q^wq * R^wr * P^wp * decay_unreinforced^wd * "
        "(1 + kappa*cos(F,R))^wf; A_base = A_evidence * "
        "min(total_reinforcement_cap, salience*decay_damp); "
        "A = A_base + wg*A_seed*path_strength"
    )
    excluded_conflicts: list[str] = Field(default_factory=list)
    trigger: str | None = None
    input_candidates: int = 0
    filtered_candidates: int = 0
    filters_applied: dict[str, Any] = Field(default_factory=dict)
    retrieval_weights: dict[str, float] = Field(default_factory=dict)
    graph_expanded: int = 0
    graph_config: dict[str, Any] = Field(default_factory=dict)
    abstained: bool = False
    abstention_reason: str | None = None
    abstention_config: dict[str, Any] = Field(default_factory=dict)
    top_evidence_score: float | None = None
    runner_up_evidence_score: float | None = None
    score_margin: float | None = None
    relative_score_margin: float | None = None
    auto_reinforced: list[str] = Field(default_factory=list)
    replayed_memory_ids: list[str] = Field(default_factory=list)
    retrieval_receipt: list[RetrievalReceiptEntry] = Field(default_factory=list)


class ExpandRequest(BaseModel):
    memory_id: str
    resolution: Resolution = "detail"
    session_key: str = "default"


class ReinforceRequest(BaseModel):
    memory_ids: list[str] = Field(..., min_length=1, max_length=64)
    session_key: str = Field(default="default", max_length=128)
    outcome: PositiveOutcomeSignal


class ReinforcedItem(BaseModel):
    memory_id: str
    use_count: int
    salience: float
    decay_damp: float
    last_reinforced_at: str | None = None
    outcome_ids: list[str] = Field(default_factory=list)


class ReinforceResponse(BaseModel):
    reinforced: list[ReinforcedItem]
    unknown_ids: list[str]
    replayed_memory_ids: list[str] = Field(default_factory=list)
    ltm_mutations: int = 0
    rule: str = REINFORCEMENT_RULE


class RetrievalReceiptEntry(BaseModel):
    """Inspectable activation breakdown for one ranked candidate."""

    memory_id: str
    rank: int
    selected: bool
    Q: float
    R: float
    P: float
    decay: float
    sim_rf: float
    reinforcement_multiplier: float
    graph_boost: float
    evidence_A: float
    gate_A: float
    A: float
    graph_path: list[str] = Field(default_factory=list)
    graph_edges: list[str] = Field(default_factory=list)


class CorrectRequest(BaseModel):
    memory_ids: list[str] = Field(..., min_length=1, max_length=64)
    session_key: str = Field(default="default", max_length=128)
    correction: OperatorCorrectionSignal


class CorrectResponse(BaseModel):
    corrected: list[ReinforcedItem]
    unknown_ids: list[str]
    replayed_correction_ids: list[str] = Field(default_factory=list)
    ltm_mutations: int = 0
    rule: str = (
        "Operator correction resets reinforcement overlay immediately "
        "(salience and decay damping cleared); LTM truth fields are never mutated."
    )


_STM: dict[str, list[STMEntry]] = {}


def get_stm(session_key: str = "default") -> list[STMEntry]:
    return list(_STM.get(session_key, []))


def set_stm(session_key: str, entries: list[STMEntry]) -> None:
    _STM[session_key] = list(entries)


def clear_stm(session_key: str | None = None) -> None:
    if session_key is None:
        _STM.clear()
    else:
        _STM.pop(session_key, None)


def reset_stm_for_tests() -> None:
    with _DYNAMICS_LOCK:
        _STM.clear()
        _REINFORCEMENT.clear()


def get_reinforcement(memory_id: str) -> ReinforcementState | None:
    return _REINFORCEMENT.get(memory_id)


def reinforce_ids(
    known_ids: set[str],
    requested: list[str],
    *,
    outcome: PositiveOutcomeSignal | None,
) -> tuple[list[ReinforcementState], list[str], list[str]]:
    """Apply bounded reinforcement only after an explicit positive outcome.

    Mutates only the EMR dynamics overlay (persisted to the sidecar) —
    never the Continuity Ledger. Replaying the same outcome id for the same
    memory is idempotent and is reported rather than reinforced again.
    """
    if outcome is None or outcome.signal != "positive":
        raise ValueError("an explicit positive outcome signal is required")
    with _DYNAMICS_LOCK:
        _ensure_dynamics()
        now_iso = datetime.now(timezone.utc).isoformat()
        reinforced: list[ReinforcementState] = []
        unknown: list[str] = []
        replayed: list[str] = []
        for mid in requested:
            if mid not in known_ids:
                unknown.append(mid)
                continue
            state = _REINFORCEMENT.get(mid) or ReinforcementState(memory_id=mid)
            if outcome.outcome_id in state.outcome_ids:
                replayed.append(mid)
                continue
            state.use_count += 1
            state.salience = min(SALIENCE_CAP, state.salience + SALIENCE_GAIN)
            state.decay_damp = min(DAMP_CAP, state.decay_damp + DAMP_GAIN)
            state.last_reinforced_at = now_iso
            state.outcome_ids.append(outcome.outcome_id)
            _REINFORCEMENT[mid] = state
            reinforced.append(state)
        if reinforced:
            save_dynamics()
        return reinforced, unknown, replayed


def correct_memory_ids(
    known_ids: set[str],
    requested: list[str],
    *,
    correction: OperatorCorrectionSignal,
) -> tuple[list[ReinforcementState], list[str], list[str]]:
    """Immediately reset reinforcement overlay for operator-corrected memories.

    Clears salience and decay damping so a mistaken memory cannot slowly
    outcompete a corrected replacement. Mutates only the EMR dynamics sidecar.
    """
    with _DYNAMICS_LOCK:
        _ensure_dynamics()
        now_iso = datetime.now(timezone.utc).isoformat()
        corrected: list[ReinforcementState] = []
        unknown: list[str] = []
        replayed: list[str] = []
        for mid in requested:
            if mid not in known_ids:
                unknown.append(mid)
                continue
            state = _REINFORCEMENT.get(mid) or ReinforcementState(memory_id=mid)
            if correction.correction_id in state.correction_ids:
                replayed.append(mid)
                continue
            state.salience = 0.0
            state.decay_damp = 0.0
            state.last_reinforced_at = now_iso
            state.correction_ids.append(correction.correction_id)
            _REINFORCEMENT[mid] = state
            corrected.append(state)
        if corrected:
            save_dynamics()
        return corrected, unknown, replayed


def build_retrieval_receipt(
    scored: list[tuple[MemoryRecord, ActivationBreakdown]],
    selected_ids: set[str],
    *,
    limit: int = 32,
) -> list[RetrievalReceiptEntry]:
    """Ranked activation breakdown for inspectable recall."""
    ranked = sorted(scored, key=lambda pair: (-pair[1].A, pair[0].id))[:limit]
    receipt: list[RetrievalReceiptEntry] = []
    for rank, (rec, br) in enumerate(ranked, start=1):
        receipt.append(
            RetrievalReceiptEntry(
                memory_id=rec.id,
                rank=rank,
                selected=rec.id in selected_ids,
                Q=br.Q,
                R=br.R,
                P=br.P,
                decay=br.decay,
                sim_rf=br.sim_rf,
                reinforcement_multiplier=br.reinforcement_multiplier,
                graph_boost=br.graph_boost,
                evidence_A=br.evidence_A,
                gate_A=br.gate_A,
                A=br.A,
                graph_path=list(br.graph_path),
                graph_edges=list(br.graph_edges),
            )
        )
    return receipt


def _tokenize(text: str) -> set[str]:
    return {m.group(0).lower() for m in _WORD_RE.finditer(text or "")}


def _parse_ts(iso: str) -> datetime | None:
    if not iso:
        return None
    try:
        return datetime.fromisoformat(iso.replace("Z", "+00:00"))
    except ValueError:
        return None


def _as_utc(value: datetime | None) -> datetime | None:
    if value is None:
        return None
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)


def filter_records(
    records: list[MemoryRecord], filters: MetadataFilters
) -> list[MemoryRecord]:
    """Apply canonical metadata filters before any relevance scoring.

    Matching is exact and case-insensitive for string metadata. Missing or
    malformed record timestamps fail closed when a corresponding time filter
    is requested.
    """

    types = set(filters.types)
    statuses = set(filters.statuses)
    source_agents = {v.casefold() for v in filters.source_agents}
    session_ids = {v.casefold() for v in filters.session_ids}
    subjects = {v.casefold() for v in filters.subjects}
    tags_any = {v.casefold() for v in filters.tags_any}
    tags_all = {v.casefold() for v in filters.tags_all}
    created_after = _as_utc(filters.created_after)
    created_before = _as_utc(filters.created_before)
    updated_after = _as_utc(filters.updated_after)
    updated_before = _as_utc(filters.updated_before)

    selected: list[MemoryRecord] = []
    for rec in records:
        if rec.status == "archived":
            continue  # archived particles are never eligible for active cognition
        if types and rec.type not in types:
            continue
        if statuses and rec.status not in statuses:
            continue
        if source_agents and rec.source_agent.casefold() not in source_agents:
            continue
        if session_ids and rec.session_id.casefold() not in session_ids:
            continue
        if subjects and (rec.subject or "").casefold() not in subjects:
            continue
        rec_tags = {tag.casefold() for tag in rec.tags}
        if tags_any and not (rec_tags & tags_any):
            continue
        if tags_all and not tags_all.issubset(rec_tags):
            continue
        if filters.min_confidence is not None and rec.confidence < filters.min_confidence:
            continue
        if filters.max_confidence is not None and rec.confidence > filters.max_confidence:
            continue

        created = _as_utc(_parse_ts(rec.created_at))
        updated = _as_utc(_parse_ts(rec.updated_at))
        if created_after is not None and (created is None or created < created_after):
            continue
        if created_before is not None and (created is None or created > created_before):
            continue
        if updated_after is not None and (updated is None or updated < updated_after):
            continue
        if updated_before is not None and (updated is None or updated > updated_before):
            continue
        selected.append(rec)
    return selected


def estimate_tokens(text: str) -> int:
    """Cheap deterministic token estimate (≈ chars/4, min 1 if non-empty)."""
    if not text:
        return 0
    return max(1, (len(text) + 3) // 4)


def make_summary(content: str, max_chars: int = 140) -> str:
    """Deterministic summary — not a truth claim; expand via resolution for detail."""
    text = re.sub(r"\s+", " ", (content or "").strip())
    if len(text) <= max_chars:
        return text
    cut = text[: max_chars - 1].rsplit(" ", 1)[0]
    return (cut or text[: max_chars - 1]).rstrip(",;:") + "…"


def query_alignment(rec: MemoryRecord, query: str) -> float:
    """Q_i ∈ (0, 1] — lexical overlap of query with content/subject/tags."""
    q_tokens = _tokenize(query)
    if not q_tokens:
        return 0.15
    blob = _tokenize(
        " ".join([rec.content, rec.subject or "", " ".join(rec.tags), rec.type])
    )
    if not blob:
        return 0.05
    overlap = len(q_tokens & blob) / len(q_tokens)
    q_lower = query.lower().strip()
    if q_lower and q_lower in rec.content.lower():
        overlap = min(1.0, overlap + 0.35)
    if rec.subject and q_lower in rec.subject.lower():
        overlap = min(1.0, overlap + 0.2)
    return max(0.05, min(1.0, overlap))


def resonance(rec: MemoryRecord, trajectory: list[str], prior_ids: list[str]) -> float:
    """R_i — alignment with current reasoning trajectory + sticky prior STM."""
    sticky = 0.35 if rec.id in prior_ids else 0.0
    if not trajectory:
        return max(0.2, sticky + 0.2)
    traj_tokens = _tokenize(" ".join(trajectory))
    blob = _tokenize(
        " ".join([rec.content, rec.subject or "", " ".join(rec.tags), rec.type])
    )
    if not traj_tokens or not blob:
        return max(0.15, sticky)
    overlap = len(traj_tokens & blob) / len(traj_tokens)
    return max(0.1, min(1.0, overlap + sticky))


def provenance_authority(rec: MemoryRecord) -> float:
    """P_i — status × confidence × evidence (caller-asserted, not truth)."""
    status_w = _STATUS_P.get(rec.status, 0.4)
    if status_w <= 0:
        return 0.0
    conf = max(0.05, min(1.0, float(rec.confidence)))
    ev_bonus = 1.0 + min(0.25, 0.05 * len(rec.evidence or []))
    type_bump = (
        1.1
        if rec.type in ("decision", "architecture") and rec.status == "verified"
        else 1.0
    )
    return max(0.0, min(1.0, status_w * conf * ev_bonus * type_bump))


def decay_factor(rec: MemoryRecord, now: datetime | None = None) -> tuple[float, float, float]:
    """Returns (exp(-D·Δt), age_hours, D)."""
    now = now or datetime.now(timezone.utc)
    ts = _parse_ts(rec.updated_at) or _parse_ts(rec.created_at)
    if ts is None:
        age_hours = 0.0
    else:
        if ts.tzinfo is None:
            ts = ts.replace(tzinfo=timezone.utc)
        age_hours = max(0.0, (now - ts).total_seconds() / 3600.0)
    D = _TYPE_DECAY.get(rec.type, 0.15)
    return math.exp(-D * age_hours), age_hours, D


def activate(
    rec: MemoryRecord,
    *,
    query: str,
    trajectory: list[str] | None = None,
    prior_stm_ids: list[str] | None = None,
    now: datetime | None = None,
    intent_f: dict[str, float] | None = None,
    rf_kappa: float = 0.0,
    weights: RetrievalWeights | None = None,
) -> ActivationBreakdown:
    weights = weights or RetrievalWeights()
    Q = query_alignment(rec, query)
    R = resonance(rec, trajectory or [], prior_stm_ids or [])
    P = provenance_authority(rec)
    _, age_hours, D = decay_factor(rec, now=now)
    dyn = _REINFORCEMENT.get(rec.id)
    salience = dyn.salience if dyn else 0.0
    damp = dyn.decay_damp if dyn else 0.0
    D_eff = D * (1.0 - damp)
    unreinforced_decay = math.exp(-D * age_hours)
    decay = math.exp(-D_eff * age_hours)
    F = resonance_vector(rec, now=now) if intent_f is not None else {}
    sim = sim_rf(F, intent_f) if intent_f is not None else 0.0
    evidence_A = (
        (Q ** weights.query)
        * (R ** weights.trajectory)
        * (P ** weights.provenance)
        * (unreinforced_decay ** weights.decay)
        * ((1.0 + rf_kappa * sim) ** weights.resonance)
    )
    gate_A = (
        Q
        * R
        * P
        * unreinforced_decay
        * (1.0 + min(rf_kappa, DEFAULT_RF_KAPPA) * sim)
    )
    reinforcement_log = (
        weights.reinforcement * math.log1p(salience)
        + weights.decay * (D - D_eff) * age_hours
    )
    reinforcement_multiplier_raw = math.exp(min(700.0, reinforcement_log))
    reinforcement_multiplier = min(
        TOTAL_REINFORCEMENT_CAP, reinforcement_multiplier_raw
    )
    A = evidence_A * reinforcement_multiplier
    return ActivationBreakdown(
        Q=round(Q, 4),
        R=round(R, 4),
        P=round(P, 4),
        decay=round(decay, 6),
        A=round(A, 6),
        age_hours=round(age_hours, 3),
        D=D,
        D_eff=round(D_eff, 6),
        salience=round(salience, 4),
        use_count=dyn.use_count if dyn else 0,
        F=F,
        sim_rf=sim,
        base_A=round(A, 6),
        evidence_A=round(evidence_A, 6),
        gate_A=round(gate_A, 6),
        reinforcement_multiplier=round(reinforcement_multiplier, 6),
        reinforcement_multiplier_raw=round(reinforcement_multiplier_raw, 6),
        weights=weights.model_dump(),
    )


def render_resolution(rec: MemoryRecord, resolution: Resolution) -> str:
    summary = make_summary(rec.content)
    if resolution == "summary":
        return summary
    if resolution == "detail":
        return rec.content
    lines = [rec.content]
    if rec.evidence:
        lines.append("--- evidence ---")
        for ev in rec.evidence:
            note = f" ({ev.note})" if getattr(ev, "note", "") else ""
            kind = getattr(ev, "kind", "ref")
            ref = getattr(ev, "ref", str(ev))
            lines.append(f"[{kind}] {ref}{note}")
    else:
        lines.append("--- evidence ---")
        lines.append("(none recorded on LTM particle)")
    return "\n".join(lines)


def _entry_from_record(
    rec: MemoryRecord,
    breakdown: ActivationBreakdown,
    resolution: Resolution = "summary",
) -> STMEntry:
    payload = render_resolution(rec, resolution)
    summary = make_summary(rec.content)
    refs: list[str] = []
    for e in rec.evidence or []:
        kind = getattr(e, "kind", "ref")
        ref = getattr(e, "ref", str(e))
        refs.append(f"{kind}:{ref}")
    return STMEntry(
        memory_id=rec.id,
        summary=summary,
        payload=payload,
        resolution=resolution,
        activation=breakdown.A,
        components=breakdown,
        type=rec.type,
        status=rec.status,
        subject=rec.subject,
        confidence=rec.confidence,
        token_cost=estimate_tokens(payload),
        evidence_refs=refs,
    )


def _evidence_memory_ids(rec: MemoryRecord, known_ids: set[str]) -> set[str]:
    """Resolve only explicit memory-id references already present in evidence."""

    found: set[str] = set()
    for evidence in rec.evidence or []:
        ref = str(getattr(evidence, "ref", "")).strip()
        direct = ref.removeprefix("memory:")
        if direct in known_ids:
            found.add(direct)
        for token in re.findall(r"mem-[A-Za-z0-9_.-]+", ref):
            if token in known_ids:
                found.add(token)
    found.discard(rec.id)
    return found


def apply_graph_expansion(
    scored: list[tuple[MemoryRecord, ActivationBreakdown]],
    *,
    config: GraphExpansionConfig,
    graph_weight: float,
) -> tuple[list[tuple[MemoryRecord, ActivationBreakdown]], int]:
    """Boost bounded multi-hop neighbors of the strongest base activations.

    Edges come only from ledger-visible structure: ``supersedes``, evidence
    memory references, shared subject, and shared tags. No relationship is
    invented from generated text. The strongest path wins, preventing cycles
    or dense graphs from accumulating an unbounded popularity boost.
    """

    if not config.enabled or graph_weight <= 0.0 or len(scored) < 2:
        return scored, 0

    records_by_id = {rec.id: rec for rec, _ in scored}
    known_ids = set(records_by_id)
    subject_index: dict[str, set[str]] = {}
    tag_index: dict[str, set[str]] = {}
    explicit: dict[str, dict[str, tuple[float, set[str]]]] = {
        mid: {} for mid in known_ids
    }

    def add_explicit(a: str, b: str, weight: float, edge_type: str) -> None:
        if a == b or a not in known_ids or b not in known_ids:
            return
        current_weight, current_types = explicit[a].get(b, (0.0, set()))
        explicit[a][b] = (max(current_weight, weight), current_types | {edge_type})

    for rec in records_by_id.values():
        if rec.subject:
            subject_index.setdefault(rec.subject.casefold(), set()).add(rec.id)
        for tag in {tag.casefold() for tag in rec.tags}:
            tag_index.setdefault(tag, set()).add(rec.id)
        if rec.supersedes and rec.supersedes in known_ids:
            add_explicit(rec.id, rec.supersedes, 1.0, "supersedes")
            add_explicit(rec.supersedes, rec.id, 1.0, "superseded-by")
        for target in _evidence_memory_ids(rec, known_ids):
            add_explicit(rec.id, target, 0.9, "evidence-ref")
            add_explicit(target, rec.id, 0.9, "evidence-backref")

    neighbor_cache: dict[str, list[tuple[str, float, list[str]]]] = {}

    def neighbors(memory_id: str) -> list[tuple[str, float, list[str]]]:
        cached = neighbor_cache.get(memory_id)
        if cached is not None:
            return cached
        rec = records_by_id[memory_id]
        candidate_ids = set(explicit[memory_id])
        if rec.subject:
            candidate_ids.update(subject_index.get(rec.subject.casefold(), set()))
        for tag in {tag.casefold() for tag in rec.tags}:
            candidate_ids.update(tag_index.get(tag, set()))
        candidate_ids.discard(memory_id)

        out: list[tuple[str, float, list[str]]] = []
        for target_id in sorted(candidate_ids):
            target = records_by_id[target_id]
            explicit_weight, explicit_types = explicit[memory_id].get(
                target_id, (0.0, set())
            )
            derived_weight = bond_strength(rec, target)
            edge_types = set(explicit_types)
            if rec.subject and rec.subject == target.subject:
                edge_types.add("subject")
            if set(rec.tags) & set(target.tags):
                edge_types.add("tags")
            weight = max(explicit_weight, derived_weight)
            if weight >= config.min_edge_weight:
                out.append((target_id, weight, sorted(edge_types)))
        neighbor_cache[memory_id] = out
        return out

    seeds = [
        (rec, br)
        for rec, br in sorted(scored, key=lambda pair: (-pair[1].A, pair[0].id))
        if br.P > 0.0 and br.A > 0.0
    ][: config.seed_limit]
    # target -> (boost, hops, seed id, memory path, typed edge path)
    best_updates: dict[str, tuple[float, int, str, list[str], list[str]]] = {}

    for seed, seed_br in seeds:
        queue: deque[tuple[str, int, float, list[str], list[str]]] = deque(
            [(seed.id, 0, 1.0, [seed.id], [])]
        )
        best_strength = {seed.id: 1.0}
        while queue:
            current_id, depth, strength, path, edge_path = queue.popleft()
            if depth >= config.max_depth:
                continue
            for target_id, edge_weight, edge_types in neighbors(current_id):
                next_depth = depth + 1
                next_strength = strength * edge_weight
                if next_depth > 1:
                    next_strength *= config.hop_decay
                if next_strength <= best_strength.get(target_id, 0.0):
                    continue
                if target_id not in best_updates and len(best_updates) >= config.max_nodes:
                    continue
                best_strength[target_id] = next_strength
                next_path = [*path, target_id]
                edge_label = f"{'+'.join(edge_types)}:{edge_weight:.3f}"
                next_edges = [*edge_path, edge_label]
                if target_id != seed.id:
                    boost = seed_br.base_A * graph_weight * next_strength
                    previous = best_updates.get(target_id)
                    if previous is None or boost > previous[0]:
                        best_updates[target_id] = (
                            boost,
                            next_depth,
                            seed.id,
                            next_path,
                            next_edges,
                        )
                queue.append(
                    (target_id, next_depth, next_strength, next_path, next_edges)
                )

    expanded: list[tuple[MemoryRecord, ActivationBreakdown]] = []
    for rec, br in scored:
        update = best_updates.get(rec.id)
        if update is None:
            expanded.append((rec, br))
            continue
        boost, hops, seed_id, path, edges = update
        expanded.append(
            (
                rec,
                br.model_copy(
                    update={
                        "A": round(br.base_A + boost, 6),
                        "graph_boost": round(boost, 6),
                        "graph_hops": hops,
                        "graph_seed_id": seed_id,
                        "graph_path": path,
                        "graph_edges": edges,
                    }
                ),
            )
        )
    return expanded, len(best_updates)


def assess_abstention(
    scored: list[tuple[MemoryRecord, ActivationBreakdown]],
    config: AbstentionConfig,
    *,
    enforce: bool = True,
) -> dict[str, Any]:
    """Decide whether retrieval has enough independent evidence to answer.

    Distinct content hashes are compared so duplicated ledger rows cannot
    manufacture ambiguity. The score is canonical ``gate_A``: caller weights,
    reinforcement, and graph boosts remain useful for ordering, but cannot make
    the gate pass.
    """

    best_by_hash: dict[str, tuple[MemoryRecord, ActivationBreakdown]] = {}
    for rec, breakdown in scored:
        key = rec.content_sha256 or rec.id
        current = best_by_hash.get(key)
        if current is None or breakdown.gate_A > current[1].gate_A:
            best_by_hash[key] = (rec, breakdown)
    ranked = sorted(
        best_by_hash.values(),
        key=lambda pair: (-pair[1].gate_A, pair[0].id),
    )
    top = ranked[0][1] if ranked else None
    runner_up = ranked[1][1] if len(ranked) > 1 else None
    top_score = top.gate_A if top else None
    runner_score = runner_up.gate_A if runner_up else None
    margin = (
        max(0.0, top_score - runner_score)
        if top_score is not None and runner_score is not None
        else top_score
    )
    relative_margin = (
        margin / top_score
        if margin is not None and top_score is not None and top_score > 0
        else None
    )

    reason: str | None = None
    if enforce:
        if top is None:
            reason = "no-candidates"
        elif top_score is not None and top_score < config.min_top_score:
            reason = "top-score-below-floor"
        elif top.Q < config.min_top_query_alignment:
            reason = "query-alignment-below-floor"
        elif runner_up is not None and (
            (margin is not None and margin < config.min_score_margin)
            or (
                relative_margin is not None
                and relative_margin < config.min_relative_margin
            )
        ):
            reason = "ambiguous-score-margin"

    return {
        "abstained": reason is not None,
        "reason": reason,
        "top_evidence_score": round(top_score, 6) if top_score is not None else None,
        "runner_up_evidence_score": round(runner_score, 6)
        if runner_score is not None
        else None,
        "score_margin": round(margin, 6) if margin is not None else None,
        "relative_score_margin": round(relative_margin, 6)
        if relative_margin is not None
        else None,
    }


def select_stm(
    scored: list[tuple[MemoryRecord, ActivationBreakdown]],
    *,
    token_budget: int,
    theta_promote: float,
    prior: list[STMEntry] | None = None,
    bond_weight: float = 0.15,
    exclude_conflicts: bool = True,
) -> tuple[list[STMEntry], list[str]]:
    """Bundle formation: maximize ΣA + λΣB_ij under budget (greedy marginal gain).

    Constructive interference: mutually supporting particles (shared subject/
    tags) bundle together. Contradiction membrane: same-subject disputes are
    surfaced via /conflicts, never silently co-admitted (policy='exclude').
    """
    prior_res = {e.memory_id: e.resolution for e in (prior or [])}
    eligible = [(rec, br) for rec, br in scored if br.A >= theta_promote and br.P > 0]

    selected: list[STMEntry] = []
    sel_recs: list[MemoryRecord] = []
    used = 0
    excluded_conflicts: list[str] = []
    remaining = list(eligible)

    while remaining:
        best: tuple[float, MemoryRecord, ActivationBreakdown, int] | None = None
        for rec, br in remaining:
            base_cost = max(1, estimate_tokens(make_summary(rec.content)))
            if used + base_cost > token_budget:
                continue
            bond_bonus = bond_weight * sum(bond_strength(rec, s) for s in sel_recs)
            density = (br.A + bond_bonus) / base_cost
            if best is None or density > best[0]:
                best = (density, rec, br, base_cost)
        if best is None:
            break

        _, rec, br, _cost = best
        if exclude_conflicts and any(is_contradiction(rec, s) for s in sel_recs):
            excluded_conflicts.append(rec.id)
            remaining = [(r, b) for r, b in remaining if r.id != rec.id]
            continue

        entry = _entry_from_record(rec, br, resolution=prior_res.get(rec.id, "summary"))
        if used + entry.token_cost > token_budget:
            if entry.resolution != "summary":
                entry = _entry_from_record(rec, br, resolution="summary")
            if used + entry.token_cost > token_budget:
                remaining = [(r, b) for r, b in remaining if r.id != rec.id]
                continue
        selected.append(entry)
        sel_recs.append(rec)
        used += entry.token_cost
        remaining = [(r, b) for r, b in remaining if r.id != rec.id]

    return selected, excluded_conflicts


def excite(
    records: list[MemoryRecord],
    req: ExciteRequest,
    *,
    now: datetime | None = None,
    enforce_abstention: bool = True,
) -> ExciteResponse:
    """Run EMR over LTM candidates → new STM view for session_key."""
    _ensure_dynamics()
    if req.trigger and req.trigger not in TRIGGER_PRESETS:
        raise ValueError(
            f"unknown trigger: {req.trigger!r}; known: {sorted(TRIGGER_PRESETS)}"
        )
    prior = get_stm(req.session_key)
    prior_ids = list(req.prior_stm_ids) or [e.memory_id for e in prior]

    filtered = filter_records(records, req.filters)
    candidates = filtered[: req.candidate_limit]

    intent_f = intent_vector(req.query, req.trigger)
    scored: list[tuple[MemoryRecord, ActivationBreakdown]] = []
    for rec in candidates:
        br = activate(
            rec,
            query=req.query,
            trajectory=req.trajectory,
            prior_stm_ids=prior_ids,
            now=now,
            intent_f=intent_f,
            rf_kappa=req.rf_kappa,
            weights=req.weights,
        )
        scored.append((rec, br))

    scored, graph_expanded = apply_graph_expansion(
        scored,
        config=req.graph,
        graph_weight=req.weights.graph,
    )

    abstention = assess_abstention(
        scored,
        req.abstention,
        enforce=enforce_abstention,
    )

    # Hysteresis: keep prior entries above theta_evict even if below promote
    by_id = {r.id: (r, br) for r, br in scored}
    if abstention["abstained"]:
        new_stm: list[STMEntry] = []
        excluded_conflicts: list[str] = []
    else:
        sticky_ids = {
            e.memory_id
            for e in prior
            if e.memory_id in by_id and by_id[e.memory_id][1].A >= req.theta_evict
        }
        for pid in sticky_ids:
            rec, br = by_id[pid]
            if br.A < req.theta_promote:
                br = br.model_copy(update={"A": req.theta_promote})
                by_id[pid] = (rec, br)
        scored = list(by_id.values())

        new_stm, excluded_conflicts = select_stm(
            scored,
            token_budget=req.token_budget,
            theta_promote=req.theta_promote,
            prior=prior,
            bond_weight=req.bond_weight,
            exclude_conflicts=req.contradiction_policy == "exclude",
        )
    new_ids = {e.memory_id for e in new_stm}
    old_ids = {e.memory_id for e in prior}
    promoted = sorted(new_ids - old_ids)
    evicted = sorted(old_ids - new_ids)

    set_stm(req.session_key, new_stm)
    auto_reinforced: list[str] = []
    replayed_memory_ids: list[str] = []
    if req.reinforce_selected and new_ids:
        reinforced, _unknown, replayed_memory_ids = reinforce_ids(
            set(by_id),
            sorted(new_ids),
            outcome=req.reinforcement_outcome,
        )
        auto_reinforced = [state.memory_id for state in reinforced]
    budget_used = sum(e.token_cost for e in new_stm)
    return ExciteResponse(
        session_key=req.session_key,
        stm=new_stm,
        promoted=promoted,
        evicted=evicted,
        scored=len(scored),
        budget_used=budget_used,
        budget_limit=req.token_budget,
        excluded_conflicts=excluded_conflicts,
        trigger=req.trigger,
        input_candidates=len(records),
        filtered_candidates=len(filtered),
        filters_applied=req.filters.model_dump(
            mode="json", exclude_defaults=True, exclude_none=True
        ),
        retrieval_weights=req.weights.model_dump(),
        graph_expanded=graph_expanded,
        graph_config=req.graph.model_dump(),
        abstained=abstention["abstained"],
        abstention_reason=abstention["reason"],
        abstention_config=req.abstention.model_dump(),
        top_evidence_score=abstention["top_evidence_score"],
        runner_up_evidence_score=abstention["runner_up_evidence_score"],
        score_margin=abstention["score_margin"],
        relative_score_margin=abstention["relative_score_margin"],
        auto_reinforced=auto_reinforced,
        replayed_memory_ids=replayed_memory_ids,
        retrieval_receipt=build_retrieval_receipt(scored, new_ids),
    )


def expand_stm_entry(
    records_by_id: dict[str, MemoryRecord],
    req: ExpandRequest,
) -> STMEntry | None:
    """Increase resolution of an STM particle; payload still provenanced to LTM."""
    stm = get_stm(req.session_key)
    idx = next((i for i, e in enumerate(stm) if e.memory_id == req.memory_id), None)
    if idx is None:
        return None
    rec = records_by_id.get(req.memory_id)
    if rec is None:
        return None
    entry = stm[idx]
    updated = _entry_from_record(rec, entry.components, resolution=req.resolution)
    updated = updated.model_copy(
        update={
            "activation": entry.activation,
            "components": entry.components,
        }
    )
    stm[idx] = updated
    set_stm(req.session_key, stm)
    return updated


def resolve_record(rec: MemoryRecord, resolution: Resolution = "summary") -> dict[str, Any]:
    """Direct LTM → resolution expand (no STM membership required)."""
    payload = render_resolution(rec, resolution)
    return {
        "memory_id": rec.id,
        "resolution": resolution,
        "payload": payload,
        "summary": make_summary(rec.content),
        "token_cost": estimate_tokens(payload),
        "provenance": {
            "source_agent": rec.source_agent,
            "session_id": rec.session_id,
            "status": rec.status,
            "confidence": rec.confidence,
            "content_sha256": rec.content_sha256,
            "subject": rec.subject,
        },
        "evidence": [e.model_dump() for e in (rec.evidence or [])],
    }


def stm_context_block(session_key: str = "default") -> str:
    """Serialize STM for LLM injection — summaries + provenance ids."""
    entries = get_stm(session_key)
    if not entries:
        return ""
    lines = ["# STM (activated working set — expand via LTM id for evidence)", ""]
    for e in entries:
        lines.append(
            f"- [{e.memory_id}] (A={e.activation:.3f}, {e.resolution}, {e.type}/{e.status}) "
            f"{e.payload}"
        )
    return "\n".join(lines)


def emr_status() -> dict[str, Any]:
    _ensure_dynamics()  # report true persisted state, not pre-load zeros
    reinforced = sorted(_REINFORCEMENT.values(), key=lambda s: -s.use_count)
    return {
        "sessions": sorted(_STM.keys()),
        "counts": {k: len(v) for k, v in _STM.items()},
        "stack": {
            "AMUL": "LTM substrate (declared/partial)",
            "Memoryboard": "LTM access/API / Continuity Ledger SoT",
            "EMR": "governed activation (this module)",
            "STM": "budgeted working set",
            "LLM": "reasoning surface (consumer)",
        },
        "role": "EMR excitation over Memoryboard LTM → STM view",
        "ltm": "jarvis-memoryboard Continuity Ledger (AMUL-backed substrate)",
        "formula": (
            "A_evidence = Q^wq * R^wr * P^wp * decay_unreinforced^wd * "
            "(1 + kappa*cos(F,R))^wf; A_base = A_evidence * "
            "min(total_reinforcement_cap, salience*decay_damp); "
            "A = A_base + wg*A_seed*path_strength"
        ),
        "capabilities": {
            "weighted_retrieval": "enforced",
            "decay": "enforced",
            "metadata_filtering": "enforced-before-scoring",
            "graph_expansion": "enforced-bounded",
            "abstention": "enforced-evidence-floor-and-margin",
            "reinforcement": "enforced-positive-outcome-and-bounded",
            "evaluation_harness": "emr-evaluation-v1-read-only",
        },
        "dynamics": {
            "sidecar": {
                "path": DYNAMICS_PATH,
                "loaded": _dynamics_loaded,
                "persisted_particles": len(_REINFORCEMENT),
                "schema": "emr-dynamics-v1",
                "note": "Retrieval dynamics only — outside the ledger; LTM stays authoritative.",
            },
            "resonance_vectors": {
                "channels": list(CHANNELS),
                "triggers": sorted(TRIGGER_PRESETS),
                "default_kappa": DEFAULT_RF_KAPPA,
            },
            "bonds": {
                "subject_weight": BOND_SUBJECT,
                "tag_weight": BOND_TAG_WEIGHT,
                "contradiction_membrane": "same subject + different content never co-admitted",
            },
            "retrieval": {
                "default_weights": RetrievalWeights().model_dump(),
                "abstention_defaults": AbstentionConfig().model_dump(),
                "metadata_filter_fields": list(MetadataFilters.model_fields),
                "graph_defaults": GraphExpansionConfig().model_dump(),
                "graph_edge_sources": [
                    "supersedes",
                    "evidence-memory-reference",
                    "shared-subject",
                    "shared-tags",
                ],
            },
            "reinforced_particles": len(_REINFORCEMENT),
            "caps": {
                "salience_gain": SALIENCE_GAIN,
                "salience_cap": SALIENCE_CAP,
                "decay_damp_gain": DAMP_GAIN,
                "decay_damp_cap": DAMP_CAP,
                "total_reinforcement_multiplier_cap": TOTAL_REINFORCEMENT_CAP,
            },
            "top": [s.model_dump() for s in reinforced[:5]],
            "rule": REINFORCEMENT_RULE,
        },
    }
