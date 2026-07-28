"""BYOK (local-first session key) tests — never assert raw key material in logs."""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from app.byok import (
    ByokForbiddenError,
    ByokScopeError,
    byok_health_view,
    byok_permitted,
    resolve_settings_for_request,
)
from app.config import Settings


def _base_settings(**kwargs) -> Settings:
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


def test_byok_health_view_never_includes_secrets():
    s = _base_settings()
    view = byok_health_view(s)
    blob = str(view).lower()
    assert "nvapi" not in blob
    assert view["scope"] == ["stills", "assist"]
    assert view["printSoT"] is False


def test_resolve_byok_on_loopback(monkeypatch):
    from starlette.requests import Request

    s = _base_settings(nvidia_api_key="env-key")
    scope = {
        "type": "http",
        "asgi": {"version": "3"},
        "http_version": "1.1",
        "method": "POST",
        "scheme": "http",
        "path": "/api/generate",
        "raw_path": b"/api/generate",
        "query_string": b"",
        "headers": [
            (b"x-nvidia-api-key", b"session-key-xyz"),
            (b"x-genblaze-model", b"black-forest-labs/flux.1-pro"),
        ],
        "client": ("127.0.0.1", 12345),
        "server": ("127.0.0.1", 8787),
    }
    request = Request(scope)
    monkeypatch.delenv("RENDER", raising=False)
    effective, meta = resolve_settings_for_request(s, request)
    assert effective.nvidia_api_key == "session-key-xyz"
    assert effective.image_model == "black-forest-labs/flux.1-pro"
    assert meta["byok_used"] is True
    assert meta["byok_source"] == "request"
    assert "session-key" not in str(meta)


def test_byok_forbidden_on_render_without_flag(monkeypatch):
    from starlette.requests import Request

    s = _base_settings(allow_byok=False)
    monkeypatch.setenv("RENDER", "true")
    scope = {
        "type": "http",
        "asgi": {"version": "3"},
        "http_version": "1.1",
        "method": "POST",
        "scheme": "https",
        "path": "/api/generate",
        "raw_path": b"/api/generate",
        "query_string": b"",
        "headers": [(b"x-nvidia-api-key", b"session-key-xyz")],
        "client": ("1.2.3.4", 443),
        "server": ("example.onrender.com", 443),
    }
    request = Request(scope)
    assert byok_permitted(request, s) is False
    with pytest.raises(ByokForbiddenError):
        resolve_settings_for_request(s, request)


def test_byok_allowed_on_render_with_flag(monkeypatch):
    from starlette.requests import Request

    s = _base_settings(allow_byok=True)
    monkeypatch.setenv("RENDER", "true")
    scope = {
        "type": "http",
        "asgi": {"version": "3"},
        "http_version": "1.1",
        "method": "POST",
        "scheme": "https",
        "path": "/api/generate",
        "raw_path": b"/api/generate",
        "query_string": b"",
        "headers": [(b"x-nvidia-api-key", b"session-key-xyz")],
        "client": ("1.2.3.4", 443),
        "server": ("example.onrender.com", 443),
    }
    request = Request(scope)
    effective, meta = resolve_settings_for_request(s, request)
    assert effective.nvidia_api_key == "session-key-xyz"
    assert meta["byok_used"] is True


def test_byok_scope_rejects_video_path(monkeypatch):
    from starlette.requests import Request
    from app.byok import BYOK_SCOPE_VIDEO

    s = _base_settings()
    monkeypatch.delenv("RENDER", raising=False)
    scope = {
        "type": "http",
        "asgi": {"version": "3"},
        "http_version": "1.1",
        "method": "POST",
        "scheme": "http",
        "path": "/api/generate-video",
        "raw_path": b"/api/generate-video",
        "query_string": b"",
        "headers": [(b"x-nvidia-api-key", b"session-key-xyz")],
        "client": ("127.0.0.1", 12345),
        "server": ("127.0.0.1", 8787),
    }
    request = Request(scope)
    with pytest.raises(ByokScopeError):
        resolve_settings_for_request(s, request, scope=BYOK_SCOPE_VIDEO)


def test_health_exposes_byok(monkeypatch):
    monkeypatch.delenv("NVIDIA_API_KEY", raising=False)
    monkeypatch.delenv("RENDER", raising=False)
    monkeypatch.setenv("GENBLAZE_DRY_RUN", "1")
    monkeypatch.setenv("B2_PROBE_ON_HEALTH", "0")
    from app.main import app

    client = TestClient(app)
    r = client.get("/health")
    assert r.status_code == 200
    body = r.json()
    assert "byok" in body
    assert body["byok"]["scope"] == ["stills", "assist"]
    assert body["byok"]["printSoT"] is False
    assert "nvapi" not in str(body).lower()


def test_generate_video_rejects_byok_header(monkeypatch):
    monkeypatch.setenv("GENBLAZE_DRY_RUN", "1")
    monkeypatch.setenv("GENBLAZE_VIDEO_ENABLED", "1")
    monkeypatch.delenv("RENDER", raising=False)
    from app.main import app

    client = TestClient(app)
    r = client.post(
        "/api/generate-video",
        json={"prompt": "test clip"},
        headers={"X-NVIDIA-API-Key": "session-key-xyz"},
    )
    assert r.status_code == 400
    assert "stills" in str(r.json().get("detail", "")).lower()


def test_polish_rejects_byok_header(monkeypatch):
    monkeypatch.setenv("GENBLAZE_DRY_RUN", "1")
    monkeypatch.setenv("GENBLAZE_POLISH_ENABLED", "1")
    monkeypatch.delenv("RENDER", raising=False)
    from app.main import app

    client = TestClient(app)
    r = client.post(
        "/api/polish-still",
        json={"run_id": "00000000-0000-4000-8000-000000000001", "prompt": "polish"},
        headers={"X-NVIDIA-API-Key": "session-key-xyz"},
    )
    assert r.status_code == 400
    assert "stills" in str(r.json().get("detail", "")).lower()


def test_soft_warn_model_id_catalog():
    from app.byok import soft_warn_model_id

    assert soft_warn_model_id("black-forest-labs/flux.1-schnell") is None
    warn = soft_warn_model_id("vendor/unknown-model-xyz")
    assert warn is not None
    assert warn["code"] == "byok_model_not_in_catalog"
