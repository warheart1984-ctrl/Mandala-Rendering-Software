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
  A_i = Q_i * R_i * P_i * exp(-D_i * age_hours)
"""

from __future__ import annotations

import json
import math
import os
import re
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Literal

from pydantic import BaseModel, Field

from app.models import MemoryRecord

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


# Bounded gains — a particle can never dominate context by repetition alone.
SALIENCE_GAIN = 0.05
SALIENCE_CAP = 0.5
DAMP_GAIN = 0.03
DAMP_CAP = 0.5

REINFORCEMENT_RULE = (
    "Reinforcement strengthens retrievability (salience up, decay damped) "
    "within hard caps; truth/authority (status, confidence, content) remain "
    "independently certified by the Continuity Ledger and are never mutated."
)

_REINFORCEMENT: dict[str, ReinforcementState] = {}

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
    try:
        p = Path(DYNAMICS_PATH)
        p.parent.mkdir(parents=True, exist_ok=True)
        tmp = p.with_suffix(p.suffix + ".tmp")
        payload = {
            "schema": "emr-dynamics-v1",
            "saved_at": datetime.now(timezone.utc).isoformat(),
            "note": "EMR retrieval dynamics only — NOT truth; ledger is authoritative.",
            "reinforcement": {k: v.model_dump() for k, v in sorted(_REINFORCEMENT.items())},
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


class ExciteResponse(BaseModel):
    session_key: str
    stm: list[STMEntry]
    promoted: list[str]
    evicted: list[str]
    scored: int
    budget_used: int
    budget_limit: int
    formula: str = (
        "A = Q * R * P * exp(-D_eff * age_hours) * (1 + salience) * (1 + kappa*cos(F,R))"
    )
    excluded_conflicts: list[str] = Field(default_factory=list)
    trigger: str | None = None


class ExpandRequest(BaseModel):
    memory_id: str
    resolution: Resolution = "detail"
    session_key: str = "default"


class ReinforceRequest(BaseModel):
    memory_ids: list[str] = Field(..., min_length=1, max_length=64)
    session_key: str = Field(default="default", max_length=128)


class ReinforcedItem(BaseModel):
    memory_id: str
    use_count: int
    salience: float
    decay_damp: float
    last_reinforced_at: str | None = None


class ReinforceResponse(BaseModel):
    reinforced: list[ReinforcedItem]
    unknown_ids: list[str]
    ltm_mutations: int = 0
    rule: str = REINFORCEMENT_RULE


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
    _STM.clear()
    _REINFORCEMENT.clear()


def get_reinforcement(memory_id: str) -> ReinforcementState | None:
    return _REINFORCEMENT.get(memory_id)


def reinforce_ids(known_ids: set[str], requested: list[str]) -> tuple[list[ReinforcementState], list[str]]:
    """Apply bounded reinforcement to known LTM ids; report unknowns.

    Mutates only the EMR dynamics overlay (persisted to the sidecar) —
    never the Continuity Ledger.
    """
    _ensure_dynamics()
    now_iso = datetime.now(timezone.utc).isoformat()
    reinforced: list[ReinforcementState] = []
    unknown: list[str] = []
    for mid in requested:
        if mid not in known_ids:
            unknown.append(mid)
            continue
        state = _REINFORCEMENT.get(mid) or ReinforcementState(memory_id=mid)
        state.use_count += 1
        state.salience = min(SALIENCE_CAP, state.salience + SALIENCE_GAIN)
        state.decay_damp = min(DAMP_CAP, state.decay_damp + DAMP_GAIN)
        state.last_reinforced_at = now_iso
        _REINFORCEMENT[mid] = state
        reinforced.append(state)
    save_dynamics()
    return reinforced, unknown


def _tokenize(text: str) -> set[str]:
    return {m.group(0).lower() for m in _WORD_RE.finditer(text or "")}


def _parse_ts(iso: str) -> datetime | None:
    if not iso:
        return None
    try:
        return datetime.fromisoformat(iso.replace("Z", "+00:00"))
    except ValueError:
        return None


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
) -> ActivationBreakdown:
    Q = query_alignment(rec, query)
    R = resonance(rec, trajectory or [], prior_stm_ids or [])
    P = provenance_authority(rec)
    _, age_hours, D = decay_factor(rec, now=now)
    dyn = _REINFORCEMENT.get(rec.id)
    salience = dyn.salience if dyn else 0.0
    damp = dyn.decay_damp if dyn else 0.0
    D_eff = D * (1.0 - damp)
    decay = math.exp(-D_eff * age_hours)
    F = resonance_vector(rec, now=now) if intent_f is not None else {}
    sim = sim_rf(F, intent_f) if intent_f is not None else 0.0
    A = Q * R * P * decay * (1.0 + salience) * (1.0 + rf_kappa * sim)
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
) -> ExciteResponse:
    """Run EMR over LTM candidates → new STM view for session_key."""
    _ensure_dynamics()
    if req.trigger and req.trigger not in TRIGGER_PRESETS:
        raise ValueError(
            f"unknown trigger: {req.trigger!r}; known: {sorted(TRIGGER_PRESETS)}"
        )
    prior = get_stm(req.session_key)
    prior_ids = list(req.prior_stm_ids) or [e.memory_id for e in prior]

    candidates = [r for r in records if r.status != "archived"][: req.candidate_limit]

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
        )
        scored.append((rec, br))

    # Hysteresis: keep prior entries above theta_evict even if below promote
    by_id = {r.id: (r, br) for r, br in scored}
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
            "A = Q * R * P * exp(-D_eff * age_hours) * (1 + salience) "
            "* (1 + kappa*cos(F,R))"
        ),
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
            "reinforced_particles": len(_REINFORCEMENT),
            "caps": {
                "salience_gain": SALIENCE_GAIN,
                "salience_cap": SALIENCE_CAP,
                "decay_damp_gain": DAMP_GAIN,
                "decay_damp_cap": DAMP_CAP,
            },
            "top": [s.model_dump() for s in reinforced[:5]],
            "rule": REINFORCEMENT_RULE,
        },
    }
