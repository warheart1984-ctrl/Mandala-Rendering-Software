"""IDAC.RenderRuntime v0.1 component facades."""

from __future__ import annotations

from typing import Any

import httpx

from app.config import Settings
from app.dispatch import DispatchError, ENGINE_BY_LANE, build_dispatch_target
from app.idac.core.contracts import EvidenceContract, ExecutionPlan, IntentContract, PlanViolationError
from app.idac.domains.rendering.adapters import RenderEvidenceAdapter, RenderValidationAdapter
from app.idac.domains.rendering.genblaze_tile_dispatch import (
    dispatch_tile_faithful,
    refresh_tile_execution_evidence,
    should_tile_faithful_dispatch,
)
from app.models import DirectRequest, DispatchTarget, NormalizedPlan
from app.render_accel import build_replay_record_skeleton


class ViolationEmitter:
    @staticmethod
    def emit(error: PlanViolationError) -> dict[str, Any]:
        return error.to_violation()


class TileScheduler:
    """ATCM tile grid — staged evidence; Genblaze remains full-frame."""

    status = "partial"

    @staticmethod
    def describe(domain_plan: dict[str, Any]) -> dict[str, Any]:
        summary = domain_plan.get("atcm_summary") or {}
        rp = domain_plan.get("render_plan") or {}
        tee = rp.get("tile_execution_evidence") or {}
        return {
            "status": "partial",
            "tile_count": summary.get("tile_count") or tee.get("tile_count"),
            "execution_mode": rp.get("execution_mode", "full_frame_dispatch"),
            "note": "Staged tile evidence attached; per-tile Genblaze shade blocked-on-downstream-API",
        }


class ShadingEngine:
    """IDAC ShadingEngine — full-frame dispatch with tile evidence tracking.

    Status: partial — full_frame_dispatch and full_frame_with_tile_evidence
    are verified; per_tile shading is blocked on downstream Genblaze API
    (waiver W-TILE-FAITHFUL).
    """

    status = "partial"

    VALID_MODES: frozenset[str] = frozenset({
        "full_frame_dispatch",
        "full_frame_with_tile_evidence",
    })

    BLOCKED_MODES: frozenset[str] = frozenset({"per_tile"})

    def __init__(self, settings: Settings | None = None) -> None:
        self._settings = settings

    @staticmethod
    def validate_mode(mode: str) -> str:
        """Validate and normalise execution mode.

        Raises PlanViolationError for blocked/per_tile modes with
        documented waiver cross-ref.
        """
        if mode in ShadingEngine.BLOCKED_MODES:
            raise PlanViolationError(
                code="shading.per_tile_blocked",
                message=(
                    f"Shading execution mode {mode!r} is blocked — "
                    f"per-tile Genblaze shading requires downstream API "
                    f"(waiver W-TILE-FAITHFUL)"
                ),
                plan_ref="",
                intent_ref="",
            )
        if mode in ShadingEngine.VALID_MODES:
            return mode
        return "full_frame_dispatch"

    def describe(self, domain_plan: dict[str, Any]) -> dict[str, Any]:
        rp = domain_plan.get("render_plan") or {}
        raw_mode = rp.get("execution_mode", "full_frame_dispatch")
        mode = self.validate_mode(raw_mode)

        tile_evidence = rp.get("tile_execution_evidence") or {}
        tile_count = tile_evidence.get("tile_count") or 0
        tile_status = tile_evidence.get("status") or "not_applicable"
        tile_faithful_operational = (
            tile_status == "enforced"
            or tile_evidence.get("downstream_dispatch") == "tile_faithful_http_loop"
        )

        waivers: list[str] = []
        if mode == "full_frame_with_tile_evidence" and not tile_faithful_operational:
            waivers.append("W-TILE-FAITHFUL")

        return {
            "status": self.status,
            "execution_mode": mode,
            "tile_count": tile_count,
            "tile_evidence_status": tile_status,
            "per_tile_available": True,
            "per_tile_note": (
                "Per-tile Genblaze shading uses crop_region on POST /api/engine3d-still "
                "or POST /api/engine3d-tile-still (full-frame render + ROI crop)"
            ),
            "waivers_applied": waivers,
        }


