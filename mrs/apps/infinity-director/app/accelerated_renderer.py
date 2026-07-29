"""AcceleratedRenderer governed pipeline facade (Draft v0.1).

CPU-centric planning surface for Sovereign X / Infinity Director. Unifies ATCM
tile planning with RenderAccelContract artifacts under ``request`` / ``execute``.

Status: **partial** — ``request`` builds per-tile evidence; ``execute`` validates
invariants then uses existing full-frame Genblaze dispatch (not per-tile shading).
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Callable

from app.atcm import plan_atcm, suggested_dims_for_profile
from app.config import Settings
from app.dispatch import ENGINE_BY_LANE, attach_profile_meta, build_dispatch_target, dispatch_render
from app.models import DirectRequest, DispatchTarget, NormalizedPlan
from app.render_accel import (
    RenderViolationError,
    atcm_explicitly_requested,
    build_atcm_contract_bundle,
    build_replay_record_skeleton,
    validate_atcm_prerequisites,
)
from app.idac.domains.rendering.genblaze_tile_dispatch import should_tile_faithful_dispatch

SPEC_VERSION = "0.1"
PIPELINE_NAME = "AcceleratedRenderer"
ROUTER_AUTHORITY = "infinity-director"


def pipeline_explicitly_enabled(*, atcm_flag: bool, speed_profile: str | None) -> bool:
    """Router authority: AR/ATCM runs only when Director client explicitly enables it."""
    return atcm_explicitly_requested(atcm_flag=atcm_flag, speed_profile=speed_profile)


@dataclass(frozen=True)
class AcceleratedRequestResult:
    atcm_report: dict[str, Any]
    render_plan: dict[str, Any]
    complexity_evidence: dict[str, Any]
    suggested_speed_profile: str
    width: int
    height: int


@dataclass(frozen=True)
class AcceleratedExecuteResult:
    lane_plan: NormalizedPlan
    dispatch_target: DispatchTarget
    result: dict[str, Any]
    speed_profile_meta: dict[str, Any] | None
    replay_record: dict[str, Any]


def validate_render_plan_for_execute(
    *,
    render_plan: dict[str, Any] | None,
    complexity_evidence: dict[str, Any] | None,
) -> None:
    """AcceleratedRenderer invariants before dispatch (Article IV — partial enforcement)."""
    if render_plan is None:
        raise RenderViolationError(
            code="ar.missing_render_plan",
            message="Accelerated execute requires a RenderPlan; no render without plan",
            article="IV",
        )
    if complexity_evidence is None:
        raise RenderViolationError(
            code="ar.missing_complexity_evidence",
            message="Accelerated execute requires ComplexityEvidence; no tile without evidence bundle",
            article="IV",
        )
    plan_id = str(render_plan.get("id") or "")
    evidence_plan_id = str(complexity_evidence.get("renderPlanId") or "")
    if not plan_id or plan_id != evidence_plan_id:
        raise RenderViolationError(
            code="ar.plan_evidence_mismatch",
            message="ComplexityEvidence renderPlanId must match RenderPlan id",
            article="IV",
            details={"renderPlanId": evidence_plan_id, "render_plan_id": plan_id},
        )
    if str(render_plan.get("routerAuthority") or "") != ROUTER_AUTHORITY:
        raise RenderViolationError(
            code="ar.router_authority",
            message="RenderPlan routerAuthority must be infinity-director",
            article="II",
        )
    tiles = render_plan.get("tiles")
    tile_count = int(render_plan.get("tile_count") or 0)
    if not tiles and tile_count < 1:
        raise RenderViolationError(
            code="ar.empty_tile_plan",
            message="RenderPlan has no tile decisions; cannot execute accelerated path",
            article="IV",
        )
    if render_plan.get("accelerator") != "ATCM":
        raise RenderViolationError(
            code="ar.unsupported_accelerator",
            message="AcceleratedRenderer v0.1 supports ATCM accelerator only",
            article="I",
            details={"accelerator": render_plan.get("accelerator")},
        )


def build_atcm_plan_report(
    *,
    width: int,
    height: int,
    prompt: str | None,
    scene_spec: dict[str, Any] | None,
    prepass_png: bytes | None = None,
    tile_size: int = 64,
    threshold: float = 0.35,
    two_pass_profile: bool = True,
) -> AcceleratedRequestResult:
    """Pipeline step 1–3: intent check → prepass/complexity → RenderPlan + ComplexityEvidence."""
    validate_atcm_prerequisites(
        width=width,
        height=height,
        prompt=prompt,
        scene_spec=scene_spec,
    )
    atcm_report = plan_atcm(
        width=width,
        height=height,
        prompt=prompt,
        prepass_png=prepass_png,
        tile_size=tile_size,
        threshold=threshold,
    )
    suggested = str(atcm_report.get("suggested_speed_profile") or "fast")
    if two_pass_profile:
        w2, h2 = suggested_dims_for_profile(suggested)
        atcm_report = plan_atcm(
            width=w2,
            height=h2,
            prompt=prompt,
            prepass_png=prepass_png,
            tile_size=tile_size,
            threshold=threshold,
        )
        suggested = str(atcm_report.get("suggested_speed_profile") or "fast")
        width, height = w2, h2

    render_plan, complexity_evidence = build_atcm_contract_bundle(
        atcm_report=atcm_report,
        prompt=prompt,
        scene_spec=scene_spec,
    )
    render_plan = {
        **render_plan,
        "pipeline": PIPELINE_NAME,
        "pipelineVersion": SPEC_VERSION,
    }
    complexity_evidence = {
        **complexity_evidence,
        "pipeline": PIPELINE_NAME,
        "pipelineVersion": SPEC_VERSION,
    }
    return AcceleratedRequestResult(
        atcm_report=atcm_report,
        render_plan=render_plan,
        complexity_evidence=complexity_evidence,
        suggested_speed_profile=suggested,
        width=width,
        height=height,
    )


def request_for_direct(
    *,
    body: DirectRequest,
    prepass_png: bytes | None = None,
) -> AcceleratedRequestResult | None:
    """Build plan + evidence when AR is explicitly enabled on ``/api/direct``."""
    if not pipeline_explicitly_enabled(atcm_flag=bool(body.atcm), speed_profile=body.speed_profile):
        return None
    width, height = suggested_dims_for_profile("fast")
    return build_atcm_plan_report(
        width=width,
        height=height,
        prompt=body.prompt,
        scene_spec=body.scene_spec,
        prepass_png=prepass_png,
        two_pass_profile=True,
    )


def request_plan_only(
    *,
    width: int,
    height: int,
    prompt: str | None,
    scene_spec: dict[str, Any] | None,
    tile_size: int = 64,
    threshold: float = 0.35,
    include_tiles: bool = True,
) -> AcceleratedRequestResult:
    """Plan-only path for ``POST /api/atcm/plan`` (explicit endpoint activation)."""
    result = build_atcm_plan_report(
        width=width,
        height=height,
        prompt=prompt,
        scene_spec=scene_spec,
        tile_size=tile_size,
        threshold=threshold,
        two_pass_profile=False,
    )
    if not include_tiles:
        empty_tiles: list[Any] = []
        atcm = {**result.atcm_report, "tiles": empty_tiles}
        render_plan = {**result.render_plan, "tiles": empty_tiles, "tile_count": 0}
        return AcceleratedRequestResult(
            atcm_report=atcm,
            render_plan=render_plan,
            complexity_evidence=result.complexity_evidence,
            suggested_speed_profile=result.suggested_speed_profile,
            width=result.width,
            height=result.height,
        )
    return result


def execute(
    *,
    settings: Settings,
    body: DirectRequest,
    render_plan: dict[str, Any],
    complexity_evidence: dict[str, Any],
    read_memoryboard_fn: Callable[..., Any],
    build_plan_fn: Callable[..., NormalizedPlan],
    build_dispatch_target_fn: Callable[..., DispatchTarget] | None = None,
    dispatch_render_fn: Callable[..., dict[str, Any]] | None = None,
    attach_profile_meta_fn: Callable[..., dict[str, Any] | None] | None = None,
) -> AcceleratedExecuteResult:
    """Pipeline step 4–5: validate plan → full-frame dispatch → ReplayRecord skeleton.

    Gap (honest): Genblaze/Engine3D still APIs render whole frames. Tile modes in
    the RenderPlan are evidence for future tile-aware execution, not dispatch flags.
    """
    validate_render_plan_for_execute(
        render_plan=render_plan,
        complexity_evidence=complexity_evidence,
    )
    _ALLOWED_EXECUTION_MODES = (None, "full_frame_dispatch", "full_frame_with_tile_evidence")
    if render_plan.get("execution_mode") not in _ALLOWED_EXECUTION_MODES:
        raise RenderViolationError(
            code="ar.unsupported_execution_mode",
            message="Director v0.1 execute supports full_frame_dispatch and full_frame_with_tile_evidence only",
            article="IV",
            details={"execution_mode": render_plan.get("execution_mode")},
        )

    hints = read_memoryboard_fn(settings, body.memory_context)
    lane_plan = build_plan_fn(body, hints, settings)
    _build_target = build_dispatch_target_fn or build_dispatch_target
    _dispatch = dispatch_render_fn or dispatch_render
    _attach_meta = attach_profile_meta_fn or attach_profile_meta
    target = _build_target(lane_plan, body, settings)
    if should_tile_faithful_dispatch(lane=lane_plan.lane, render_plan=render_plan):
        from app.idac.domains.rendering.genblaze_tile_dispatch import (
            dispatch_tile_faithful,
            refresh_tile_execution_evidence,
        )

        result = dispatch_tile_faithful(
            settings,
            render_plan=render_plan,
            base_payload=dict(target.payload),
            dispatch_fn=_dispatch,
        )
        render_plan["tile_execution_evidence"] = refresh_tile_execution_evidence(
            render_plan,
            result,
        )
        plan_faithful = {
            "claimed": True,
            "note": "Tile-faithful HTTP loop with crop_region per tile",
            "execution_mode": render_plan.get("execution_mode"),
        }
    else:
        result = _dispatch(settings, target)
        plan_faithful = {
            "claimed": False,
            "note": "Full-frame dispatch; tile-faithful loop not used for this lane/mode",
            "execution_mode": render_plan.get("execution_mode", "full_frame_dispatch"),
        }
    replay = build_replay_record_skeleton(
        render_plan_id=str(render_plan["id"]),
        complexity_evidence_id=str(complexity_evidence["id"]),
        lane=lane_plan.lane,
        engine=ENGINE_BY_LANE[lane_plan.lane],
        dispatch_endpoint=target.endpoint,
        result=result,
    )
    replay = {
        **replay,
        "pipeline": PIPELINE_NAME,
        "pipelineVersion": SPEC_VERSION,
        "plan_faithful_execution": plan_faithful,
    }
    return AcceleratedExecuteResult(
        lane_plan=lane_plan,
        dispatch_target=target,
        result=result,
        speed_profile_meta=_attach_meta(lane_plan, body),
        replay_record=replay,
    )
