"""C-08 route registration — Verification Evidence (default CI)."""

from __future__ import annotations

from fastapi.testclient import TestClient

from app.main import app


def test_idac_routes_not_404_in_app():
    """Frozen Core routes must be registered on the FastAPI app (stale process guard)."""
    client = TestClient(app)
    intent = {
        "mission_ref": "cecp/idac-stack-2026-07",
        "policy_ref": "RenderAccelContract/0.1.0",
        "domain": "render",
        "goal": {"statement": "route registration", "justification": "ci"},
        "constraints": {"prompt": "flat wall", "speed_profile": "fast"},
    }
    probes = [
        ("/api/warmup", "post", {}),
        ("/api/atcm/plan", "post", {"width": 256, "height": 256, "prompt": "flat wall"}),
        ("/api/idac/intent", "post", intent),
        ("/api/idac/learning/status", "get", None),
        ("/api/idac/charter/status", "get", None),
    ]
    for path, method, body in probes:
        if method == "get":
            resp = client.get(path)
        else:
            resp = client.post(path, json=body)
        assert resp.status_code != 404, f"{path} returned 404 — stale or wrong app module"


def test_learning_status_shape(monkeypatch, tmp_path):
    monkeypatch.setenv("IDAC_LEARNING_STORE_PATH", str(tmp_path / "learn.jsonl"))
    client = TestClient(app)
    resp = client.get("/api/idac/learning/status")
    assert resp.status_code == 200
    body = resp.json()
    assert body["count"] == 0
    assert body["exists"] is False
