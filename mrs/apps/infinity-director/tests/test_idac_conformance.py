"""IDAC conformance suite — L0 + partial L1 (see docs/IDAC_CONFORMANCE_SUITE.md)."""

from __future__ import annotations

import json
from pathlib import Path
from unittest.mock import patch

import pytest

from app.config import Settings
from app.idac import (
    IntentContract,
    IntentGoal,
    PlanViolationError,
    handle_intent,
    request_plan,
    validate_intent_evidence,
)
from app.idac.core.constitution import CONSTITUTIONAL_INVARIANTS
from app.idac.core.learning import learning_store_path, learning_store_stats, record_learning_candidate
from app.idac.core.router import validate_intent, validate_plan
from app.idac.domains.rendering.adapters import RenderOptimizerAdapter, RenderValidationAdapter
from app.idac.domains.rendering.runtime import PostFXEngine, RenderExecutor, ShadingEngine, TileScheduler
from app.idac.runtime import execute_plan

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


def _sample_intent(**overrides) -> IntentContract:
    base = dict(
        mission_ref="cecp/idac-stack-2026-07",
        policy_ref="RenderAccelContract/0.1.0",
        domain="render",
        goal=IntentGoal(
            statement="Produce governed preview still",
            justification="Reference runtime under mission_ref and policy_ref",
        ),
        constraints={"prompt": "empty sky wall flat structure", "speed_profile": "fast"},
    )
    base.update(overrides)
    return IntentContract(**base)


@pytest.fixture
def settings() -> Settings:
    return Settings(planner_mode="heuristic")


class TestIntentL0:
    def test_intent_contract_schema_shape(self):
        doc = _sample_intent().to_document()
        _check_required(doc, _load_schema("idac-intent.schema.json"))

    def test_constitutional_invariant_count(self):
        assert len(CONSTITUTIONAL_INVARIANTS) == 6

    def test_router_rejects_empty_mission(self):
        intent = _sample_intent(mission_ref="")
        with pytest.raises(PlanViolationError) as exc:
            validate_intent(intent)
        assert exc.value.code == "idac.intent_incomplete"


class TestOptimizerL0:
    def test_optimizer_must_not_execute(self, settings):
        plan = request_plan(_sample_intent(), settings=settings)
        assert plan.optimizer["must_not_execute"] is True
        _check_required(plan.to_document(), _load_schema("idac-execution-plan.schema.json"))

    def test_atcm_domain_plan_includes_render_plan(self, settings):
        intent = _sample_intent(constraints={"prompt": "flat wall", "atcm": True})
        plan = request_plan(intent, settings=settings)
        assert plan.domain_plan.get("atcm_activated") is True
        rp = plan.domain_plan.get("render_plan") or {}
        assert rp.get("kind") == "RenderPlan"
        assert RenderValidationAdapter.check_tile_complexity_evidence(plan.domain_plan)

    def test_ai_domain_stub(self, settings):
        intent = _sample_intent(domain="ai")
        plan = request_plan(intent, settings=settings)
        assert plan.enforcement == "declared"
        assert plan.domain_plan.get("status") == "declared"


class TestRouterL1:
    def test_handle_intent_mocked_dispatch(self, settings):
        intent = _sample_intent()
        plan = request_plan(intent, settings=settings)

        def _fake_dispatch(_settings, target, client=None):
            return {"structure": {"run_id": "idac-run-1", "preview_url": "/p/idac-run-1"}}

        with patch("app.main.dispatch_render", side_effect=_fake_dispatch):
            bundle = handle_intent(intent, settings=settings)

        assert bundle["validation"]["verdict"] == "pass"
        ev = bundle["evidence"]
        _check_required(ev, _load_schema("idac-evidence.schema.json"))
        assert ev["execution_trace"]["run_id"] == "idac-run-1"


class TestExecutionL0:
    def test_plan_drift_raises(self, settings):
        intent = _sample_intent()
        plan = request_plan(intent, settings=settings)
        plan.resource_plan["dispatch"] = {**plan.resource_plan["dispatch"], "endpoint": "/api/mutated"}

        with pytest.raises(PlanViolationError) as exc:
            execute_plan(plan, intent=intent, settings=settings)
        assert exc.value.code == "idac.plan_drift"


