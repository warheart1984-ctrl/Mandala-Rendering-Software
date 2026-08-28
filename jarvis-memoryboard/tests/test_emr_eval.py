from __future__ import annotations

import json
from datetime import datetime, timezone

from app.continuity import content_sha256
from app.emr_eval import (
    EVAL_SCHEMA,
    build_ledger_cases,
    load_human_cases,
    render_markdown,
    run_evaluation,
)
from app.models import MemoryRecord


def _record(**updates) -> MemoryRecord:
    now = datetime.now(timezone.utc).isoformat()
    base = {
        "id": "mem-alpha",
        "content": "Asterion reactor uses governed phase memory.",
        "created_at": now,
        "updated_at": now,
        "source_agent": "eval-test",
        "session_id": "session-alpha",
        "type": "architecture",
        "confidence": 0.95,
        "evidence": [],
        "supersedes": None,
        "status": "verified",
        "subject": "asterion-reactor",
        "tags": ["asterion", "phase"],
    }
    base.update(updates)
    base.setdefault("content_sha256", content_sha256(base["content"]))
    return MemoryRecord(**base)


def _fixture_records() -> list[MemoryRecord]:
    return [
        _record(),
        _record(
            id="mem-alpha-v2",
            content="Asterion rotor calibration follows the phase memory decision.",
            session_id="session-alpha-v2",
            supersedes="mem-alpha",
            tags=["asterion", "calibration"],
            content_sha256=content_sha256(
                "Asterion rotor calibration follows the phase memory decision."
            ),
        ),
        _record(
            id="mem-beta",
            content="Garden irrigation runs at dawn.",
            session_id="session-beta",
            type="fact",
            confidence=0.8,
            subject="garden-irrigation",
            tags=["garden", "water"],
            content_sha256=content_sha256("Garden irrigation runs at dawn."),
        ),
    ]


def _write_ledger(path, records: list[MemoryRecord]) -> None:
    path.write_text(
        json.dumps(
            {
                "schema": "continuity-ledger-v1",
                "board": {},
                "memories": [record.model_dump() for record in records],
            }
        ),
        encoding="utf-8",
    )


def test_ledger_cases_are_deterministic_and_session_spanning():
    records = _fixture_records()
    first = build_ledger_cases(records, max_cases=8)
    second = build_ledger_cases(records, max_cases=8)
    assert [case.case_id for case in first] == [case.case_id for case in second]
    assert len({case.session_id for case in first}) == 3
    alpha = next(case for case in first if case.session_id == "session-alpha")
    assert "mem-alpha" in alpha.relevant_ids
    assert "mem-alpha-v2" in alpha.relevant_ids


def test_human_labels_override_proxy_quality(tmp_path):
    records = _fixture_records()
    labels = tmp_path / "labels.jsonl"
    labels.write_text(
        json.dumps(
            {
                "case_id": "human-1",
                "query": "Which memory defines Asterion phase behavior?",
                "relevant_ids": ["mem-alpha"],
                "notes": "Reviewed by operator.",
            }
        )
        + "\n",
        encoding="utf-8",
    )
    cases = load_human_cases(labels, records)
    assert len(cases) == 1
    assert cases[0].label_quality == "human-adjudicated"
    assert cases[0].relevant_hashes


def test_evaluation_measures_safety_and_preserves_files(tmp_path):
    records = _fixture_records()
    ledger = tmp_path / "ledger.json"
    dynamics = tmp_path / "dynamics.json"
    _write_ledger(ledger, records)
    dynamics.write_text(
        json.dumps({"schema": "emr-dynamics-v1", "reinforcement": {}}),
        encoding="utf-8",
    )
    ledger_before = ledger.read_bytes()
    dynamics_before = dynamics.read_bytes()

    report = run_evaluation(
        ledger_path=ledger,
        dynamics_path=dynamics,
        max_cases=3,
        contradiction_probes=1,
        reinforcement_probes=1,
        reinforcement_uses=3,
    )

    assert report["schema"] == EVAL_SCHEMA
    assert report["status"] in {"pass", "pass_with_findings"}
    assert report["safety_status"] == "pass"
    assert all(report["safety_gates"].values())
    assert report["metrics"]["contradiction"]["exclude_leaks"] == 0
    assert report["metrics"]["reinforcement_bias"]["truth_mutations"] == 0
    assert report["metrics"]["reinforcement_bias"]["sidecar_isolated"] is True
    assert ledger.read_bytes() == ledger_before
    assert dynamics.read_bytes() == dynamics_before

    markdown = render_markdown(report)
    assert "Jarvis EMR Evaluation Report" in markdown
    assert "Scientific claim boundary" in markdown
    assert "PASS" in markdown
