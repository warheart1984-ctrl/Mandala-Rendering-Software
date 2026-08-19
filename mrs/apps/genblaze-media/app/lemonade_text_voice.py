"""Lemonade local text + voice backend for the merged Genblaze Media server.

Calls the system-wide Lemonade Server OpenAI-compatible API at
``http://127.0.0.1:13307/api/v1`` (override with ``LEMONADE_BASE_URL``).

Endpoints proxied:
- text:   ``/v1/chat/completions``  (default ``Llama-3.2-1B-Instruct-GGUF``)
- voice:  ``/v1/audio/speech``      (default ``kokoro-v1`` TTS, returns MP3)
- speech: ``/v1/audio/transcriptions`` (default ``Whisper-Large-v3-Turbo``)

HONEST SCOPE:
    This is **local inference on-device**, not NVIDIA NIM / fal and not the
    deterministic RT4D path tracer. Receipts use provider id ``lemonade-local``
    so operators can tell cloud vs on-device. No invented quality metrics —
    text/voice get provenance only (model, base_url, request echo, latency).
"""

from __future__ import annotations

import base64
import hashlib
import logging
import time
from dataclasses import dataclass, field
from typing import Any
from urllib.parse import urljoin

import httpx

from app.config import Settings

logger = logging.getLogger(__name__)

LEMONADE_PROVIDER_ID = "lemonade-local"
DEFAULT_LEMONADE_BASE_URL = "http://127.0.0.1:13307/api/v1"

LEMONADE_TEXT_VOICE_HELP = (
    "Lemonade local text/voice backend needs Lemonade Server on "
    f"{DEFAULT_LEMONADE_BASE_URL} (or LEMONADE_BASE_URL). Install from "
    "https://lemonade-server.ai , run `lemonade serve`, then pull the "
    "chat/tts/stt models you plan to use."
)


class LemonadeTextVoiceError(RuntimeError):
    """Lemonade reachable but the text/voice call failed."""


@dataclass
class LemonadeReceipt:
    provider: str = LEMONADE_PROVIDER_ID
    model: str | None = None
    base_url: str | None = None
    elapsed_seconds: float | None = None
    bytes_len: int | None = None
    sha256: str | None = None
    audio_base64: str | None = None
    text: str | None = None
    detail: str | None = None
    request_echo: dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> dict[str, Any]:
        d = {k: v for k, v in self.__dict__.items() if v is not None}
        return d


def _base_url(settings: Settings) -> str:
    raw = (getattr(settings, "lemonade_base_url", None) or "").strip()
    return (raw or DEFAULT_LEMONADE_BASE_URL).rstrip("/")


def _auth_headers(settings: Settings) -> dict[str, str]:
    key = (getattr(settings, "lemonade_api_key", None) or "").strip()
    headers = {"Content-Type": "application/json"}
    if key:
        headers["Authorization"] = f"Bearer {key}"
    return headers


def lemonade_text_voice_availability(settings: Settings) -> dict[str, Any]:
    """Cheap health probe for /health (does not load models)."""
    base = _base_url(settings)
    if getattr(settings, "skip_local_sd", False):
        return {
            "available": False,
            "skipped": True,
            "skip_reason": "GENBLAZE_SKIP_LOCAL_SD=1",
            "base_url": base,
            "chat_model": getattr(settings, "lemonade_chat_model", None),
            "tts_model": getattr(settings, "lemonade_tts_model", None),
            "stt_model": getattr(settings, "lemonade_stt_model", None),
            "help": LEMONADE_TEXT_VOICE_HELP,
        }
    candidates = [
        f"{base}/models",
        f"{base.rsplit('/api/v1', 1)[0]}/api/v1/models",
    ]
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
                    "models_url": url,
                    "status_code": resp.status_code,
                    "chat_model": getattr(settings, "lemonade_chat_model", None),
                    "tts_model": getattr(settings, "lemonade_tts_model", None),
                    "stt_model": getattr(settings, "lemonade_stt_model", None),
                    "help": None if resp.status_code < 400 else LEMONADE_TEXT_VOICE_HELP,
                }
            last_error = f"HTTP {resp.status_code}"
        except Exception as exc:  # noqa: BLE001 — surface in health JSON
            last_error = f"{type(exc).__name__}: {exc}"
    return {
        "available": False,
        "base_url": base,
        "models_url": next(iter(seen), f"{base}/models"),
        "status_code": None,
        "chat_model": getattr(settings, "lemonade_chat_model", None),
        "tts_model": getattr(settings, "lemonade_tts_model", None),
        "stt_model": getattr(settings, "lemonade_stt_model", None),
        "error": last_error,
        "help": LEMONADE_TEXT_VOICE_HELP,
    }


