#!/usr/bin/env python3
"""Stdio MCP server — exposes ``emr_recall`` to assistant hosts.

Proxies tool calls to the Jarvis Memoryboard HTTP API:
  POST {JARVIS_MEMORYBOARD_URL}/api/jarvis/tools/emr_recall

Transport: JSON-RPC 2.0 over stdin/stdout (MCP 2024-11-05 / 2025-03-26 compatible).
"""

from __future__ import annotations

import json
import os
import sys
import urllib.error
import urllib.request
from typing import Any

PROTOCOL_VERSION = "2024-11-05"
SERVER_NAME = "jarvis-emr-recall"
SERVER_VERSION = "0.1.0"
DEFAULT_BASE_URL = "http://127.0.0.1:8001"

EMR_RECALL_TOOL: dict[str, Any] = {
    "name": "emr_recall",
    "description": (
        "Read-only Electrom-Matic Recall over the Continuity Ledger. "
        "Returns a governed memory bundle for the given intent and query. "
        "Does not write, reinforce, or mutate ledger truth."
    ),
    "inputSchema": {
        "type": "object",
        "properties": {
            "intent": {
                "description": "Recall wave: operation string or structured intent object",
                "oneOf": [
                    {"type": "string"},
                    {
                        "type": "object",
                        "properties": {
                            "operation": {"type": "string"},
                            "domain": {"type": "string"},
                            "project": {"type": "string"},
                            "authority_required": {"type": "string"},
                        },
                        "required": ["operation"],
                    },
                ],
            },
            "query": {
                "type": "string",
                "description": "Natural-language recall query",
            },
            "subjects": {
                "type": "array",
                "items": {"type": "string"},
                "description": "Subject filters (e.g. image-signature, creative-style)",
            },
            "tags_any": {
                "type": "array",
                "items": {"type": "string"},
            },
            "types": {
                "type": "array",
                "items": {"type": "string"},
            },
            "statuses": {
                "type": "array",
                "items": {"type": "string"},
            },
            "max_memories": {
                "type": "integer",
                "minimum": 1,
                "maximum": 32,
                "default": 8,
            },
            "truth_scope": {
                "type": "string",
                "default": "live",
            },
            "session_key": {
                "type": "string",
                "default": "tool-emr-recall",
            },
            "include_provenance": {
                "type": "boolean",
                "default": True,
            },
        },
        "required": ["intent", "query"],
    },
}


def base_url() -> str:
    return os.environ.get("JARVIS_MEMORYBOARD_URL", DEFAULT_BASE_URL).rstrip("/")


def _send(message: dict[str, Any]) -> None:
    sys.stdout.write(json.dumps(message, separators=(",", ":")) + "\n")
    sys.stdout.flush()


def _reply(request_id: Any, result: dict[str, Any]) -> None:
    _send({"jsonrpc": "2.0", "id": request_id, "result": result})


def _error(request_id: Any, code: int, message: str) -> None:
    _send(
        {
            "jsonrpc": "2.0",
            "id": request_id,
            "error": {"code": code, "message": message},
        }
    )


def call_emr_recall(arguments: dict[str, Any]) -> dict[str, Any]:
    """POST emr_recall to the memoryboard HTTP API."""
    url = f"{base_url()}/api/jarvis/tools/emr_recall"
    payload = json.dumps(arguments).encode("utf-8")
    headers = {"Content-Type": "application/json", "Accept": "application/json"}
    api_key = (os.environ.get("EMR_RECALL_API_KEY") or "").strip()
    if api_key:
        headers["Authorization"] = f"Bearer {api_key}"
    req = urllib.request.Request(
        url,
        data=payload,
        headers=headers,
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=60) as resp:
            body = resp.read().decode("utf-8")
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"memoryboard HTTP {exc.code}: {detail}") from exc
    except urllib.error.URLError as exc:
        raise RuntimeError(
            f"memoryboard unreachable at {base_url()}: {exc.reason}. "
            "Start jarvis-memoryboard (uvicorn app.main:app --port 8001)."
        ) from exc

    return json.loads(body)


def handle_tools_call(params: dict[str, Any]) -> dict[str, Any]:
    name = params.get("name")
    arguments = params.get("arguments") or {}
    if name != "emr_recall":
        return {
            "content": [{"type": "text", "text": f"unknown tool: {name}"}],
            "isError": True,
        }
    try:
        result = call_emr_recall(arguments)
    except (RuntimeError, json.JSONDecodeError) as exc:
        return {
            "content": [{"type": "text", "text": str(exc)}],
            "isError": True,
        }
    return {
        "content": [{"type": "text", "text": json.dumps(result, indent=2)}],
        "structuredContent": result,
        "isError": False,
    }


def handle_message(message: dict[str, Any]) -> bool:
    """Handle one JSON-RPC message. Returns False when the server should exit."""
    method = message.get("method")
    request_id = message.get("id")

    if method == "initialize":
        requested = (message.get("params") or {}).get("protocolVersion")
        negotiated = requested if requested else PROTOCOL_VERSION
        _reply(
            request_id,
            {
                "protocolVersion": negotiated,
                "capabilities": {"tools": {"listChanged": False}},
                "serverInfo": {"name": SERVER_NAME, "version": SERVER_VERSION},
            },
        )
        return True

    if method == "notifications/initialized":
        return True

    if method == "notifications/cancelled":
        return True

    if method == "tools/list":
        _reply(request_id, {"tools": [EMR_RECALL_TOOL]})
        return True

    if method == "tools/call":
        _reply(request_id, handle_tools_call(message.get("params") or {}))
        return True

    if method == "ping":
        _reply(request_id, {})
        return True

    if request_id is not None:
        _error(request_id, -32601, f"Unknown method: {method}")
    return True


def run_stdio() -> None:
    for line in sys.stdin:
        if not line.strip():
            continue
        try:
            message = json.loads(line)
        except json.JSONDecodeError as exc:
            print(f"invalid JSON: {exc}", file=sys.stderr, flush=True)
            continue
        if not handle_message(message):
            break


if __name__ == "__main__":
    run_stdio()
