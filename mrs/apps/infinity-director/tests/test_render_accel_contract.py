"""RenderAccelContract structural tests (schemas + API gates)."""

from __future__ import annotations

import json
from pathlib import Path

from app.atcm import plan_atcm
from app.render_accel import build_atcm_contract_bundle

SCHEMAS = Path(__file__).resolve().parents[1] / "schemas"


def _load_schema(name: str) -> dict:
    return json.loads((SCHEMAS / name).read_text(encoding="utf-8"))


def _check_required(obj: dict, schema: dict) -> None:
    for key in schema.get("required", []):
        assert key in obj, f"missing required field {key!r}"
    for prop, spec in schema.get("properties", {}).items():
        if prop not in obj:
            continue
        if "const" in spec:
            assert obj[prop] == spec["const"], prop
        if "enum" in spec:
            assert obj[prop] in spec["enum"], prop


def test_plan_atcm_emits_contract_shapes():
    raw = plan_atcm(width=256, height=256, prompt="empty sky wall flat structure")
    render_plan, complexity = build_atcm_contract_bundle(
        atcm_report=raw,
        prompt="empty sky wall flat structure",
        scene_spec=None,
    )
    _check_required(render_plan, _load_schema("render-plan.schema.json"))
    _check_required(complexity, _load_schema("complexity-evidence.schema.json"))
    assert render_plan["work_model"]["label"] == "estimate_not_measured"
    assert render_plan["execution_mode"] == "full_frame_with_tile_evidence"
    tee = render_plan.get("tile_execution_evidence") or {}
    assert tee.get("downstream_dispatch") == "single_full_frame_only"
    assert tee.get("tile_count") == render_plan["tile_count"]
    assert complexity["sceneGraphHash_note"] == "proxy_from_prompt_and_scene_spec"
    ms = render_plan.get("math_strategies") or {}
    assert ms.get("binding") == "from_atcm_complexity"
    assert ms.get("execution") == "metadata_only"
    assert "adaptive_samples" in ms
    assert "visibility_strategy" in ms
    assert "brdf_strategy" in ms
    assert "upscale_strategy" in ms


def test_atcm_plan_endpoint_violation_on_invalid_frame():
    from fastapi.testclient import TestClient

    from app.main import app

    client = TestClient(app)
    response = client.post("/api/atcm/plan", json={"width": 0, "height": 256, "prompt": "test"})
    assert response.status_code == 422
    detail = response.json()["detail"]
    assert detail["kind"] == "RenderViolation"
    assert detail["no_non_constitutional_fallback"] is True


def test_atcm_plan_endpoint_missing_intent():
    from fastapi.testclient import TestClient

    from app.main import app

    client = TestClient(app)
    response = client.post("/api/atcm/plan", json={"width": 256, "height": 256})
    assert response.status_code == 422
    assert response.json()["detail"]["code"] == "atcm.missing_intent"


def test_direct_fast_does_not_self_activate_atcm(monkeypatch):
    from fastapi.testclient import TestClient

    from app.config import Settings
    from app.main import app
    from app.models import MemoryboardHints

    settings = Settings(
        genblaze_base_url="https://genblaze.example.test",
        planner_mode="heuristic",
        default_quality="draft",
        default_engine3d_width=256,
        default_engine3d_height=256,
        default_prompt_to_scene_width=256,
        default_prompt_to_scene_height=192,
        default_prompt_to_scene_samples=2,
        default_prompt_to_scene_max_depth=3,
    )
    monkeypatch.setattr("app.main.get_settings", lambda: settings)
    monkeypatch.setattr("app.main.read_memoryboard", lambda *_a, **_k: MemoryboardHints())
    monkeypatch.setattr("app.main.dispatch_render", lambda *_a, **_k: {"structure": {"run_id": "fast-1"}})

    client = TestClient(app)
    response = client.post(
        "/api/direct",
        json={"prompt": "empty sky wall flat mesh", "speed_profile": "fast"},
    )
    assert response.status_code == 200
    body = response.json()
    assert body.get("render_plan") is None
    assert body.get("complexity_evidence") is None
    assert body.get("atcm") is None


def test_direct_atcm_returns_contract_artifacts(monkeypatch):
    from fastapi.testclient import TestClient

    from app.config import Settings
    from app.main import app
    from app.models import MemoryboardHints

    settings = Settings(
        genblaze_base_url="https://genblaze.example.test",
        planner_mode="heuristic",
        default_quality="draft",
        default_engine3d_width=256,
        default_engine3d_height=256,
        default_prompt_to_scene_width=256,
        default_prompt_to_scene_height=192,
        default_prompt_to_scene_samples=2,
        default_prompt_to_scene_max_depth=3,
    )
    monkeypatch.setattr("app.main.get_settings", lambda: settings)
    monkeypatch.setattr("app.main.read_memoryboard", lambda *_a, **_k: MemoryboardHints())
    monkeypatch.setattr(
        "app.main.dispatch_render",
        lambda *_a, **_k: {"structure": {"run_id": "atcm-2", "preview_url": "/p/atcm-2"}},
    )

    client = TestClient(app)
    response = client.post(
        "/api/direct",
        json={"prompt": "empty sky wall flat mesh", "speed_profile": "atcm"},
    )
    assert response.status_code == 200
    body = response.json()
    assert body["render_plan"]["kind"] == "RenderPlan"
    assert body["complexity_evidence"]["kind"] == "ComplexityEvidence"
    assert body["replay_record"]["kind"] == "ReplayRecord"
    assert body["replay_record"]["tile_timings"] is None
    assert body["replay_record"]["dispatch"]["run_id"] == "atcm-2"
    _check_required(body["render_plan"], _load_schema("render-plan.schema.json"))
    _check_required(body["replay_record"], _load_schema("replay-record.schema.json"))
