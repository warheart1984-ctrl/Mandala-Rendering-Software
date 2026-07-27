"""Unit tests for image_polish — mock HTTP, assert provenance chain.

These tests verify the image_polish module without live fal.ai or NVIDIA calls.
They mock httpx.Client.post and assert the output contains the expected
provenance fields.
"""

from __future__ import annotations

import hashlib
from dataclasses import dataclass
from typing import Any
from unittest.mock import MagicMock, patch

import pytest

from app.image_polish import (
    POLISH_DEFAULT_MODEL,
    POLISH_DEFAULT_STRENGTH,
    POLISH_PROVIDER_ID,
    PolishError,
    PolishNotConfiguredError,
    _fal_img2img,
    _try_nvidia_img2img,
    polish_availability,
    polish_image,
)


def _dummy_png() -> bytes:
    """Minimal valid 2x2 PNG for test inputs."""
    import struct
    import zlib

    def chunk(t: bytes, d: bytes) -> bytes:
        c = t + d
        crc = struct.pack(">I", zlib.crc32(c) & 0xFFFFFFFF)
        return struct.pack(">I", len(d)) + c + crc

    raw = b""
    for y in range(2):
        raw += b"\x00" + b"\xff\x00\x00\xff" * 2
    return (
        b"\x89PNG\r\n\x1a\n"
        + chunk(b"IHDR", struct.pack(">IIBBBBB", 2, 2, 8, 6, 0, 0, 0))
        + chunk(b"IDAT", zlib.compress(raw))
        + chunk(b"IEND", b"")
    )


@dataclass
class FakeSettings:
    """Minimal settings object for polish tests."""
    polish_enabled: bool = True
    polish_model: str | None = None
    polish_default_strength: float = 0.45
    polish_backend: str = "fal"
    nvidia_api_key: str | None = None
    fal_api_key: str | None = "test-fal-key"
    nvidia_configured: bool = False
    b2_configured: bool = False