class PostFXEngine:
    """IDAC PostFXEngine — upscale, BRDF, and visibility strategy metadata.

    Status: partial — strategy metadata is tracked and validated; actual
    post-fx dispatch is not wired (Genblaze full-frame only).
    """

    status = "partial"

    VALID_UPSCALE_STRATEGIES: frozenset[str] = frozenset({
        "low_res_edge_aware_upscale",
        "none_full_res",
    })

    VALID_BRDF_STRATEGIES: frozenset[str] = frozenset({
        "piecewise_cheap_tiles",
        "full_brdf_tiles",
    })

    VALID_VISIBILITY_STRATEGIES: frozenset[str] = frozenset({
        "director_tile_grid_only",
    })

    def __init__(self, settings: Settings | None = None) -> None:
        self._settings = settings

    @staticmethod
    def validate_upscale(strategy: str | None) -> str:
        if strategy and strategy not in PostFXEngine.VALID_UPSCALE_STRATEGIES:
            return "none_full_res"
        return strategy or "none_full_res"

    @staticmethod
    def validate_brdf(strategy: str | None) -> str:
        if strategy and strategy not in PostFXEngine.VALID_BRDF_STRATEGIES:
            return "full_brdf_tiles"
        return strategy or "full_brdf_tiles"

    @staticmethod
    def validate_visibility(strategy: str | None) -> str:
        if strategy and strategy not in PostFXEngine.VALID_VISIBILITY_STRATEGIES:
            return "director_tile_grid_only"
        return strategy or "director_tile_grid_only"

    def describe(self, domain_plan: dict[str, Any]) -> dict[str, Any]:
        rp = domain_plan.get("render_plan") or {}
        ms = rp.get("math_strategies") or {}
        upscale = ms.get("upscale_strategy") or {}
        brdf = ms.get("brdf_strategy") or {}
        visibility = ms.get("visibility_strategy") or {}
        adaptive = ms.get("adaptive_samples") or {}

        upscale_strategy = self.validate_upscale(upscale.get("strategy"))
        brdf_strategy = self.validate_brdf(brdf.get("strategy"))
        visibility_strategy = self.validate_visibility(visibility.get("strategy"))

        per_tile_strategy = brdf_strategy == "piecewise_cheap_tiles"
        rp_full = domain_plan.get("render_plan") or {}
        tee = rp_full.get("tile_execution_evidence") or {}
        tile_faithful_operational = (
            tee.get("status") == "enforced"
            or tee.get("downstream_dispatch") == "tile_faithful_http_loop"
        )
        waivers: list[str] = []
        if per_tile_strategy and not tile_faithful_operational:
            waivers.append("W-TILE-FAITHFUL")

        return {
            "status": self.status,
            "upscale_strategy": upscale_strategy,
            "brdf_strategy": brdf_strategy,
            "visibility_strategy": visibility_strategy,
            "adaptive_samples_suggested_spp": adaptive.get("suggested_global_spp"),
            "adaptive_samples_strategy": adaptive.get("strategy"),
            "director_today": {
                "upscale": upscale.get("director_today", "not_dispatched_post_fx_or_upscale"),
                "brdf": brdf.get("director_today", "classification_in_render_plan_tiles_only"),
                "visibility": visibility.get("director_today", "tile_grid_and_C_i_only"),
            },
            "per_tile_postfx_available": True,
            "per_tile_note": (
                "Per-tile post-fx may call Genblaze crop_region /engine3d-tile-still "
                "(full-frame + ROI crop; Director dispatch loop partial)"
            ),
            "waivers_applied": waivers,
        }


class EvidenceEmitter:
    @staticmethod
    def build(
        *,
        intent: IntentContract,
        plan: ExecutionPlan,
        execution_trace: dict[str, Any],
        artifacts: dict[str, Any],
        environment: dict[str, Any],
        outcome: str,
    ) -> EvidenceContract:
        return EvidenceContract(
            intent_ref=intent.id,
            plan_ref=plan.plan_id,
            execution_trace=execution_trace,
            artifacts=artifacts,
            environment=environment,
            outcome=outcome,  # type: ignore[arg-type]
        )


