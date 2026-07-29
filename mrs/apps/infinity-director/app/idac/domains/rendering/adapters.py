"""Rendering domain adapters v1.0 — ATCM / RenderAccel behind IDAC Optimizer."""

from __future__ import annotations

from typing import Any

from app.atcm import plan_atcm, suggested_dims_for_profile
from app.config import Settings
from app.idac.core.contracts import IntentContract, PlanViolationError
from app.memoryboard import read_memoryboard
from app.models import DirectRequest, MemoryboardHints
from app.render_accel import build_atcm_contract_bundle, derive_math_strategies, validate_atcm_prerequisites


class RenderIntentAdapter:
    """Maps HTTP / DirectRequest fields into IntentContract.constraints."""

    @staticmethod
    def constraints_from_direct(request: DirectRequest) -> dict[str, Any]:
        return {
            "prompt": request.prompt,
            "scene_spec": request.scene_spec,
            "quality": request.quality,
            "speed_profile": request.speed_profile,
            "atcm": request.atcm,
            "mode": request.mode,
            "source_run_id": request.source_run_id,
            "memory_context": (
                request.memory_context.model_dump(mode="json") if request.memory_context else None
            ),
        }


class RenderOptimizerAdapter:
    """RenderOptimizer — DomainPlan producer (ATCM + AcceleratedRenderer contract bundle)."""

    def __init__(self, *, settings: Settings, prepass_png: bytes | None = None) -> None:
        self._settings = settings
        self._prepass_png = prepass_png
        self.hints: MemoryboardHints | None = None
        self.effective_request: DirectRequest | None = None

    def build_domain_plan(self, *, intent: IntentContract, request: DirectRequest) -> dict[str, Any]:
        use_atcm = bool(request.atcm or (request.speed_profile or "").lower() == "atcm")
        domain_plan: dict[str, Any] = {"atcm_activated": use_atcm, "adapter": "rendering_v1"}

        if request.memory_context and request.memory_context.memoryboard_id:
            self.hints = read_memoryboard(self._settings, request.memory_context)

        effective = request
        if use_atcm:
            width, height = suggested_dims_for_profile("fast")
            validate_atcm_prerequisites(
                width=width,
                height=height,
                prompt=request.prompt,
                scene_spec=request.scene_spec,
            )
            atcm_report = plan_atcm(
                width=width,
                height=height,
                prompt=request.prompt,
                prepass_png=self._prepass_png,
            )
            suggested = atcm_report.get("suggested_speed_profile") or "fast"
            width, height = suggested_dims_for_profile(suggested)
            atcm_report = plan_atcm(
                width=width,
                height=height,
                prompt=request.prompt,
                prepass_png=self._prepass_png,
            )
            render_plan, complexity = build_atcm_contract_bundle(
                atcm_report=atcm_report,
                prompt=request.prompt,
                scene_spec=request.scene_spec,
            )
            math_strategies = derive_math_strategies(atcm_report=atcm_report)
            render_plan = {**render_plan, "math_strategies": math_strategies}
            domain_plan["render_plan"] = render_plan
            domain_plan["complexity_evidence"] = complexity
            domain_plan["complexity_evidence_preview"] = {
                "id": complexity.get("id"),
                "render_plan_id": complexity.get("renderPlanId"),
            }
            domain_plan["atcm_summary"] = {
                k: v for k, v in atcm_report.items() if k != "tiles"
            }
            domain_plan["atcm_summary"]["tile_count"] = len(atcm_report.get("tiles") or [])
            effective = request.model_copy(
                update={
                    "speed_profile": atcm_report.get("suggested_speed_profile") or "fast",
                    "atcm": True,
                },
            )

        self.effective_request = effective
        return domain_plan


class RenderEvidenceAdapter:
    """Maps RenderAccel artifacts into EvidenceContract.artifacts."""

    @staticmethod
    def wrap_render_accel(*, dispatch_result: dict[str, Any], replay_record: dict[str, Any] | None) -> dict[str, Any]:
        out: dict[str, Any] = {"dispatch_result": dispatch_result}
        if replay_record:
            out["replay_record"] = replay_record
        return out


class RenderValidationAdapter:
    """Domain-specific validation hooks — partial."""

    status: str = "skeleton"

    @staticmethod
    def check_tile_complexity_evidence(domain_plan: dict[str, Any]) -> bool:
        if not domain_plan.get("atcm_activated"):
            return True
        return bool(domain_plan.get("complexity_evidence_preview"))
