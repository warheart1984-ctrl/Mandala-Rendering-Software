"""Streamable HTTP MCP transport — mount at ``/mcp`` on the FastAPI app.

Stateless JSON responses (no SSE session manager). Read-only ``emr_recall`` only.
Spec: MCP Streamable HTTP (2025-03-26).
"""

from __future__ import annotations

import json
import secrets
from typing import Any, Callable

from fastapi import APIRouter, HTTPException, Request, Response
from fastapi.responses import JSONResponse

from app.auth import optional_verify_operator_api_key
from mcp_server.protocol import (
    PROTOCOL_VERSION,
    dispatch_rpc,
    is_jsonrpc_request,
)

EmrRecallCaller = Callable[[dict[str, Any]], dict[str, Any]]

SESSION_HEADER = "mcp-session-id"
PROTOCOL_HEADER = "mcp-protocol-version"


def _require_mcp_auth(request: Request) -> None:
    try:
        optional_verify_operator_api_key(
            request.headers.get("authorization"),
            request.headers.get("x-emr-recall-key"),
        )
    except HTTPException as exc:
        raise exc


def _parse_body(raw: bytes) -> list[dict[str, Any]]:
    if not raw:
        raise HTTPException(status_code=400, detail="Empty MCP request body")
    try:
        payload = json.loads(raw.decode("utf-8"))
    except json.JSONDecodeError as exc:
        raise HTTPException(status_code=400, detail=f"Invalid JSON: {exc}") from exc
    if isinstance(payload, dict):
        return [payload]
    if isinstance(payload, list):
        return [item for item in payload if isinstance(item, dict)]
    raise HTTPException(status_code=400, detail="MCP body must be object or array")


def _validate_accept(request: Request) -> None:
    accept = request.headers.get("accept", "")
    if not accept:
        return
    if "application/json" in accept or "text/event-stream" in accept or "*/*" in accept:
        return
    raise HTTPException(
        status_code=406,
        detail="Accept must include application/json or text/event-stream",
    )


def create_mcp_router(call_emr_recall: EmrRecallCaller) -> APIRouter:
    router = APIRouter()

    @router.post("")
    @router.post("/")
    async def mcp_post(request: Request) -> Response:
        _validate_accept(request)
        _require_mcp_auth(request)

        session_id = request.headers.get(SESSION_HEADER)
        messages = _parse_body(await request.body())

        # After initialize, clients should echo Mcp-Session-Id (stateless: we accept any).
        requests = [m for m in messages if is_jsonrpc_request(m)]
        notifications = [m for m in messages if not is_jsonrpc_request(m)]

        for note in notifications:
            dispatch_rpc(note, call_emr_recall)

        if not requests:
            return Response(status_code=202)

        responses: list[dict[str, Any]] = []
        new_session: str | None = None
        for msg in requests:
            if msg.get("method") == "initialize" and not session_id:
                new_session = secrets.token_urlsafe(24)
            out = dispatch_rpc(msg, call_emr_recall)
            if out is not None:
                responses.append(out)

        if len(responses) == 1:
            body = responses[0]
        else:
            body = responses

        headers: dict[str, str] = {}
        if new_session:
            headers[SESSION_HEADER] = new_session
        headers["MCP-Protocol-Version"] = PROTOCOL_VERSION

        return JSONResponse(content=body, headers=headers)

    @router.get("")
    @router.get("/")
    async def mcp_get() -> Response:
        # Stateless server — no standing SSE stream.
        return Response(status_code=405, headers={"Allow": "POST, DELETE"})

    @router.delete("")
    @router.delete("/")
    async def mcp_delete() -> Response:
        return Response(status_code=204)

    return router