class TestEvidenceL0:
    def test_atcm_replay_record_on_success(self, settings):
        intent = _sample_intent(constraints={"prompt": "flat wall", "atcm": True})
        plan = request_plan(intent, settings=settings)

        with patch(
            "app.main.dispatch_render",
            return_value={"structure": {"run_id": "atcm-ev-1"}},
        ):
            evidence = execute_plan(plan, intent=intent, settings=settings)

        assert evidence.artifacts.get("replay_record") is not None
        assert evidence.intent_ref == intent.id
        assert evidence.plan_ref == plan.plan_id


class TestValidationL0:
    def test_bit_identical_replay_skipped(self, settings):
        intent = _sample_intent()
        plan = request_plan(intent, settings=settings)
        with patch(
            "app.main.dispatch_render",
            return_value={"structure": {"run_id": "v-1"}},
        ):
            evidence = execute_plan(plan, intent=intent, settings=settings)
        report = validate_intent_evidence(intent, evidence)
        skipped = [c for c in report["checks"] if c.get("id") == "bit_identical_replay"][0]
        assert skipped.get("skipped") is True

    def test_intent_ref_match_passes(self, settings):
        intent = _sample_intent()
        plan = request_plan(intent, settings=settings)
        with patch("app.main.dispatch_render", return_value={"structure": {"run_id": "v-2"}}):
            evidence = execute_plan(plan, intent=intent, settings=settings)
        report = validate_intent_evidence(intent, evidence)
        check = [c for c in report["checks"] if c["id"] == "intent_ref_match"][0]
        assert check["pass"] is True

    def test_intent_ref_match_fails(self, settings):
        intent = _sample_intent()
        plan = request_plan(intent, settings=settings)
        with patch("app.main.dispatch_render", return_value={"structure": {"run_id": "v-3"}}):
            evidence = execute_plan(plan, intent=intent, settings=settings)
        evidence.intent_ref = "wrong-intent"
        report = validate_intent_evidence(intent, evidence)
        check = [c for c in report["checks"] if c["id"] == "intent_ref_match"][0]
        assert check["pass"] is False

    def test_domain_match_passes_render(self, settings):
        intent = _sample_intent()
        plan = request_plan(intent, settings=settings)
        with patch("app.main.dispatch_render", return_value={"structure": {"run_id": "v-4"}}):
            evidence = execute_plan(plan, intent=intent, settings=settings)
        report = validate_intent_evidence(intent, evidence)
        check = [c for c in report["checks"] if c["id"] == "domain_match"][0]
        assert check["pass"] is True

    def test_domain_match_accepts_declared_stub(self):
        intent = _sample_intent(domain="ai")
        evidence = type("E", (), {
            "intent_ref": intent.id, "plan_ref": "p-1",
            "outcome": "declared_stub",
            "execution_trace": {}, "artifacts": {}, "environment": {},
        })()
        report = validate_intent_evidence(intent, evidence)
        check = [c for c in report["checks"] if c["id"] == "domain_match"][0]
        assert check["pass"] is True

    def test_plan_ref_present_passes(self, settings):
        intent = _sample_intent()
        plan = request_plan(intent, settings=settings)
        with patch("app.main.dispatch_render", return_value={"structure": {"run_id": "v-5"}}):
            evidence = execute_plan(plan, intent=intent, settings=settings)
        report = validate_intent_evidence(intent, evidence)
        check = [c for c in report["checks"] if c["id"] == "plan_ref_present"][0]
        assert check["pass"] is True

    def test_plan_ref_empty_fails(self, settings):
        intent = _sample_intent()
        plan = request_plan(intent, settings=settings)
        with patch("app.main.dispatch_render", return_value={"structure": {"run_id": "v-6"}}):
            evidence = execute_plan(plan, intent=intent, settings=settings)
        evidence.plan_ref = ""
        report = validate_intent_evidence(intent, evidence)
        check = [c for c in report["checks"] if c["id"] == "plan_ref_present"][0]
        assert check["pass"] is False

    def test_render_accel_artifacts_when_atcm(self, settings):
        intent = _sample_intent(constraints={"prompt": "flat wall", "atcm": True})
        plan = request_plan(intent, settings=settings)
        with patch("app.main.dispatch_render", return_value={"structure": {"run_id": "v-7"}}):
            evidence = execute_plan(plan, intent=intent, settings=settings)
        report = validate_intent_evidence(intent, evidence)
        check = [c for c in report["checks"] if c["id"] == "render_accel_artifacts_when_atcm"][0]
        assert check["pass"] is True

    def test_execution_trace_present_passes(self, settings):
        intent = _sample_intent()
        plan = request_plan(intent, settings=settings)
        with patch("app.main.dispatch_render", return_value={"structure": {"run_id": "v-8"}}):
            evidence = execute_plan(plan, intent=intent, settings=settings)
        report = validate_intent_evidence(intent, evidence)
        check = [c for c in report["checks"] if c["id"] == "execution_trace_present"][0]
        assert check["pass"] is True

    def test_no_error_in_trace_when_ok(self, settings):
        intent = _sample_intent()
        plan = request_plan(intent, settings=settings)
        with patch("app.main.dispatch_render", return_value={"structure": {"run_id": "v-9"}}):
            evidence = execute_plan(plan, intent=intent, settings=settings)
        report = validate_intent_evidence(intent, evidence)
        check = [c for c in report["checks"] if c["id"] == "no_error_in_trace_when_ok"][0]
        assert check["pass"] is True

    def test_verdict_pass_when_all_checks_pass(self, settings):
        intent = _sample_intent(constraints={"prompt": "flat wall", "atcm": True})
        plan = request_plan(intent, settings=settings)
        with patch("app.main.dispatch_render", return_value={"structure": {"run_id": "v-10"}}):
            evidence = execute_plan(plan, intent=intent, settings=settings)
        report = validate_intent_evidence(intent, evidence)
        assert report["verdict"] == "pass"
        assert report["status"] == "partial"

    def test_verdict_fail_when_checks_fail(self, settings):
        intent = _sample_intent()
        plan = request_plan(intent, settings=settings)
        with patch("app.main.dispatch_render", return_value={"structure": {"run_id": "v-11"}}):
            evidence = execute_plan(plan, intent=intent, settings=settings)
        evidence.intent_ref = "wrong"
        report = validate_intent_evidence(intent, evidence)
        assert report["verdict"] == "fail"

    def test_non_render_domain_validated_as_stub(self):
        intent = _sample_intent(domain="compile")
        evidence = type("E", (), {
            "intent_ref": intent.id, "plan_ref": "p-1",
            "outcome": "declared_stub",
            "execution_trace": {}, "artifacts": {}, "environment": {},
        })()
        report = validate_intent_evidence(intent, evidence)
        assert report["verdict"] == "pass"


