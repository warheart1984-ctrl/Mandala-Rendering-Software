from __future__ import annotations

from pathlib import Path

import httpx
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from starlette.middleware.base import BaseHTTPMiddleware

from app.accelerated_renderer import (
    pipeline_explicitly_enabled,
    request_plan_only,
)
from app.render_accel import RenderViolationError
from app.config import Settings, get_settings
from app.dispatch import ENGINE_BY_LANE, DispatchError, attach_profile_meta, build_dispatch_target, dispatch_render
from app.idac import PlanViolationError as IdacPlanViolationError, handle_intent as idac_handle_intent
from app.idac.core.learning import learning_store_stats
from app.idac.core.charter_gate import charter_gate_status
from app.idac.core.contracts import IntentContract
from app.idac_direct_bridge import (
    direct_request_to_intent,
    idac_bundle_to_direct_response,
    idac_path_requested,
)
from app.health import probe_downstream, probe_planner
from app.memoryboard import MemoryboardReadError, read_memoryboard
from app.models import DirectRequest, DirectResponse, DispatchTarget
from app.planner import PlannerError, build_plan
from app.render_profiles import PROFILES

APP_DIR = Path(__file__).resolve().parent
STATIC_INDEX = APP_DIR / "static" / "index.html"


class DirectorHeaderMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request, call_next):
        response = await call_next(request)
        response.headers["X-MRS-Director"] = "infinity-memoryboard-director"
        return response

app = FastAPI(
    title="Infinity Memoryboard Director",
    description=(
        "CPU-only director router for Infinity memoryboard -> Genblaze/MRS still-image "
        "lanes. Read-only memory context, no diffusion, no local asset-history mining."
    ),
    version="0.1.0",
)

settings = get_settings()
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_allow_origins,
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.add_middleware(DirectorHeaderMiddleware)


def _maybe_fetch_prepass_png(settings: Settings, run_id: str | None) -> bytes | None:
    if not run_id:
        return None
    try:
        url = f"{settings.genblaze_base_url.rstrip('/')}/api/preview/{run_id}"
        with httpx.Client(timeout=min(settings.request_timeout_seconds, 30.0)) as client:
            response = client.get(url)
            if response.status_code >= 400:
                return None
            ctype = (response.headers.get("content-type") or "").lower()
            if "png" not in ctype and not response.content.startswith(b"\x89PNG"):
                return None
            return response.content
    except Exception:  # noqa: BLE001
        return None


@app.get("/")
def index() -> FileResponse:
    return FileResponse(STATIC_INDEX)


@app.get("/health")
def health() -> dict:
    settings = get_settings()
    downstream = probe_downstream(settings)
    planner = probe_planner(settings)
    return {
        "status": "ok",
        "service": settings.service_name,
        "planner_mode": settings.planner_mode,
        "planner_base_url": settings.planner_base_url,
        "planner_model": settings.planner_model,
        "planner": planner.model_dump(),
        "memoryboard_configured": bool(settings.memoryboard_base_url),
        "genblaze_base_url": settings.genblaze_base_url,
        "supported_lanes": ["rt4d", "prompt_to_scene", "render_scene", "engine3d_still"],
        "memory_write_enabled": False,
        "print_sot": "cpu.rt4d.print",
        "atcm_status": "partial",
        "observation_note": (
            "Director dispatches still-image lanes only. Observation/aperture "
            "projection is not a beauty/print path; CPU RT4D remains print SoT."
        ),
        "downstream": downstream.model_dump(),
    }


@app.get("/api/speed-profiles")
def speed_profiles() -> dict:
    return {
        "status": "ok",
        "print_sot": "cpu.rt4d.print",
        "note": (
            "Profiles control Director→Genblaze workload (lane bias, draft quality, "
            "width/height/samples). Unsupported marketing flags (ao/gi/raster_mode) "
            "are listed per profile and are not sent. ATCM is a separate planner "
            "(`speed_profile=atcm`) that suggests fast/beauty from a tile work model."
        ),
        "profiles": {key: value.model_dump() for key, value in PROFILES.items()},
    }


