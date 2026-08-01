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
    POLISH_HFSPACE_MODEL,
    POLISH_PROVIDER_ID,
    POLISH_PROVIDER_ID_HFSPACE,
    PolishError,
    PolishNotConfiguredError,
    _fal_img2img,
    _hfspace_build_payload,
    _hfspace_extract_embedded_error,
    _hfspace_extract_image_url,
    _hfspace_img2img,
    _hfspace_parse_sse,
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
    hfspace_url: str = "https://m3st3rj4k3l-flux-2-klein-multi-lora.hf.space"
    hfspace_timeout_seconds: float = 180.0

    @property
    def hfspace_configured(self) -> bool:
        return bool(self.hfspace_url)


def _mock_hfspace_client(
    mock_client_cls,
    png: bytes,
    sse_text: str | None = None,
    upload_json=None,
    start_json=None,
    upload_status: int = 200,
    start_status: int = 200,
) -> MagicMock:
    """Wire a MagicMock httpx.Client for the upload→infer→poll→download flow."""
    mock_instance = MagicMock()
    mock_client_cls.return_value.__enter__.return_value = mock_instance

    upload_resp = MagicMock(status_code=upload_status)
    upload_resp.json.return_value = upload_json if upload_json is not None else ["/tmp/gradio/base.png"]
    start_resp = MagicMock(status_code=start_status)
    start_resp.json.return_value = start_json if start_json is not None else {"event_id": "evt-1"}
    if sse_text is None:
        sse_text = (
            'event: complete\ndata: [{"url": '
            '"https://m3st3rj4k3l-flux-2-klein-multi-lora.hf.space/gradio_api/file=/tmp/out.png"}]\n\n'
        )
    sse_resp = MagicMock(status_code=200, text=sse_text)
    img_resp = MagicMock(status_code=200, content=png)

    mock_instance.post.side_effect = [upload_resp, start_resp]
    mock_instance.get.side_effect = [sse_resp, img_resp]
    return mock_instance