class TestPlanViolationL0:
    def test_rejects_empty_goal_statement(self):
        intent = _sample_intent()
        intent = intent.model_copy(
            update={"goal": IntentGoal.model_construct(statement="", justification="has justification")},
        )
        with pytest.raises(PlanViolationError) as exc:
            validate_intent(intent)
        assert exc.value.code == "idac.intent_goal_invalid"

    def test_rejects_plan_intent_mismatch(self, settings):
        intent = _sample_intent()
        plan = request_plan(intent, settings=settings)
        plan.intent_ref = "intent-wrong"
        with pytest.raises(PlanViolationError) as exc:
            validate_plan(plan, intent)
        assert exc.value.code == "idac.plan_intent_mismatch"

    def test_rejects_optimizer_execute_breach(self, settings):
        intent = _sample_intent()
        plan = request_plan(intent, settings=settings)
        plan.optimizer = {**plan.optimizer, "must_not_execute": False}
        with pytest.raises(PlanViolationError) as exc:
            validate_plan(plan, intent)
        assert exc.value.code == "idac.optimizer_must_not_execute"


class TestLearningL0:
    def test_learning_records_candidate_on_pass(self, settings, tmp_path, monkeypatch):
        monkeypatch.setenv("IDAC_LEARNING_STORE_PATH", str(tmp_path / "candidates.jsonl"))
        intent = _sample_intent()
        plan = request_plan(intent, settings=settings)
        with patch(
            "app.main.dispatch_render",
            return_value={"structure": {"run_id": "learn-1"}},
        ):
            evidence = execute_plan(plan, intent=intent, settings=settings)
        validation = validate_intent_evidence(intent, evidence)
        out = record_learning_candidate(intent=intent, evidence=evidence, validation=validation)
        assert validation["verdict"] == "pass"
        assert out["recorded"] is True
        assert out["status"] == "partial"
        assert (tmp_path / "candidates.jsonl").is_file()

    def test_no_learning_without_validated_evidence(self, settings):
        intent = _sample_intent()
        out = record_learning_candidate(
            intent=intent,
            evidence=type("E", (), {"id": "ev-1", "plan_ref": "p-1"})(),
            validation={"verdict": "fail"},
        )
        assert out["recorded"] is False

    def test_learning_store_path_default(self):
        path = learning_store_path()
        assert "data" in str(path)
        assert path.suffix == ".jsonl"

    def test_learning_store_path_from_env(self, monkeypatch, tmp_path):
        store = tmp_path / "custom-store.jsonl"
        monkeypatch.setenv("IDAC_LEARNING_STORE_PATH", str(store))
        path = learning_store_path()
        assert str(path) == str(store)

    def test_learning_store_stats_when_no_file(self, tmp_path, monkeypatch):
        monkeypatch.setenv("IDAC_LEARNING_STORE_PATH", str(tmp_path / "nonexistent.jsonl"))
        stats = learning_store_stats()
        assert stats["exists"] is False
        assert stats["count"] == 0
        assert stats["status"] == "partial"

    def test_learning_store_stats_with_records(self, tmp_path, monkeypatch):
        store = tmp_path / "candidates.jsonl"
        monkeypatch.setenv("IDAC_LEARNING_STORE_PATH", str(store))
        store.write_text(
            '{"intent_ref": "i-1", "candidate_kind": "validated_execution_bundle"}\n'
            '{"intent_ref": "i-2", "candidate_kind": "validated_execution_bundle"}\n',
            encoding="utf-8",
        )
        stats = learning_store_stats(tail=5)
        assert stats["exists"] is True
        assert stats["count"] == 2
        assert len(stats["tail"]) == 2

    def test_recorded_entry_shape(self, settings, tmp_path, monkeypatch):
        monkeypatch.setenv("IDAC_LEARNING_STORE_PATH", str(tmp_path / "candidates.jsonl"))
        intent = _sample_intent(constraints={"prompt": "flat wall", "atcm": True})
        plan = request_plan(intent, settings=settings)
        with patch("app.main.dispatch_render", return_value={"structure": {"run_id": "learn-2"}}):
            evidence = execute_plan(plan, intent=intent, settings=settings)
        validation = validate_intent_evidence(intent, evidence)
        out = record_learning_candidate(intent=intent, evidence=evidence, validation=validation)
        assert out["recorded"] is True
        assert out["intent_ref"] == intent.id
        assert out["evidence_ref"] == evidence.id
        assert out["candidate_kind"] == "validated_execution_bundle"
        line = json.loads((tmp_path / "candidates.jsonl").read_text(encoding="utf-8").strip())
        assert line["intent_ref"] == intent.id
        assert line["evidence_ref"] == evidence.id

    def test_learning_append_only_multiple_records(self, settings, tmp_path, monkeypatch):
        monkeypatch.setenv("IDAC_LEARNING_STORE_PATH", str(tmp_path / "candidates.jsonl"))
        for i in range(3):
            intent = _sample_intent(source_run_id=f"run-{i}")
            plan = request_plan(intent, settings=settings)
            with patch("app.main.dispatch_render", return_value={"structure": {"run_id": f"learn-{i}"}}):
                evidence = execute_plan(plan, intent=intent, settings=settings)
            validation = validate_intent_evidence(intent, evidence)
            record_learning_candidate(intent=intent, evidence=evidence, validation=validation)
        lines = [ln for ln in (tmp_path / "candidates.jsonl").read_text(encoding="utf-8").splitlines() if ln.strip()]
        assert len(lines) == 3


