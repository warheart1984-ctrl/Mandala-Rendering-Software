#!/usr/bin/env python3
"""Cursor sessionEnd hook — prefer decision/evidence extracts over chat dumps.

Clause V (CONSTITUTIONAL_BOUNDARY_CLAUSE.md): Memory is excluded from continuity.
This hook is transitional/partial — it may still POST draft fact stubs when no
decision markers are found. Migrate toward CES-shaped evidence writes or keep
transient notes off the constitutional CCS path.
"""

from __future__ import annotations

import json
import re
import sys
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from jarvis_common import (  # noqa: E402
    MAX_MEMORY_CONTENT,
    emit,
    last_response_path,
    read_stdin_json,
    session_meta_path,
    truncate,
    try_http_json,
)

_DECISION_MARKERS = re.compile(
    r"(?i)\b(decided|decision|accepted|approved|will use|must |shall |"
    r"architectural(?:ly)?|we (?:chose|choose|adopt)|so\.?t\b|canonical)\b"
)


def _load_meta() -> dict:
    path = session_meta_path()
    if not path.is_file():
        return {}
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
        return data if isinstance(data, dict) else {}
    except (OSError, json.JSONDecodeError):
        return {}


def _load_last_response() -> str:
    path = last_response_path()
    if not path.is_file():
        return ""
    try:
        return path.read_text(encoding="utf-8").strip()
    except OSError:
        return ""


def _extract_decision_lines(text: str) -> list[str]:
    lines = []
    for raw in text.splitlines():
        line = raw.strip().lstrip("-*• ").strip()
        if len(line) < 20:
            continue
        if _DECISION_MARKERS.search(line):
            lines.append(line)
    return lines[:5]


def main() -> int:
    payload = read_stdin_json()
    meta = _load_meta()
    session_id = (
        payload.get("session_id")
        or meta.get("session_id")
        or payload.get("conversation_id")
        or "unknown"
    )
    reason = payload.get("reason") or payload.get("final_status") or "ended"
    last = _load_last_response()
    stamp = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%MZ")

    decisions = _extract_decision_lines(last) if last else []
    if decisions:
        content = truncate(
            f"Session {session_id} decisions ({stamp}): " + " | ".join(decisions),
            MAX_MEMORY_CONTENT,
        )
        mem_type = "decision"
        confidence = 0.55
        status = "draft"
        subject = "session-decisions"
    else:
        # Prefer a short fact stub over dumping the full chat.
        excerpt = truncate(last.replace("\n", " "), 400) if last else "no cached response"
        content = truncate(
            f"Session {session_id} ended ({reason}) at {stamp}. Outcome note: {excerpt}",
            MAX_MEMORY_CONTENT,
        )
        mem_type = "fact"
        confidence = 0.3
        status = "draft"
        subject = "session-end"

    body = {
        "content": content,
        "source_agent": "cursor-sessionEnd",
        "session_id": str(session_id)[:128],
        "type": mem_type,
        "confidence": confidence,
        "status": status,
        "subject": subject,
        "evidence": [
            {
                "kind": "hook",
                "ref": "agent-hooks/jarvis_session_end.py",
                "note": "auto sessionEnd; prefer agent-posted verified decisions",
            }
        ],
        "tags": ["cursor-session", "auto-sessionEnd", mem_type],
    }
    try_http_json("POST", "/api/jarvis/memory", body)
    emit({})
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception:  # noqa: BLE001
        emit({})
        raise SystemExit(0)
