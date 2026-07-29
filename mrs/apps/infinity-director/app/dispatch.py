from __future__ import annotations

from typing import Any

import httpx

from app.config import Settings
from app.models import DirectRequest, DispatchTarget, NormalizedPlan
from app.render_profiles import SpeedProfile, profile_evidence, resolve_speed_profile

ENGINE_BY_LANE = {
    "rt4d": "mrs-renderer-core/rt4d",
    "prompt_to_scene": "mrs-adapters/prompt-scene-bridge",
    "render_scene": "mrs-renderer-core/render-scene",
    "engine3d_still": "mrs-engine3d-core/still",
}


class DispatchError(RuntimeError):
    """Downstream Genblaze dispatch failed."""


def _dims(profile: SpeedProfile, settings: Settings) -> tuple[int, int, int, int]:
    if profile.id == "auto":
        return (
            settings.default_engine3d_width,
            settings.default_engine3d_height,
            settings.default_prompt_to_scene_samples,
            settings.default_prompt_to_scene_max_depth,
        )
    return profile.width, profile.height, profile.samples, profile.max_depth


def build_dispatch_target(
    plan: NormalizedPlan,
    request: DirectRequest,
    settings: Settings,
) -> DispatchTarget:
    profile = resolve_speed_profile(getattr(request, "speed_profile", None))
    width, height, samples, max_depth = _dims(profile, settings)
    quality = plan.quality if profile.id == "auto" else profile.genblaze_quality

    if plan.lane == "rt4d":
        return DispatchTarget(
            endpoint="/api/generate",
            payload={
                "prompt": request.prompt,
                "quality": quality,
                "embed": False,
            },
        )
    if plan.lane == "prompt_to_scene":
        return DispatchTarget(
            endpoint="/api/prompt-to-scene",
            payload={
                "prompt": request.prompt,
                "render": True,
                "quality": quality,
                "width": width if profile.id != "auto" else settings.default_prompt_to_scene_width,
                "height": height if profile.id != "auto" else settings.default_prompt_to_scene_height,
                "samples": samples if profile.id != "auto" else settings.default_prompt_to_scene_samples,
                "max_depth": max_depth if profile.id != "auto" else settings.default_prompt_to_scene_max_depth,
            },
        )
    if plan.lane == "render_scene":
        if request.scene_spec is None:
            raise DispatchError("render_scene requires scene_spec")
        return DispatchTarget(
            endpoint="/api/render-scene",
            payload={"spec": request.scene_spec, "quality": quality},
        )
    payload: dict[str, Any] = {
        "width": width,
        "height": height,
        "aov_depth": profile.aov_depth if profile.id != "auto" else True,
        "aov_normal": profile.aov_normal if profile.id != "auto" else True,
        "polish": profile.polish,
    }
    if request.prompt:
        payload["prompt"] = request.prompt
    if request.source_run_id and profile.reuse_background:
        payload["rt4d_background_run_id"] = request.source_run_id
    return DispatchTarget(endpoint="/api/engine3d-still", payload=payload)


def attach_profile_meta(plan: NormalizedPlan, request: DirectRequest) -> dict[str, Any]:
    profile = resolve_speed_profile(getattr(request, "speed_profile", None))
    return profile_evidence(profile, plan.lane)


def dispatch_render(
    settings: Settings,
    target: DispatchTarget,
    client: httpx.Client | None = None,
) -> dict[str, Any]:
    own_client = client is None
    request_client = client or httpx.Client(timeout=settings.request_timeout_seconds)
    try:
        response = request_client.post(
            f"{settings.genblaze_base_url}{target.endpoint}",
            json=target.payload,
        )
        response.raise_for_status()
        body = response.json()
    except Exception as exc:  # noqa: BLE001
        raise DispatchError(f"dispatch to {target.endpoint} failed: {exc}") from exc
    finally:
        if own_client:
            request_client.close()
    if not isinstance(body, dict):
        raise DispatchError(f"dispatch to {target.endpoint} failed: expected object response")
    return body