class TestCharterGateLearningEnforcement:
    """evaluate_learning_invariants — no_learning_without_validated_evidence gate."""

    def test_raises_when_verdict_not_pass(self):
        from app.idac.core.charter_gate import evaluate_learning_invariants

        with pytest.raises(PlanViolationError) as exc:
            evaluate_learning_invariants({"verdict": "fail"})
        assert exc.value.code == "idac.charter.no_learning_without_validated_evidence"

    def test_raises_when_verdict_missing(self):
        from app.idac.core.charter_gate import evaluate_learning_invariants

        with pytest.raises(PlanViolationError) as exc:
            evaluate_learning_invariants({})
        assert exc.value.code == "idac.charter.no_learning_without_validated_evidence"

    def test_passes_when_verdict_is_pass(self, settings):
        from app.idac.core.charter_gate import evaluate_learning_invariants

        intent = _sample_intent()
        plan = request_plan(intent, settings=settings)
        with patch("app.main.dispatch_render", return_value={"structure": {"run_id": "clg-1"}}):
            evidence = execute_plan(plan, intent=intent, settings=settings)
        validation = validate_intent_evidence(intent, evidence)
        evaluate_learning_invariants(validation)

    def test_router_passes_learning_invariant_on_success(self, settings):
        intent = _sample_intent()
        plan = request_plan(intent, settings=settings)
        with patch("app.main.dispatch_render", return_value={"structure": {"run_id": "clg-2"}}):
            evidence = execute_plan(plan, intent=intent, settings=settings)
        validation = validate_intent_evidence(intent, evidence)
        validation["verdict"] = "pass"
        outcome = record_learning_candidate(intent=intent, evidence=evidence, validation=validation)
        assert outcome["recorded"] is True


