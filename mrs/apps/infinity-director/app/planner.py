from __future__ import annotations

from typing import Any

import httpx

from app.config import Settings
from app.models import (
    CameraPlan,
    DirectRequest,
    MemoryboardHints,
    NormalizedPlan,
    StylePlan,
)

ARCHETYPES = {
    "rt4d": "tesseract_lattice",
    "prompt_to_scene": "cathedral_caustic",
    "render_scene": "cathedral_caustic",
    "engine3d_still": "portrait_structure",
}

MATERIAL_KEYWORDS = {
    "glass": "glass",
    "crystal": "crystal",
    "chrome": "chrome",
    "metal": "metal",
    "stone": "stone",
    "emissive": "emissive",
}

LIGHTING_KEYWORDS = {
    "caustic": "soft_caustics",
    "rim": "rim_glow",
    "volumetric": "volumetric",
    "bloom": "ambient_bloom",
    "contrast": "high_contrast",
}

SHOT_KEYWORDS = {
    "wide": "wide",
    "hero": "hero",
    "close": "close",
    "symmetric": "symmetric",
}

MOOD_KEYWORDS = {
    "majestic": "majestic",
    "sacred": "sacred",
    "technical": "technical",
    "dream": "dreamlike",
    "severe": "severe",
}

PALETTE_KEYWORDS = ("gold", "blue", "silver", "black", "white", "red", "green", "cyan")

LANE_HINTS = {
    "rt4d": ("tesseract", "lattice", "mandala", "caustic", "procedural", "deterministic", "4d"),
    "engine3d_still": ("portrait", "mesh", "rig", "structure", "face"),
    "prompt_to_scene": ("scene", "cathedral", "temple", "chamber", "environment"),
}


class PlannerError(RuntimeError):
    """Planner backend failed or returned invalid data."""


SYSTEM_PROMPT = """You are a constrained render director for Mandala Rendering System.
Return JSON only with keys: lane, archetype, style, camera, quality.
Allowed lanes: rt4d, prompt_to_scene, render_scene, engine3d_still.
Allowed archetypes: tesseract_lattice, mandala_star, cathedral_caustic, orbital_temple, glass_chamber, portrait_structure.
Allowed style.material: glass, metal, chrome, stone, crystal, emissive.
Allowed style.lighting: soft_caustics, rim_glow, volumetric, ambient_bloom, high_contrast.
Allowed camera.shot: wide, hero, close, symmetric.
Allowed camera.mood: majestic, sacred, technical, dreamlike, severe.
Never emit any prose. Never emit unsupported values.
Prefer prompt_to_scene for general natural-language environments, rt4d for procedural 4D lattices/mandalas/caustics, engine3d_still for portrait/rig/mesh structure.
"""


_FORCED_LANES = frozenset({"rt4d", "prompt_to_scene", "render_scene", "engine3d_still"})


def classify_lane(request: DirectRequest, hints: MemoryboardHints) -> str:
    if request.scene_spec is not None:
        return "render_scene"
    forced = str(getattr(request, "mode", None) or "auto").strip().lower()
    if forced in _FORCED_LANES:
        if forced == "render_scene" and request.scene_spec is None:
            raise PlannerError("mode=render_scene requires scene_spec")
        return forced

    # CPU speed profiles prefer Engine3D soft-raster when operator leaves mode=auto.
    speed = str(getattr(request, "speed_profile", None) or "auto").strip().lower()
    if speed in {"fast", "beauty", "atcm"} or bool(getattr(request, "atcm", False)):
        text_probe = (request.prompt or "").lower()
        # Explicit 4D cues still win so RT4D demos keep working.
        if any(word in text_probe for word in LANE_HINTS["rt4d"]):
            return "rt4d"
        return "engine3d_still"

    text = " ".join(
        filter(
            None,
            [
                request.prompt or "",
                " ".join(hints.themes),
                " ".join(hints.style_preferences),
                " ".join(hints.operator_hints),
                " ".join(hints.lane_preferences),
            ],
        )
    ).lower()
    if any(word in text for word in LANE_HINTS["engine3d_still"]):
        return "engine3d_still"
    if any(word in text for word in LANE_HINTS["rt4d"]):
        return "rt4d"
    preferred = [item.lower() for item in hints.lane_preferences]
    if "engine3d_still" in preferred:
        return "engine3d_still"
    if "rt4d" in preferred:
        return "rt4d"
    return "prompt_to_scene"


