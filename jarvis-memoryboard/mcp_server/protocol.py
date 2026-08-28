"""Shared MCP protocol surface — stdio and Streamable HTTP.

Tools:
- ``emr_recall`` — read-only governed recall (always available when auth allows)
- ``emr_remember`` / ``emr_upsert`` — draft writes when ``JARVIS_MCP_WRITE_ENABLED``
"""

from __future__ import annotations

import json
from typing import Any, Callable

PROTOCOL_VERSION = "2025-03-26"
PROTOCOL_VERSION_LEGACY = "2024-11-05"
SERVER_NAME = "jarvis-emr"
SERVER_VERSION = "0.3.0"

# (tool_name, arguments) → JSON-serializable result dict
EmrToolCaller = Callable[[str, dict[str, Any]], dict[str, Any]]

# Backward-compatible alias used by older call sites
EmrRecallCaller = Callable[[dict[str, Any]], dict[str, Any]]

EMR_RECALL_TOOL: dict[str, Any] = {
    "name": "emr_recall",
    "description": (
        "Governed recall bundle from EMR. Returns STM-ready memories with provenance "
        "and activation scores. Does not write, reinforce, or mutate ledger truth. "
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

EMR_REMEMBER_TOOL: dict[str, Any] = {
    "name": "emr_remember",
    "description": (
        "Create a governed durable memory record via EMR. Writes to Continuity Ledger "
        "through constitutional gatekeeping. Requires user_requested=true; always draft. "
        "Host should requireApproval. Disabled unless JARVIS_MCP_WRITE_ENABLED=true."
    ),
    "annotations": {
        "readOnlyHint": False,
        "destructiveHint": False,
        "idempotentHint": False,
        "openWorldHint": False,
    },
    "inputSchema": {
        "type": "object",
        "properties": {
            "content": {"type": "string", "description": "Memory content"},
            "source_agent": {"type": "string", "description": "Agent writing the memory"},
            "session_id": {"type": "string", "description": "Session identifier"},
            "type": {
                "type": "string",
                "description": "MemoryType literal",
                "enum": [
                    "decision",
                    "fact",
                    "task",
                    "preference",
                    "architecture",
                    "research",
                ],
            },
            "subject": {"type": "string", "description": "Subject domain"},
            "tags": {"type": "array", "items": {"type": "string"}},
            "user_requested": {
                "type": "boolean",
                "description": "Must be true — explicit user intent to store",
            },
            "user_statement": {
                "type": "string",
                "description": "Verbatim user wording requesting storage",
            },
        },
        "required": ["content", "session_id", "type", "user_requested"],
    },
}

EMR_UPSERT_TOOL: dict[str, Any] = {
    "name": "emr_upsert",
    "description": (
        "Update or supersede an existing memory record. EMR enforces lineage, "
        "provenance, and conflict membranes (new draft + archive prior; no destructive "
        "overwrite). Requires user_requested=true. Disabled unless JARVIS_MCP_WRITE_ENABLED=true."
    ),
    "annotations": {
        "readOnlyHint": False,
        "destructiveHint": False,
        "idempotentHint": False,
        "openWorldHint": False,
    },
    "inputSchema": {
        "type": "object",
        "properties": {
            "id": {"type": "string", "description": "Existing memory id being superseded"},
            "content": {"type": "string", "description": "Updated content"},
            "supersedes": {
                "type": "string",
                "description": "Optional id of record being superseded (defaults to id)",
            },
            "source_agent": {"type": "string"},
            "session_id": {"type": "string"},
            "type": {
                "type": "string",
                "enum": [
                    "decision",
                    "fact",
                    "task",
                    "preference",
                    "architecture",
                    "research",
                ],
            },
            "subject": {"type": "string"},
            "tags": {"type": "array", "items": {"type": "string"}},
            "user_requested": {
                "type": "boolean",
                "description": "Must be true — explicit user intent",
            },
            "user_statement": {"type": "string"},
        },
        "required": ["id", "content", "user_requested"],
    },
}

MCP_TOOLS: list[dict[str, Any]] = [
    EMR_RECALL_TOOL,
    EMR_REMEMBER_TOOL,
    EMR_UPSERT_TOOL,
]

_KNOWN_TOOLS = frozenset(t["name"] for t in MCP_TOOLS)


def handle_tools_call(
    params: dict[str, Any],
    call_tool: EmrToolCaller,
) -> dict[str, Any]:
    name = params.get("name")
    arguments = params.get("arguments") or {}
    if name not in _KNOWN_TOOLS:
        return {
            "content": [{"type": "text", "text": f"unknown tool: {name}"}],
            "isError": True,
        }
    try:
        result = call_tool(str(name), arguments if isinstance(arguments, dict) else {})
    except Exception as exc:  # noqa: BLE001 — surface as tool error to host
        return {
            "content": [{"type": "text", "text": str(exc)}],
            "isError": True,
        }
    # Write refusals are structured success (accepted=false), not transport errors
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
            "EMR constitutional memory tools. "
            "Use emr_recall for governed Continuity Ledger recall (may abstain). "
            "Use emr_remember / emr_upsert only when the user explicitly asked to store "
            "or update memory (user_requested=true); writes are draft-only and may be "
            "disabled by JARVIS_MCP_WRITE_ENABLED. Never invent memories."
        ),
    }


def dispatch_rpc(
    message: dict[str, Any],
    call_tool: EmrToolCaller,
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
            "result": {"tools": list(MCP_TOOLS)},
        }

    if method == "tools/call":
        return {
            "jsonrpc": "2.0",
            "id": request_id,
            "result": handle_tools_call(
                params if isinstance(params, dict) else {},
                call_tool,
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


def wrap_recall_caller(call_emr_recall: EmrRecallCaller) -> EmrToolCaller:
    """Adapt legacy recall-only callers to the multi-tool dispatcher."""

    def _call(name: str, arguments: dict[str, Any]) -> dict[str, Any]:
        if name != "emr_recall":
            raise RuntimeError(f"tool {name} not supported by this caller")
        return call_emr_recall(arguments)

    return _call
