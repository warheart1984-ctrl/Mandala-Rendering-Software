"""Unit tests for image ingest / analyze (no GPU / no live keys)."""

from __future__ import annotations

import base64
import io
import os
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from PIL import Image

os.environ["GENBLAZE_DRY_RUN"] = "1"

from app.config import Settings
from app.image_ingest import is_valid_image, sanitize_filename
from app.main import app  # noqa: E402


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
    )
    base.update(overrides)
    return Settings(**base)


def _png_bytes(color=(40, 120, 200), size=(32, 24)) -> bytes:
    img = Image.new("RGB", size, color)
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return buf.getvalue()


@pytest.fixture()
def ingest_client(tmp_path, monkeypatch):
    monkeypatch.setenv("GENBLAZE_DRY_RUN", "1")
    monkeypatch.setattr("app.main.get_settings", _offline_settings)
    monkeypatch.setattr("app.main.APP_DIR", tmp_path)
    from app import main as main_mod
    from app.index_store import AssetIndex

    main_mod._index = AssetIndex(tmp_path / "recent.json")
    return TestClient(app)


def test_sanitize_filename_strips_traversal():
    assert ".." not in sanitize_filename("../../etc/passwd")
    assert "/" not in sanitize_filename("a/b/c.png")
    assert sanitize_filename("photo.PNG").endswith(".PNG") or "photo" in sanitize_filename(
        "photo.PNG"
    )


def test_is_valid_image_accepts_png():
    ok, err, info = is_valid_image(_png_bytes(), filename="x.png")
    assert ok is True
    assert err is None
    assert info["format"] == "PNG"
    assert info["width"] == 32
    assert info["dominant_color"].startswith("#")


def test_is_valid_image_rejects_garbage():
    ok, err, _ = is_valid_image(b"not-an-image")
    assert ok is False
    assert err


def test_ingest_analyze_list_roundtrip(ingest_client, tmp_path):
    png = _png_bytes()
    b64 = base64.b64encode(png).decode("ascii")
    r = ingest_client.post(
        "/api/image/ingest",
        json={"image_base64": b64, "filename": "scene.png", "mime": "image/png"},
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["id"]
    assert body["format"] == "PNG"
    assert body["width"] == 32
    assert "disclaimer" in body
    image_id = body["id"]

    listed = ingest_client.get("/api/image/ingested")
    assert listed.status_code == 200
    items = listed.json()["items"]
    assert any(i["id"] == image_id for i in items)

    analyzed = ingest_client.post("/api/image/analyze", json={"id": image_id})
    assert analyzed.status_code == 200
    analysis = analyzed.json()
    assert analysis["analysis_mode"] == "heuristic"
    assert "suggestion" in analysis
    assert analysis["suggestion"]["suggested_color"].startswith("#")
    assert "not" in analysis["disclaimer"].lower() or "Heuristic" in analysis["disclaimer"]

    file_r = ingest_client.get(f"/api/image/ingested/{image_id}/file")
    assert file_r.status_code == 200
    assert file_r.content[:8] == png[:8]

    # Path-looking ids rejected
    bad = ingest_client.post("/api/image/analyze", json={"id": "../secret"})
    assert bad.status_code == 400


def test_ingest_rejects_non_image(ingest_client):
    b64 = base64.b64encode(b"hello").decode("ascii")
    r = ingest_client.post(
        "/api/image/ingest",
        json={"image_base64": b64, "filename": "x.png"},
    )
    assert r.status_code == 400


def test_ingest_multipart(ingest_client):
    png = _png_bytes(color=(200, 40, 40))
    r = ingest_client.post(
        "/api/image/ingest",
        files={"file": ("warm.png", png, "image/png")},
    )
    assert r.status_code == 200, r.text
    assert r.json()["format"] == "PNG"


def test_ingest_multipart_missing_dependency_returns_503(ingest_client, monkeypatch):
    """Starlette without python-multipart must not become an unhandled 500."""
    from starlette.requests import Request

    async def _boom(self, *args, **kwargs):
        raise RuntimeError('Form data requires "python-multipart" to be installed.')

    monkeypatch.setattr(Request, "form", _boom)
    png = _png_bytes(color=(200, 40, 40))
    r = ingest_client.post(
        "/api/image/ingest",
        files={"file": ("warm.png", png, "image/png")},
    )
    assert r.status_code == 503, r.text
    assert "python-multipart" in r.json()["detail"].lower()
