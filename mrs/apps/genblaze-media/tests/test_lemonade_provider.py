"""Unit tests for the local Lemonade image backend (mocked HTTP)."""

from __future__ import annotations

import base64
import io

import pytest
from PIL import Image

from app.config import Settings
from app.lemonade_provider import (
    LEMONADE_PROVIDER_ID,
    LemonadeGenerateError,
    _model_id,
    generate_image_lemonade,
    lemonade_availability,
)


def _tiny_png_bytes(color: tuple[int, int, int] = (180, 90, 40)) -> bytes:
    img = Image.new("RGB", (64, 64), color)
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return buf.getvalue()


def _settings(**overrides) -> Settings:
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
        dry_run=False,
        b2_probe_on_health=False,
        abstract_retry_on_blank=True,
        empty_504_retry=False,
        empty_504_retry_delay_seconds=45.0,
        nvidia_warmup_on_startup=False,
        dotenv_loaded=(),
        image_backend="lemonade",
        lemonade_base_url="http://127.0.0.1:13305/api/v1",
        lemonade_model="SD-Turbo",
        lemonade_size="512x512",
        lemonade_steps=4,
        lemonade_timeout_seconds=30.0,
        lemonade_api_key=None,
    )
    base.update(overrides)
    return Settings(**base)


def test_model_id_defaults_away_from_flux_slug():
    s = _settings(lemonade_model=None, image_model="black-forest-labs/flux.1-schnell")
    assert _model_id(s) == "SD-Turbo"


def test_model_id_respects_explicit_lemonade_model():
    s = _settings(lemonade_model="SDXL-Turbo")
    assert _model_id(s) == "SDXL-Turbo"


def test_availability_reports_reachable(monkeypatch):
    png = _tiny_png_bytes()

    class FakeResp:
        status_code = 200

    class FakeClient:
        def __init__(self, *args, **kwargs):
            pass

        def __enter__(self):
            return self

        def __exit__(self, *args):
            return False

        def get(self, url):
            return FakeResp()

    monkeypatch.setattr("app.lemonade_provider.httpx.Client", FakeClient)
    info = lemonade_availability(_settings())
    assert info["available"] is True
    assert info["model"] == "SD-Turbo"
    assert png  # keep helper used for generate tests


def test_generate_image_lemonade_local_only(monkeypatch):
    png = _tiny_png_bytes()
    b64 = base64.b64encode(png).decode("ascii")

    class FakeResp:
        status_code = 200
        text = ""

        def json(self):
            return {"data": [{"b64_json": b64}]}

    class FakeClient:
        def __init__(self, *args, **kwargs):
            pass

        def __enter__(self):
            return self

        def __exit__(self, *args):
            return False

        def post(self, url, headers=None, json=None):
            assert url.endswith("/images/generations")
            assert json["model"] == "SD-Turbo"
            assert "mandala" in json["prompt"].lower() or json["prompt"]
            return FakeResp()

    monkeypatch.setattr("app.lemonade_provider.httpx.Client", FakeClient)
    gen = generate_image_lemonade(
        _settings(), "sacred geometry mandala lattice, abstract"
    )
    assert gen.provider == LEMONADE_PROVIDER_ID
    assert gen.status == "ok"
    assert gen.asset_sha256
    assert gen.provenance is not None
    assert gen.provenance["provider"] == LEMONADE_PROVIDER_ID
    assert "local-only" in (gen.detail or "").lower()


def test_generate_image_lemonade_model_missing(monkeypatch):
    class FakeResp:
        status_code = 404
        text = "model not found"

        def json(self):
            return {}

    class FakeClient:
        def __init__(self, *args, **kwargs):
            pass

        def __enter__(self):
            return self

        def __exit__(self, *args):
            return False

        def post(self, url, headers=None, json=None):
            return FakeResp()

    monkeypatch.setattr("app.lemonade_provider.httpx.Client", FakeClient)
    with pytest.raises(LemonadeGenerateError, match="lemonade pull"):
        generate_image_lemonade(_settings(), "tesseract mandala")
