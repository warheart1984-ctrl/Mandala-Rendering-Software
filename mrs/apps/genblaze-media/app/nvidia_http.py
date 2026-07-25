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
# Poll default 120 (was 90): live Render E2E saw empty 504s around 125–153s;
# holding the sync window longer (NVIDIA max 300) reduces premature gateway 504s.
DEFAULT_HTTP_TIMEOUT = 600.0
DEFAULT_NVCF_TIMEOUT = 600.0
DEFAULT_PIPELINE_TIMEOUT = 720
DEFAULT_NVCF_POLL_SECONDS = 120
DEFAULT_CONNECT_TIMEOUT = 30.0
# Opt-in empty-504 delayed retry (see pipeline.generate_image). Default OFF —
# never silently double-bill. Delay gives NIM time to finish cold-starting.
DEFAULT_EMPTY_504_RETRY_DELAY = 45.0


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


# Cosmos / NIM video: colder queues and longer diffusion than FLUX stills.
DEFAULT_VIDEO_HTTP_TIMEOUT = 900.0
DEFAULT_VIDEO_NVCF_TIMEOUT = 900.0
DEFAULT_VIDEO_PIPELINE_TIMEOUT = 1200
DEFAULT_VIDEO_NVCF_POLL_SECONDS = 120


@dataclass(frozen=True)
class NvidiaVideoTimeouts:
    """Timeouts and NVCF long-poll window for Cosmos text-to-video."""

    http_timeout: float
    nvcf_timeout: float
    pipeline_timeout: int
    nvcf_poll_seconds: int
    connect_timeout: float

    @classmethod
    def from_env(cls) -> NvidiaVideoTimeouts:
        poll = _env_int(
            "GENBLAZE_VIDEO_NVCF_POLL_SECONDS",
            DEFAULT_VIDEO_NVCF_POLL_SECONDS,
            lo=0,
            hi=300,
        )
        http = _env_float("GENBLAZE_VIDEO_HTTP_TIMEOUT", DEFAULT_VIDEO_HTTP_TIMEOUT)
        min_http = float(poll) + 30.0
        if http < min_http:
            http = min_http
        return cls(
            http_timeout=http,
            nvcf_timeout=_env_float(
                "GENBLAZE_VIDEO_NVCF_TIMEOUT", DEFAULT_VIDEO_NVCF_TIMEOUT
            ),
            pipeline_timeout=int(
                _env_float(
                    "GENBLAZE_VIDEO_PIPELINE_TIMEOUT",
                    float(DEFAULT_VIDEO_PIPELINE_TIMEOUT),
                )
            ),
            nvcf_poll_seconds=poll,
            connect_timeout=_env_float(
                "GENBLAZE_CONNECT_TIMEOUT", DEFAULT_CONNECT_TIMEOUT
            ),
        )


def build_nvidia_genai_client(
    api_key: str,
    timeouts: NvidiaGenaiTimeouts | NvidiaVideoTimeouts | None = None,
    *,
    gen_base_url: str | None = None,
) -> httpx.Client:
    """Build an httpx client for Genblaze NVIDIA image/video providers.

    Sets ``NVCF-POLL-SECONDS`` so queued/cold NIM returns 202 for polling
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
        # Cap sync hold; Genblaze providers already poll on 202.
        "NVCF-POLL-SECONDS": str(cfg.nvcf_poll_seconds),
    }
    return httpx.Client(base_url=base, headers=headers, timeout=timeout)


def empty_504_retry_delay_from_env() -> float:
    """Seconds to wait before an opt-in empty-504 retry (clamped)."""
    return max(5.0, min(180.0, _env_float(
        "GENBLAZE_EMPTY_504_RETRY_DELAY", DEFAULT_EMPTY_504_RETRY_DELAY
    )))


def probe_genai_model_liveness(
    api_key: str,
    model: str,
    *,
    client: httpx.Client | None = None,
) -> dict[str, object]:
    """Cheap invalid-payload POST to wake / check a genai slug (no real job).

    Mirrors Genblaze's ``empty_payload_genai_probe``: empty ``{}`` body is
    rejected as malformed before the model runs — no billed image when NIM
    behaves as documented. Used for optional startup warmup only.
    """
    owns = client is None
    path = f"/genai/{model.strip('/')}"
    # Short connect/read for warmup — do not inherit the 600s generate read.
    warm_timeout = httpx.Timeout(connect=15.0, read=30.0, write=30.0, pool=15.0)
    http = client
    if http is None:
        base = (
            (os.getenv("NVIDIA_GEN_BASE_URL") or "").strip() or DEFAULT_GEN_BASE_URL
        ).rstrip("/")
        http = httpx.Client(
            base_url=base,
            headers={
                "Authorization": f"Bearer {api_key}",
                "Accept": "application/json",
                "Content-Type": "application/json",
                "NVCF-POLL-SECONDS": "0",
            },
            timeout=warm_timeout,
        )
    try:
        resp = http.post(path, json={})
        status = int(resp.status_code)
        if status == 404:
            liveness = "dead"
        elif status == 400 or 200 <= status < 300:
            liveness = "live"
        else:
            liveness = "unknown"
        return {
            "ran": True,
            "model": model,
            "http_status": status,
            "liveness": liveness,
            "note": (
                "invalid-payload probe (no billed generate when NIM rejects "
                "empty body as documented)"
            ),
        }
    except Exception as exc:  # noqa: BLE001 — surface in health/startup logs
        return {
            "ran": True,
            "model": model,
            "liveness": "unknown",
            "error": f"{type(exc).__name__}: {exc}",
            "note": "warmup probe transport/error — generate may still work",
        }
    finally:
        if owns and http is not None:
            http.close()
