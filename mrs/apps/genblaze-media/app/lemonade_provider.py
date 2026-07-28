"""Local Lemonade (AMD) image backend for Genblaze concept stills.

Calls the system-wide Lemonade Server OpenAI-compatible images API at
``http://127.0.0.1:13305/api/v1`` (override with ``LEMONADE_BASE_URL``).

HONEST SCOPE (Drive-G-1):
    This is **local diffusion** via Lemonade (default ``SD-Turbo``), not NVIDIA
    NIM / fal and not the deterministic RT4D path tracer. Receipts must use
    provider id ``lemonade-local`` so operators can tell cloud vs on-device.
"""

from __future__ import annotations

import base64
import hashlib
import json
import logging
import os
import uuid
from typing import Any
from urllib.parse import urljoin

import httpx

from app.config import Settings
from app.image_quality import assess_image_bytes
from app.pipeline import (
    GenerateResult,
    GenerationQualityError,
    _attach_local_preview,
    _presign_preview,
    _utc_now,
    build_backend,
)

logger = logging.getLogger(__name__)

LEMONADE_PROVIDER_ID = "lemonade-local"
DEFAULT_LEMONADE_BASE_URL = "http://127.0.0.1:13305/api/v1"
DEFAULT_LEMONADE_MODEL = "SD-Turbo"
DEFAULT_LEMONADE_SIZE = "512x512"
DEFAULT_LEMONADE_STEPS = 4
DEFAULT_LEMONADE_TIMEOUT = 600.0

LEMONADE_SETUP_HELP = (
    "Lemonade local image backend needs Lemonade Server on "
    f"{DEFAULT_LEMONADE_BASE_URL} (or LEMONADE_BASE_URL). Install from "
    "https://lemonade-server.ai , run `lemonade serve`, then "
    f"`lemonade pull {DEFAULT_LEMONADE_MODEL}`. Set "
    "GENBLAZE_IMAGE_BACKEND=lemonade to use this path."
)


class LemonadeGenerateError(Exception):
    """Lemonade reachable but generation failed (HTTP/model/decode)."""


def _base_url(settings: Settings) -> str:
    raw = (getattr(settings, "lemonade_base_url", None) or "").strip()
    if not raw:
        raw = (os.getenv("LEMONADE_BASE_URL") or DEFAULT_LEMONADE_BASE_URL).strip()
    return raw.rstrip("/")


def _model_id(settings: Settings) -> str:
    explicit = (getattr(settings, "lemonade_model", None) or "").strip()
    if explicit:
        return explicit
    # Avoid sending a NVIDIA FLUX slug to Lemonade when the operator only
    # flipped GENBLAZE_IMAGE_BACKEND without setting a local model id.
    configured = (settings.image_model or "").strip()
    if configured and not configured.startswith("black-forest-labs/"):
        if "/" not in configured or configured in {DEFAULT_LEMONADE_MODEL, "SDXL-Turbo"}:
            return configured
    return DEFAULT_LEMONADE_MODEL


def lemonade_availability(settings: Settings) -> dict[str, Any]:
    """Cheap health probe for /health (does not pull models)."""
    base = _base_url(settings)
    health_url = urljoin(base + "/", "health")
    # Some Lemonade builds expose /api/v1/health; others answer on root /health.
    candidates = [health_url, f"{base.rsplit('/api/v1', 1)[0]}/api/v1/health"]
    if base.endswith("/api/v1"):
        candidates.append(f"{base}/health")
    seen: set[str] = set()
    last_error: str | None = None
    for url in candidates:
        if url in seen:
            continue
        seen.add(url)
        try:
            with httpx.Client(timeout=3.0) as client:
                resp = client.get(url)
            if resp.status_code < 500:
                return {
                    "available": resp.status_code < 400,
                    "base_url": base,
                    "health_url": url,
                    "status_code": resp.status_code,
                    "model": _model_id(settings),
                    "size": getattr(settings, "lemonade_size", None)
                    or DEFAULT_LEMONADE_SIZE,
                    "help": None if resp.status_code < 400 else LEMONADE_SETUP_HELP,
                }
            last_error = f"HTTP {resp.status_code}"
        except Exception as exc:  # noqa: BLE001 — surface in health JSON
            last_error = f"{type(exc).__name__}: {exc}"
    return {
        "available": False,
        "base_url": base,
        "health_url": next(iter(seen), health_url),
        "status_code": None,
        "model": _model_id(settings),
        "size": getattr(settings, "lemonade_size", None) or DEFAULT_LEMONADE_SIZE,
        "error": last_error,
        "help": LEMONADE_SETUP_HELP,
    }


def _auth_headers(settings: Settings) -> dict[str, str]:
    key = (getattr(settings, "lemonade_api_key", None) or "").strip()
    if not key:
        key = (os.getenv("LEMONADE_API_KEY") or "").strip()
    if not key:
        return {"Content-Type": "application/json"}
    return {
        "Content-Type": "application/json",
        "Authorization": f"Bearer {key}",
    }


def _decode_image_payload(data: dict[str, Any]) -> bytes:
    items = data.get("data") or []
    if not items:
        raise LemonadeGenerateError("Lemonade returned no image data")
    item = items[0]
    b64 = item.get("b64_json")
    if b64:
        return base64.b64decode(b64)
    url = item.get("url")
    if url and isinstance(url, str) and url.startswith("data:"):
        # data:image/png;base64,...
        try:
            encoded = url.split(",", 1)[1]
            return base64.b64decode(encoded)
        except (IndexError, ValueError) as exc:
            raise LemonadeGenerateError("invalid data URL from Lemonade") from exc
    if url and isinstance(url, str) and url.startswith(("http://", "https://")):
        with httpx.Client(timeout=60.0) as client:
            resp = client.get(url)
            resp.raise_for_status()
            return resp.content
    raise LemonadeGenerateError("Lemonade response missing b64_json/url")