def _pick_value(text: str, keywords: dict[str, str], fallback: str) -> str:
    for key, value in keywords.items():
        if key in text:
            return value
    return fallback


def _pick_palette(text: str) -> list[str]:
    found: list[str] = []
    for item in PALETTE_KEYWORDS:
        if item in text and item not in found:
            found.append(item)
    return found[:4]


def heuristic_plan(request: DirectRequest, hints: MemoryboardHints, settings: Settings) -> NormalizedPlan:
    from app.render_profiles import resolve_speed_profile

    lane = classify_lane(request, hints)
    profile = resolve_speed_profile(getattr(request, "speed_profile", None))
    speed = str(getattr(request, "speed_profile", None) or "auto").strip().lower()
    text = " ".join(
        filter(
            None,
            [
                request.prompt or "",
                " ".join(hints.themes),
                " ".join(hints.style_preferences),
                " ".join(hints.operator_hints),
                " ".join(hints.archetype_vocabulary),
            ],
        )
    ).lower()
    material = _pick_value(text, MATERIAL_KEYWORDS, "glass" if lane != "engine3d_still" else "metal")
    lighting = _pick_value(text, LIGHTING_KEYWORDS, "soft_caustics" if lane != "engine3d_still" else "rim_glow")
    shot = _pick_value(text, SHOT_KEYWORDS, "wide" if lane != "engine3d_still" else "hero")
    mood = _pick_value(text, MOOD_KEYWORDS, "majestic" if lane != "engine3d_still" else "technical")
    # Speed profiles always pin Genblaze draft quality (final is slower on CPU).
    quality = (
        profile.genblaze_quality
        if profile.id in {"fast", "beauty"} or speed in {"fast", "beauty", "atcm"} or bool(getattr(request, "atcm", False))
        else (request.quality or settings.default_quality)
    )
    return NormalizedPlan(
        lane=lane,
        archetype=ARCHETYPES[lane],
        style=StylePlan(material=material, palette=_pick_palette(text), lighting=lighting),
        camera=CameraPlan(shot=shot, mood=mood),
        quality=quality,
    )


def external_plan(
    request: DirectRequest,
    hints: MemoryboardHints,
    settings: Settings,
    client: httpx.Client | None = None,
) -> NormalizedPlan:
    if not settings.planner_url:
        raise PlannerError("planner mode is http but DIRECTOR_PLANNER_URL is not configured")
    own_client = client is None
    request_client = client or httpx.Client(timeout=settings.planner_timeout_seconds)
    payload = {
        "prompt": request.prompt,
        "quality": request.quality or settings.default_quality,
        "memoryboard_hints": hints.model_dump(),
        "scene_spec": request.scene_spec,
        "source_run_id": request.source_run_id,
    }
    try:
        response = request_client.post(settings.planner_url, json=payload)
        response.raise_for_status()
        body = response.json()
    except Exception as exc:  # noqa: BLE001
        raise PlannerError(f"planner backend failed: {exc}") from exc
    finally:
        if own_client:
            request_client.close()
    try:
        return NormalizedPlan.model_validate(body)
    except Exception as exc:  # noqa: BLE001
        raise PlannerError(f"planner backend returned invalid plan: {exc}") from exc


def _llm_payload(request: DirectRequest, hints: MemoryboardHints, settings: Settings) -> dict[str, Any]:
    return {
        "prompt": request.prompt,
        "quality": request.quality or settings.default_quality,
        "source_run_id": request.source_run_id,
        "scene_spec_present": request.scene_spec is not None,
        "memoryboard_hints": hints.model_dump(),
        "defaults": {
            "preferred_lane": classify_lane(request, hints),
            "quality": request.quality or settings.default_quality,
        },
    }


