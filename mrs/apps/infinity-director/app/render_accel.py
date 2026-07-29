"""Sovereign X RenderAccelContract artifact builders (Director scope).

Status: **partial** — shapes responses; CKL does not enforce these gates yet.
"""

from __future__ import annotations

import hashlib
import json
import uuid
from datetime import datetime, timezone
from typing import Any

CONTRACT_VERSION = "0.1.0"
ACCELERATOR_NAME = "ATCM"
ATCM_SPEED_ALIASES = frozenset({"atcm", "adaptive", "tiles"})


def atcm_explicitly_requested(*, atcm_flag: bool, speed_profile: str | None) -> bool:
    """Article III — no self-activation without explicit client flag."""
    if atcm_flag:
        return True
    return str(speed_profile or "").strip().lower() in ATCM_SPEED_ALIASES


class RenderViolationError(Exception):
    """Article VI — accelerated path failed; no silent non-constitutional fallback."""

    def __init__(
        self,
        *,
        code: str,
        message: str,
        article: str = "VI",
        status_code: int = 422,
        details: dict[str, Any] | None = None,
    ) -> None:
        super().__init__(message)
        self.code = code
        self.message = message
        self.article = article
        self.status_code = status_code
        self.details = details or {}

    def to_violation(self) -> dict[str, Any]:
        return build_render_violation(
            code=self.code,
            message=self.message,
            article=self.article,
            details=self.details,
        )


def _utc_now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def scene_graph_hash_proxy(*, prompt: str | None, scene_spec: dict[str, Any] | None) -> str:
    """Proxy SceneGraph fingerprint (prompt + scene_spec). Not a full scene graph hash."""
    payload = {"prompt": prompt or "", "scene_spec": scene_spec or {}}
    raw = json.dumps(payload, sort_keys=True, separators=(",", ":")).encode("utf-8")
    return hashlib.sha256(raw).hexdigest()


def validate_atcm_prerequisites(
    *,
    width: int,
    height: int,
    prompt: str | None,
    scene_spec: dict[str, Any] | None,
) -> None:
    if width < 1 or height < 1:
        raise RenderViolationError(
            code="atcm.invalid_frame",
            message="ATCM requires positive frame width and height",
            details={"width": width, "height": height},
        )
    if not prompt and scene_spec is None:
        raise RenderViolationError(
            code="atcm.missing_intent",
            message="ATCM requires prompt or scene_spec (render intent)",
        )


def build_render_violation(
    *,
    code: str,
    message: str,
    article: str = "VI",
    details: dict[str, Any] | None = None,
) -> dict[str, Any]:
    return {
        "kind": "RenderViolation",
        "contractVersion": CONTRACT_VERSION,
        "contract": "RenderAccelContract",
        "id": f"rviol-{uuid.uuid4()}",
        "createdAt": _utc_now(),
        "article": article,
        "code": code,
        "message": message,
        "no_non_constitutional_fallback": True,
        "enforcement": "partial",
        "details": details or {},
    }


def derive_math_strategies(*, atcm_report: dict[str, Any]) -> dict[str, Any]:
    """Declared acceleration metadata from ATCM complexity — not sent to Genblaze per-tile."""
    mean_c = float(atcm_report.get("mean_complexity") or 0.5)
    work = atcm_report.get("work_model") or {}
    simple_frac = float(work.get("simple_fraction") or 0.0)
    suggested_spp = max(1, min(16, int(round(1 + mean_c * 8))))
    cheap_dominant = simple_frac >= 0.5
    return {
        "binding": "from_atcm_complexity",
        "execution": "metadata_only",
        "status": "declared",
        "mean_complexity_C": round(mean_c, 4),
        "adaptive_samples": {
            "strategy": "C_i_inverse",
            "suggested_global_spp": suggested_spp,
            "per_tile_note": (
                "Per-tile spp may scale with tile.complexity; Genblaze still APIs "
                "do not accept per-tile sample counts today."
            ),
        },
        "visibility_strategy": {
            "strategy": "director_tile_grid_only",
            "director_today": "tile_grid_and_C_i_only",
            "evidence": "mrs/packages/renderer-core/src/render/rt4d/accel/BVH4D.js",
            "future": "hierarchical_tiled_z_coarse_depth_with_bvh_reuse",
        },
        "brdf_strategy": {
            "strategy": "piecewise_cheap_tiles" if cheap_dominant else "full_brdf_tiles",
            "cheap_tile_mode": "cheap",
            "director_today": "classification_in_render_plan_tiles_only",
        },
        "upscale_strategy": {
            "strategy": "low_res_edge_aware_upscale" if mean_c < 0.35 else "none_full_res",
            "director_today": "not_dispatched_post_fx_or_upscale",
        },
    }