class TestPolishImage:
    """Tests for the core polish_image function with mocked HTTP."""

    def test_polish_disabled_raises(self):
        settings = FakeSettings(polish_enabled=False)
        with pytest.raises(PolishNotConfiguredError, match="disabled"):
            polish_image(settings, _dummy_png(), "refine", structure_run_id="abc")

    def test_no_provider_raises(self):
        settings = FakeSettings(
            fal_api_key=None,
            nvidia_api_key=None,
            nvidia_configured=False,
            polish_backend="auto",
            hfspace_url="",
        )
        with pytest.raises(PolishNotConfiguredError, match="[Nn]o img2img provider"):
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

    @patch("app.image_polish.httpx.Client")
    def test_hfspace_backend_success(self, mock_client_cls):
        """polish_backend='hfspace' → keyless upload/infer/poll/download."""
        png = _dummy_png()
        _mock_hfspace_client(mock_client_cls, png)

        settings = FakeSettings(
            polish_backend="hfspace",
            fal_api_key=None,
            nvidia_api_key=None,
        )
        result = polish_image(
            settings,
            png,
            "refine",
            structure_run_id="abc",
        )

        assert result.status == "ok"
        assert result.provider == POLISH_PROVIDER_ID_HFSPACE
        assert result.model == POLISH_HFSPACE_MODEL
        assert result.asset_sha256 == hashlib.sha256(png).hexdigest()
        assert result.to_dict()["manifest"]["polish_provider"] == POLISH_PROVIDER_ID_HFSPACE

    @patch("app.image_polish.httpx.Client")
    def test_auto_backend_hfspace_fallback(self, mock_client_cls):
        """auto with no NVIDIA/fal keys → keyless hfspace succeeds."""
        png = _dummy_png()
        _mock_hfspace_client(mock_client_cls, png)

        settings = FakeSettings(
            polish_backend="auto",
            fal_api_key=None,
            nvidia_api_key=None,
            nvidia_configured=False,
        )
        result = polish_image(settings, png, "refine", structure_run_id="abc")
        assert result.status == "ok"
        assert result.provider == POLISH_PROVIDER_ID_HFSPACE

    @patch("app.image_polish.httpx.Client")
    def test_hfspace_backend_error_raises(self, mock_client_cls):
        """SSE error event from the Space → PolishError surfaces to caller."""
        png = _dummy_png()
        _mock_hfspace_client(
            mock_client_cls,
            png,
            sse_text='event: error\ndata: {"error": "quota exceeded, retry in 24h"}\n\n',
        )
        settings = FakeSettings(
            polish_backend="hfspace",
            fal_api_key=None,
            nvidia_api_key=None,
        )
        with pytest.raises(PolishError, match="quota"):
            polish_image(settings, png, "refine", structure_run_id="abc")


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

    def test_url_download_uses_open_client(self):
        """Regression: image URL fetch must happen before the httpx context exits."""
        png = _dummy_png()
        state = {"entered": False, "exited": False, "get_while_open": False}

        class TrackingClient:
            def __init__(self, *args, **kwargs):
                pass

            def __enter__(self):
                state["entered"] = True
                return self

            def __exit__(self, *args):
                state["exited"] = True
                return False

            def post(self, *args, **kwargs):
                assert not state["exited"]
                resp = MagicMock(status_code=200)
                resp.json.return_value = {
                    "images": [{"url": "https://fal.run/media/test-output.png"}],
                }
                return resp

            def get(self, url, *args, **kwargs):
                assert state["entered"] and not state["exited"], (
                    "client.get called after httpx Client context closed"
                )
                state["get_while_open"] = True
                resp = MagicMock(status_code=200, content=png)
                resp.raise_for_status = MagicMock()
                return resp

        with patch("app.image_polish.httpx.Client", TrackingClient):
            result = _fal_img2img("test-key", png, "refine")

        assert result == png
        assert state["get_while_open"] is True
        assert state["exited"] is True

    def test_top_level_image_url_download_uses_open_client(self):
        """Same regression for fal responses that return image_url (no images[])."""
        png = _dummy_png()
        state = {"exited": False, "get_while_open": False}

        class TrackingClient:
            def __init__(self, *args, **kwargs):
                pass

            def __enter__(self):
                return self

            def __exit__(self, *args):
                state["exited"] = True
                return False

            def post(self, *args, **kwargs):
                resp = MagicMock(status_code=200)
                resp.json.return_value = {
                    "image_url": "https://fal.run/media/direct.png",
                }
                return resp

            def get(self, url, *args, **kwargs):
                assert not state["exited"]
                state["get_while_open"] = True
                resp = MagicMock(status_code=200, content=png)
                resp.raise_for_status = MagicMock()
                return resp

        with patch("app.image_polish.httpx.Client", TrackingClient):
            result = _fal_img2img("test-key", png, "refine")

        assert result == png
        assert state["get_while_open"] is True

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


