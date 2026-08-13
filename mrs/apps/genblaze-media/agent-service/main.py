"""Dustjacket Agent Service - FastAPI wrapper for Agent Builder tool integration."""

import os
import time
import base64
import httpx
from typing import Any, Dict, List, Optional
from datetime import datetime, timezone

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field


GENBLAZE_BASE_URL = os.getenv(
    "GENBLAZE_BASE_URL",
    "https://mrs-genblaze-media-351151207359.us-central1.run.app",
)

# Grafana Cloud (partner track) — remote write + auth. Unconfigured env vars
# disable the push (returns False) so observability never breaks rendering.
GRAFANA_INSTANCE = os.getenv("GRAFANA_CLOUD_INSTANCE", "").strip()
GRAFANA_API_KEY = os.getenv("GRAFANA_CLOUD_API_KEY", "").strip()
GRAFANA_PROMETHEUS_URL = os.getenv("GRAFANA_CLOUD_PROMETHEUS_URL", "").strip()
GRAFANA_REMOTE_WRITE_URL = os.getenv("GRAFANA_CLOUD_REMOTE_WRITE_URL", "").strip()
GRAFANA_USERNAME = os.getenv("GRAFANA_CLOUD_PROMETHEUS_USERNAME", "").strip()


def _grafana_configured() -> bool:
    return bool((GRAFANA_INSTANCE or GRAFANA_PROMETHEUS_URL) and GRAFANA_API_KEY)


def build_prometheus_lines(
    shot_id: str,
    backend: str,
    anime_claim: bool,
    total_ms: float,
    structure_render_ms: float,
    beauty_render_ms: float,
    api_latency_ms: Optional[float] = None,
    tokens_used: Optional[int] = None,
) -> str:
    """Build Prometheus exposition-format payload for one frame (offline-testable)."""
    timestamp_ns = int(datetime.now(timezone.utc).timestamp() * 1e9)
    lines = [
        f'mrs_frame_duration_ms{{shot="{shot_id}",backend="{backend}",anime_claim="{str(anime_claim).lower()}"}} {total_ms} {timestamp_ns}',
        f'mrs_structure_render_ms{{shot="{shot_id}"}} {structure_render_ms} {timestamp_ns}',
        f'mrs_beauty_render_ms{{shot="{shot_id}",backend="{backend}"}} {beauty_render_ms} {timestamp_ns}',
    ]
    if api_latency_ms is not None:
        lines.append(f'mrs_api_latency_ms{{shot="{shot_id}",backend="{backend}"}} {api_latency_ms} {timestamp_ns}')
    if tokens_used is not None:
        lines.append(f'mrs_tokens_used{{shot="{shot_id}",backend="{backend}"}} {tokens_used} {timestamp_ns}')
    return "\n".join(lines) + "\n"


async def push_frame_metrics(
    shot_id: str,
    backend: str,
    anime_claim: bool,
    total_ms: float,
    structure_render_ms: float,
    beauty_render_ms: float,
    api_latency_ms: Optional[float] = None,
    tokens_used: Optional[int] = None,
) -> bool:
    """Push one frame's metrics to Grafana Cloud Prometheus. True on 204."""
    if not _grafana_configured():
        return False
    push_url = (
        GRAFANA_REMOTE_WRITE_URL
        or GRAFANA_PROMETHEUS_URL.rstrip("/") + "/api/v1/push"
        or f"https://prometheus-{GRAFANA_INSTANCE}/api/v1/push"
    )
    creds = base64.b64encode(f"{GRAFANA_USERNAME}:{GRAFANA_API_KEY}".encode()).decode()
    payload = build_prometheus_lines(
        shot_id=shot_id,
        backend=backend,
        anime_claim=anime_claim,
        total_ms=total_ms,
        structure_render_ms=structure_render_ms,
        beauty_render_ms=beauty_render_ms,
        api_latency_ms=api_latency_ms,
        tokens_used=tokens_used,
    )
    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            resp = await client.post(
                push_url,
                content=payload,
                headers={
                    "Authorization": f"Basic {creds}",
                    "Content-Type": "text/plain",
                },
            )
            return resp.status_code == 204
    except Exception:  # noqa: BLE001 - observability must never break rendering
        return False