class TestPolishImage:
    """Tests for the core polish_image function with mocked HTTP."""

    def test_polish_disabled_raises(self):
        settings = FakeSettings(polish_enabled=False)
        with pytest.raises(PolishNotConfiguredError, match="disabled"):
            polish_image(settings, _dummy_png(), "refine", structure_run_id="abc")

    def test_no_provider_raises(self):
        settings = FakeSettings(fal_api_key=None, nvidia_api_key=None, polish_backend="fal")
        with pytest.raises(PolishNotConfiguredError, match="no img2img provider"):
            polish_image(settings, _dummy_png(), "refine", structure_run_id="abc")

    def test_fal_backend_missing_key_raises(self):
        settings = FakeSettings(fal_api_key=None, polish_backend="fal")
        with pytest.raises(PolishNotConfiguredError, match="FAL_KEY"):
            polish_image(settings, _dummy_png(), "refine", structure_run_id="abc")

    @patch("app.image_polish.httpx.Client")
    def test_fal_polish_success(self, mock_client_cls):
        """Mock fal.ai FLUX img2img, verify provenance fields."""
        mock_instance = MagicMock()
        mock_client_cls.return_value.__enter__.return_value = mock_instance

        # Mock the POST response: return an image URL then the image bytes.
        png = _dummy_png()
        mock_post_resp = MagicMock()
        mock_post_resp.status_code = 200
        mock_post_resp.json.return_value = {
            "images": [{"url": "https://fal.run/media/test-output.png"}],
        }
        mock_get_resp = MagicMock()
        mock_get_resp.status_code = 200
        mock_get_resp.content = png
        mock_instance.post.return_value = mock_post_resp
        mock_instance.get.return_value = mock_get_resp

        settings = FakeSettings()
        result = polish_image(
            settings,
            png,
            "enhance materials, add dramatic lighting",
            structure_run_id="abc-123",
            structure_sha256=hashlib.sha256(png).hexdigest(),
            strength=0.5,
        )

        assert result.status == "ok"
        assert result.structure_run_id == "abc-123"
        assert result.provider == POLISH_PROVIDER_ID
        assert result.model == POLISH_DEFAULT_MODEL
        assert result.strength == 0.5
        assert result.asset_sha256 == hashlib.sha256(png).hexdigest()
        assert result.img2img is True

        payload = result.to_dict()
        assert payload["img2img"] is True
        assert payload["manifest"]["structure_run_id"] == "abc-123"
        assert payload["manifest"]["polish_provider"] == POLISH_PROVIDER_ID
        assert payload["manifest"]["img2img"] is True
        assert payload["structure_sha256"] == hashlib.sha256(png).hexdigest()

    @patch("app.image_polish.httpx.Client")
    def test_fal_polish_http_error(self, mock_client_cls):
        """Mock fal.ai 4xx/5xx, verify PolishError raised."""
        mock_instance = MagicMock()
        mock_client_cls.return_value.__enter__.return_value = mock_instance
        mock_resp = MagicMock()
        mock_resp.status_code = 402
        mock_resp.text = '{"error": "insufficient credits"}'
        mock_instance.post.return_value = mock_resp

        settings = FakeSettings()
        with pytest.raises(PolishError, match="402"):
            polish_image(settings, _dummy_png(), "refine", structure_run_id="abc")

    @patch("app.image_polish.httpx.Client")
    def test_nvidia_then_fal_fallback(self, mock_client_cls):
        """NVIDIA returns None (T2I-only), fal succeeds."""
        mock_instance = MagicMock()
        mock_client_cls.return_value.__enter__.return_value = mock_instance
        png = _dummy_png()

        # First call = NVIDIA (fails with 400 -> None)
        # Second call = fal (succeeds)
        nvidia_resp = MagicMock()
        nvidia_resp.status_code = 400
        nvidia_resp.text = "bad request"

        fal_resp = MagicMock()
        fal_resp.status_code = 200
        fal_resp.json.return_value = {
            "images": [{"url": "https://fal.run/media/test.png"}],
        }

        mock_instance.post.side_effect = [nvidia_resp, fal_resp]
        get_resp = MagicMock()
        get_resp.status_code = 200
        get_resp.content = png
        mock_instance.get.return_value = get_resp

        settings = FakeSettings(
            polish_backend="auto",
            nvidia_api_key="test-nv-key",
            nvidia_configured=True,
            fal_api_key="test-fal-key",
        )
        result = polish_image(
            settings,
            png,
            "refine",
            structure_run_id="abc",
        )

        assert result.status == "ok"
        assert result.provider == POLISH_PROVIDER_ID  # fal fallback

    @patch("app.image_polish.httpx.Client")
    def test_nvidia_backend_no_fal_fallback(self, mock_client_cls):
        """polish_backend='nvidia' and T2I-only -> raise PolishError."""
        mock_instance = MagicMock()
        mock_client_cls.return_value.__enter__.return_value = mock_instance
        nvidia_resp = MagicMock()
        nvidia_resp.status_code = 400
        nvidia_resp.text = "bad request"
        mock_instance.post.return_value = nvidia_resp

        settings = FakeSettings(
            polish_backend="nvidia",
            nvidia_api_key="test-nv-key",
            nvidia_configured=True,
            fal_api_key=None,
        )
        with pytest.raises(PolishError, match="T2I-only"):
            polish_image(settings, _dummy_png(), "refine", structure_run_id="abc")


