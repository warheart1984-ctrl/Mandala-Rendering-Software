"""NVIDIA GenAI HTTP client defaults for FLUX (timeouts + NVCF poll header).

Evidence: live failures surface as
``NVIDIA submit failed (transport): The read operation timed out`` from
``genblaze_nvidia.NvidiaClient.post_generation`` when the sync POST to
``ai.api.nvidia.com`` holds longer than the httpx read timeout (cold NIM /
queue). NVIDIA documents ``NVCF-POLL-SECONDS`` (max 300): hold up to that
many seconds, then return ``202`` + ``NVCF-REQID`` so the client can poll
``api.nvcf.nvidia.com`` instead of one unbounded read.
"""

from __future__ import annotations

import os
from dataclasses import dataclass

import httpx

DEFAULT_GEN_BASE_URL = "https://ai.api.nvidia.com/v1"

# Before (app defaults): http=300, nvcf=300, pipeline=420, no NVCF-POLL-SECONDS.
# After: longer read + explicit poll window so cold starts become 202→poll.
DEFAULT_HTTP_TIMEOUT = 600.0
DEFAULT_NVCF_TIMEOUT = 600.0
DEFAULT_PIPELINE_TIMEOUT = 720
DEFAULT_NVCF_POLL_SECONDS = 90
DEFAULT_CONNECT_TIMEOUT = 30.0


def _env_float(name: str, default: float) -> float:
    raw = (os.getenv(name) or "").strip()
    if not raw:
        return default
    try:
        return float(raw)
    except ValueError:
        return default


def _env_int(name: str, default: int, *, lo: int, hi: int) -> int:
    raw = (os.getenv(name) or "").strip()
    if not raw:
        value = default
    else:
        try:
            value = int(raw)
        except ValueError:
            value = default
    return max(lo, min(hi, value))


@dataclass(frozen=True)
class NvidiaGenaiTimeouts:
    """Timeouts and NVCF long-poll window for image generation."""

    http_timeout: float
    nvcf_timeout: float
    pipeline_timeout: int
    nvcf_poll_seconds: int
    connect_timeout: float

    @classmethod
    def from_env(cls) -> NvidiaGenaiTimeouts:
        poll = _env_int(
            "GENBLAZE_NVCF_POLL_SECONDS",
            DEFAULT_NVCF_POLL_SECONDS,
            lo=0,
            hi=300,
        )
        http = _env_float("GENBLAZE_HTTP_TIMEOUT", DEFAULT_HTTP_TIMEOUT)
        # Read must outlive NVCF long-poll or the client times out before 202.
        min_http = float(poll) + 30.0
        if http < min_http:
            http = min_http
        return cls(
            http_timeout=http,
            nvcf_timeout=_env_float("GENBLAZE_NVCF_TIMEOUT", DEFAULT_NVCF_TIMEOUT),
            pipeline_timeout=int(
                _env_float("GENBLAZE_PIPELINE_TIMEOUT", float(DEFAULT_PIPELINE_TIMEOUT))
            ),
            nvcf_poll_seconds=poll,
            connect_timeout=_env_float(
                "GENBLAZE_CONNECT_TIMEOUT", DEFAULT_CONNECT_TIMEOUT
            ),
        )


def build_nvidia_genai_client(
    api_key: str,
    timeouts: NvidiaGenaiTimeouts | None = None,
    *,
    gen_base_url: str | None = None,
) -> httpx.Client:
    """Build an httpx client for Genblaze ``NvidiaImageProvider(http_client=…)``.

    Sets ``NVCF-POLL-SECONDS`` so queued/cold FLUX returns 202 for polling
    instead of holding one sync read until the transport times out.
    """
    cfg = timeouts or NvidiaGenaiTimeouts.from_env()
    base = (
        gen_base_url
        or (os.getenv("NVIDIA_GEN_BASE_URL") or "").strip()
        or DEFAULT_GEN_BASE_URL
    ).rstrip("/")
    timeout = httpx.Timeout(
        connect=cfg.connect_timeout,
        read=cfg.http_timeout,
        write=min(120.0, cfg.http_timeout),
        pool=cfg.connect_timeout,
    )
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Accept": "application/json",
        "Content-Type": "application/json",
        # Cap sync hold; Genblaze image provider already polls on 202.
        "NVCF-POLL-SECONDS": str(cfg.nvcf_poll_seconds),
    }
    return httpx.Client(base_url=base, headers=headers, timeout=timeout)
