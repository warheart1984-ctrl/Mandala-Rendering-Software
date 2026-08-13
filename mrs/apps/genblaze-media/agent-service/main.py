"""Dustjacket Agent Service - FastAPI wrapper for Agent Builder tool integration."""

import os
import time
import httpx
from typing import Any, Dict, List, Optional
from datetime import datetime, timezone

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field


GENBLAZE_BASE_URL = os.getenv(
    "GENBLAZE_BASE_URL",
    "https://mrs-genblaze-media-351151207359.us-central1.run.app",
)


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
    grafana_pushed = False

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
            results.append(FrameResult(
                frame=i,
                run_id=gen.get("run_id"),
                provider=gen.get("provider"),
                elapsed_ms=elapsed_ms,
                status=gen.get("status"),
            ))

    return AgentResponse(
        shot_id=shot_id,
        prompt=request.prompt,
        frames=results,
        frame_count=len(results),
        status="completed",
        grafana_pushed=grafana_pushed,
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