def _call_lemonade(settings: Settings, prompt: str) -> tuple[bytes, dict[str, Any]]:
    base = _base_url(settings)
    model = _model_id(settings)
    size = (getattr(settings, "lemonade_size", None) or DEFAULT_LEMONADE_SIZE).strip()
    try:
        steps = int(getattr(settings, "lemonade_steps", None) or DEFAULT_LEMONADE_STEPS)
    except (TypeError, ValueError):
        steps = DEFAULT_LEMONADE_STEPS
    try:
        timeout = float(
            getattr(settings, "lemonade_timeout_seconds", None)
            or DEFAULT_LEMONADE_TIMEOUT
        )
    except (TypeError, ValueError):
        timeout = DEFAULT_LEMONADE_TIMEOUT

    body = {
        "model": model,
        "prompt": prompt,
        "size": size,
        "steps": steps,
        "cfg_scale": 1.0,
        "response_format": "b64_json",
        "n": 1,
    }
    url = f"{base}/images/generations"
    logger.info("Lemonade image generate model=%s size=%s url=%s", model, size, url)
    try:
        with httpx.Client(timeout=timeout) as client:
            resp = client.post(url, headers=_auth_headers(settings), json=body)
    except httpx.HTTPError as exc:
        raise RuntimeError(LEMONADE_SETUP_HELP) from exc

    if resp.status_code == 404:
        raise LemonadeGenerateError(
            f"Lemonade model not found ({model}). Run: lemonade pull {model}"
        )
    if resp.status_code >= 400:
        detail = (resp.text or "")[:500]
        raise LemonadeGenerateError(
            f"Lemonade image generate failed ({resp.status_code}): {detail}"
        )

    try:
        payload = resp.json()
    except ValueError as exc:
        raise LemonadeGenerateError("Lemonade returned non-JSON body") from exc

    png = _decode_image_payload(payload)
    provenance = {
        "provider": LEMONADE_PROVIDER_ID,
        "base_url": base,
        "model": model,
        "size": size,
        "steps": steps,
        "request": {k: v for k, v in body.items() if k != "prompt"},
    }
    return png, provenance


def _build_manifest(
    *,
    run_id: str,
    prompt: str,
    created_at: str,
    sha256: str,
    provenance: dict[str, Any],
    asset_key: str,
) -> dict[str, Any]:
    return {
        "run_id": run_id,
        "created_at": created_at,
        "prompt": prompt,
        "provider": LEMONADE_PROVIDER_ID,
        "model": provenance.get("model"),
        "asset_key": asset_key,
        "sha256": sha256,
        "provenance": provenance,
    }


def generate_image_lemonade(settings: Settings, prompt: str) -> GenerateResult:
    """Generate a concept still via local Lemonade and persist like RT4D/NVIDIA."""
    cleaned = (prompt or "").strip()
    if not cleaned:
        raise ValueError("prompt is required")

    run_id = str(uuid.uuid4())
    created_at = _utc_now()
    model = _model_id(settings)

    png, provenance = _call_lemonade(settings, cleaned)
    if not png:
        raise LemonadeGenerateError("Lemonade returned empty image bytes")

    assessment = assess_image_bytes(png)
    if not assessment.ok:
        raise GenerationQualityError(
            f"Lemonade image failed quality check: {assessment.reason}"
        )

    sha256 = hashlib.sha256(png).hexdigest()
    provenance = {**provenance, "sha256": sha256}
    asset_key = f"{settings.storage_prefix}/lemonade/{run_id}/render.png"
    manifest_key = f"{settings.storage_prefix}/lemonade/{run_id}/manifest.json"
    manifest = _build_manifest(
        run_id=run_id,
        prompt=cleaned,
        created_at=created_at,
        sha256=sha256,
        provenance=provenance,
        asset_key=asset_key,
    )
    quality = {
        "ok": assessment.ok,
        "byte_len": assessment.byte_len,
        "width": assessment.width,
        "height": assessment.height,
        "mean_luminance": assessment.mean_luminance,
        "unique_colors": assessment.unique_colors,
        "format": assessment.format,
    }

    if not settings.b2_configured:
        gen = GenerateResult(
            run_id=run_id,
            prompt=cleaned,
            model=model,
            provider=LEMONADE_PROVIDER_ID,
            status="ok",
            asset_key=asset_key,
            manifest_key=manifest_key,
            asset_sha256=sha256,
            preview_url=None,
            created_at=created_at,
            dry_run=False,
            detail="B2 not configured; Lemonade still stayed local-only (no upload).",
            quality=quality,
            provenance=provenance,
        )
        _attach_local_preview(gen, png)
        return gen

    backend = build_backend(settings)
    try:
        backend.put(asset_key, png, content_type="image/png")
        backend.put(
            manifest_key,
            json.dumps(manifest, indent=2).encode("utf-8"),
            content_type="application/json",
        )
        preview = _presign_preview(backend, settings, asset_key, None)
    finally:
        close = getattr(backend, "close", None)
        if callable(close):
            close()

    gen = GenerateResult(
        run_id=run_id,
        prompt=cleaned,
        model=model,
        provider=LEMONADE_PROVIDER_ID,
        status="ok",
        asset_key=asset_key,
        manifest_key=manifest_key,
        asset_sha256=sha256,
        preview_url=preview,
        created_at=created_at,
        dry_run=False,
        quality=quality,
        provenance=provenance,
    )
    _attach_local_preview(gen, png)
    return gen
