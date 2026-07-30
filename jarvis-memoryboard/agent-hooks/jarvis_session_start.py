#!/usr/bin/env python3
"""Cursor sessionStart hook — load Continuity Ledger into agent context."""

from __future__ import annotations

import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from jarvis_common import (  # noqa: E402
    emit,
    format_live_context,
    read_stdin_json,
    session_meta_path,
    try_http_json,
    write_context_file,
)


def main() -> int:
    payload = read_stdin_json()
    session_id = payload.get("session_id") or payload.get("conversation_id") or ""
    meta = {
        "session_id": session_id,
        "composer_mode": payload.get("composer_mode"),
        "is_background_agent": payload.get("is_background_agent"),
        "transcript_path": payload.get("transcript_path"),
    }
    try:
        session_meta_path().write_text(json.dumps(meta, indent=2), encoding="utf-8")
    except OSError:
        pass

    board, board_err = try_http_json("GET", "/api/jarvis/memory/board")
    # Prefer retrieve envelope (provenance + conflicts). Fall back to list.
    mem_body, mem_err = try_http_json(
        "GET", "/api/jarvis/memory/retrieve?truth_scope=live&limit=32"
    )
    if mem_body is None:
        mem_body, mem_err = try_http_json(
            "GET", "/api/jarvis/memory?truth_scope=live&limit=32"
        )
    err = board_err or mem_err
    memories = (mem_body or {}).get("memories") if mem_body else []
    selections = (mem_body or {}).get("selections") if mem_body else []
    conflicts = (mem_body or {}).get("conflicts") if mem_body else []
    if not isinstance(memories, list):
        memories = []
    if not isinstance(selections, list):
        selections = []
    if not isinstance(conflicts, list):
        conflicts = []

    context = format_live_context(
        board,
        memories,
        selections=selections,
        conflicts=conflicts,
        error=err,
    )
    try:
        write_context_file(context)
    except OSError:
        pass

    out = {
        "additional_context": context,
        "env": {
            "JARVIS_MEMORYBOARD_URL": (
                __import__("os").environ.get("JARVIS_MEMORYBOARD_URL")
                or "http://127.0.0.1:8001"
            ),
            "JARVIS_SESSION_ID": str(session_id),
        },
    }
    emit(out)
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception:  # noqa: BLE001 — hooks must fail open
        emit({})
        raise SystemExit(0)
