"""AMUL Architect — LTM substrate beneath the Jarvis Memoryboard.

Stack position (declared architecture):

    AMUL Architect   -> LTM substrate: persistence / structure / lineage
    Jarvis Board     -> LTM access/API (Continuity Ledger SoT for truth)
    EMR              -> governed excitation
    STM              -> budgeted working set
    LLM              -> reasoning surface

AMUL stores immutable, content-addressed M-particle ARTIFACTS in an
append-only JSONL field. The Continuity Ledger remains the sole truth
authority; AMUL preserves every version with lineage and provenance so
compression can never silently become truth.

Maturity (honest tags):
    append-only persistence      - enforced (tests/test_amul.py)
    resolution artifacts (3)     - enforced
    version lineage + provenance - enforced
    verify / drift protocol      - enforced (rehash + ledger cross-check)
    checkpoint compaction (GC)   - enforced (app/amul_gc.py, tests/test_amul_gc.py)
    vector index                 - declared (not implemented)
"""

from __future__ import annotations

import hashlib
import json
import os
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Literal

from pydantic import BaseModel, Field

from app.emr import make_summary, render_resolution
from app.models import MemoryRecord

ArtifactResolution = Literal["summary", "detail", "evidence"]

SCHEMA = "amul-artifact-v1"

FIELD_PATH = os.getenv("JARVIS_AMUL_PATH") or os.path.join("data", "amul-field.jsonl")

_field: "AmulField | None" = None


def sha256_text(text: str) -> str:
    return hashlib.sha256((text or "").encode("utf-8")).hexdigest()


class ProvenanceEvent(BaseModel):
    actor: str
    action: str  # anchored | superseded | verified | imported
    at: str
    ref: str | None = None


class Artifact(BaseModel):
    """Immutable M-particle artifact — one resolution of one ledger memory."""

    artifact_id: str
    ledger_id: str
    resolution: ArtifactResolution
    payload: str
    payload_sha256: str
    authority_class: str  # ledger status mirrored AT ANCHOR TIME (never updated)
    lineage_parent_ids: list[str] = Field(default_factory=list)
    derived_from: list[str] = Field(default_factory=list)  # canonical detail artifact
    provenance_chain: list[ProvenanceEvent] = Field(default_factory=list)
    created_at: str
    schema_version: str = SCHEMA


class AnchorReport(BaseModel):
    ledger_id: str
    created: list[str] = Field(default_factory=list)  # artifact ids
    unchanged: list[str] = Field(default_factory=list)  # resolutions already current


class VerifyReport(BaseModel):
    schema_version: str = SCHEMA
    artifact_count: int = 0
    integrity_ok: bool = True
    integrity_failures: list[str] = Field(default_factory=list)  # artifact ids
    drifted_ledger_ids: list[str] = Field(default_factory=list)
    unanchored_ledger_ids: list[str] = Field(default_factory=list)
    # AMUL-GC: when a valid checkpoint chain exists, covered ranges are
    # authenticated by range_sha/merkle and only the tail is payload-rehashed.
    gc_mode: str = "full_rehash"  # full_rehash | checkpoint_chain
    checkpoints_checked: int = 0
    tail_lines_rehashed: int = 0


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _artifact_id(ledger_id: str, resolution: str, sha: str, seq: int) -> str:
    return f"art-{sha[:12]}-{resolution[0]}{seq}"


class AmulField:
    """Append-only JSONL field. Existing lines are never mutated."""

    def __init__(self, path: str):
        self.path = path
        self._artifacts: dict[str, Artifact] = {}
        self._order: list[str] = []
        self._loaded = False

    # -- persistence -------------------------------------------------------

    def _ensure_loaded(self) -> None:
        if self._loaded:
            return
        self._loaded = True
        p = Path(self.path)
        if not p.exists():
            return
        try:
            for line in p.read_text(encoding="utf-8").splitlines():
                line = line.strip()
                if not line:
                    continue
                art = Artifact(**json.loads(line))
                self._artifacts[art.artifact_id] = art
                self._order.append(art.artifact_id)
        except Exception:
            # A torn tail line must not take the whole field down;
            # prefix stays loaded (append-only guarantees prefix validity).
            pass

    def append(self, artifact: Artifact) -> None:
        self._ensure_loaded()
        p = Path(self.path)
        p.parent.mkdir(parents=True, exist_ok=True)
        line = json.dumps(artifact.model_dump(), separators=(",", ":"))
        with p.open("a", encoding="utf-8") as f:
            f.write(line + "\n")
        self._artifacts[artifact.artifact_id] = artifact
        self._order.append(artifact.artifact_id)

    # -- reads ---------------------------------------------------------------

    def get(self, artifact_id: str) -> Artifact | None:
        self._ensure_loaded()
        return self._artifacts.get(artifact_id)

    @property
    def count(self) -> int:
        self._ensure_loaded()
        return len(self._order)

    def by_ledger(self, memory_id: str) -> list[Artifact]:
        self._ensure_loaded()
        arts = [self._artifacts[i] for i in self._order]
        return [a for a in arts if a.ledger_id == memory_id]

    def latest(self, memory_id: str, resolution: str) -> Artifact | None:
        arts = [a for a in self.by_ledger(memory_id) if a.resolution == resolution]
        return arts[-1] if arts else None

    def lineage(self, memory_id: str) -> dict[str, Any]:
        """Version ancestry across all resolutions, oldest first."""
        arts = self.by_ledger(memory_id)
        chain: list[dict[str, Any]] = []
        for a in arts:
            parent = a.lineage_parent_ids[0] if a.lineage_parent_ids else None
            chain.append(
                {
                    "artifact_id": a.artifact_id,
                    "resolution": a.resolution,
                    "payload_sha256": a.payload_sha256,
                    "parent": parent,
                    "created_at": a.created_at,
                }
            )
        return {"ledger_id": memory_id, "depth": len(chain), "versions": chain}

    def all(self) -> list[Artifact]:
        self._ensure_loaded()
        return [self._artifacts[i] for i in self._order]


