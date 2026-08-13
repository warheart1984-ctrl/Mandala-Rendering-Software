"""Grafana Cloud MCP Integration — Pipeline Observability.

Provides real-time telemetry for agentic cinema pipeline:
- Render metrics (frame time, tokens, latency, GPU)
- Pipeline health (success/failure rates, bottlenecks)
- Cost tracking (API calls, GPU hours)
- Live dashboard for demo video.

Requires:
- GRAFANA_CLOUD_INSTANCE (e.g., "my-org.grafana.net")
- GRAFANA_CLOUD_API_KEY (Grafana Cloud API key)
- GRAFANA_CLOUD_PROMETHEUS_URL (optional, for direct Prometheus push)
"""

from __future__ import annotations

import os
import json
import asyncio
from dataclasses import dataclass, asdict
from datetime import datetime, timezone
from typing import Any, Optional
from urllib.parse import urljoin

import httpx
from pydantic import BaseModel, Field


@dataclass
class PainterProbe:
    """Probe result matching constitutional_anime_render.PainterProbe."""
    backend: str
    configured: bool
    reachable: bool | None
    operational: bool | None
    verified: bool
    last_verified: str | None
    detail: str
    env_vars_required: list[str] = None

    def __post_init__(self):
        if self.env_vars_required is None:
            self.env_vars_required = []


class GrafanaConfigError(Exception):
    """Missing or invalid Grafana configuration."""
    pass


class GrafanaPushError(Exception):
    """Failed to push metrics to Grafana."""
    pass


@dataclass
class FrameMetrics:
    """Per-frame render metrics for Grafana."""
    frame_index: int
    shot_id: str
    structure_render_ms: float
    beauty_render_ms: float
    total_ms: float
    backend: str
    anime_claim: bool
    structure_sha256: str
    beauty_sha256: str | None
    gpu_memory_mb: float | None = None
    gpu_utilization_pct: float | None = None
    tokens_used: int | None = None
    api_latency_ms: float | None = None


@dataclass
class PipelineHealth:
    """Overall pipeline health summary."""
    total_frames: int
    successful_frames: int
    failed_frames: int
    avg_frame_time_ms: float
    total_tokens: int
    total_cost_usd: float
    backend_breakdown: dict[str, int]
    error_breakdown: dict[str, int]


