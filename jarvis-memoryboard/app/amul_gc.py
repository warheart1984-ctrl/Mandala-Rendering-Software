"""AMUL-GC — Verifiable Checkpoint Compactor.

Stack position:

    Field (append-only truth) -> Checkpoint (sha-linked summary, NOT a rewrite)
                              -> Cold Archive (logical tier, lineage intact)

Adaptive: retention follows EMR salience, not LRU. A particle is HOT when its
ledger memory has recent reinforcement or live salience; it goes COLD after
inactivity beyond 2x its type half-life (decisions 14d, architecture 70d,
others declared below). Nothing is ever deleted — cold is a classification,
recorded in checkpoints, with hash lineage intact ("dead stays dead").

Modular: GC writes ONLY to data/amul-checkpoints.jsonl. It never touches
amul-field.jsonl or jarvis-store.json. Each checkpoint points at a line range:

    {
      "type": "checkpoint",
      "range_sha": "<sha256 of raw lines [start, end)>",
      "range_start": 0, "range_end": 10000,
      "cold_count": 732, "hot_count": 9268,
      "prev_checkpoint_sha": "...",
      "merkle_root": "...",
      "checkpoint_sha": "..."
    }

Universal: same sha256 addressing as every other AMUL artifact.

Logical hard rules (enforced):
    G1. Every artifact in a checkpoint's range is accounted for: range size ==
        hot_count + cold_count, and raw bytes rehash to range_sha/merkle_root.
    G2. No archived particle becomes hot via GC: once cold in any prior
        checkpoint, a ledger id may never be classified hot later.
    G3. Replay: any point-in-time prefix remains reconstructable from
        checkpoints + tail (ranges are contiguous from line 0).

Verify complexity: cryptographic payload rehash drops from O(all lines) to
O(tail). Covered ranges are authenticated by streaming range_sha/merkle
comparison (byte-hash I/O is unavoidable; expensive parse+payload-rehash is
not). Ledger cross-checks (drift/unanchored) are orthogonal and unchanged.

Maturity: enforced (tests/test_amul_gc.py).
"""

from __future__ import annotations

import hashlib
import json
import os
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any

from pydantic import BaseModel, Field

import app.emr as emr
from app.amul import Artifact, AmulField, _now_iso, sha256_text
from app.models import MemoryRecord

CHECKPOINT_SCHEMA = "amul-gc-checkpoint-v1"
CHECKPOINTS_PATH = os.getenv("JARVIS_AMUL_GC_PATH") or os.path.join(
    "data", "amul-checkpoints.jsonl"
)

# Adaptive retention: cold threshold = 2x half-life of the type.
HALF_LIFE_DAYS: dict[str, float] = {
    "decision": 7.0,       # cold after 14d idle
    "architecture": 35.0,  # cold after 70d idle
    "fact": 14.0,          # cold after 28d idle
    "preference": 28.0,    # cold after 56d idle
    "research": 14.0,      # cold after 28d idle
    "task": 7.0,           # cold after 14d idle
}
DEFAULT_HALF_LIFE_DAYS = 7.0

SALIENCE_HOT_FLOOR = 0.05  # live salience at/above this keeps a particle hot


class GCViolation(ValueError):
    """Raised when a compaction or verification violates AMUL-GC law."""


class Checkpoint(BaseModel):
    type: str = "checkpoint"
    schema_version: str = CHECKPOINT_SCHEMA
    range_start: int
    range_end: int
    range_sha: str
    merkle_root: str
    cold_count: int
    hot_count: int
    cold_ledger_ids: list[str] = Field(default_factory=list)
    hot_ledger_ids: list[str] = Field(default_factory=list)
    prev_checkpoint_sha: str | None = None
    checkpoint_sha: str | None = None
    created_at: str = ""
    actor: str = "amul-gc"

    def model_canonical(self) -> str:
        payload = self.model_dump(exclude={"checkpoint_sha"})
        return json.dumps(payload, separators=(",", ":"), sort_keys=True)

    def seal(self) -> "Checkpoint":
        self.checkpoint_sha = sha256_text(self.model_canonical())
        return self


class CompactReport(BaseModel):
    compacted: bool = False
    reason: str = ""
    checkpoint_sha: str | None = None
    range_start: int = 0
    range_end: int = 0
    cold_count: int = 0
    hot_count: int = 0
    total_checkpoints: int = 0


class GCVerifyReport(BaseModel):
    schema_version: str = CHECKPOINT_SCHEMA
    mode: str = "full_rehash"  # full_rehash | checkpoint_chain
    integrity_ok: bool = True
    integrity_failures: list[str] = Field(default_factory=list)
    checkpoints_checked: int = 0
    tail_lines_rehashed: int = 0
    rule_g1_ok: bool = True
    rule_g2_dead_stays_dead: bool = True
    rule_g3_chain_contiguous: bool = True


def _parse_iso(ts: str | None) -> datetime | None:
    if not ts:
        return None
    try:
        return datetime.fromisoformat(ts.replace("Z", "+00:00"))
    except ValueError:
        return None


