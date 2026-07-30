#!/usr/bin/env python3
"""Cursor afterAgentResponse hook — cache last assistant text for sessionEnd."""

from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from jarvis_common import emit, last_response_path, read_stdin_json, truncate  # noqa: E402


def main() -> int:
    payload = read_stdin_json()
    text = payload.get("text") or ""
    if isinstance(text, str) and text.strip():
        try:
            last_response_path().write_text(truncate(text, 4000), encoding="utf-8")
        except OSError:
            pass
    emit({})
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception:  # noqa: BLE001
        emit({})
        raise SystemExit(0)