def _coerce_plan(body: Any, fallback_lane: str, fallback_quality: str) -> NormalizedPlan:
    if isinstance(body, dict) and "plan" in body and isinstance(body["plan"], dict):
        body = body["plan"]
    if not isinstance(body, dict):
        raise PlannerError("planner backend returned non-object JSON")
    body.setdefault("lane", fallback_lane)
    body.setdefault("archetype", ARCHETYPES.get(body["lane"], ARCHETYPES[fallback_lane]))
    body.setdefault("quality", fallback_quality)
    body.setdefault("style", {"material": "glass", "palette": [], "lighting": "soft_caustics"})
    body.setdefault("camera", {"shot": "wide", "mood": "majestic"})
    return NormalizedPlan.model_validate(body)


def openai_plan(
    request: DirectRequest,
    hints: MemoryboardHints,
    settings: Settings,
    client: httpx.Client | None = None,
) -> NormalizedPlan:
    if not settings.planner_base_url or not settings.planner_model:
        raise PlannerError("planner mode openai requires DIRECTOR_PLANNER_BASE_URL and DIRECTOR_PLANNER_MODEL")
    own_client = client is None
    request_client = client or httpx.Client(timeout=settings.planner_timeout_seconds)
    headers = {"Content-Type": "application/json"}
    if settings.planner_api_key:
        headers["Authorization"] = f"Bearer {settings.planner_api_key}"
    payload = {
        "model": settings.planner_model,
        "temperature": 0,
        "response_format": {"type": "json_object"},
        "messages": [
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": str(_llm_payload(request, hints, settings))},
        ],
    }
    try:
        response = request_client.post(
            f"{settings.planner_base_url}/chat/completions",
            headers=headers,
            json=payload,
        )
        response.raise_for_status()
        body = response.json()
        content = body["choices"][0]["message"]["content"]
    except Exception as exc:  # noqa: BLE001
        raise PlannerError(f"openai-compatible planner failed: {exc}") from exc
    finally:
        if own_client:
            request_client.close()
    try:
        parsed = httpx.Response(200, content=content.encode("utf-8")).json()
    except Exception as exc:  # noqa: BLE001
        raise PlannerError(f"openai-compatible planner returned non-JSON content: {exc}") from exc
    return _coerce_plan(parsed, classify_lane(request, hints), request.quality or settings.default_quality)


def ollama_plan(
    request: DirectRequest,
    hints: MemoryboardHints,
    settings: Settings,
    client: httpx.Client | None = None,
) -> NormalizedPlan:
    if not settings.planner_base_url or not settings.planner_model:
        raise PlannerError("planner mode ollama requires DIRECTOR_PLANNER_BASE_URL and DIRECTOR_PLANNER_MODEL")
    own_client = client is None
    request_client = client or httpx.Client(timeout=settings.planner_timeout_seconds)
    payload = {
        "model": settings.planner_model,
        "stream": False,
        "format": "json",
        "messages": [
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": str(_llm_payload(request, hints, settings))},
        ],
        "options": {"temperature": 0},
    }
    try:
        response = request_client.post(
            f"{settings.planner_base_url}/api/chat",
            json=payload,
        )
        response.raise_for_status()
        body = response.json()
        content = ((body.get("message") or {}).get("content") or "").strip()
    except Exception as exc:  # noqa: BLE001
        raise PlannerError(f"ollama planner failed: {exc}") from exc
    finally:
        if own_client:
            request_client.close()
    try:
        parsed = httpx.Response(200, content=content.encode("utf-8")).json()
    except Exception as exc:  # noqa: BLE001
        raise PlannerError(f"ollama planner returned non-JSON content: {exc}") from exc
    return _coerce_plan(parsed, classify_lane(request, hints), request.quality or settings.default_quality)


def build_plan(request: DirectRequest, hints: MemoryboardHints, settings: Settings) -> NormalizedPlan:
    forced = str(getattr(request, "mode", None) or "auto").strip().lower()
    speed = str(getattr(request, "speed_profile", None) or "auto").strip().lower()
    # Forced operator lane OR CPU speed profiles skip remote/local LLM planners.
    if forced in _FORCED_LANES or speed in {"fast", "beauty", "atcm"} or bool(getattr(request, "atcm", False)):
        return heuristic_plan(request, hints, settings)
    if settings.planner_mode == "http":
        return external_plan(request, hints, settings)
    if settings.planner_mode == "openai":
        return openai_plan(request, hints, settings)
    if settings.planner_mode == "ollama":
        return ollama_plan(request, hints, settings)
    return heuristic_plan(request, hints, settings)
