"""Dustjacket Agent - Vertex AI Reasoning Engine deployment module."""

import os
import httpx
from typing import Dict, Any
from datetime import datetime, timezone


GENBLAZE_BASE_URL = os.getenv(
    "GENBLAZE_BASE_URL",
    "https://mrs-genblaze-media-351151207359.us-central1.run.app",
)


class DustjacketAgent:
    """Vertex AI Reasoning Engine agent for FMCE constitutional pipeline."""

    def __init__(self):
        self._client = None

    def set_up(self):
        self._client = httpx.Client(timeout=300.0)

    def query(self, input: Dict[str, Any]) -> Dict[str, Any]:
        prompt = input.get("prompt", "mandala neural lattice")
        shot_id = input.get("shot_id", f"shot-{datetime.now().strftime('%H%M%S')}")
        frame_count = max(1, min(int(input.get("frame_count", 1)), 24))
        quality = input.get("quality", "draft")

        if self._client is None:
            self.set_up()

        results = []
        for i in range(frame_count):
            start = datetime.now()
            resp = self._client.post(
                f"{GENBLAZE_BASE_URL}/api/generate",
                json={"prompt": prompt, "quality": quality},
            )
            resp.raise_for_status()
            gen = resp.json()
            elapsed_ms = (datetime.now() - start).total_seconds() * 1000
            results.append(
                {
                    "frame": i,
                    "run_id": gen.get("run_id"),
                    "provider": gen.get("provider"),
                    "elapsed_ms": elapsed_ms,
                    "status": gen.get("status"),
                }
            )

        return {
            "shot_id": shot_id,
            "prompt": prompt,
            "frames": results,
            "frame_count": len(results),
            "status": "completed",
        }
