"""Seedance 2.0 cloud HTTP client (fal.ai gateway).

Status: **partial** — REST client for ByteDance Seedance 2.0 via fal.run /
queue.fal.run. Drive-G-1: this does not claim a free tier, watermark-free
consumer quota, or official ByteDance direct billing; those depend on the
gateway account and product terms.

Auth: ``Authorization: Key <FAL_KEY>`` (also accepts ``SEEDANCE_API_KEY``).

Evidence links (operator research):
- Official model page: https://seed.bytedance.com/en/seedance2_0
- fal text-to-video: https://fal.ai/models/bytedance/seedance-2.0/text-to-video
- Cloudflare Workers AI mirror: https://developers.cloudflare.com/ai/models/bytedance/seedance-2.0/
"""

from __future__ import annotations

import logging
import time
from dataclasses import dataclass
from typing import Any, Mapping
from urllib.parse import urljoin

import httpx

logger = logging.getLogger(__name__)

DEFAULT_FAL_RUN_BASE = "https://fal.run"
DEFAULT_FAL_QUEUE_BASE = "https://queue.fal.run"
DEFAULT_MODEL_ID = "bytedance/seedance-2.0/text-to-video"
DEFAULT_HTTP_TIMEOUT = 900.0
DEFAULT_POLL_INTERVAL = 2.0
DEFAULT_POLL_TIMEOUT = 900.0


@dataclass(frozen=True)
class SeedanceGenerateRequest:
    prompt: str
    model_id: str = DEFAULT_MODEL_ID
    resolution: str = "720p"
    duration: str = "5"
    aspect_ratio: str = "16:9"
    generate_audio: bool = True
    seed: int | None = None
    watermark: bool | None = None


@dataclass(frozen=True)
class SeedanceGenerateResult:
    video_url: str
    seed: int | None
    provider_request_id: str | None
    model_id: str
    raw: Mapping[str, Any]
    gateway: str = "fal"


class SeedanceClientError(RuntimeError):
    """Upstream Seedance/fal request failed."""