class TestHfspaceImg2Img:
    """Direct tests for the keyless HF Space img2img backend (mocked HTTP)."""

    @patch("app.image_polish.httpx.Client")
    def test_success_full_flow(self, mock_client_cls):
        png = _dummy_png()
        _mock_hfspace_client(mock_client_cls, png)

        result = _hfspace_img2img(png, "refine")
        assert result == png

    @patch("app.image_polish.httpx.Client")
    def test_error_event_raises(self, mock_client_cls):
        png = _dummy_png()
        _mock_hfspace_client(
            mock_client_cls,
            png,
            sse_text='event: error\ndata: {"error": "quota exceeded"}\n\n',
        )
        with pytest.raises(PolishError, match="quota"):
            _hfspace_img2img(png, "refine")

    @patch("app.image_polish.httpx.Client")
    def test_complete_without_image_raises(self, mock_client_cls):
        png = _dummy_png()
        _mock_hfspace_client(
            mock_client_cls,
            png,
            sse_text='event: complete\ndata: {"status": "done"}\n\n',
        )
        with pytest.raises(PolishError, match="without producing"):
            _hfspace_img2img(png, "refine")

    @patch("app.image_polish.httpx.Client")
    def test_timeout_raises(self, mock_client_cls):
        png = _dummy_png()
        mock_instance = MagicMock()
        mock_client_cls.return_value.__enter__.return_value = mock_instance
        upload_resp = MagicMock(status_code=200)
        upload_resp.json.return_value = ["/tmp/gradio/base.png"]
        start_resp = MagicMock(status_code=200)
        start_resp.json.return_value = {"event_id": "evt-1"}
        poll_resp = MagicMock(
            status_code=200,
            text='event: generating\ndata: {"status": "thinking"}\n\n',
        )
        mock_instance.post.side_effect = [upload_resp, start_resp]
        mock_instance.get.side_effect = [poll_resp]

        with pytest.raises(PolishError, match="timed out"):
            _hfspace_img2img(png, "refine", timeout=0.05)

    def test_payload_shape(self):
        data = _hfspace_build_payload("/tmp/gradio/base.png", "refine", 0.45)
        assert len(data) == 27
        assert data[0] == {"path": "/tmp/gradio/base.png"}
        assert data[2] == "refine"
        assert data[-6:] == [1.0] * 6
        assert data[12] == 1024  # width
        assert data[13] == 1024  # height

    def test_payload_seed_deterministic(self):
        a = _hfspace_build_payload("/tmp/a.png", "same prompt", 0.5)
        b = _hfspace_build_payload("/tmp/b.png", "same prompt", 0.5)
        assert a[6] == b[6]
        c = _hfspace_build_payload("/tmp/a.png", "other prompt", 0.5)
        assert a[6] != c[6]

    def test_extract_image_url_escaped_slash(self):
        sse = '[{"url": "https://host/gradio_api/file=\\/tmp\\/out.png"}]'
        assert _hfspace_extract_image_url(sse) == "https://host/gradio_api/file=/tmp/out.png"

    def test_extract_image_url_none(self):
        assert _hfspace_extract_image_url('{"status": "done"}') is None

    def test_parse_sse_multiple_events(self):
        text = (
            'event: generating\ndata: {"status": "step 1"}\n\n'
            'event: generating\ndata: {"status": "step 2"}\n\n'
        )
        events = _hfspace_parse_sse(text)
        assert len(events) == 2
        assert events[0] == ("generating", '{"status": "step 1"}')
        assert events[1] == ("generating", '{"status": "step 2"}')

    def test_embedded_error_non_json(self):
        assert _hfspace_extract_embedded_error('"plain text with an error inside"') is not None
        assert _hfspace_extract_embedded_error('"all clear"') is None

    @patch("app.image_polish.httpx.Client")
    def test_upload_http_error_raises(self, mock_client_cls):
        png = _dummy_png()
        _mock_hfspace_client(mock_client_cls, png, upload_status=500)
        with pytest.raises(PolishError, match="upload failed"):
            _hfspace_img2img(png, "refine")

    @patch("app.image_polish.httpx.Client")
    def test_upload_empty_response_raises(self, mock_client_cls):
        png = _dummy_png()
        _mock_hfspace_client(mock_client_cls, png, upload_json=[])
        with pytest.raises(PolishError, match="unexpected response"):
            _hfspace_img2img(png, "refine")


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

    def test_hfspace_backend_configured(self):
        settings = FakeSettings(
            polish_enabled=True,
            polish_backend="hfspace",
            fal_api_key=None,
            nvidia_api_key=None,
        )
        av = polish_availability(settings)
        assert av["available"] is True
        assert av["img2img_wired"] is True
        assert av["hfspace_img2img_possible"] is True

    def test_auto_backend_hfspace_only(self):
        settings = FakeSettings(
            polish_enabled=True,
            polish_backend="auto",
            fal_api_key=None,
            nvidia_api_key=None,
            nvidia_configured=False,
        )
        av = polish_availability(settings)
        assert av["available"] is True
        assert av["img2img_wired"] is True
