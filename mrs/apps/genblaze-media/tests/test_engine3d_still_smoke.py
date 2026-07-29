"""Local live-server smoke for Engine3D still.

Boots the Genblaze app through uvicorn, then probes the public Engine3D still
route over HTTP. This is a local deployment-shaped check, not a remote Render
verification.
"""

from __future__ import annotations

import httpx

from tests._live_server import run_live_server, wait_for_health


def test_engine3d_still_live_server_smoke(tmp_path):
    """AC: uvicorn-served app answers /health and renders engine3d-still end-to-end."""
    with run_live_server(tmp_path) as base_url:
        health = wait_for_health(base_url)
        assert health["status"] == "ok"
        assert "engine3d_still" in health
        assert health["engine3d_still"]["available"] is True

        with httpx.Client(timeout=120.0) as client:
            resp = client.post(
                f"{base_url}/api/engine3d-still",
                json={
                    "width": 16,
                    "height": 16,
                    "aov_depth": False,
                    "aov_normal": False,
                    "prefer_face_fixture": False,
                },
            )
        assert resp.status_code == 200, resp.text
        body = resp.json()
        assert body["structure"]["kind"] == "engine3d-structure-still"
        assert body["structure"]["provider"] == "engine3d-still"
        assert body["structure"]["status"] == "ok"