def cold_threshold_days(mem_type: str) -> float:
    return 2.0 * HALF_LIFE_DAYS.get(mem_type, DEFAULT_HALF_LIFE_DAYS)


def classify_retention(
    records: list[MemoryRecord],
    *,
    now: datetime | None = None,
) -> dict[str, list[str]]:
    """Adaptive layer: split ledger ids into hot/cold by EMR salience law.

    Cold = no reinforcement AND no ledger update within cold_threshold_days.
    Live salience >= SALIENCE_HOT_FLOOR keeps a particle hot regardless of age.
    """
    now = now or datetime.now(timezone.utc)
    emr._ensure_dynamics()
    hot: list[str] = []
    cold: list[str] = []
    for rec in records:
        state = emr._REINFORCEMENT.get(rec.id)
        salience = state.salience if state else 0.0
        last_activity = max(
            (t for t in (_parse_iso(state.last_reinforced_at if state else None),
                         _parse_iso(rec.updated_at)) if t is not None),
            default=None,
        )
        threshold = timedelta(days=cold_threshold_days(rec.type))
        if salience >= SALIENCE_HOT_FLOOR:
            hot.append(rec.id)
            continue
        if last_activity is None:
            cold.append(rec.id)
            continue
        if now - last_activity > threshold:
            cold.append(rec.id)
        else:
            hot.append(rec.id)
    return {"hot": sorted(hot), "cold": sorted(cold)}


def _read_raw_lines(path: str) -> list[bytes]:
    p = Path(path)
    if not p.exists():
        return []
    data = p.read_bytes()
    if not data:
        return []
    lines = data.splitlines(keepends=True)
    return [ln for ln in lines if ln.strip()]


def _range_authenticators(raw_lines: list[bytes], start: int, end: int) -> tuple[str, str]:
    """Streaming range_sha + merkle_root for raw lines [start, end)."""
    hasher = hashlib.sha256()
    leaf_hashes: list[str] = []
    for raw in raw_lines[start:end]:
        hasher.update(raw)
        leaf_hashes.append(hashlib.sha256(raw).hexdigest())
    return hasher.hexdigest(), _merkle_root(leaf_hashes)


def _merkle_root(leaves: list[str]) -> str:
    if not leaves:
        return sha256_text("")
    level = list(leaves)
    while len(level) > 1:
        if len(level) % 2 == 1:
            level.append(level[-1])
        level = [
            hashlib.sha256((level[i] + level[i + 1]).encode("utf-8")).hexdigest()
            for i in range(0, len(level), 2)
        ]
    return level[0]


def _load_checkpoints(path: str) -> list[Checkpoint]:
    p = Path(path)
    if not p.exists():
        return []
    out: list[Checkpoint] = []
    for line in p.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if line:
            out.append(Checkpoint(**json.loads(line)))
    return out


def _append_checkpoint(path: str, cp: Checkpoint) -> None:
    p = Path(path)
    p.parent.mkdir(parents=True, exist_ok=True)
    line = json.dumps(cp.model_dump(), separators=(",", ":"))
    with p.open("a", encoding="utf-8") as f:
        f.write(line + "\n")


def compact(
    field: AmulField,
    records: list[MemoryRecord],
    *,
    checkpoints_path: str | None = None,
    actor: str = "amul-gc",
    now: datetime | None = None,
) -> CompactReport:
    """Seal the currently-uncheckpointed prefix of the field into one checkpoint.

    The field file itself is NEVER mutated. Classification is adaptive
    (EMR salience law); dead-stays-dead is enforced before sealing.
    """
    checkpoints_path = checkpoints_path or CHECKPOINTS_PATH
    raw_lines = _read_raw_lines(field.path)
    existing = _load_checkpoints(checkpoints_path)
    covered = existing[-1].range_end if existing else 0
    total = len(raw_lines)
    if total <= covered:
        return CompactReport(
            compacted=False,
            reason="no uncheckpointed lines",
            total_checkpoints=len(existing),
        )

    plan = classify_retention(records, now=now)
    hot_set = set(plan["hot"])
    prior_cold: set[str] = set()
    for cp in existing:
        prior_cold.update(cp.cold_ledger_ids)
    resurrected = prior_cold & hot_set
    if resurrected:
        raise GCViolation(
            f"G2 dead-stays-dead violation: previously cold particles "
            f"classified hot: {sorted(resurrected)[:5]}"
        )

    field._ensure_loaded()
    artifacts_in_range = field.all()[covered:total]
    range_hot_ids: set[str] = set()
    range_cold_ids: set[str] = set()
    for art in artifacts_in_range:
        bucket = range_hot_ids if art.ledger_id in hot_set else range_cold_ids
        bucket.add(art.ledger_id)

    range_sha, merkle = _range_authenticators(raw_lines, covered, total)
    cp = Checkpoint(
        range_start=covered,
        range_end=total,
        range_sha=range_sha,
        merkle_root=merkle,
        cold_count=sum(1 for a in artifacts_in_range if a.ledger_id in range_cold_ids),
        hot_count=sum(1 for a in artifacts_in_range if a.ledger_id in range_hot_ids),
        cold_ledger_ids=sorted(range_cold_ids),
        hot_ledger_ids=sorted(range_hot_ids),
        prev_checkpoint_sha=existing[-1].checkpoint_sha if existing else None,
        created_at=_now_iso(),
        actor=actor,
    ).seal()
    _append_checkpoint(checkpoints_path, cp)
    return CompactReport(
        compacted=True,
        reason=f"sealed lines [{cp.range_start}, {cp.range_end})",
        checkpoint_sha=cp.checkpoint_sha,
        range_start=cp.range_start,
        range_end=cp.range_end,
        cold_count=cp.cold_count,
        hot_count=cp.hot_count,
        total_checkpoints=len(existing) + 1,
    )


