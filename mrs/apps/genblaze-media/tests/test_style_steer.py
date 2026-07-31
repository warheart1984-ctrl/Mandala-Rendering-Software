"""Unit tests for anime / default media style steering."""

from __future__ import annotations

import os

import pytest
from fastapi.testclient import TestClient

os.environ["GENBLAZE_DRY_RUN"] = "1"

from app.config import Settings
from app.face_polish_defaults import resolve_face_polish_prompt
from app.main import app
from app.style_steer import (
    ANIME_STEER_SUFFIX,
    STYLE_ANIME,
    STYLE_DEFAULT,
    apply_style_steer,
    normalize_style,
    resolve_style,
    style_health_payload,
)


def test_normalize_style_aliases():
    assert normalize_style(None) == STYLE_DEFAULT
    assert normalize_style("") == STYLE_DEFAULT
    assert normalize_style("anime") == STYLE_ANIME
    assert normalize_style("CEL") == STYLE_ANIME
    assert normalize_style("default") == STYLE_DEFAULT
    with pytest.raises(ValueError, match="unsupported style"):
        normalize_style("oil-paint")


def test_apply_style_steer_appends_once():
    steered, flag = apply_style_steer("oracle mask mandala", "anime")
    assert flag is True
    assert "oracle mask mandala" in steered
    assert ANIME_STEER_SUFFIX in steered
    # Idempotent when cues already present
    again, flag2 = apply_style_steer(steered, "anime")
    assert flag2 is False
    assert again == steered


def test_resolve_style_request_overrides_settings():
    assert resolve_style(request_style="anime", settings_style="default") == STYLE_ANIME
    assert resolve_style(request_style=None, settings_style="anime") == STYLE_ANIME
    assert resolve_style(request_style="", settings_style="anime") == STYLE_ANIME


def test_face_polish_anime_default():
    assert "anime" in resolve_face_polish_prompt(None, face_rig=True, style="anime").lower()
    assert "cel-shaded" in resolve_face_polish_prompt("", face_rig=True, style="anime").lower()


def test_style_health_payload():
    payload = style_health_payload("anime")
    assert payload["default"] == STYLE_ANIME
    assert payload["anime_status"] == "partial"
    assert "style" in payload["api_field"]
    assert payload["entry_point"] == "constitutional-anime-rendering"
    awp = payload["anime_world_profile"]
    assert awp["enforcement_status"] == "declared"
    assert awp["validation_status"] == "partial"
    assert awp.get("example_valid") is True


def _offline_settings(**overrides) -> Settings:
    base = dict(
        nvidia_api_key=None,
        fal_api_key=None,
        b2_key_id=None,
        b2_app_key=None,
        b2_bucket="test-bucket",
        b2_region="us-east-005",
        b2_endpoint="https://s3.us-east-005.backblazeb2.com",
        storage_prefix="genblaze-media",
        image_model="black-forest-labs/flux.1-schnell",
        video_model="nvidia/cosmos-1.0-7b-diffusion-text2world",
        video_enabled=False,
        video_backend="nvidia",
        seedance_model="bytedance/seedance-2.0/text-to-video",
        seedance_resolution="720p",
        seedance_duration="5",
        seedance_aspect_ratio="16:9",
        seedance_generate_audio=True,
        seedance_watermark=False,
        embed_model="nvidia/nv-embedcode-7b-v1",
        embed_url="https://integrate.api.nvidia.com/v1/embeddings",
        embed_timeout_seconds=60.0,
        store_full_embeddings=True,
        presign_expires_seconds=3600,
        dry_run=True,
        b2_probe_on_health=False,
        abstract_retry_on_blank=True,
        empty_504_retry=False,
        empty_504_retry_delay_seconds=45.0,
        nvidia_warmup_on_startup=False,
        dotenv_loaded=(),
        media_style="default",
    )
    base.update(overrides)
    return Settings(**base)


@pytest.fixture()
def client(tmp_path, monkeypatch):
    monkeypatch.setenv("GENBLAZE_DRY_RUN", "1")
    monkeypatch.setattr("app.main.get_settings", lambda: _offline_settings())
    from app import main as main_mod
    from app.index_store import AssetIndex

    main_mod._index = AssetIndex(tmp_path / "recent.json")
    return TestClient(app)


def test_health_exposes_media_style(client):
    r = client.get("/health")
    assert r.status_code == 200
    body = r.json()
    assert "media_style" in body
    assert body["media_style"]["anime_status"] == "partial"
    assert "anime" in body["media_style"]["allowed"]


def test_generate_accepts_style_anime_dry_run(client):
    r = client.post(
        "/api/generate",
        json={"prompt": "oracle mask grown from metallic mandala petals", "style": "anime"},
    )
    assert r.status_code == 200, r.text
    data = r.json()
    assert data.get("style") == "anime"
    assert data.get("style_steered") is True
    assert "anime style" in (data.get("prompt") or "").lower()
    assert "partial" in (data.get("detail") or "").lower()


def test_generate_rejects_unknown_style(client):
    r = client.post(
        "/api/generate",
        json={"prompt": "neon tesseract", "style": "oil-paint"},
    )
    assert r.status_code == 400
