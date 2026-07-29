"""Learning layer — append-only candidate store (no policy mutation)."""

from __future__ import annotations

import json
import os
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from app.idac.core.contracts import EvidenceContract, IntentContract

_DEFAULT_STORE = (
    Path(__file__).resolve().parents[3] / "data" / "idac-learning-candidates.jsonl"
)


def learning_store_path() -> Path:
    raw = (os.getenv("IDAC_LEARNING_STORE_PATH") or "").strip()
    return Path(raw) if raw else _DEFAULT_STORE


def learning_store_stats(*, tail: int = 5) -> dict[str, Any]:
    path = learning_store_path()
    if not path.is_file():
        return {
            "status": "partial",
            "exists": False,
            "count": 0,
            "store_path": str(path),
            "tail": [],
        }
    lines = [ln for ln in path.read_text(encoding="utf-8").splitlines() if ln.strip()]
    tail_rows: list[dict[str, Any]] = []
    for ln in lines[-tail:]:
        try:
            tail_rows.append(json.loads(ln))
        except json.JSONDecodeError:
            tail_rows.append({"raw": ln[:120]})
    return {
        "status": "partial",
        "exists": True,
        "count": len(lines),
        "store_path": str(path),
        "tail": tail_rows,
        "note": "Append-only JSONL; no policy mutation",
    }


def record_learning_candidate(
    *,
    intent: IntentContract,
    evidence: EvidenceContract,
    validation: dict[str, Any],
) -> dict[str, Any]:
    """Append validated bundle reference to JSONL store; does not mutate invariants."""
    if validation.get("verdict") != "pass":
        return {
            "status": "declared",
            "recorded": False,
            "reason": "no_learning_without_validated_evidence",
        }

    entry = {
        "recorded_at": datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z"),
        "intent_ref": intent.id,
        "evidence_ref": evidence.id,
        "plan_ref": evidence.plan_ref,
        "candidate_kind": "validated_execution_bundle",
        "validation_verdict": validation.get("verdict"),
        "note": "Append-only learning candidate; no adaptation loop",
    }
    path = learning_store_path()
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("a", encoding="utf-8") as handle:
        handle.write(json.dumps(entry, ensure_ascii=False) + "\n")

    return {
        "status": "partial",
        "recorded": True,
        "intent_ref": intent.id,
        "evidence_ref": evidence.id,
        "candidate_kind": "validated_execution_bundle",
        "store_path": str(path),
        "note": "File-backed JSONL; no policy mutation or adaptation loop",
    }