class GrafanaMCPClient:
    """MCP-compatible client for Grafana Cloud (Prometheus + Loki)."""

    def __init__(
        self,
        instance: str | None = None,
        api_key: str | None = None,
        prometheus_url: str | None = None,
        username: str | None = None,
        remote_write_url: str | None = None,
        timeout: float = 10.0,
    ):
        self.instance = instance or os.getenv("GRAFANA_CLOUD_INSTANCE", "").strip()
        self.api_key = api_key or os.getenv("GRAFANA_CLOUD_API_KEY", "").strip()
        self.prometheus_url = prometheus_url or os.getenv("GRAFANA_CLOUD_PROMETHEUS_URL", "").strip()
        self.username = username or os.getenv("GRAFANA_CLOUD_PROMETHEUS_USERNAME", "").strip()
        self.remote_write_url = remote_write_url or os.getenv("GRAFANA_CLOUD_REMOTE_WRITE_URL", "").strip()
        self.timeout = timeout
        self._client: httpx.AsyncClient | None = None

        if not self.instance and not self.prometheus_url:
            raise GrafanaConfigError(
                "Either GRAFANA_CLOUD_INSTANCE or GRAFANA_CLOUD_PROMETHEUS_URL required"
            )

    async def __aenter__(self):
        headers = {"Content-Type": "application/json"}
        if self.username and self.api_key:
            import base64
            creds = base64.b64encode(f"{self.username}:{self.api_key}".encode()).decode()
            headers["Authorization"] = f"Basic {creds}"
        elif self.api_key:
            headers["Authorization"] = f"Bearer {self.api_key}"
        self._client = httpx.AsyncClient(headers=headers, timeout=self.timeout)
        return self

    async def __aexit__(self, exc_type, exc_val, exc_tb):
        if self._client:
            await self._client.aclose()

    def _build_prometheus_url(self) -> str:
        if self.remote_write_url:
            return self.remote_write_url
        if self.prometheus_url:
            return urljoin(self.prometheus_url, "/api/v1/push")
        return f"https://prometheus-{self.instance}/api/v1/push"

    def _build_loki_url(self) -> str:
        return f"https://logs-{self.instance}/loki/api/v1/push"

    async def push_frame_metrics(self, metrics: FrameMetrics) -> bool:
        """Push per-frame metrics to Prometheus (Grafana Cloud)."""
        if not self._client:
            raise GrafanaPushError("Client not initialized")

        timestamp_ns = int(datetime.now(timezone.utc).timestamp() * 1e9)

        # Prometheus exposition format
        lines = [
            f'mrs_frame_duration_ms{{shot="{metrics.shot_id}",backend="{metrics.backend}",anime_claim="{str(metrics.anime_claim).lower()}"}} {metrics.total_ms} {timestamp_ns}',
            f'mrs_structure_render_ms{{shot="{metrics.shot_id}"}} {metrics.structure_render_ms} {timestamp_ns}',
            f'mrs_beauty_render_ms{{shot="{metrics.shot_id}",backend="{metrics.backend}"}} {metrics.beauty_render_ms} {timestamp_ns}',
        ]

        if metrics.gpu_memory_mb is not None:
            lines.append(f'mrs_gpu_memory_mb{{shot="{metrics.shot_id}"}} {metrics.gpu_memory_mb} {timestamp_ns}')
        if metrics.gpu_utilization_pct is not None:
            lines.append(f'mrs_gpu_utilization_pct{{shot="{metrics.shot_id}"}} {metrics.gpu_utilization_pct} {timestamp_ns}')
        if metrics.tokens_used is not None:
            lines.append(f'mrs_tokens_used{{shot="{metrics.shot_id}",backend="{metrics.backend}"}} {metrics.tokens_used} {timestamp_ns}')
        if metrics.api_latency_ms is not None:
            lines.append(f'mrs_api_latency_ms{{shot="{metrics.shot_id}",backend="{metrics.backend}"}} {metrics.api_latency_ms} {timestamp_ns}')

        payload = "\n".join(lines) + "\n"

        resp = await self._client.post(
            self._build_prometheus_url(),
            content=payload,
            headers={"Content-Type": "text/plain"},
        )
        return resp.status_code == 204

    async def push_log_entry(
        self,
        level: str,
        message: str,
        labels: dict[str, str] | None = None,
    ) -> bool:
        """Push log entry to Loki (Grafana Cloud)."""
        if not self._client:
            raise GrafanaPushError("Client not initialized")

        timestamp_ns = str(int(datetime.now(timezone.utc).timestamp() * 1e9))
        stream_labels = {
            "app": "mrs-constitutional-anime",
            "level": level,
            **(labels or {}),
        }

        payload = {
            "streams": [
                {
                    "stream": stream_labels,
                    "values": [[timestamp_ns, message]],
                }
            ]
        }

        resp = await self._client.post(
            self._build_loki_url(),
            json=payload,
        )
        return resp.status_code == 204

    async def query_pipeline_health(self, hours: int = 1) -> PipelineHealth:
        """Query Prometheus for pipeline health summary (requires Grafana Cloud Prometheus)."""
        # This would use PromQL queries via Grafana's query API
        # For now, return a placeholder - implement based on your Prometheus setup
        return PipelineHealth(
            total_frames=0,
            successful_frames=0,
            failed_frames=0,
            avg_frame_time_ms=0.0,
            total_tokens=0,
            total_cost_usd=0.0,
            backend_breakdown={},
            error_breakdown={},
        )


# --- Synchronous wrappers for pipeline integration ---

def push_frame_metrics_sync(
    frame_index: int,
    shot_id: str,
    structure_render_ms: float,
    beauty_render_ms: float,
    total_ms: float,
    backend: str,
    anime_claim: bool,
    structure_sha256: str,
    beauty_sha256: str | None = None,
    gpu_memory_mb: float | None = None,
    gpu_utilization_pct: float | None = None,
    tokens_used: int | None = None,
    api_latency_ms: float | None = None,
) -> bool:
    """Synchronous wrapper for pushing frame metrics."""
    instance = os.getenv("GRAFANA_CLOUD_INSTANCE", "").strip()
    api_key = os.getenv("GRAFANA_CLOUD_API_KEY", "").strip()
    prometheus_url = os.getenv("GRAFANA_CLOUD_PROMETHEUS_URL", "").strip()
    username = os.getenv("GRAFANA_CLOUD_PROMETHEUS_USERNAME", "").strip()
    remote_write_url = os.getenv("GRAFANA_CLOUD_REMOTE_WRITE_URL", "").strip()

    if not instance and not prometheus_url:
        return False  # Silently skip if not configured

    async def _run():
        async with GrafanaMCPClient(instance, api_key, prometheus_url, username, remote_write_url) as client:
            metrics = FrameMetrics(
                frame_index=frame_index,
                shot_id=shot_id,
                structure_render_ms=structure_render_ms,
                beauty_render_ms=beauty_render_ms,
                total_ms=total_ms,
                backend=backend,
                anime_claim=anime_claim,
                structure_sha256=structure_sha256,
                beauty_sha256=beauty_sha256,
                gpu_memory_mb=gpu_memory_mb,
                gpu_utilization_pct=gpu_utilization_pct,
                tokens_used=tokens_used,
                api_latency_ms=api_latency_ms,
            )
            return await client.push_frame_metrics(metrics)

    try:
        return asyncio.run(_run())
    except Exception:
        return False  # Fail silently - observability shouldn't break pipeline


