"""Deployment auth — optional API key for hosted EMR recall; write gate for public deploy."""

from __future__ import annotations

import os
import secrets

from fastapi import Header, HTTPException, Request
from starlette.responses import JSONResponse


def emr_recall_api_key() -> str | None:
    key = (os.getenv("EMR_RECALL_API_KEY") or "").strip()
    return key or None


def memory_write_enabled() -> bool:
    return os.getenv("JARVIS_MEMORY_WRITE_ENABLED", "true").lower() in (
        "1",
        "true",
        "yes",
    )


def ledger_read_protected() -> bool:
    """When true, GET /api/jarvis/memory/* requires the operator API key."""
    if not emr_recall_api_key():
        return False
    return os.getenv("JARVIS_PROTECT_LEDGER_READ", "false").lower() in (
        "1",
        "true",
        "yes",
    )


def deployment_label() -> str:
    if os.getenv("RENDER"):
        return "render"
    if os.getenv("JARVIS_DEPLOYMENT"):
        return os.getenv("JARVIS_DEPLOYMENT", "").strip() or "custom"
    return "local"


def _extract_bearer(authorization: str | None) -> str | None:
    if not authorization:
        return None
    prefix = "bearer "
    if authorization.lower().startswith(prefix):
        return authorization[len(prefix) :].strip()
    return None


def verify_operator_api_key(
    authorization: str | None,
    x_emr_recall_key: str | None,
) -> None:
    expected = emr_recall_api_key()
    if not expected:
        raise HTTPException(
            status_code=503,
            detail="Operator API key required but EMR_RECALL_API_KEY is not configured",
        )
    token = _extract_bearer(authorization) or (x_emr_recall_key or "").strip()
    if not token or not secrets.compare_digest(token, expected):
        raise HTTPException(
            status_code=401,
            detail="Invalid or missing operator API key",
        )


def require_emr_recall_api_key(
    authorization: str | None = Header(default=None),
    x_emr_recall_key: str | None = Header(default=None, alias="X-EMR-Recall-Key"),
) -> None:
    """When EMR_RECALL_API_KEY is set, require Bearer or X-EMR-Recall-Key header."""
    expected = emr_recall_api_key()
    if not expected:
        return
    verify_operator_api_key(authorization, x_emr_recall_key)


def require_ledger_read_api_key(
    authorization: str | None = Header(default=None),
    x_emr_recall_key: str | None = Header(default=None, alias="X-EMR-Recall-Key"),
) -> None:
    if not ledger_read_protected():
        return
    verify_operator_api_key(authorization, x_emr_recall_key)


def require_memory_write() -> None:
    if not memory_write_enabled():
        raise HTTPException(
            status_code=403,
            detail="Memory writes are disabled on this deployment",
        )


LEDGER_READ_PREFIX = "/api/jarvis/memory"


async def ledger_read_protection_middleware(request: Request, call_next):
    """Gate GET ledger endpoints when JARVIS_PROTECT_LEDGER_READ is enabled."""
    if request.method != "GET" or not request.url.path.startswith(LEDGER_READ_PREFIX):
        return await call_next(request)
    if not ledger_read_protected():
        return await call_next(request)
    try:
        verify_operator_api_key(
            request.headers.get("authorization"),
            request.headers.get("x-emr-recall-key"),
        )
    except HTTPException as exc:
        return JSONResponse(status_code=exc.status_code, content={"detail": exc.detail})
    return await call_next(request)


def optional_verify_operator_api_key(
    authorization: str | None,
    x_emr_recall_key: str | None,
) -> None:
    """When EMR_RECALL_API_KEY is unset, allow (local dev). When set, require match."""
    if not emr_recall_api_key():
        return
    verify_operator_api_key(authorization, x_emr_recall_key)
