"""Shared MCP protocol surface — stdio and Streamable HTTP.

Exposes **only** read-only ``emr_recall``. No write / reinforce / correct / CRUD tools.
"""

from __future__ import annotations

import json
from typing import Any, Callable

PROTOCOL_VERSION = "2025-03-26"
PROTOCOL_VERSION_LEGACY = "2024-11-05"
SERVER_NAME = "jarvis-emr-recall"
SERVER_VERSION = "0.2.0"

# Callable that runs emr_recall and returns a JSON-serializable dict.
EmrRecallCaller = Callable[[dict[str, Any]], dict[str, Any]]

EMR_RECALL_TOOL: dict[str, Any] = {
    "name": "emr_recall",
    "description": (
        "Read-only Electrom-Matic Recall over the Continuity Ledger. "
        "Returns a governed memory bundle for the given intent and query. "
        "Does not write, reinforce, or mutate ledger truth. "
        "May abstain when evidence is insufficient; surfaces unresolved conflicts."
    ),
    "annotations": {
        "readOnlyHint": True,
        "destructiveHint": False,
        "idempotentHint": True,
        "openWorldHint": False,
    },
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


def handle_tools_call(
    params: dict[str, Any],
    call_emr_recall: EmrRecallCaller,
) -> dict[str, Any]:
    name = params.get("name")
    arguments = params.get("arguments") or {}
    if name != "emr_recall":
        return {
            "content": [{"type": "text", "text": f"unknown tool: {name}"}],
            "isError": True,
        }
    try:
        result = call_emr_recall(arguments if isinstance(arguments, dict) else {})
    except Exception as exc:  # noqa: BLE001 — surface as tool error to host
        return {
            "content": [{"type": "text", "text": str(exc)}],
            "isError": True,
        }
    return {
        "content": [{"type": "text", "text": json.dumps(result, indent=2)}],
        "structuredContent": result,
        "isError": False,
    }


def _initialize_result(params: dict[str, Any] | None) -> dict[str, Any]:
    requested = (params or {}).get("protocolVersion")
    if requested in (PROTOCOL_VERSION, PROTOCOL_VERSION_LEGACY):
        negotiated = requested
    else:
        negotiated = PROTOCOL_VERSION
    return {
        "protocolVersion": negotiated,
        "capabilities": {
            "tools": {"listChanged": False},
        },
        "serverInfo": {"name": SERVER_NAME, "version": SERVER_VERSION},
        "instructions": (
            "Read-only EMR recall. Use emr_recall to fetch governed Continuity Ledger "
            "memories. The tool may abstain; do not invent memories. No write tools."
        ),
    }


def dispatch_rpc(
    message: dict[str, Any],
    call_emr_recall: EmrRecallCaller,
) -> dict[str, Any] | None:
    """Dispatch one JSON-RPC MCP message.

    Returns a JSON-RPC response dict, or ``None`` for notifications (no body).
    """
    method = message.get("method")
    request_id = message.get("id")
    params = message.get("params") or {}

    # Notifications have no id (or explicitly null) and return no response body.
    is_notification = "id" not in message or message.get("id") is None

    if method == "notifications/initialized":
        return None
    if method == "notifications/cancelled":
        return None

    if method == "initialize":
        return {
            "jsonrpc": "2.0",
            "id": request_id,
            "result": _initialize_result(params if isinstance(params, dict) else {}),
        }

    if method == "tools/list":
        return {
            "jsonrpc": "2.0",
            "id": request_id,
            "result": {"tools": [EMR_RECALL_TOOL]},
        }

    if method == "tools/call":
        return {
            "jsonrpc": "2.0",
            "id": request_id,
            "result": handle_tools_call(
                params if isinstance(params, dict) else {},
                call_emr_recall,
            ),
        }

    if method == "ping":
        return {"jsonrpc": "2.0", "id": request_id, "result": {}}

    if is_notification:
        return None

    return {
        "jsonrpc": "2.0",
        "id": request_id,
        "error": {"code": -32601, "message": f"Unknown method: {method}"},
    }


def is_jsonrpc_request(message: dict[str, Any]) -> bool:
    return "id" in message and message.get("id") is not None and "method" in message
