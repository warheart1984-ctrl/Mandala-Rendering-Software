"""Constitutional compliance probes for Genblaze BYOK — real byok.py /health behavior.

Status: **partial** coverage of assist-only + zero-secret health disclosure.
Not a substitute for full 16/16 MRS conformance.
"""

from __future__ import annotations

import os

import pytest
from fastapi.testclient import TestClient

from app.byok import (
    BYOK_SCOPE_ASSIST,
    BYOK_SCOPE_POLISH,
    BYOK_SCOPE_STILLS,
    BYOK_SCOPE_VIDEO,
    ByokForbiddenError,
    ByokScopeError,
    byok_health_view,
    resolve_settings_for_request,
)
from app.config import Settings


def _settings(**kwargs) -> Settings:
    defaults = dict(
        nvidia_api_key=None,
        fal_api_key=None,
        b2_key_id=None,
        b2_app_key=None,
        b2_bucket="test",
        b2_region="us-east-005",
        b2_endpoint=None,
        storage_prefix="t",
        image_model="black-forest-labs/flux.1-schnell",
        video_model="nvidia/cosmos-1.0-7b-diffusion-text2world",
        video_enabled=False,
        video_backend="nvidia",
        seedance_model="bytedance/seedance-2.0/text-to-video",
        seedance_resolution="720p",
        seedance_duration="5",
        seedance_aspect_ratio="16:9",
        seedance_generate_audio=True,
        seedance_watermark=None,
        embed_model="nvidia/nv-embedcode-7b-v1",
        embed_url="https://integrate.api.nvidia.com/v1/embeddings",
        embed_timeout_seconds=60.0,
        store_full_embeddings=False,
        presign_expires_seconds=3600,
        dry_run=True,
        b2_probe_on_health=False,
        abstract_retry_on_blank=True,
        empty_504_retry=False,
        empty_504_retry_delay_seconds=45.0,
        nvidia_warmup_on_startup=False,
        dotenv_loaded=(),
        allow_byok=False,
    )
    defaults.update(kwargs)
    return Settings(**defaults)


def _request(headers=None, client_host="127.0.0.1"):
    from starlette.requests import Request

    hdrs = []
    for k, v in (headers or {}).items():
        hdrs.append((k.lower().encode(), v.encode()))
    scope = {
        "type": "http",
        "asgi": {"version": "3"},
        "http_version": "1.1",
        "method": "POST",
        "scheme": "http",
        "path": "/api/generate",
        "raw_path": b"/api/generate",
        "query_string": b"",
        "headers": hdrs,
        "client": (client_host, 12345),
        "server": ("127.0.0.1", 8787),
    }
    return Request(scope)


def test_health_byok_never_print_sot(monkeypatch):
    monkeypatch.setenv("GENBLAZE_DRY_RUN", "1")
    monkeypatch.setenv("B2_PROBE_ON_HEALTH", "0")
    monkeypatch.delenv("RENDER", raising=False)
    from app.main import app

    client = TestClient(app)
    body = client.get("/health").json()
    assert body["byok"]["printSoT"] is False
    assert body["byok"]["scope"] == ["stills", "assist"]
    blob = str(body).lower()
    assert "nvapi-" not in blob
    assert "session-key" not in blob


def test_assist_scope_allows_byok_on_loopback(monkeypatch):
    monkeypatch.delenv("RENDER", raising=False)
    s = _settings()
    req = _request({"x-nvidia-api-key": "session-key-xyz"})
    effective, meta = resolve_settings_for_request(
        s, req, scope=BYOK_SCOPE_ASSIST
    )
    assert effective.nvidia_api_key == "session-key-xyz"
    assert meta["assistOnly"] is True
    assert meta["printSoT"] is False
    assert "session-key" not in str(meta)


def test_video_and_polish_scopes_denied(monkeypatch):
    monkeypatch.delenv("RENDER", raising=False)
    s = _settings()
    req = _request({"x-nvidia-api-key": "session-key-xyz"})
    with pytest.raises(ByokScopeError):
        resolve_settings_for_request(s, req, scope=BYOK_SCOPE_VIDEO)
    with pytest.raises(ByokScopeError):
        resolve_settings_for_request(s, req, scope=BYOK_SCOPE_POLISH)


def test_hosted_render_denies_without_flag(monkeypatch):
    monkeypatch.setenv("RENDER", "true")
    s = _settings(allow_byok=False)
    req = _request({"x-nvidia-api-key": "session-key-xyz"}, client_host="1.2.3.4")
    with pytest.raises(ByokForbiddenError):
        resolve_settings_for_request(s, req, scope=BYOK_SCOPE_STILLS)


def test_byok_health_view_storage_claim():
    view = byok_health_view(_settings())
    assert "sessionStorage" in view["storage"]
    assert view["hosted_requires_flag"] is True
    assert view["printSoT"] is False