def get_field(path: str | None = None) -> AmulField:
    global _field
    if _field is None or (path and path != _field.path):
        _field = AmulField(path or FIELD_PATH)
    return _field


def reset_field_for_tests() -> None:
    global _field
    _field = None


# --- Anchoring: Ledger truth -> immutable AMUL artifacts -------------------


def anchor_memory(rec: MemoryRecord, field: AmulField, actor: str = "amul") -> AnchorReport:
    """Anchor current ledger state as immutable artifacts (idempotent).

    Unchanged content => no-op per resolution. Changed content => NEW artifact
    whose lineage parent is the previous version — drift becomes recorded
    history, never an overwrite. Detail is anchored first so summary/evidence
    can carry derived_from pointers before their lines are appended.
    """
    field._ensure_loaded()
    ordered_payloads: list[tuple[str, str]] = [
        ("detail", rec.content),
        ("summary", make_summary(rec.content)),
        ("evidence", render_resolution(rec, "evidence")),  # type: ignore[arg-type]
    ]
    report = AnchorReport(ledger_id=rec.id)
    canonical_detail_id: str | None = None

    for resolution, payload in ordered_payloads:
        sha = sha256_text(payload)
        prev = field.latest(rec.id, resolution)
        if prev is not None and prev.payload_sha256 == sha:
            report.unchanged.append(resolution)
            if resolution == "detail":
                canonical_detail_id = prev.artifact_id
            continue

        parents = [prev.artifact_id] if prev else []
        if not parents and resolution == "detail" and rec.supersedes:
            superseded_art = field.latest(rec.supersedes, "detail")
            if superseded_art:
                parents = [superseded_art.artifact_id]

        art = Artifact(
            artifact_id=_artifact_id(rec.id, resolution, sha, field.count),
            ledger_id=rec.id,
            resolution=resolution,  # type: ignore[arg-type]
            payload=payload,
            payload_sha256=sha,
            authority_class=rec.status,
            lineage_parent_ids=parents,
            derived_from=[] if resolution == "detail" else (
                [canonical_detail_id] if canonical_detail_id else []
            ),
            provenance_chain=[
                ProvenanceEvent(
                    actor=actor,
                    action="anchored",
                    at=_now_iso(),
                    ref=f"ledger:{rec.id}@{rec.updated_at}",
                )
            ],
            created_at=_now_iso(),
        )
        field.append(art)
        report.created.append(art.artifact_id)
        if resolution == "detail":
            canonical_detail_id = art.artifact_id
    return report


def verify_field(field: AmulField, records: list[MemoryRecord]) -> VerifyReport:
    """Integrity + cross-check against live ledger state.

    Integrity is GC-aware (AMUL-GC): with a valid checkpoint chain, covered
    ranges authenticate via range_sha/merkle and only the tail is rehashed.
    Drift compares each memory's LATEST detail artifact against live content;
    older versions are preserved history, not drift.
    """
    report = VerifyReport(artifact_count=field.count)

    import app.amul_gc as amul_gc

    gcr = amul_gc.verify_gc(field)
    report.gc_mode = gcr.mode
    report.checkpoints_checked = gcr.checkpoints_checked
    report.tail_lines_rehashed = gcr.tail_lines_rehashed
    if not gcr.integrity_ok:
        report.integrity_ok = False
        report.integrity_failures.extend(gcr.integrity_failures)

    all_artifacts = field.all()

    live_by_id = {r.id: r for r in records}
    latest_detail: dict[str, Artifact] = {}
    anchored_ids: set[str] = set()
    for art in all_artifacts:  # append-order == oldest→newest
        anchored_ids.add(art.ledger_id)
        if art.resolution == "detail":
            latest_detail[art.ledger_id] = art

    for ledger_id, art in latest_detail.items():
        rec = live_by_id.get(ledger_id)
        if rec is None:
            continue  # deleted from ledger; history preserved here
        if sha256_text(rec.content) != art.payload_sha256:
            report.drifted_ledger_ids.append(ledger_id)
    report.unanchored_ledger_ids = sorted(set(live_by_id) - anchored_ids)
    return report
