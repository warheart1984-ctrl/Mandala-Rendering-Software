"""Dustjacket MCP Server - Proper MCP wrapper for the render agent."""

from mcp.server.fastmcp import FastMCP
import httpx
from datetime import datetime
from typing import Optional

mcp = FastMCP("dustjacket-render")

GENBLAZE_URL = "https://dustjacket-agent-351151207359.us-central1.run.app"


@mcp.tool()
async def render_frame(
    prompt: str,
    shot_id: Optional[str] = None,
    frame_count: int = 1,
    quality: str = "draft",
    demo_cache: bool = True
) -> dict:
    """Render a frame via Dustjacket Agent (Genblaze + Grafana metrics).

    Args:
        prompt: The render prompt (e.g., "cyberpunk tesseract mandala")
        shot_id: Optional shot identifier (auto-generated if not provided)
        frame_count: Number of frames to render (1-24)
        quality: "draft" or "final"
        demo_cache: Use pre-rendered B2 frames for instant demo responses

    Returns:
        Render result with run_id, provider, elapsed_ms, and frame data
    """
    if shot_id is None:
        shot_id = f"shot-{datetime.now().strftime('%H%M%S')}"

    async with httpx.AsyncClient(timeout=300.0) as client:
        resp = await client.post(
            f"{GENBLAZE_URL}/query",
            json={
                "prompt": prompt,
                "shot_id": shot_id,
                "frame_count": frame_count,
                "quality": quality,
                "demo_cache": demo_cache
            }
        )
        resp.raise_for_status()
        return resp.json()


@mcp.tool()
async def health_check() -> dict:
    """Check Dustjacket Agent health."""
    async with httpx.AsyncClient(timeout=10.0) as client:
        resp = await client.get(f"{GENBLAZE_URL}/health")
        resp.raise_for_status()
        return resp.json()


if __name__ == "__main__":
    import os
    port = int(os.getenv("PORT", "8080"))
    mcp.run(transport="sse", host="0.0.0.0", port=port)