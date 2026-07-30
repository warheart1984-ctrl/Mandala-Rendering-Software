"""Continuity Ledger retrieval, conflict detection, and drift helpers."""

from __future__ import annotations

import hashlib
import re
from typing import Any

from app.models import ConflictSet, MemoryRecord, SelectionProvenance


def normalize_content(text: str) -> str:
    return re.sub(r"\s+", " ", (text or "").strip().lower())


def content_sha256(text: str) -> str:
    return hashlib.sha256(normalize_content(text).encode("utf-8")).hexdigest()


def ensure_content_hash(rec: MemoryRecord) -> MemoryRecord:
    if rec.content_sha256:
        return rec
    data = rec.model_dump()
    data["content_sha256"] = content_sha256(rec.content)
    return MemoryRecord(**data)


def build_why_selected(
    rec: MemoryRecord,
    *,
    query: str | None,
    truth_scope: str | None,
    memory_type: str | None,
    status: str | None,
) -> str:
    reasons: list[str] = []
    if query:
        q = query.lower()
        if q in rec.content.lower():
            reasons.append(f"content matched query '{query}'")
        elif any(q in t.lower() for t in rec.tags):
            reasons.append(f"tag matched query '{query}'")
        elif rec.subject and q in rec.subject.lower():
            reasons.append(f"subject matched query '{query}'")
        else:
            reasons.append(f"included under query filter '{query}'")
    if truth_scope:
        if truth_scope.lower() == "live" and rec.status != "archived":
            reasons.append("status is non-archived (truth_scope=live)")
        else:
            reasons.append(f"matched truth_scope={truth_scope}")
    if memory_type:
        reasons.append(f"type={rec.type}")
    if status:
        reasons.append(f"status={rec.status}")
    if not reasons:
        reasons.append("listed by recency (no filter)")
    reasons.append(f"source_agent={rec.source_agent}")
    reasons.append(f"session_id={rec.session_id}")
    return "; ".join(reasons)


def to_selection(
    rec: MemoryRecord,
    *,
    query: str | None = None,
    truth_scope: str | None = None,
    memory_type: str | None = None,
    status: str | None = None,
) -> SelectionProvenance:
    return SelectionProvenance(
        memory_id=rec.id,
        why_selected=build_why_selected(
            rec,
            query=query,
            truth_scope=truth_scope,
            memory_type=memory_type,
            status=status,
        ),
        source_agent=rec.source_agent,
        session_id=rec.session_id,
        created_at=rec.created_at,
        type=rec.type,
        status=rec.status,
        confidence=rec.confidence,
        supersedes=rec.supersedes,
        evidence=list(rec.evidence),
        subject=rec.subject,
    )


def _active(rec: MemoryRecord) -> bool:
    return rec.status != "archived"


def _non_superseded_ids(records: list[MemoryRecord]) -> set[str]:
    """Ids not archived and not named as supersedes target by another in-set record.

    This is a continuity graph filter (recorded replacement claims), not a truth verdict.
    """
    by_id = {r.id: r for r in records}
    superseded_targets = {
        r.supersedes for r in records if r.supersedes and r.supersedes in by_id and _active(r)
    }
    return {r.id for r in records if _active(r) and r.id not in superseded_targets}


def detect_conflicts(
    records: list[MemoryRecord],
    *,
    subject: str | None = None,
) -> list[ConflictSet]:
    """Surface disagreeing active memories sharing a subject. Never merges or picks truth."""
    groups: dict[str, list[MemoryRecord]] = {}
    for rec in records:
        if not rec.subject:
            continue
        if subject is not None and rec.subject != subject:
            continue
        groups.setdefault(rec.subject, []).append(rec)

    conflicts: list[ConflictSet] = []
    for subj, group in sorted(groups.items()):
        open_ids = _non_superseded_ids(group)
        open_recs = [r for r in group if r.id in open_ids]
        # Distinct claim hashes among non-superseded → unresolved conflict for consumers
        hashes = {r.content_sha256 or content_sha256(r.content) for r in open_recs}
        if len(open_recs) >= 2 and len(hashes) >= 2:
            conflicts.append(
                ConflictSet(
                    subject=subj,
                    unresolved=True,
                    memories=sorted(open_recs, key=lambda m: m.created_at),
                )
            )
        elif len(open_recs) >= 2 and len(hashes) == 1:
            # Same normalized content restated — still surface both; not a semantic dispute
            conflicts.append(
                ConflictSet(
                    subject=subj,
                    unresolved=False,
                    memories=sorted(open_recs, key=lambda m: m.created_at),
                    policy_hint=(
                        "Same content_sha256 across non-superseded records; duplicate continuity "
                        "entries, not a semantic conflict. Consumers may archive duplicates; "
                        "ledger does not auto-collapse or rank by confidence."
                    ),
                )
            )
    return conflicts


def drift_check(original_content: str, retrieved: MemoryRecord) -> dict[str, Any]:
    """Measurable fidelity check: normalized content hash must match baseline."""
    expected = content_sha256(original_content)
    actual = retrieved.content_sha256 or content_sha256(retrieved.content)
    return {
        "memory_id": retrieved.id,
        "expected_sha256": expected,
        "actual_sha256": actual,
        "match": expected == actual,
        "status": retrieved.status,
        "created_at": retrieved.created_at,
        "session_id": retrieved.session_id,
    }