class TestMissionRegistry:
    """Article III — mission_ref validation against known missions."""

    def test_known_mission_passes(self):
        from app.idac.core.mission_registry import validate_mission_ref

        validate_mission_ref("cecp/idac-stack-2026-07")

    def test_unknown_mission_raises(self):
        from app.idac.core.mission_registry import validate_mission_ref

        with pytest.raises(PlanViolationError) as exc:
            validate_mission_ref("unknown/mission")
        assert exc.value.code == "idac.mission_ref_unknown"

    def test_empty_mission_raises(self):
        from app.idac.core.mission_registry import validate_mission_ref

        with pytest.raises(PlanViolationError) as exc:
            validate_mission_ref("")
        assert exc.value.code == "idac.mission_ref_empty"

    def test_validate_intent_rejects_unknown_mission(self):
        intent = _sample_intent(mission_ref="bogus/mission")
        with pytest.raises(PlanViolationError) as exc:
            from app.idac.core.router import validate_intent

            validate_intent(intent)
        assert exc.value.code == "idac.mission_ref_unknown"

    def test_list_known_missions(self):
        from app.idac.core.mission_registry import list_known_missions

        missions = list_known_missions()
        assert "cecp/idac-stack-2026-07" in missions
        assert "mission/test" in missions
        assert len(missions) >= 2

    def test_router_handle_intent_passes_valid_mission(self, settings):
        from app.idac.core.router import handle_intent as handle_via_router

        intent = _sample_intent()
        with patch("app.main.dispatch_render", return_value={"structure": {"run_id": "mr-1"}}):
            result = handle_via_router(intent, settings=settings)
        assert result["validation"]["verdict"] == "pass"

    def test_router_rejects_unknown_mission(self, settings):
        from app.idac.core.router import handle_intent as handle_via_router

        intent = _sample_intent(mission_ref="bogus/mission")
        with pytest.raises(PlanViolationError) as exc:
            handle_via_router(intent, settings=settings)
        assert exc.value.code == "idac.mission_ref_unknown"


class TestOptimizerCharterGate:
    """DIRECTOR_ENFORCEMENT: no_optimization_without_constitutional_constraints."""

    def test_request_plan_rejects_missing_charter(self, monkeypatch, settings):
        monkeypatch.setattr(
            "app.idac.core.optimizer.assert_idac_charter_loaded",
            lambda: (_ for _ in ()).throw(
                __import__("app.idac.core.charter_gate", fromlist=["IdacCharterLoadError"]).IdacCharterLoadError(
                    "simulated missing charter"
                )
            ),
        )
        with pytest.raises(RuntimeError):
            intent = _sample_intent()
            request_plan(intent, settings=settings)

    def test_request_plan_passes_with_charter(self, settings):
        intent = _sample_intent()
        plan = request_plan(intent, settings=settings)
        assert plan.plan_id is not None
        assert plan.optimizer["must_not_execute"] is True