def build_render_plan(*, atcm_report: dict[str, Any], render_plan_id: str | None = None) -> dict[str, Any]:
    frame = atcm_report.get("frame") or {}
    work = atcm_report.get("work_model") or {}
    tiles = atcm_report.get("tiles") or []
    if not tiles:
        raise RenderViolationError(
            code="atcm.empty_tile_plan",
            message="ATCM produced no tile decisions; cannot emit RenderPlan",
        )
    plan_id = render_plan_id or f"rplan-{uuid.uuid4()}"
    from app.idac.domains.rendering.tile_evidence import build_staged_tile_execution_evidence

    return {
        "kind": "RenderPlan",
        "contractVersion": CONTRACT_VERSION,
        "contract": "RenderAccelContract",
        "id": plan_id,
        "createdAt": _utc_now(),
        "accelerator": ACCELERATOR_NAME,
        "routerAuthority": "infinity-director",
        "activation": "explicit",
        "print_sot": False,
        "enforcement": "partial",
        "execution_mode": "full_frame_with_tile_evidence",
        "execution_note": (
            "When execution_mode is full_frame_with_tile_evidence and lane is "
            "engine3d_still, RenderExecutor dispatches POST /api/engine3d-tile-still "
            "per ATCM tile (crop_region) and merges FinalFrame."
        ),
        "tile_execution_evidence": build_staged_tile_execution_evidence(tiles=tiles, frame=frame),
        "frame": frame,
        "suggested_speed_profile": atcm_report.get("suggested_speed_profile"),
        "workers": atcm_report.get("workers"),
        "mean_complexity": atcm_report.get("mean_complexity"),
        "tile_count": len(tiles),
        "tiles": tiles,
        "work_model": work,
        "algorithm": atcm_report.get("algorithm"),
        "authority": atcm_report.get("authority"),
        "status": atcm_report.get("status", "partial"),
        "math_strategies": derive_math_strategies(atcm_report=atcm_report),
    }


def build_complexity_evidence(
    *,
    atcm_report: dict[str, Any],
    render_plan_id: str,
    prompt: str | None,
    scene_spec: dict[str, Any] | None,
) -> dict[str, Any]:
    prepass = atcm_report.get("prepass") or {}
    work = atcm_report.get("work_model") or {}
    return {
        "kind": "ComplexityEvidence",
        "contractVersion": CONTRACT_VERSION,
        "contract": "RenderAccelContract",
        "id": f"cevid-{uuid.uuid4()}",
        "createdAt": _utc_now(),
        "renderPlanId": render_plan_id,
        "accelerator": ACCELERATOR_NAME,
        "sceneGraphHash": scene_graph_hash_proxy(prompt=prompt, scene_spec=scene_spec),
        "sceneGraphHash_note": "proxy_from_prompt_and_scene_spec",
        "prepass": prepass,
        "mean_complexity": atcm_report.get("mean_complexity"),
        "work_model": work,
        "enforcement": "partial",
        "status": "partial",
    }


def build_replay_record_skeleton(
    *,
    render_plan_id: str,
    complexity_evidence_id: str,
    lane: str,
    engine: str,
    dispatch_endpoint: str,
    result: dict[str, Any] | None,
) -> dict[str, Any]:
    run_id = None
    if result:
        for key in ("structure", "render", "image"):
            block = result.get(key)
            if isinstance(block, dict) and block.get("run_id"):
                run_id = block.get("run_id")
                break
        if run_id is None and result.get("run_id"):
            run_id = result.get("run_id")
    return {
        "kind": "ReplayRecord",
        "contractVersion": CONTRACT_VERSION,
        "contract": "RenderAccelContract",
        "id": f"replay-{uuid.uuid4()}",
        "createdAt": _utc_now(),
        "renderPlanId": render_plan_id,
        "complexityEvidenceId": complexity_evidence_id,
        "verdict": "unverified",
        "replayClass": "declared",
        "enforcement": "declared",
        "status": "skeleton",
        "tile_timings": None,
        "tile_timings_note": "not_collected — full-frame dispatch; per-tile replay declared future",
        "dispatch": {
            "lane": lane,
            "engine": engine,
            "endpoint": dispatch_endpoint,
            "run_id": run_id,
        },
        "determinism": {
            "claimed": False,
            "note": "Director preview path; bit-identical replay not measured here",
        },
    }


def build_atcm_contract_bundle(
    *,
    atcm_report: dict[str, Any],
    prompt: str | None,
    scene_spec: dict[str, Any] | None,
) -> tuple[dict[str, Any], dict[str, Any]]:
    render_plan = build_render_plan(atcm_report=atcm_report)
    complexity = build_complexity_evidence(
        atcm_report=atcm_report,
        render_plan_id=str(render_plan["id"]),
        prompt=prompt,
        scene_spec=scene_spec,
    )
    return render_plan, complexity