def _verify_chain_structure(cps: list[Checkpoint]) -> list[str]:
    failures: list[str] = []
    expected_start = 0
    prev_sha: str | None = None
    for i, cp in enumerate(cps):
        if cp.range_start != expected_start:
            failures.append(f"G3: checkpoint {i} starts at {cp.range_start}, expected {expected_start}")
        if cp.prev_checkpoint_sha != prev_sha:
            failures.append(f"G3: checkpoint {i} prev link broken")
        if cp.checkpoint_sha != sha256_text(cp.model_canonical()):
            failures.append(f"checkpoint {i} content address invalid")
        if cp.cold_count + cp.hot_count != cp.range_end - cp.range_start:
            failures.append(f"G1: checkpoint {i} counts do not cover range")
        expected_start = cp.range_end
        prev_sha = cp.checkpoint_sha
    return failures


def verify_gc(
    field: AmulField,
    *,
    checkpoints_path: str | None = None,
) -> GCVerifyReport:
    """GC-aware integrity verification.

    With a checkpoint chain: covered ranges are authenticated by streaming
    range_sha/merkle comparison (G1); only the tail is parse+rehashed.
    Without: falls back to full per-artifact rehash (mode=full_rehash).
    """
    checkpoints_path = checkpoints_path or CHECKPOINTS_PATH
    report = GCVerifyReport()
    cps = _load_checkpoints(checkpoints_path)
    raw_lines = _read_raw_lines(field.path)
    field._ensure_loaded()

    if not cps:
        report.mode = "full_rehash"
        report.tail_lines_rehashed = len(raw_lines)
        for art in field.all():
            if sha256_text(art.payload) != art.payload_sha256:
                report.integrity_ok = False
                report.integrity_failures.append(art.artifact_id)
        return report

    report.mode = "checkpoint_chain"
    report.checkpoints_checked = len(cps)
    report.integrity_failures.extend(_verify_chain_structure(cps))

    # Dead-stays-dead across the chain (G2).
    seen_cold: set[str] = set()
    for cp in cps:
        if seen_cold & set(cp.hot_ledger_ids):
            report.rule_g2_dead_stays_dead = False
            report.integrity_failures.append(
                f"G2: cold particle resurfaced hot in range [{cp.range_start}, {cp.range_end})"
            )
        seen_cold.update(cp.cold_ledger_ids)

    # Byte-authenticate every covered range (G1), rehash only the tail.
    covered_end = 0
    for cp in cps:
        range_sha, merkle = _range_authenticators(raw_lines, cp.range_start, cp.range_end)
        if range_sha != cp.range_sha or merkle != cp.merkle_root:
            report.integrity_failures.append(
                f"G1: range [{cp.range_start}, {cp.range_end}) fails range_sha/merkle"
            )
        covered_end = max(covered_end, cp.range_end)

    ordered = field.all()
    tail = ordered[covered_end:]
    report.tail_lines_rehashed = len(tail)
    for art in tail:
        if sha256_text(art.payload) != art.payload_sha256:
            report.integrity_ok = False
            report.integrity_failures.append(art.artifact_id)

    if report.integrity_failures:
        report.integrity_ok = False
    report.rule_g1_ok = not any(f.startswith("G1") for f in report.integrity_failures)
    report.rule_g3_chain_contiguous = not any(
        f.startswith("G3") for f in report.integrity_failures
    )
    return report


def reconstruct_prefix(field: AmulField, n_lines: int) -> list[Artifact]:
    """Logical rule G3 helper: point-in-time reconstruction from checkpoints+tail.

    The append-only field plus contiguous checkpoint ranges means the first
    n_lines entries are always recoverable exactly as they were.
    """
    field._ensure_loaded()
    return field.all()[:n_lines]


def gc_status(
    field: AmulField, *, checkpoints_path: str | None = None
) -> dict[str, Any]:
    checkpoints_path = checkpoints_path or CHECKPOINTS_PATH
    cps = _load_checkpoints(checkpoints_path)
    covered = cps[-1].range_end if cps else 0
    return {
        "schema": CHECKPOINT_SCHEMA,
        "path": checkpoints_path,
        "total_checkpoints": len(cps),
        "covered_lines": covered,
        "field_lines": field.count,
        "tail_lines": max(0, field.count - covered),
        "cold_ledger_ids_total": len(
            {lid for cp in cps for lid in cp.cold_ledger_ids}
        ),
        "half_life_days": dict(HALF_LIFE_DAYS),
        "note": "GC never mutates the field; checkpoints are sha-linked summaries.",
    }