class TestRenderRuntime:
    def test_tile_scheduler_declared_note(self):
        desc = TileScheduler.describe({"atcm_summary": {"tile_count": 16}})
        assert desc["status"] == "partial"
        assert "full-frame" in desc["note"] or "per-tile" in desc["note"]


class TestShadingEngineVerified:
    """ShadingEngine verification — mode validation, waiver, evidence shape."""

    def make_engine(self) -> ShadingEngine:
        return ShadingEngine(Settings(planner_mode="heuristic"))

    def test_accepts_full_frame_dispatch(self):
        engine = self.make_engine()
        desc = engine.describe({"render_plan": {"execution_mode": "full_frame_dispatch"}})
        assert desc["execution_mode"] == "full_frame_dispatch"
        assert desc["status"] == "partial"
        assert desc["per_tile_available"] is True

    def test_accepts_full_frame_with_tile_evidence(self):
        engine = self.make_engine()
        desc = engine.describe({"render_plan": {"execution_mode": "full_frame_with_tile_evidence"}})
        assert desc["execution_mode"] == "full_frame_with_tile_evidence"
        assert "W-TILE-FAITHFUL" in desc["waivers_applied"]
        assert desc["per_tile_available"] is True

    def test_rejects_per_tile_mode(self):
        engine = self.make_engine()
        with pytest.raises(PlanViolationError) as exc:
            engine.describe({"render_plan": {"execution_mode": "per_tile"}})
        assert "W-TILE-FAITHFUL" in str(exc.value)
        assert exc.value.code == "shading.per_tile_blocked"

    def test_defaults_to_full_frame_when_mode_unknown(self):
        engine = self.make_engine()
        desc = engine.describe({"render_plan": {"execution_mode": "quantum_raster"}})
        assert desc["execution_mode"] == "full_frame_dispatch"

    def test_describe_includes_capability_and_waiver_metadata(self):
        engine = self.make_engine()
        desc = engine.describe({"render_plan": {}})
        assert "status" in desc
        assert "execution_mode" in desc
        assert "per_tile_available" in desc
        assert "per_tile_note" in desc
        assert "waivers_applied" in desc
        assert isinstance(desc["waivers_applied"], list)

    def test_handles_empty_domain_plan(self):
        engine = self.make_engine()
        desc = engine.describe({})
        assert desc["execution_mode"] == "full_frame_dispatch"
        assert desc["tile_count"] == 0

    def test_tile_count_from_tile_evidence(self):
        engine = self.make_engine()
        desc = engine.describe({
            "render_plan": {
                "execution_mode": "full_frame_with_tile_evidence",
                "tile_execution_evidence": {"tile_count": 9, "status": "partial"},
            },
        })
        assert desc["tile_count"] == 9
        assert desc["tile_evidence_status"] == "partial"

    def test_validate_mode_rejects_per_tile(self):
        engine = self.make_engine()
        with pytest.raises(PlanViolationError) as exc:
            engine.validate_mode("per_tile")
        assert exc.value.code == "shading.per_tile_blocked"

    def test_validate_mode_accepts_valid(self):
        engine = self.make_engine()
        assert engine.validate_mode("full_frame_dispatch") == "full_frame_dispatch"
        assert engine.validate_mode("full_frame_with_tile_evidence") == "full_frame_with_tile_evidence"

    def test_validate_mode_defaults_unknown(self):
        engine = self.make_engine()
        assert engine.validate_mode("hyper_raster") == "full_frame_dispatch"