class SeedanceClient:
    """Thin httpx client for Seedance 2.0 via fal (sync run + queue poll)."""

    def __init__(
        self,
        api_key: str,
        *,
        run_base: str = DEFAULT_FAL_RUN_BASE,
        queue_base: str = DEFAULT_FAL_QUEUE_BASE,
        http_timeout: float = DEFAULT_HTTP_TIMEOUT,
        poll_interval: float = DEFAULT_POLL_INTERVAL,
        poll_timeout: float = DEFAULT_POLL_TIMEOUT,
        http_client: httpx.Client | None = None,
    ) -> None:
        key = (api_key or "").strip()
        if not key:
            raise ValueError("Seedance/fal API key is required")
        self._api_key = key
        self._run_base = run_base.rstrip("/") + "/"
        self._queue_base = queue_base.rstrip("/") + "/"
        self._http_timeout = http_timeout
        self._poll_interval = poll_interval
        self._poll_timeout = poll_timeout
        self._owns_client = http_client is None
        self._client = http_client or httpx.Client(
            timeout=httpx.Timeout(http_timeout, connect=30.0),
            headers={
                "Authorization": f"Key {key}",
                "Content-Type": "application/json",
                "Accept": "application/json",
            },
        )

    def close(self) -> None:
        if self._owns_client:
            self._client.close()

    def __enter__(self) -> SeedanceClient:
        return self

    def __exit__(self, *exc: object) -> None:
        self.close()

    def _payload(self, req: SeedanceGenerateRequest) -> dict[str, Any]:
        body: dict[str, Any] = {
            "prompt": req.prompt,
            "resolution": req.resolution,
            "duration": str(req.duration),
            "aspect_ratio": req.aspect_ratio,
            "generate_audio": bool(req.generate_audio),
        }
        if req.seed is not None:
            body["seed"] = int(req.seed)
        # Cloudflare schema exposes watermark; fal may ignore unknown keys.
        if req.watermark is not None:
            body["watermark"] = bool(req.watermark)
        return body

    def generate(self, req: SeedanceGenerateRequest) -> SeedanceGenerateResult:
        """Submit text-to-video; prefer sync fal.run, fall back to queue poll."""
        payload = self._payload(req)
        run_url = urljoin(self._run_base, req.model_id)
        try:
            response = self._client.post(run_url, json=payload)
        except httpx.HTTPError as exc:
            raise SeedanceClientError(f"Seedance transport error: {exc}") from exc

        if response.status_code == 200:
            return self._parse_result(response, req.model_id, gateway="fal.run")

        # Queue-style gateways often return 202 / JSON with request_id.
        if response.status_code in {202, 400, 404, 405, 422}:
            logger.info(
                "fal.run returned %s; trying queue.fal.run for %s",
                response.status_code,
                req.model_id,
            )
            return self._generate_via_queue(req, payload)

        if response.status_code >= 400:
            raise SeedanceClientError(
                f"Seedance fal.run failed HTTP {response.status_code}: "
                f"{response.text[:500]}"
            )
        return self._parse_result(response, req.model_id, gateway="fal.run")

    def _generate_via_queue(
        self, req: SeedanceGenerateRequest, payload: dict[str, Any]
    ) -> SeedanceGenerateResult:
        submit_url = urljoin(self._queue_base, req.model_id)
        try:
            submit = self._client.post(submit_url, json=payload)
        except httpx.HTTPError as exc:
            raise SeedanceClientError(f"Seedance queue submit error: {exc}") from exc
        if submit.status_code >= 400:
            raise SeedanceClientError(
                f"Seedance queue submit failed HTTP {submit.status_code}: "
                f"{submit.text[:500]}"
            )
        try:
            submit_body = submit.json()
        except ValueError as exc:
            raise SeedanceClientError(
                "Seedance queue submit returned non-JSON body"
            ) from exc

        request_id = (
            submit_body.get("request_id")
            or submit_body.get("requestId")
            or submit.headers.get("X-Fal-Request-Id")
            or submit.headers.get("x-request-id")
        )
        status_url = (
            submit_body.get("status_url")
            or submit_body.get("statusUrl")
            or (
                urljoin(self._queue_base, f"{req.model_id}/requests/{request_id}/status")
                if request_id
                else None
            )
        )
        result_url = (
            submit_body.get("response_url")
            or submit_body.get("responseUrl")
            or (
                urljoin(self._queue_base, f"{req.model_id}/requests/{request_id}")
                if request_id
                else None
            )
        )
        if not status_url or not result_url:
            raise SeedanceClientError(
                "Seedance queue response missing status/result URL or request_id"
            )

        deadline = time.monotonic() + self._poll_timeout
        while time.monotonic() < deadline:
            try:
                status_resp = self._client.get(status_url)
            except httpx.HTTPError as exc:
                raise SeedanceClientError(f"Seedance queue poll error: {exc}") from exc
            if status_resp.status_code >= 400:
                raise SeedanceClientError(
                    f"Seedance queue status failed HTTP {status_resp.status_code}: "
                    f"{status_resp.text[:500]}"
                )
            try:
                status_body = status_resp.json()
            except ValueError as exc:
                raise SeedanceClientError(
                    "Seedance queue status returned non-JSON body"
                ) from exc
            status = str(status_body.get("status") or "").upper()
            if status in {"COMPLETED", "OK", "SUCCESS"}:
                result_resp = self._client.get(result_url)
                if result_resp.status_code >= 400:
                    raise SeedanceClientError(
                        f"Seedance queue result failed HTTP {result_resp.status_code}: "
                        f"{result_resp.text[:500]}"
                    )
                parsed = self._parse_result(
                    result_resp, req.model_id, gateway="queue.fal.run"
                )
                if parsed.provider_request_id is None and request_id:
                    return SeedanceGenerateResult(
                        video_url=parsed.video_url,
                        seed=parsed.seed,
                        provider_request_id=str(request_id),
                        model_id=parsed.model_id,
                        raw=dict(parsed.raw),
                        gateway=parsed.gateway,
                    )
                return parsed
            if status in {"FAILED", "ERROR", "CANCELLED"}:
                raise SeedanceClientError(
                    f"Seedance queue job {status}: {status_body!r}"
                )
            time.sleep(self._poll_interval)

        raise SeedanceClientError(
            f"Seedance queue timed out after {self._poll_timeout}s "
            f"(request_id={request_id})"
        )

    def _parse_result(
        self, response: httpx.Response, model_id: str, *, gateway: str
    ) -> SeedanceGenerateResult:
        try:
            body = response.json()
        except ValueError as exc:
            raise SeedanceClientError(
                "Seedance response was not JSON"
            ) from exc
        video = body.get("video") if isinstance(body, dict) else None
        video_url = None
        if isinstance(video, dict):
            video_url = video.get("url")
        elif isinstance(video, str):
            video_url = video
        if not video_url and isinstance(body, dict):
            video_url = body.get("video_url") or body.get("url")
        if not isinstance(video_url, str) or not video_url.strip():
            raise SeedanceClientError(
                f"Seedance response missing video URL: keys={list(body) if isinstance(body, dict) else type(body)}"
            )
        seed_raw = body.get("seed") if isinstance(body, dict) else None
        seed: int | None
        try:
            seed = int(seed_raw) if seed_raw is not None else None
        except (TypeError, ValueError):
            seed = None
        request_id = (
            response.headers.get("X-Fal-Request-Id")
            or response.headers.get("x-request-id")
            or (body.get("request_id") if isinstance(body, dict) else None)
        )
        return SeedanceGenerateResult(
            video_url=video_url.strip(),
            seed=seed,
            provider_request_id=str(request_id) if request_id else None,
            model_id=model_id,
            raw=body if isinstance(body, dict) else {"value": body},
            gateway=gateway,
        )

    def download_video(self, url: str) -> bytes:
        try:
            response = self._client.get(url)
        except httpx.HTTPError as exc:
            raise SeedanceClientError(f"Seedance video download error: {exc}") from exc
        if response.status_code >= 400:
            raise SeedanceClientError(
                f"Seedance video download failed HTTP {response.status_code}"
            )
        data = response.content
        if not data:
            raise SeedanceClientError("Seedance video download returned empty body")
        return data
