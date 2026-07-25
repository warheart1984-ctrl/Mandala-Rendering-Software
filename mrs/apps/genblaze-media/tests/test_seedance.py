"""Mocked Seedance / fal video provider tests (no live paid calls)."""

from __future__ import annotations

import hashlib
from pathlib import Path

import httpx
import pytest
from fastapi.testclient import TestClient

from app.config import get_settings
from app.main import app
from app.pipeline_video import generate_video
from app.seedance_client import SeedanceClient, SeedanceGenerateRequest
from app.seedance_provider import SeedanceVideoProvider

# Same minimal MP4 stub used by pipeline dry-run.
_MINIMAL_MP4 = bytes.fromhex(
    "000000186674797069736f6d0000020069736f6d69736f32000000000866726565"
    "000000286d64617400000000000000000000000000000000000000000000000000"
)


def _settings_env(monkeypatch, **extra: str) -> None:
    monkeypatch.setenv("GENBLAZE_DRY_RUN", "0")
    monkeypatch.setenv("GENBLAZE_VIDEO_ENABLED", "1")
    monkeypatch.setenv("GENBLAZE_VIDEO_BACKEND", "seedance")
    monkeypatch.setenv("FAL_KEY", "test-fal-key")
    monkeypatch.delenv("NVIDIA_API_KEY", raising=False)
    monkeypatch.delenv("B2_KEY_ID", raising=False)
    monkeypatch.delenv("B2_APP_KEY", raising=False)
    for key, value in extra.items():
        monkeypatch.setenv(key, value)


def test_settings_seedance_backend_and_availability(monkeypatch):
    _settings_env(monkeypatch)
    s = get_settings()
    assert s.video_backend == "seedance"
    assert s.seedance_configured is True
    assert s.video_available is True
    assert s.seedance_model == "bytedance/seedance-2.0/text-to-video"


def test_settings_seedance_unavailable_without_key(monkeypatch):
    monkeypatch.setenv("GENBLAZE_VIDEO_ENABLED", "1")
    monkeypatch.setenv("GENBLAZE_VIDEO_BACKEND", "seedance")
    monkeypatch.delenv("FAL_KEY", raising=False)
    monkeypatch.delenv("SEEDANCE_API_KEY", raising=False)
    monkeypatch.delenv("FAL_API_KEY", raising=False)
    monkeypatch.setenv("GENBLAZE_DRY_RUN", "0")
    s = get_settings()
    assert s.seedance_configured is False
    assert s.video_available is False


def test_health_exposes_seedance_backend(monkeypatch):
    _settings_env(monkeypatch)
    client = TestClient(app)
    r = client.get("/health")
    assert r.status_code == 200
    body = r.json()
    assert body["video_backend"] == "seedance"
    assert body["seedance_configured"] is True
    assert body["cmm_id"] == "CMM-Seedance-v1.0"
    assert "bytedance/seedance-2.0" in body["video_model"]


def test_seedance_client_sync_run(monkeypatch):
    def handler(request: httpx.Request) -> httpx.Response:
        assert request.headers.get("Authorization") == "Key test-fal-key"
        if request.url.path.endswith("/text-to-video") and request.method == "POST":
            return httpx.Response(
                200,
                json={
                    "video": {"url": "https://example.invalid/out.mp4"},
                    "seed": 42,
                },
                headers={"X-Fal-Request-Id": "req-abc"},
            )
        if str(request.url) == "https://example.invalid/out.mp4":
            return httpx.Response(200, content=_MINIMAL_MP4)
        return httpx.Response(404, text="missing")

    transport = httpx.MockTransport(handler)
    client = httpx.Client(transport=transport, headers={"Authorization": "Key test-fal-key"})
    sc = SeedanceClient("test-fal-key", http_client=client)
    result = sc.generate(
        SeedanceGenerateRequest(prompt="a lantern drifts over water", duration="5")
    )
    assert result.video_url.endswith("out.mp4")
    assert result.seed == 42
    assert result.provider_request_id == "req-abc"
    data = sc.download_video(result.video_url)
    assert data[:4] == b"\x00\x00\x00\x18"
    sc.close()