class TestDomainAdapterRendering:
    def test_render_executor_components(self, settings):
        ex = RenderExecutor(settings)
        assert ex.tile_scheduler.status == "partial"
        assert ex.shading_engine.status == "partial"
        assert ex.shading_engine._settings is not None
        assert ex.postfx_engine.status == "partial"

    def test_postfx_engine_in_evidence_runtime_meta(self, settings):
        intent = _sample_intent(constraints={"prompt": "flat wall", "atcm": True})
        plan = request_plan(intent, settings=settings)
        with patch("app.main.dispatch_render", return_value={"structure": {"run_id": "pfe-1"}}):
            evidence = execute_plan(plan, intent=intent, settings=settings)
        runtime = evidence.execution_trace.get("runtime", {})
        pfe = runtime.get("postfx_engine", {})
        assert pfe.get("status") == "partial"
        assert "upscale_strategy" in pfe
        assert "brdf_strategy" in pfe
        assert pfe.get("per_tile_postfx_available") is True

    def test_postfx_engine_conditional_waiver_in_evidence(self, settings):
        intent = _sample_intent(constraints={"prompt": "flat wall", "atcm": True})
        plan = request_plan(intent, settings=settings)
        with patch("app.main.dispatch_render", return_value={"structure": {"run_id": "pfe-2"}}):
            evidence = execute_plan(plan, intent=intent, settings=settings)
        runtime = evidence.execution_trace.get("runtime", {})
        pfe = runtime.get("postfx_engine", {})
        brdf = pfe.get("brdf_strategy")
        waivers = pfe.get("waivers_applied", [])
        if brdf == "piecewise_cheap_tiles":
            assert "W-TILE-FAITHFUL" in waivers
        else:
            assert waivers == []


class TestPostFXEngineVerified:
    """PostFXEngine verification — strategy validation, metadata, waiver."""

    def make_engine(self) -> PostFXEngine:
        return PostFXEngine(Settings(planner_mode="heuristic"))

    def test_upscale_strategy_valid(self):
        engine = self.make_engine()
        desc = engine.describe({
            "render_plan": {
                "math_strategies": {
                    "upscale_strategy": {"strategy": "low_res_edge_aware_upscale"},
                },
            },
        })
        assert desc["upscale_strategy"] == "low_res_edge_aware_upscale"
        assert desc["status"] == "partial"

    def test_upscale_strategy_defaults_on_unknown(self):
        engine = self.make_engine()
        desc = engine.describe({
            "render_plan": {
                "math_strategies": {
                    "upscale_strategy": {"strategy": "ai_super_res"},
                },
            },
        })
        assert desc["upscale_strategy"] == "none_full_res"

    def test_brdf_strategy_valid(self):
        engine = self.make_engine()
        desc = engine.describe({
            "render_plan": {
                "math_strategies": {
                    "brdf_strategy": {"strategy": "piecewise_cheap_tiles"},
                },
            },
        })
        assert desc["brdf_strategy"] == "piecewise_cheap_tiles"

    def test_brdf_strategy_defaults_on_unknown(self):
        engine = self.make_engine()
        desc = engine.describe({
            "render_plan": {
                "math_strategies": {
                    "brdf_strategy": {"strategy": "path_trace_full"},
                },
            },
        })
        assert desc["brdf_strategy"] == "full_brdf_tiles"

    def test_visibility_strategy_valid(self):
        engine = self.make_engine()
        desc = engine.describe({
            "render_plan": {
                "math_strategies": {
                    "visibility_strategy": {"strategy": "director_tile_grid_only"},
                },
            },
        })
        assert desc["visibility_strategy"] == "director_tile_grid_only"

    def test_visibility_strategy_defaults_on_unknown(self):
        engine = self.make_engine()
        desc = engine.describe({
            "render_plan": {
                "math_strategies": {
                    "visibility_strategy": {"strategy": "hierarchical_z_buffer"},
                },
            },
        })
        assert desc["visibility_strategy"] == "director_tile_grid_only"

    def test_adaptive_samples_from_math_strategies(self):
        engine = self.make_engine()
        desc = engine.describe({
            "render_plan": {
                "math_strategies": {
                    "adaptive_samples": {
                        "strategy": "C_i_inverse",
                        "suggested_global_spp": 8,
                    },
                },
            },
        })
        assert desc["adaptive_samples_strategy"] == "C_i_inverse"
        assert desc["adaptive_samples_suggested_spp"] == 8

    def test_director_today_shape(self):
        engine = self.make_engine()
        desc = engine.describe({"render_plan": {"math_strategies": {}}})
        dt = desc["director_today"]
        assert "upscale" in dt
        assert "brdf" in dt
        assert "visibility" in dt

    def test_per_tile_postfx_api_available_without_brdf_waiver(self):
        engine = self.make_engine()
        desc = engine.describe({"render_plan": {}})
        assert desc["per_tile_postfx_available"] is True
        assert desc["waivers_applied"] == []
        assert desc["brdf_strategy"] == "full_brdf_tiles"

    def test_waiver_applied_when_brdf_is_piecewise_cheap_tiles(self):
        engine = self.make_engine()
        desc = engine.describe({
            "render_plan": {
                "math_strategies": {
                    "brdf_strategy": {"strategy": "piecewise_cheap_tiles"},
                },
            },
        })
        assert desc["brdf_strategy"] == "piecewise_cheap_tiles"
        assert "W-TILE-FAITHFUL" in desc["waivers_applied"]

    def test_no_waiver_for_full_brdf_tiles(self):
        engine = self.make_engine()
        desc = engine.describe({
            "render_plan": {
                "math_strategies": {
                    "brdf_strategy": {"strategy": "full_brdf_tiles"},
                },
            },
        })
        assert desc["waivers_applied"] == []

    def test_empty_domain_plan_defaults(self):
        engine = self.make_engine()
        desc = engine.describe({})
        assert desc["upscale_strategy"] == "none_full_res"
        assert desc["brdf_strategy"] == "full_brdf_tiles"
        assert desc["waivers_applied"] == []

    def test_validate_upscale_static_method(self):
        assert PostFXEngine.validate_upscale("low_res_edge_aware_upscale") == "low_res_edge_aware_upscale"
        assert PostFXEngine.validate_upscale("none_full_res") == "none_full_res"
        assert PostFXEngine.validate_upscale("unknown") == "none_full_res"
        assert PostFXEngine.validate_upscale(None) == "none_full_res"

    def test_validate_brdf_static_method(self):
        assert PostFXEngine.validate_brdf("piecewise_cheap_tiles") == "piecewise_cheap_tiles"
        assert PostFXEngine.validate_brdf("full_brdf_tiles") == "full_brdf_tiles"
        assert PostFXEngine.validate_brdf("unknown") == "full_brdf_tiles"
        assert PostFXEngine.validate_brdf(None) == "full_brdf_tiles"

    def test_validate_visibility_static_method(self):
        assert PostFXEngine.validate_visibility("director_tile_grid_only") == "director_tile_grid_only"
        assert PostFXEngine.validate_visibility("unknown") == "director_tile_grid_only"
        assert PostFXEngine.validate_visibility(None) == "director_tile_grid_only"