def push_log_sync(
    level: str,
    message: str,
    shot_id: str | None = None,
    frame_index: int | None = None,
    backend: str | None = None,
) -> bool:
    """Synchronous wrapper for pushing log entry."""
    instance = os.getenv("GRAFANA_CLOUD_INSTANCE", "").strip()
    api_key = os.getenv("GRAFANA_CLOUD_API_KEY", "").strip()

    if not instance or not api_key:
        return False

    labels = {"app": "mrs-constitutional-anime"}
    if shot_id:
        labels["shot"] = shot_id
    if frame_index is not None:
        labels["frame"] = str(frame_index)
    if backend:
        labels["backend"] = backend

    async def _run():
        async with GrafanaMCPClient(instance, api_key) as client:
            return await client.push_log_entry(level, message, labels)

    try:
        return asyncio.run(_run())
    except Exception:
        return False


# --- Probe function for pipeline integration ---

def probe_grafana(live: bool = True) -> PainterProbe:
    """Probe Grafana Cloud availability for pipeline health check."""
    instance = os.getenv("GRAFANA_CLOUD_INSTANCE", "").strip()
    api_key = os.getenv("GRAFANA_CLOUD_API_KEY", "").strip()
    prometheus_url = os.getenv("GRAFANA_CLOUD_PROMETHEUS_URL", "").strip()

    if not (instance or prometheus_url) or not api_key:
        return PainterProbe(
            backend="grafana",
            configured=False,
            reachable=None,
            operational=None,
            verified=False,
            last_verified=None,
            detail="missing GRAFANA_CLOUD_INSTANCE/PROMETHEUS_URL or GRAFANA_CLOUD_API_KEY",
            env_vars_required=[
                "GRAFANA_CLOUD_INSTANCE",
                "GRAFANA_CLOUD_API_KEY",
                "GRAFANA_CLOUD_PROMETHEUS_URL",
            ],
        )

    if not live:
        return PainterProbe(
            backend="grafana",
            configured=True,
            reachable=None,
            operational=None,
            verified=False,
            last_verified=None,
            detail="configured (live probe disabled)",
            env_vars_required=["GRAFANA_CLOUD_INSTANCE", "GRAFANA_CLOUD_API_KEY"],
        )

    try:
        async def _probe():
            async with GrafanaMCPClient(instance, api_key, prometheus_url) as client:
                await client.push_log_entry("info", "grafana mcp probe")
                return True

        asyncio.run(_probe())
        return PainterProbe(
            backend="grafana",
            configured=True,
            reachable=True,
            operational=True,
            verified=True,
            last_verified=datetime.now(timezone.utc).replace(microsecond=0).isoformat(),
            detail="grafana: live push ok",
            env_vars_required=["GRAFANA_CLOUD_INSTANCE", "GRAFANA_CLOUD_API_KEY"],
        )
    except Exception as exc:
        return PainterProbe(
            backend="grafana",
            configured=True,
            reachable=False,
            operational=False,
            verified=True,
            last_verified=datetime.now(timezone.utc).replace(microsecond=0).isoformat(),
            detail=f"grafana: {type(exc).__name__}: {exc}",
            env_vars_required=["GRAFANA_CLOUD_INSTANCE", "GRAFANA_CLOUD_API_KEY"],
        )


# --- MCP Tool Definitions ---

MCP_TOOLS = [
    {
        "name": "grafana_push_frame_metrics",
        "description": "Push per-frame render metrics to Grafana Cloud Prometheus for real-time dashboard.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "frame_index": {"type": "integer"},
                "shot_id": {"type": "string"},
                "structure_render_ms": {"type": "number"},
                "beauty_render_ms": {"type": "number"},
                "total_ms": {"type": "number"},
                "backend": {"type": "string"},
                "anime_claim": {"type": "boolean"},
                "structure_sha256": {"type": "string"},
                "beauty_sha256": {"type": "string"},
                "gpu_memory_mb": {"type": "number"},
                "gpu_utilization_pct": {"type": "number"},
                "tokens_used": {"type": "integer"},
                "api_latency_ms": {"type": "number"},
            },
            "required": ["frame_index", "shot_id", "structure_render_ms", "beauty_render_ms", "total_ms", "backend", "anime_claim", "structure_sha256"],
        },
    },
    {
        "name": "grafana_push_log",
        "description": "Push log entry to Grafana Cloud Loki for debugging and audit trail.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "level": {"type": "string", "enum": ["debug", "info", "warning", "error"]},
                "message": {"type": "string"},
                "shot_id": {"type": "string"},
                "frame_index": {"type": "integer"},
                "backend": {"type": "string"},
            },
            "required": ["level", "message"],
        },
    },
    {
        "name": "grafana_query_health",
        "description": "Query pipeline health summary from Grafana Cloud Prometheus.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "hours": {"type": "integer", "default": 1},
            },
        },
    },
]


if __name__ == "__main__":
    # Quick test
    import sys
    print("Grafana MCP Client - configure env vars and use in pipeline")
    print("Required: GRAFANA_CLOUD_INSTANCE, GRAFANA_CLOUD_API_KEY")