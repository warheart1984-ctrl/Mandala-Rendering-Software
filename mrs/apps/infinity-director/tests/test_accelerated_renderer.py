"""AcceleratedRenderer facade — invariant gates and activation (no Genblaze)."""

from __future__ import annotations

import pytest

from app.accelerated_renderer import (
    build_atcm_plan_report,
    execute as ar_execute,
    pipeline_explicitly_enabled,
    request_for_direct,
    validate_render_plan_for_execute,
)
from app.config import Settings
from app.models import CameraPlan, DirectRequest, DispatchTarget, MemoryboardHints, NormalizedPlan, StylePlan
from app.render_accel import RenderViolationError


def test_pipeline_not_self_activated():
    assert pipeline_explicitly_enabled(atcm_flag=False, speed_profile="fast") is False
    assert pipeline_explicitly_enabled(atcm_flag=False, speed_profile="auto") is False
    assert pipeline_explicitly_enabled(atcm_flag=False, speed_profile="beauty") is False
    assert pipeline_explicitly_enabled(atcm_flag=True, speed_profile="fast") is True
    assert pipeline_explicitly_enabled(atcm_flag=False, speed_profile="atcm") is True


def test_request_for_direct_returns_none_when_disabled():
    body = DirectRequest(prompt="empty sky wall flat structure", speed_profile="fast")
    assert request_for_direct(body=body) is None


def test_request_for_direct_builds_plan_when_atcm():
    body = DirectRequest(prompt="empty sky wall flat structure", speed_profile="atcm")
    result = request_for_direct(body=body)
    assert result is not None
    assert result.render_plan["kind"] == "RenderPlan"
    assert result.render_plan["pipeline"] == "AcceleratedRenderer"
    assert result.complexity_evidence["renderPlanId"] == result.render_plan["id"]
    assert len(result.render_plan.get("tiles") or []) >= 1


def test_validate_execute_rejects_missing_plan():
    raw = build_atcm_plan_report(
        width=256,
        height=256,
        prompt="empty sky wall flat structure",
        scene_spec=None,
        two_pass_profile=False,
    )
    with pytest.raises(RenderViolationError) as exc:
        validate_render_plan_for_execute(render_plan=None, complexity_evidence=raw.complexity_evidence)
    assert exc.value.code == "ar.missing_render_plan"


def test_validate_execute_rejects_plan_evidence_mismatch():
    raw = build_atcm_plan_report(
        width=256,
        height=256,
        prompt="empty sky wall flat structure",
        scene_spec=None,
        two_pass_profile=False,
    )
    bad_evidence = {**raw.complexity_evidence, "renderPlanId": "rplan-wrong"}
    with pytest.raises(RenderViolationError) as exc:
        validate_render_plan_for_execute(render_plan=raw.render_plan, complexity_evidence=bad_evidence)
    assert exc.value.code == "ar.plan_evidence_mismatch"


def test_validate_execute_accepts_matching_bundle():
    raw = build_atcm_plan_report(
        width=256,
        height=256,
        prompt="empty sky wall flat structure",
        scene_spec=None,
        two_pass_profile=False,
    )
    validate_render_plan_for_execute(
        render_plan=raw.render_plan,
        complexity_evidence=raw.complexity_evidence,
    )


def test_execute_runs_dispatch_when_plan_valid(monkeypatch):
    raw = build_atcm_plan_report(
        width=256,
        height=256,
        prompt="empty sky wall flat structure",
        scene_spec=None,
        two_pass_profile=False,
    )
    settings = Settings(
        genblaze_base_url="https://genblaze.example.test",
        planner_mode="heuristic",
    )
    body = DirectRequest(prompt="empty sky wall flat structure", speed_profile="fast", atcm=True)

    fake_plan = NormalizedPlan(
        lane="engine3d_still",
        archetype="portrait_structure",
        style=StylePlan(material="glass", palette=[], lighting="soft_caustics"),
        camera=CameraPlan(shot="hero", mood="technical"),
        quality="draft",
    )

    monkeypatch.setattr(
        "app.accelerated_renderer.dispatch_render",
        lambda *_a, **_k: {"structure": {"run_id": "ar-exec-1"}},
    )
    monkeypatch.setattr(
        "app.accelerated_renderer.build_dispatch_target",
        lambda *_a, **_k: DispatchTarget(endpoint="/api/engine3d-still", payload={}),
    )

    out = ar_execute(
        settings=settings,
        body=body,
        render_plan=raw.render_plan,
        complexity_evidence=raw.complexity_evidence,
        read_memoryboard_fn=lambda *_a, **_k: MemoryboardHints(),
        build_plan_fn=lambda *_a, **_k: fake_plan,
    )
    assert out.result["structure"]["run_id"] == "ar-exec-1"
    assert out.replay_record["pipeline"] == "AcceleratedRenderer"
    assert out.replay_record["plan_faithful_execution"]["claimed"] is True
