"""Genblaze local-first BYOK (bring your own NVIDIA / NIM key).

Constitutional defaults (Drive-G-1):
- Session key lives in the browser (sessionStorage) — never written by this module.
- Request may carry X-NVIDIA-API-Key / Authorization: Bearer for one call.
- Hosted Render rejects BYOK unless GENBLAZE_ALLOW_BYOK=1.
- Loopback / TestClient allowed by default (local Genblaze).
- Scope: stills + assist only (not video / polish as BYOK).
- Never log key material. Never attach keys to Digital Printer evidence.
"""

from __future__ import annotations

import os
from dataclasses import replace
from typing import Any

from fastapi import Request

from app.config import Settings

BYOK_KEY_HEADER = "x-nvidia-api-key"
BYOK_MODEL_HEADER = "x-genblaze-model"
BYOK_SCOPE_STILLS = "stills"
BYOK_SCOPE_ASSIST = "assist"
BYOK_SCOPE_VIDEO = "video"
BYOK_SCOPE_POLISH = "polish"

# Disclosure catalog (UI datalist / marketplace). Soft allowlist only — not a live inventory.
BYOK_MODEL_CATALOG: frozenset[str] = frozenset(
    {
        "black-forest-labs/flux.1-schnell",
        "black-forest-labs/flux.1-dev",
        "black-forest-labs/flux.1-pro",
        "meta/llama-3.2-11b-vision-instruct",
    }
)

_LOOPBACK = frozenset({"127.0.0.1", "::1", "localhost", "testclient"})


class ByokForbiddenError(PermissionError):
    """BYOK headers present but policy forbids using them."""


class ByokScopeError(ValueError):
    """BYOK used on an endpoint outside stills+assist scope."""


def soft_warn_model_id(model_id: str | None) -> dict[str, Any] | None:
    """Return a soft warning dict when model is outside the disclosed catalog.

    Does not reject — catalog is disclosure-only (Drive-G-1).
    """
    if not model_id or not str(model_id).strip():
        return None
    mid = str(model_id).strip()
    if mid in BYOK_MODEL_CATALOG:
        return None
    return {
        "level": "warn",
        "code": "byok_model_not_in_catalog",
        "model": mid,
        "message": (
            "Model id is not in the disclosed Genblaze catalog; "
            "upstream NIM may still accept it depending on your key."
        ),
    }


def is_loopback_client(request: Request) -> bool:
    host = (request.client.host if request.client else "") or ""
    return host.lower() in _LOOPBACK


def is_hosted_render() -> bool:
    return bool((os.getenv("RENDER") or "").strip())


def byok_permitted(request: Request, settings: Settings) -> bool:
    """True when per-request keys may be honored."""
    if bool(getattr(settings, "allow_byok", False)):
        return True
    if is_hosted_render():
        return False
    return is_loopback_client(request)


def extract_byok_key(request: Request) -> str | None:
    """Pull key from headers. Never log the return value."""
    raw = (request.headers.get(BYOK_KEY_HEADER) or "").strip()
    if raw:
        return raw
    auth = (request.headers.get("authorization") or "").strip()
    if auth.lower().startswith("bearer "):
        token = auth[7:].strip()
        return token or None
    return None


def extract_model_override(
    request: Request,
    *,
    body_model: str | None = None,
) -> str | None:
    header = (request.headers.get(BYOK_MODEL_HEADER) or "").strip()
    if header:
        return header
    if body_model and str(body_model).strip():
        return str(body_model).strip()
    return None


def byok_headers_present(request: Request) -> bool:
    if extract_byok_key(request):
        return True
    if (request.headers.get(BYOK_MODEL_HEADER) or "").strip():
        return True
    return False


def resolve_settings_for_request(
    settings: Settings,
    request: Request,
    *,
    body_model: str | None = None,
    scope: str = BYOK_SCOPE_STILLS,
) -> tuple[Settings, dict[str, Any]]:
    """Apply BYOK key/model overrides or raise.

    Returns (effective_settings, provenance_meta) where provenance_meta never
    contains the raw key — only booleans / sources for /health-style honesty.
    """
    key = extract_byok_key(request)
    model = extract_model_override(request, body_model=body_model)
    present = bool(key) or bool(model)

    meta: dict[str, Any] = {
        "byok_used": False,
        "byok_key_present": bool(key),
        "byok_model_override": bool(model),
        "byok_source": "env",
        "byok_scope": scope,
        "byok_permitted": byok_permitted(request, settings),
        "assistOnly": scope == BYOK_SCOPE_ASSIST,
        "printSoT": False,
    }

    if not present:
        return settings, meta

    if scope in (BYOK_SCOPE_VIDEO, BYOK_SCOPE_POLISH):
        raise ByokScopeError(
            "BYOK scope is stills + assist only. "
            "Video and polish do not accept per-request keys/models."
        )

    if not byok_permitted(request, settings):
        raise ByokForbiddenError(
            "BYOK is disabled on hosted Render. "
            "Use local Genblaze (loopback) or set GENBLAZE_ALLOW_BYOK=1."
        )

    updates: dict[str, Any] = {}
    if key:
        updates["nvidia_api_key"] = key
        meta["byok_used"] = True
        meta["byok_source"] = "request"
    if model:
        updates["image_model"] = model
        meta["byok_used"] = True
        if meta["byok_source"] == "env":
            meta["byok_source"] = "request-model"
        warn = soft_warn_model_id(model)
        if warn:
            meta["byok_model_warning"] = warn

    if not updates:
        return settings, meta
    return replace(settings, **updates), meta


def byok_health_view(settings: Settings, request: Request | None = None) -> dict[str, Any]:
    """Public /health disclosure — never includes key material."""
    permitted = True
    if request is not None:
        permitted = byok_permitted(request, settings)
    elif is_hosted_render() and not bool(getattr(settings, "allow_byok", False)):
        permitted = False
    return {
        "mode": "session-only-client",
        "scope": ["stills", "assist"],
        "storage": "browser sessionStorage (client); server never persists BYOK keys",
        "local_default": True,
        "hosted_requires_flag": True,
        "allow_byok_flag": bool(getattr(settings, "allow_byok", False)),
        "permitted_for_this_request": permitted,
        "hosted_render_detected": is_hosted_render(),
        "headers": [BYOK_KEY_HEADER, "Authorization: Bearer …", BYOK_MODEL_HEADER],
        "printSoT": False,
        "note": (
            "Keys stay in the browser session. Hosted BYOK is off unless "
            "GENBLAZE_ALLOW_BYOK=1. Never sent to Digital Printer evidence."
        ),
    }