def _post_json(settings: Settings, path: str, body: dict[str, Any], *, timeout: float) -> httpx.Response:
    base = _base_url(settings)
    url = urljoin(base + "/", path)
    try:
        with httpx.Client(timeout=timeout) as client:
            return client.post(url, headers=_auth_headers(settings), json=body)
    except httpx.HTTPError as exc:
        raise RuntimeError(LEMONADE_TEXT_VOICE_HELP) from exc


def chat_completion(settings: Settings, messages: list[dict[str, str]], *, model: str | None = None, max_tokens: int = 256, temperature: float | None = None) -> LemonadeReceipt:
    """Proxy to Lemonade /v1/chat/completions."""
    cleaned = [{"role": m.get("role", "user"), "content": m.get("content", "")} for m in messages]
    model = (model or "").strip() or (getattr(settings, "lemonade_chat_model", None) or "")
    body: dict[str, Any] = {"model": model, "messages": cleaned, "max_tokens": max_tokens}
    if temperature is not None:
        body["temperature"] = temperature
    start = time.monotonic()
    resp = _post_json(settings, "chat/completions", body, timeout=180.0)
    if resp.status_code >= 400:
        detail = (resp.text or "")[:500]
        raise LemonadeTextVoiceError(f"Lemonade chat failed ({resp.status_code}): {detail}")
    payload = resp.json()
    choices = payload.get("choices") or []
    text = ""
    if choices:
        msg = choices[0].get("message") or {}
        text = msg.get("content") or ""
    elapsed = time.monotonic() - start
    return LemonadeReceipt(
        provider=LEMONADE_PROVIDER_ID,
        model=model,
        base_url=_base_url(settings),
        elapsed_seconds=round(elapsed, 3),
        text=text,
        request_echo={"messages": cleaned, "max_tokens": max_tokens},
    )


def text_to_speech(settings: Settings, text: str, *, voice: str | None = None, model: str | None = None) -> LemonadeReceipt:
    """Proxy to Lemonade /v1/audio/speech (kokoro TTS). Returns MP3 bytes."""
    cleaned = (text or "").strip()
    if not cleaned:
        raise ValueError("text is required")
    model = (model or "").strip() or (getattr(settings, "lemonade_tts_model", None) or "")
    body: dict[str, Any] = {"model": model, "input": cleaned}
    if voice:
        body["voice"] = voice
    start = time.monotonic()
    resp = _post_json(settings, "audio/speech", body, timeout=180.0)
    if resp.status_code >= 400:
        detail = (resp.text or "")[:500]
        raise LemonadeTextVoiceError(f"Lemonade TTS failed ({resp.status_code}): {detail}")
    data = resp.content
    elapsed = time.monotonic() - start
    return LemonadeReceipt(
        provider=LEMONADE_PROVIDER_ID,
        model=model,
        base_url=_base_url(settings),
        elapsed_seconds=round(elapsed, 3),
        bytes_len=len(data),
        sha256=hashlib.sha256(data).hexdigest() if data else None,
        audio_base64=base64.b64encode(data).decode("ascii") if data else None,
        request_echo={"voice": voice, "chars": len(cleaned)},
    )


def speech_to_text(settings: Settings, audio_bytes: bytes, *, model: str | None = None, filename: str = "audio.mp3") -> LemonadeReceipt:
    """Proxy to Lemonade /v1/audio/transcriptions (Whisper)."""
    if not audio_bytes:
        raise ValueError("audio bytes are required")
    model = (model or "").strip() or (getattr(settings, "lemonade_stt_model", None) or "")
    base = _base_url(settings)
    url = urljoin(base + "/", "audio/transcriptions")
    start = time.monotonic()
    try:
        with httpx.Client(timeout=300.0) as client:
            resp = client.post(
                url,
                headers={
                    "Authorization": _auth_headers(settings).get("Authorization", "")
                },
                files={"file": (filename, audio_bytes, "audio/mpeg")},
                data={"model": model},
            )
    except httpx.HTTPError as exc:
        raise RuntimeError(LEMONADE_TEXT_VOICE_HELP) from exc
    if resp.status_code >= 400:
        detail = (resp.text or "")[:500]
        raise LemonadeTextVoiceError(f"Lemonade STT failed ({resp.status_code}): {detail}")
    payload = resp.json()
    text = payload.get("text") or ""
    elapsed = time.monotonic() - start
    return LemonadeReceipt(
        provider=LEMONADE_PROVIDER_ID,
        model=model,
        base_url=base,
        elapsed_seconds=round(elapsed, 3),
        text=text,
        bytes_len=len(audio_bytes),
        sha256=hashlib.sha256(audio_bytes).hexdigest(),
        request_echo={"filename": filename},
    )