def test_seedance_provider_evidence(monkeypatch):
    def handler(request: httpx.Request) -> httpx.Response:
        if request.method == "POST":
            return httpx.Response(
                200,
                json={"video": {"url": "https://example.invalid/clip.mp4"}, "seed": 7},
                headers={"X-Fal-Request-Id": "rid-1"},
            )
        return httpx.Response(200, content=_MINIMAL_MP4)

    transport = httpx.MockTransport(handler)
    http = httpx.Client(transport=transport, headers={"Authorization": "Key k"})
    provider = SeedanceVideoProvider(
        "k",
        client=SeedanceClient("k", http_client=http),
        resolution="720p",
        duration="5",
    )
    out = provider.generate("mandala rings expand in fog")
    provider.close()
    assert out.provider == "seedance-video"
    assert out.provider_request_id == "rid-1"
    assert out.asset_sha256 == hashlib.sha256(_MINIMAL_MP4).hexdigest()
    assert out.prompt_sha256 == hashlib.sha256(
        b"mandala rings expand in fog"
    ).hexdigest()
    ev = out.evidence()
    assert ev["replayClass"] == "provider-contract"
    assert ev["modelId"].startswith("bytedance/seedance-2.0")


def test_generate_video_seedance_mocked(monkeypatch):
    _settings_env(monkeypatch, SEEDANCE_RESOLUTION="720p", SEEDANCE_DURATION="5")

    def handler(request: httpx.Request) -> httpx.Response:
        if request.method == "POST":
            return httpx.Response(
                200,
                json={
                    "video": {"url": "https://cdn.example.invalid/v.mp4"},
                    "seed": 99,
                },
                headers={"X-Fal-Request-Id": "live-mock-1"},
            )
        return httpx.Response(200, content=_MINIMAL_MP4)

    transport = httpx.MockTransport(handler)
    real_client_init = SeedanceClient.__init__

    def patched_init(self, api_key, **kwargs):  # noqa: ANN001
        kwargs["http_client"] = httpx.Client(
            transport=transport,
            headers={"Authorization": f"Key {api_key}"},
        )
        real_client_init(self, api_key, **kwargs)

    monkeypatch.setattr(SeedanceClient, "__init__", patched_init)

    settings = get_settings()
    gen = generate_video(settings, "soft light over a stone courtyard")
    assert gen.provider == "seedance-video"
    assert gen.cmm_id == "CMM-Seedance-v1.0"
    assert gen.dry_run is False
    assert gen.asset_sha256 == hashlib.sha256(_MINIMAL_MP4).hexdigest()
    assert gen.quality and gen.quality["ok"] is True


def test_generate_video_seedance_dry_run(monkeypatch):
    monkeypatch.setenv("GENBLAZE_VIDEO_ENABLED", "1")
    monkeypatch.setenv("GENBLAZE_VIDEO_BACKEND", "seedance")
    monkeypatch.setenv("GENBLAZE_DRY_RUN", "1")
    monkeypatch.delenv("FAL_KEY", raising=False)
    settings = get_settings()
    gen = generate_video(settings, "dry seedance clip")
    assert gen.dry_run is True
    assert gen.provider == "seedance-video"
    assert gen.cmm_id == "CMM-Seedance-v1.0"
    assert "bytedance/seedance-2.0" in gen.model


def test_seedance_modules_have_no_story_forge():
    root = Path(__file__).resolve().parents[1] / "app"
    offenders: list[str] = []
    for path in root.glob("seedance*.py"):
        text = path.read_text(encoding="utf-8")
        if "story_forge" in text or "storyforge" in text:
            offenders.append(str(path))
    assert offenders == []