@app.post("/api/warmup")
def warmup() -> dict:
    """Pre-warm Genblaze health + a tiny Engine3D soft-raster still."""
    settings = get_settings()
    downstream = probe_downstream(settings)
    warm: dict = {
        "downstream": downstream.model_dump(),
        "render": None,
        "print_sot": "cpu.rt4d.print",
        "authority": "preview_still",
    }
    if not downstream.reachable or not downstream.engine3d_still.available:
        warm["status"] = "partial"
        warm["detail"] = "Genblaze unreachable or engine3d_still unavailable"
        return warm
    try:
        tiny = DispatchTarget(
            endpoint="/api/engine3d-still",
            payload={
                "width": 128,
                "height": 128,
                "aov_depth": False,
                "aov_normal": False,
                "polish": False,
                "prompt": "warmup empty structure",
            },
        )
        warm["render"] = dispatch_render(settings, tiny)
        warm["status"] = "ok"
    except DispatchError as exc:
        warm["status"] = "partial"
        warm["detail"] = str(exc)
    return warm


@app.post("/api/atcm/plan")
def atcm_plan_endpoint(body: dict) -> dict:
    """Return an ATCM tile plan (estimate-only speedup model)."""
    width = int(body["width"]) if "width" in body else 256
    height = int(body["height"]) if "height" in body else 256
    tile_size = int(body.get("tile_size") or 64)
    threshold = float(body.get("threshold") or 0.35)
    prompt = body.get("prompt")
    scene_spec = body.get("scene_spec")
    try:
        ar_result = request_plan_only(
            width=width,
            height=height,
            prompt=str(prompt) if prompt is not None else None,
            scene_spec=scene_spec if isinstance(scene_spec, dict) else None,
            tile_size=tile_size,
            threshold=threshold,
            include_tiles=bool(body.get("include_tiles", True)),
        )
    except RenderViolationError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.to_violation()) from exc

    return {
        "atcm": ar_result.atcm_report,
        "render_plan": ar_result.render_plan,
        "complexity_evidence": ar_result.complexity_evidence,
        "pipeline": "AcceleratedRenderer",
        "pipelineVersion": "0.1",
        "print_sot": False,
        "contract": "RenderAccelContract",
    }


@app.get("/api/idac/learning/status")
def idac_learning_status() -> dict:
    """Read-only visibility for append-only learning JSONL (partial)."""
    return learning_store_stats()


@app.get("/api/idac/charter/status")
def idac_charter_status() -> dict:
    """IDAC-local charter gate probe (not MRS CKL SoT)."""
    return charter_gate_status()


@app.post("/api/idac/intent")
def idac_intent_endpoint(body: IntentContract) -> dict:
    """Governed IDAC entry — IntentContract in, full router bundle out."""
    settings = get_settings()
    try:
        return idac_handle_intent(body, settings=settings)
    except IdacPlanViolationError as exc:
        raise HTTPException(status_code=422, detail=exc.to_violation()) from exc


@app.post("/api/direct", response_model=DirectResponse)
def api_direct(body: DirectRequest) -> DirectResponse:
    settings = get_settings()
    use_atcm = pipeline_explicitly_enabled(atcm_flag=bool(body.atcm), speed_profile=body.speed_profile)
    if idac_path_requested(body):
        prepass_png = _maybe_fetch_prepass_png(settings, body.source_run_id)
        intent = direct_request_to_intent(body)
        try:
            bundle = idac_handle_intent(
                intent,
                settings=settings,
                prepass_png=prepass_png,
            )
        except IdacPlanViolationError as exc:
            raise HTTPException(status_code=422, detail=exc.to_violation()) from exc
        evidence = bundle.get("evidence") or {}
        if evidence.get("outcome") == "dispatch_error":
            trace = evidence.get("execution_trace") or {}
            raise HTTPException(
                status_code=502,
                detail=trace.get("error") or "IDAC dispatch failed",
            )
        return idac_bundle_to_direct_response(
            bundle,
            original=body,
            use_atcm=use_atcm,
        )

    effective = body
    try:
        hints = read_memoryboard(settings, effective.memory_context)
        plan = build_plan(effective, hints, settings)
        target = build_dispatch_target(plan, effective, settings)
        result = dispatch_render(settings, target)
        speed_meta = attach_profile_meta(plan, effective)
    except RenderViolationError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.to_violation()) from exc
    except MemoryboardReadError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    except PlannerError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except DispatchError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc

    return DirectResponse(
        lane=plan.lane,
        engine=ENGINE_BY_LANE[plan.lane],
        plan=plan,
        context_used={
            "memoryboard": bool(effective.memory_context and effective.memory_context.memoryboard_id),
            "source_run_id": effective.source_run_id,
            "speed_profile": getattr(effective, "speed_profile", None) or "auto",
            "atcm": False,
            "idac": False,
        },
        dispatch=target,
        result=result,
        speed_profile=speed_meta,
    )