class TestFalImg2Img:
    """Direct tests for the low-level _fal_img2img function."""

    @patch("app.image_polish.httpx.Client")
    def test_success_url_response(self, mock_client_cls):
        mock_instance = MagicMock()
        mock_client_cls.return_value.__enter__.return_value = mock_instance
        png = _dummy_png()
        mock_post = MagicMock(status_code=200)
        mock_post.json.return_value = {"images": [{"url": "https://fal.run/img.png"}]}
        mock_get = MagicMock(status_code=200, content=png)
        mock_instance.post.return_value = mock_post
        mock_instance.get.return_value = mock_get

        result = _fal_img2img("test-key", png, "refine")
        assert result == png

    @patch("app.image_polish.httpx.Client")
    def test_success_base64_response(self, mock_client_cls):
        import base64
        mock_instance = MagicMock()
        mock_client_cls.return_value.__enter__.return_value = mock_instance
        png = _dummy_png()
        b64 = base64.b64encode(png).decode("ascii")
        mock_post = MagicMock(status_code=200)
        mock_post.json.return_value = {"images": [{"content": b64}]}
        mock_instance.post.return_value = mock_post

        result = _fal_img2img("test-key", png, "refine")
        assert result == png

    @patch("app.image_polish.httpx.Client")
    def test_no_images_raises(self, mock_client_cls):
        mock_instance = MagicMock()
        mock_client_cls.return_value.__enter__.return_value = mock_instance
        mock_post = MagicMock(status_code=200)
        mock_post.json.return_value = {}
        mock_instance.post.return_value = mock_post

        with pytest.raises(PolishError, match="no images"):
            _fal_img2img("test-key", _dummy_png(), "refine")


class TestNvidiaImg2Img:
    """Tests for the _try_nvidia_img2img probe function."""

    @patch("app.image_polish.httpx.Client")
    def test_success(self, mock_client_cls):
        import base64
        mock_instance = MagicMock()
        mock_client_cls.return_value.__enter__.return_value = mock_instance
        png = _dummy_png()
        b64 = base64.b64encode(png).decode("ascii")
        mock_resp = MagicMock(status_code=200)
        mock_resp.json.return_value = {"artifacts": [{"base64": b64}]}
        mock_instance.post.return_value = mock_resp

        result = _try_nvidia_img2img("test-key", png, "refine")
        assert result == png

    @patch("app.image_polish.httpx.Client")
    def test_t2i_only_returns_none(self, mock_client_cls):
        mock_instance = MagicMock()
        mock_client_cls.return_value.__enter__.return_value = mock_instance
        mock_resp = MagicMock(status_code=400)
        mock_instance.post.return_value = mock_resp

        result = _try_nvidia_img2img("test-key", _dummy_png(), "refine")
        assert result is None

    @patch("app.image_polish.httpx.Client")
    def test_transport_error_raises(self, mock_client_cls):
        import httpx
        mock_instance = MagicMock()
        mock_client_cls.return_value.__enter__.return_value = mock_instance
        mock_instance.post.side_effect = httpx.HTTPError("timeout")

        with pytest.raises(PolishError, match="transport"):
            _try_nvidia_img2img("test-key", _dummy_png(), "refine")


class TestPolishAvailability:
    """Tests for the /health availability disclosure."""

    def test_disabled_when_polish_disabled(self):
        settings = FakeSettings(polish_enabled=False)
        av = polish_availability(settings)
        assert av["available"] is False
        assert av["img2img_wired"] is False

    def test_enabled_with_fal_key(self):
        settings = FakeSettings(
            polish_enabled=True,
            polish_backend="fal",
            fal_api_key="test-key",
        )
        av = polish_availability(settings)
        assert av["available"] is True
        assert av["img2img_wired"] is True
        assert av["backend"] == "fal"

    def test_not_ready_without_key(self):
        settings = FakeSettings(
            polish_enabled=True,
            polish_backend="fal",
            fal_api_key=None,
        )
        av = polish_availability(settings)
        assert av["available"] is False
        assert av["img2img_wired"] is False

    def test_auto_backend_any_key(self):
        settings = FakeSettings(
            polish_enabled=True,
            polish_backend="auto",
            fal_api_key="test-key",
            nvidia_api_key="nv-key",
            nvidia_configured=True,
        )
        av = polish_availability(settings)
        assert av["available"] is True
        assert av["img2img_wired"] is True

    def test_nvidia_backend_configured(self):
        settings = FakeSettings(
            polish_enabled=True,
            polish_backend="nvidia",
            nvidia_api_key="nv-key",
            nvidia_configured=True,
            fal_api_key=None,
        )
        av = polish_availability(settings)
        assert av["available"] is True
        assert av["img2img_wired"] is True