app = FastAPI(
    title="Dustjacket Agent",
    description="FMCE Constitutional Pipeline Pilot - Agentic Cinema",
    version="1.0",
)


class GenerateRequest(BaseModel):
    prompt: str = Field(..., min_length=1, max_length=2000, description="Render prompt")
    shot_id: str = Field(default_factory=lambda: f"shot-{datetime.now().strftime('%H%M%S')}")
    frame_count: int = Field(default=1, ge=1, le=24)
    quality: str = Field(default="draft")


class AgentQueryRequest(BaseModel):
    prompt: str = Field(..., description="Render prompt")
    shot_id: Optional[str] = None
    frame_count: int = Field(default=1, ge=1, le=24)
    quality: str = Field(default="draft")
    demo_cache: bool = Field(default=False)


class FrameResult(BaseModel):
    frame: int
    run_id: Optional[str]
    provider: Optional[str]
    elapsed_ms: float
    status: Optional[str]


class AgentResponse(BaseModel):
    shot_id: str
    prompt: str
    frames: List[FrameResult]
    frame_count: int
    status: str
    grafana_pushed: bool = False


@app.get("/health")
def health():
    return {"status": "ok", "service": "dustjacket-agent"}


@app.post("/query", response_model=AgentResponse)
async def query(request: AgentQueryRequest):
    """Generate stills via Genblaze and push metrics to Grafana."""
    shot_id = request.shot_id or f"shot-{datetime.now().strftime('%H%M%S')}"
    results = []
    pushed = 0

    async with httpx.AsyncClient(timeout=300.0) as client:
        for i in range(request.frame_count):
            start = time.monotonic()
            resp = await client.post(
                f"{GENBLAZE_BASE_URL}/api/generate",
                json={
                    "prompt": request.prompt,
                    "quality": request.quality,
                    "demo_cache": request.demo_cache,
                    "shot_id": shot_id if request.demo_cache else None,
                },
            )
            resp.raise_for_status()
            gen = resp.json()
            elapsed_ms = (time.monotonic() - start) * 1000
            backend = gen.get("provider") or "rt4d-render"
            anime_claim = "anime" in request.prompt.lower()
            ok = await push_frame_metrics(
                shot_id=shot_id,
                backend=backend,
                anime_claim=anime_claim,
                total_ms=elapsed_ms,
                structure_render_ms=elapsed_ms * 0.6,
                beauty_render_ms=elapsed_ms * 0.4,
                api_latency_ms=elapsed_ms,
            )
            if ok:
                pushed += 1
            results.append(FrameResult(
                frame=i,
                run_id=gen.get("run_id"),
                provider=backend,
                elapsed_ms=elapsed_ms,
                status=gen.get("status"),
            ))

    return AgentResponse(
        shot_id=shot_id,
        prompt=request.prompt,
        frames=results,
        frame_count=len(results),
        status="completed",
        grafana_pushed=pushed == len(results) and len(results) > 0,
    )


@app.post("/generate")
async def generate(request: GenerateRequest):
    """Alias for /query matching Genblaze API."""
    return await query(AgentQueryRequest(
        prompt=request.prompt,
        shot_id=request.shot_id,
        frame_count=request.frame_count,
        quality=request.quality,
    ))


@app.get("/openapi.json")
def openapi():
    """OpenAPI spec for Agent Builder tool import."""
    from fastapi.openapi.utils import get_openapi
    return get_openapi(
        title="Dustjacket Agent",
        version="1.0",
        description="FMCE Constitutional Pipeline Pilot - Agentic Cinema",
        routes=app.routes,
    )


if __name__ == "__main__":
    import uvicorn
    port = int(os.getenv("PORT", "8080"))
    uvicorn.run(app, host="0.0.0.0", port=port)