class TestRouterHttpIntegrationL1:
    def test_direct_api_uses_idac_router(self, monkeypatch):
        from fastapi.testclient import TestClient

        from app.main import app
        from app.models import MemoryboardHints

        settings = Settings(
            genblaze_base_url="https://genblaze.example.test",
            planner_mode="heuristic",
        )
        monkeypatch.setattr("app.main.get_settings", lambda: settings)
        monkeypatch.setattr("app.main.read_memoryboard", lambda *_a, **_k: MemoryboardHints())

        def _dispatch(_settings, target, client=None):
            return {"structure": {"run_id": "direct-idac-1", "preview_url": "/p/direct-idac-1"}}

        monkeypatch.setattr("app.main.dispatch_render", _dispatch)
        client = TestClient(app)
        response = client.post(
            "/api/direct",
            json={"prompt": "empty sky wall flat structure", "speed_profile": "atcm"},
        )
        assert response.status_code == 200
        body = response.json()
        assert body["context_used"]["idac"] is True
        assert body["idac"] is not None
        assert body["idac"]["validation"]["verdict"] == "pass"
        assert body["idac"]["evidence"]["execution_trace"]["run_id"] == "direct-idac-1"
        assert body["render_plan"] is not None
        assert body["atcm"]["work_model"]["label"] == "estimate_not_measured"


@pytest.mark.skip(reason="L2: multi-domain orchestration not implemented")
class TestMultiDomainL2:
    def test_compile_and_ai_in_one_session(self):
        pass
