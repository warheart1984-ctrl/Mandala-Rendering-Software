"""IDAC-local charter gate (W-CKL-CHARTER clearance for Director scope)."""

from __future__ import annotations

import pytest

from app.idac.core.charter_gate import (
    assert_idac_charter_loaded,
    charter_gate_status,
    evaluate_intent_invariants,
    evaluate_plan_invariants,
)
from app.idac.core.contracts import IntentContract, IntentGoal, PlanViolationError
from app.idac.core.optimizer import request_plan
from app.idac.core.router import validate_intent, validate_plan
from app.config import Settings


def _settings() -> Settings:
    return Settings(
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


def _intent(**constraints) -> IntentContract:
    base = {
        "prompt": "flat wall structure",
        "quality": "draft",
        "speed_profile": "fast",
    }
    base.update(constraints)
    return IntentContract(
        mission_ref="mission/test",
        policy_ref="policy/test",
        goal=IntentGoal(statement="render test", justification="charter gate test"),
        domain="render",
        constraints=base,
    )


class TestIdacCharterGateLoaded:
    def test_charter_artifacts_load(self):
        doc = assert_idac_charter_loaded()
        assert doc["scope"] == "infinity-director-idac-local"
        status = charter_gate_status()
        assert status["loaded"] is True
        assert status["mrs_ckl_binding"] == "out_of_scope"


class TestIdacCharterDenyPaths:
    def test_denies_missing_mission_ref(self):
        intent = _intent()
        intent = intent.model_copy(update={"mission_ref": ""})
        with pytest.raises(PlanViolationError) as exc:
            evaluate_intent_invariants(intent)
        assert exc.value.code == "idac.charter.no_execution_without_intent"

    def test_denies_optimizer_execute_breach_via_plan_invariants(self):
        intent = _intent()
        plan = request_plan(intent, settings=_settings())
        plan.optimizer = {**plan.optimizer, "must_not_execute": False}
        with pytest.raises(PlanViolationError) as exc:
            evaluate_plan_invariants(plan, intent)
        assert exc.value.code == "idac.charter.no_optimization_without_constitutional_constraints"


class TestIdacCharterClearsWaiverLocally:
    def test_idac_local_gate_not_mrs_ckl(self):
        """W-CKL-CHARTER cleared for IDAC-local; MRS engine CKL remains separate."""
        status = charter_gate_status()
        assert status["loaded"]
        assert status["mrs_ckl_binding"] == "out_of_scope"
