"""Shared helpers for Jarvis Continuity Ledger Cursor hooks."""

from __future__ import annotations

import json
import os
import sys
import urllib.error
import urllib.request
from pathlib import Path
from typing import Any

DEFAULT_BASE = "http://127.0.0.1:8001"
TIMEOUT_SEC = 4.0
MAX_CONTEXT_CHARS = 12000
MAX_MEMORY_CONTENT = 1900  # API limit is 2000


def base_url() -> str:
    return (
        os.environ.get("JARVIS_MEMORYBOARD_URL")
        or os.environ.get("DIRECTOR_MEMORYBOARD_BASE_URL")
        or DEFAULT_BASE
    ).rstrip("/")


def repo_root() -> Path:
    # agent-hooks/ -> jarvis-memoryboard/ -> repo root
    return Path(__file__).resolve().parents[2]


def state_dir() -> Path:
    d = repo_root() / ".cursor" / "hooks" / "state"
    d.mkdir(parents=True, exist_ok=True)
    return d


def context_path() -> Path:
    return state_dir() / "jarvis-live-context.md"


def last_response_path() -> Path:
    return state_dir() / "jarvis-last-response.txt"


def session_meta_path() -> Path:
    return state_dir() / "jarvis-session-meta.json"


def read_stdin_json() -> dict[str, Any]:
    raw = sys.stdin.read()
    if not raw.strip():
        return {}
    try:
        data = json.loads(raw)
        return data if isinstance(data, dict) else {}
    except json.JSONDecodeError:
        return {}


def http_json(method: str, path: str, body: dict[str, Any] | None = None) -> dict[str, Any]:
    url = f"{base_url()}{path}"
    data = None
    headers = {"Accept": "application/json"}
    if body is not None:
        data = json.dumps(body).encode("utf-8")
        headers["Content-Type"] = "application/json"
    req = urllib.request.Request(url, data=data, headers=headers, method=method)
    with urllib.request.urlopen(req, timeout=TIMEOUT_SEC) as resp:
        payload = json.loads(resp.read().decode("utf-8"))
        return payload if isinstance(payload, dict) else {}


def try_http_json(
    method: str, path: str, body: dict[str, Any] | None = None
) -> tuple[dict[str, Any] | None, str | None]:
    try:
        return http_json(method, path, body), None
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="replace")[:300]
        return None, f"HTTP {exc.code}: {detail}"
    except Exception as exc:  # noqa: BLE001 — fail-open for hooks
        return None, str(exc)


def emit(obj: dict[str, Any]) -> None:
    # Windows hook hosts often use cp1252; force UTF-8 for JSON payloads.
    payload = json.dumps(obj, ensure_ascii=False)
    try:
        sys.stdout.reconfigure(encoding="utf-8")  # type: ignore[attr-defined]
    except Exception:  # noqa: BLE001
        pass
    try:
        sys.stdout.write(payload)
    except UnicodeEncodeError:
        sys.stdout.buffer.write(payload.encode("utf-8"))
    sys.stdout.flush()


def truncate(text: str, limit: int) -> str:
    text = text.strip()
    if len(text) <= limit:
        return text
    return text[: max(0, limit - 20)].rstrip() + "\n…[truncated]"


def format_live_context(
    board: dict[str, Any] | None,
    memories: list[dict[str, Any]],
    *,
    selections: list[dict[str, Any]] | None = None,
    conflicts: list[dict[str, Any]] | None = None,
    error: str | None = None,
) -> str:
    lines: list[str] = [
        "# Jarvis Continuity Ledger — live cross-chat context",
        "",
        "Evidence-backed decisions/facts (not chat dumps). Consumers decide independently.",
        "Prefer POST type=decision with evidence + session_id; resolve conflicts via supersedes/status.",
        "",
        f"Base URL: `{base_url()}`",
        "",
    ]
    if error:
        lines.extend(
            [
                f"**Service unavailable:** {error}",
                "Start it with: `jarvis-memoryboard/scripts/start-memoryboard.ps1`",
                "",
            ]
        )
        return "\n".join(lines)

    board_obj = (board or {}).get("memory_board") or board or {}
    summary = (board_obj.get("summary") or "").strip() or "(empty)"
    board_id = board_obj.get("board_id") or "default_board"
    lines.extend(
        [
            f"## Board (`{board_id}`)",
            "",
            summary,
            "",
            f"## Live ledger entries ({len(memories)})",
            "",
        ]
    )
    if not memories:
        lines.append("_No live memories._")
    else:
        sel_by_id = {
            s.get("memory_id"): s for s in (selections or []) if isinstance(s, dict)
        }
        for mem in memories:
            mid = mem.get("id", "?")
            mtype = mem.get("type") or mem.get("category") or "?"
            status = mem.get("status") or "?"
            src = mem.get("source_agent") or "?"
            sess = mem.get("session_id") or "?"
            content = (mem.get("content") or "").replace("\n", " ").strip()
            if len(content) > 220:
                content = content[:217] + "..."
            why = (sel_by_id.get(mid) or {}).get("why_selected") or ""
            why_bit = f" | why: {why[:120]}" if why else ""
            lines.append(
                f"- `{mid}` ({mtype}/{status} from {src} sess={sess}): {content}{why_bit}"
            )
    if conflicts:
        lines.extend(["", "## Unresolved conflicts (do not merge)", ""])
        for c in conflicts:
            if not c.get("unresolved"):
                continue
            subj = c.get("subject") or "?"
            ids = ", ".join(m.get("id", "?") for m in (c.get("memories") or []))
            lines.append(
                f"- subject=`{subj}` ids=[{ids}] — resolve via supersedes or archive"
            )
    lines.extend(
        [
            "",
            "## Agent obligations",
            "",
            "1. Prefer verified decisions/architecture over draft session facts.",
            "2. Before ending substantive work, POST type=decision with source_agent, session_id, evidence.",
            "3. Never silently merge conflicts; use supersedes / status=archived.",
            "4. PATCH `/api/jarvis/memory/board` when durable workspace state changes.",
            "",
        ]
    )
    return truncate("\n".join(lines), MAX_CONTEXT_CHARS)


def write_context_file(text: str) -> Path:
    path = context_path()
    path.write_text(text, encoding="utf-8")
    return path