class RenderExecutor:
    """RenderExecution — plan-faithful dispatch to Genblaze lanes."""

    def __init__(self, settings: Settings) -> None:
        self._settings = settings
        self.tile_scheduler = TileScheduler()
        self.shading_engine = ShadingEngine(settings)
        self.postfx_engine = PostFXEngine(settings)
        self.evidence_emitter = EvidenceEmitter()
        self.violation_emitter = ViolationEmitter()

    def execute(
        self,
        plan: ExecutionPlan,
        *,
        intent: IntentContract,
        http_client: httpx.Client | None = None,
    ) -> EvidenceContract:
        if plan.domain in {"ai", "compile"} and plan.enforcement == "declared":
            return self.evidence_emitter.build(
                intent=intent,
                plan=plan,
                execution_trace={"status": "declared_stub", "domain": plan.domain},
                artifacts={"note": "stub domain"},
                environment={"genblaze_base_url": self._settings.genblaze_base_url},
                outcome="declared_stub",
            )

        domain_plan = plan.domain_plan or {}
        if plan.domain == "render" and domain_plan.get("atcm_activated"):
            if not RenderValidationAdapter.check_tile_complexity_evidence(domain_plan):
                raise PlanViolationError(
                    code="render.no_complexity_evidence",
                    message="Rendering invariant: no tile plan without complexity evidence",
                    plan_ref=plan.plan_id,
                    intent_ref=intent.id,
                )

        dispatch_doc = plan.resource_plan.get("dispatch") or {}
        normalized = NormalizedPlan.model_validate(domain_plan.get("normalized_plan") or {})
        target = DispatchTarget.model_validate(dispatch_doc)
        request = _request_from_plan(intent, plan)

        replay_target = build_dispatch_target(normalized, request, self._settings)
        if replay_target.endpoint != target.endpoint or replay_target.payload != target.payload:
            raise PlanViolationError(
                code="idac.plan_drift",
                message="Dispatch drift vs frozen ExecutionPlan",
                plan_ref=plan.plan_id,
                intent_ref=intent.id,
            )

        runtime_meta = {
            "tile_scheduler": self.tile_scheduler.describe(domain_plan),
            "shading_engine": self.shading_engine.describe(domain_plan),
            "postfx_engine": self.postfx_engine.describe(domain_plan),
        }

        try:
            from app.main import dispatch_render as director_dispatch_render

            render_plan = domain_plan.get("render_plan") if isinstance(domain_plan.get("render_plan"), dict) else None
            use_tiles = should_tile_faithful_dispatch(
                lane=normalized.lane,
                render_plan=render_plan,
            )
            if use_tiles and render_plan is not None:
                result = dispatch_tile_faithful(
                    self._settings,
                    render_plan=render_plan,
                    base_payload=dict(target.payload),
                    client=http_client,
                    dispatch_fn=director_dispatch_render,
                )
                updated_tee = refresh_tile_execution_evidence(render_plan, result)
                render_plan["tile_execution_evidence"] = updated_tee
                domain_plan["render_plan"] = render_plan
                runtime_meta["shading_engine"] = self.shading_engine.describe(domain_plan)
            else:
                try:
                    result = director_dispatch_render(self._settings, target, client=http_client)
                except TypeError:
                    result = director_dispatch_render(self._settings, target)
        except DispatchError as exc:
            return self.evidence_emitter.build(
                intent=intent,
                plan=plan,
                execution_trace={
                    "endpoint": target.endpoint,
                    "lane": normalized.lane,
                    "error": str(exc),
                    "runtime": runtime_meta,
                },
                artifacts={},
                environment={"genblaze_base_url": self._settings.genblaze_base_url},
                outcome="dispatch_error",
            )

        artifacts = RenderEvidenceAdapter.wrap_render_accel(dispatch_result=result, replay_record=None)
        render_plan = domain_plan.get("render_plan")
        preview = domain_plan.get("complexity_evidence_preview") or {}
        if isinstance(render_plan, dict):
            replay = build_replay_record_skeleton(
                render_plan_id=str(render_plan.get("id")),
                complexity_evidence_id=str(preview.get("id") or "unknown"),
                lane=normalized.lane,
                engine=ENGINE_BY_LANE[normalized.lane],
                dispatch_endpoint=target.endpoint,
                result=result,
            )
            artifacts = RenderEvidenceAdapter.wrap_render_accel(
                dispatch_result=result,
                replay_record=replay,
            )
            artifacts["render_accel"] = {
                "render_plan_id": render_plan.get("id"),
                "complexity_evidence_id": preview.get("id"),
            }

        run_id = None
        for key in ("structure", "render", "image"):
            block = result.get(key)
            if isinstance(block, dict) and block.get("run_id"):
                run_id = block.get("run_id")
                break

        return self.evidence_emitter.build(
            intent=intent,
            plan=plan,
            execution_trace={
                "endpoint": target.endpoint,
                "lane": normalized.lane,
                "engine": ENGINE_BY_LANE[normalized.lane],
                "run_id": run_id,
                "runtime": runtime_meta,
            },
            artifacts=artifacts,
            environment={
                "genblaze_base_url": self._settings.genblaze_base_url,
                "policy_ref": intent.policy_ref,
            },
            outcome="ok",
        )


def _request_from_plan(intent: IntentContract, plan: ExecutionPlan) -> DirectRequest:
    raw = (plan.domain_plan or {}).get("effective_request")
    if isinstance(raw, dict):
        return DirectRequest.model_validate(raw)
    return _request_from_intent(intent)


def _request_from_intent(intent: IntentContract) -> DirectRequest:
    c = intent.constraints
    return DirectRequest(
        prompt=str(c["prompt"]) if c.get("prompt") else None,
        quality=c.get("quality"),
        speed_profile=c.get("speed_profile"),
        atcm=bool(c.get("atcm")),
        scene_spec=c.get("scene_spec") if isinstance(c.get("scene_spec"), dict) else None,
        source_run_id=c.get("source_run_id"),
    )
