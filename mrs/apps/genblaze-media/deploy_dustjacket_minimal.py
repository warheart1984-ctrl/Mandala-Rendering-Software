"""
Minimal Dustjacket Agent deployment to Vertex AI Reasoning Engine.
Uses only httpx — no genblaze-core dependency.
"""

import argparse
import os
import sys
import json
import asyncio
import httpx
from typing import Dict, Any, Optional
from dataclasses import dataclass
from datetime import datetime, timezone

GENBLAZE_BASE_URL = os.getenv("GENBLAZE_BASE_URL", "https://mrs-genblaze-media-351151207359.us-central1.run.app")
GRAFANA_REMOTE_WRITE_URL = os.getenv("GRAFANA_CLOUD_REMOTE_WRITE_URL", "https://prometheus-prod-56-prod-us-east-2.grafana.net/api/prom/push")
GRAFANA_API_KEY = os.getenv("GRAFANA_CLOUD_API_KEY", "")
GRAFANA_USERNAME = os.getenv("GRAFANA_CLOUD_PROMETHEUS_USERNAME", "3453458")


@dataclass
class FrameMetrics:
    frame_index: int
    shot_id: str
    total_ms: float
    backend: str
    structure_sha256: str
    anime_claim: bool = False


class DustjacketAgent:
    def __init__(self):
        self._genblaze_client = None
        self._grafana_client = None

    def _get_genblaze_client(self) -> httpx.AsyncClient:
        if self._genblaze_client is None:
            self._genblaze_client = httpx.AsyncClient(timeout=300.0)
        return self._genblaze_client

    def _get_grafana_client(self) -> Optional[httpx.AsyncClient]:
        if not self._grafana_client and GRAFANA_REMOTE_WRITE_URL and GRAFANA_API_KEY:
            import base64
            creds = base64.b64encode(f"{GRAFANA_USERNAME}:{GRAFANA_API_KEY}".encode()).decode()
            self._grafana_client = httpx.AsyncClient(
                headers={
                    "Authorization": f"Basic {creds}",
                    "Content-Type": "text/plain",
                },
                timeout=30.0,
            )
        return self._grafana_client

    async def _grafana_push(self, metrics: FrameMetrics) -> bool:
        client = self._get_grafana_client()
        if not client:
            return False
        ts = int(datetime.now(timezone.utc).timestamp() * 1e9)
        lines = [
            f'mrs_frame_duration_ms{{shot="{metrics.shot_id}",backend="{metrics.backend}"}} {metrics.total_ms} {ts}',
        ]
        payload = "\n".join(lines) + "\n"
        try:
            resp = await client.post(GRAFANA_REMOTE_WRITE_URL, content=payload)
            return resp.status_code in (200, 204)
        except Exception:
            return False

    async def _generate(self, prompt: str, quality: str = "draft") -> Dict[str, Any]:
        client = self._get_genblaze_client()
        resp = await client.post(
            f"{GENBLAZE_BASE_URL}/api/generate",
            json={"prompt": prompt, "quality": quality},
        )
        resp.raise_for_status()
        return resp.json()

    def query(self, input: Dict[str, Any]) -> Dict[str, Any]:
        prompt = input.get("prompt", "mandala neural lattice")
        shot_id = input.get("shot_id", f"shot-{datetime.now().strftime('%H%M%S')}")
        frame_count = input.get("frame_count", 1)
        quality = input.get("quality", "draft")

        async def _run():
            results = []
            for i in range(frame_count):
                start = datetime.now()
                gen = await self._generate(prompt, quality)
                elapsed_ms = (datetime.now() - start).total_seconds() * 1000
                await self._grafana_push(FrameMetrics(
                    frame_index=i,
                    shot_id=shot_id,
                    total_ms=elapsed_ms,
                    backend=gen.get("provider", "nvidia"),
                    structure_sha256=gen.get("asset_sha256", ""),
                ))
                results.append({"frame": i, "run_id": gen.get("run_id"), "elapsed_ms": elapsed_ms})
            return {"shot_id": shot_id, "frames": results, "status": "completed"}

        return asyncio.run(_run())

    async def close(self):
        if self._genblaze_client:
            await self._genblaze_client.aclose()
        if self._grafana_client:
            await self._grafana_client.aclose()


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--project", default="marine-proposal-430017-b4")
    parser.add_argument("--location", default="us-central1")
    parser.add_argument("--staging-bucket", required=True)
    parser.add_argument("--display-name", default="dustjacket")
    args = parser.parse_args()

    import vertexai
    from vertexai.preview import reasoning_engines

    vertexai.init(project=args.project, location=args.location, staging_bucket=args.staging_bucket)

    agent = DustjacketAgent()
    print(f"Deploying {args.display_name} to Vertex AI...")

    try:
        remote = reasoning_engines.ReasoningEngine.create(
            reasoning_engine=agent,
            requirements=["httpx>=0.28.1"],
            display_name=args.display_name,
            description="FMCE Constitutional Pipeline Pilot - Agentic Cinema Grafana Track",
        )
        print(f"OK: {remote.resource_name}")
    except Exception as e:
        print(f"FAIL: {e}")
        sys.exit(1)
    finally:
        asyncio.run(agent.close())


if __name__ == "__main__":
    main()
