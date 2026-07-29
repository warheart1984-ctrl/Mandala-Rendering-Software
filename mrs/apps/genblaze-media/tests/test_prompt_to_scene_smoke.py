"""Local live-server smoke for prompt-to-scene.

Boots the Genblaze app through uvicorn, then probes the public contract over HTTP.
This is a local deployment-shaped check, not a remote Render verification.
"""

from __future__ import annotations

import httpx

from tests._live_server import run_live_server, wait_for_health


def test_prompt_to_scene_live_server_smoke(tmp_path):
    """AC: uvicorn-served app answers /health and renders prompt-to-scene end-to-end."""
    with run_live_server(tmp_path) as base_url:
        health = wait_for_health(base_url)
        assert health["status"] == "ok"
        assert health["prompt_scene"]["endpoint"] == "/api/prompt-to-scene"

        with httpx.Client(timeout=60.0) as client:
            resp = client.post(
                f"{base_url}/api/prompt-to-scene",
                json={
                    "prompt": "cyan tesseract star mandala",
                    "render": True,
                    "quality": "draft",
                    "width": 96,
                    "height": 72,
                    "samples": 1,
                    "max_depth": 2,
                },
            )
        assert resp.status_code == 200, resp.text
        body = resp.json()
        assert body["ok"] is True
        assert body["rendered"] is True
        assert len(body["engine3dWorldDocument"]["objects"]) > 0
        assert body["render"]["kind"] == "prompt-scene-bridge-rt4d"
        assert body["render"]["provider"] == "scene-spec-render"
        assert body["render"]["status"] == "ok"
