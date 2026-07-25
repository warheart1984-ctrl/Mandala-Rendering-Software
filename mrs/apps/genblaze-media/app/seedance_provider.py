"""Seedance 2.0 video provider for Genblaze Media (cloud, no local GPU).

Parallel to the NVIDIA Cosmos path. No Story Forge imports. No cros package
imports (CROS charter keeps genblaze-media out of process).

Status: **partial** — live generate works when ``FAL_KEY`` / ``SEEDANCE_API_KEY``
is set and the fal gateway accepts the model; CI uses mocked HTTP only.
"""

from __future__ import annotations

import hashlib
from dataclasses import dataclass
from typing import Any

from app.seedance_client import (
    DEFAULT_MODEL_ID,
    SeedanceClient,
    SeedanceGenerateRequest,
    SeedanceGenerateResult,
)


@dataclass(frozen=True)
class SeedanceProviderResult:
    video_bytes: bytes
    video_url: str
    model_id: str
    provider: str
    provider_request_id: str | None
    prompt_sha256: str
    asset_sha256: str
    seed: int | None
    resolution: str
    duration: str
    gateway: str
    raw: dict[str, Any]

    def evidence(self) -> dict[str, Any]:
        """provider-contract evidence fields (not frame-identical)."""
        return {
            "replayClass": "provider-contract",
            "modelId": self.model_id,
            "provider": self.provider,
            "providerRequestId": self.provider_request_id,
            "promptSha256": self.prompt_sha256,
            "assetSha256": self.asset_sha256,
            "seed": self.seed,
            "resolution": self.resolution,
            "duration": self.duration,
            "gateway": self.gateway,
            "note": (
                "Replay = re-submit same pinned model + params + prompt hash; "
                "pixel/frame equality is not asserted."
            ),
        }


class SeedanceVideoProvider:
    """Cloud text-to-video via Seedance 2.0 (fal.ai gateway by default)."""

    PROVIDER_ID = "seedance-video"

    def __init__(
        self,
        api_key: str,
        *,
        model_id: str = DEFAULT_MODEL_ID,
        resolution: str = "720p",
        duration: str = "5",
        aspect_ratio: str = "16:9",
        generate_audio: bool = True,
        watermark: bool | None = False,
        client: SeedanceClient | None = None,
    ) -> None:
        self._model_id = model_id
        self._resolution = resolution
        self._duration = str(duration)
        self._aspect_ratio = aspect_ratio
        self._generate_audio = generate_audio
        self._watermark = watermark
        self._owns_client = client is None
        self._client = client or SeedanceClient(api_key)

    def close(self) -> None:
        if self._owns_client:
            self._client.close()

    def generate(self, prompt: str, *, seed: int | None = None) -> SeedanceProviderResult:
        cleaned = (prompt or "").strip()
        if not cleaned:
            raise ValueError("prompt is required")
        prompt_sha = hashlib.sha256(cleaned.encode("utf-8")).hexdigest()
        req = SeedanceGenerateRequest(
            prompt=cleaned,
            model_id=self._model_id,
            resolution=self._resolution,
            duration=self._duration,
            aspect_ratio=self._aspect_ratio,
            generate_audio=self._generate_audio,
            seed=seed,
            watermark=self._watermark,
        )
        upstream: SeedanceGenerateResult = self._client.generate(req)
        video_bytes = self._client.download_video(upstream.video_url)
        asset_sha = hashlib.sha256(video_bytes).hexdigest()
        return SeedanceProviderResult(
            video_bytes=video_bytes,
            video_url=upstream.video_url,
            model_id=upstream.model_id,
            provider=self.PROVIDER_ID,
            provider_request_id=upstream.provider_request_id,
            prompt_sha256=prompt_sha,
            asset_sha256=asset_sha,
            seed=upstream.seed if upstream.seed is not None else seed,
            resolution=self._resolution,
            duration=self._duration,
            gateway=upstream.gateway,
            raw=dict(upstream.raw),
        )
