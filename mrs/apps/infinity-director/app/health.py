from __future__ import annotations

import httpx

from app.config import Settings
from app.models import DownstreamStatus, LaneStatus, PlannerStatus


def probe_planner(settings: Settings, client: httpx.Client | None = None) -> PlannerStatus:
    """Cheap planner reachability probe (Ollama tags / OpenAI models / heuristic)."""
    mode = (settings.planner_mode or "heuristic").strip().lower()
    if mode == "heuristic":
        return PlannerStatus(mode=mode, reachable=True, detail="local heuristic planner")
    if mode == "http":
        return PlannerStatus(
            mode=mode,
            reachable=bool(settings.planner_url),
            base_url=settings.planner_url,
            detail=None if settings.planner_url else "DIRECTOR_PLANNER_URL unset",
        )
    if not settings.planner_base_url:
        return PlannerStatus(mode=mode, reachable=False, detail="DIRECTOR_PLANNER_BASE_URL unset")
    own_client = client is None
    request_client = client or httpx.Client(timeout=min(settings.planner_timeout_seconds, 10.0))
    try:
        if mode == "ollama":
            response = request_client.get(f"{settings.planner_base_url.rstrip('/')}/api/tags")
            response.raise_for_status()
            body = response.json()
            names = [
                str((m or {}).get("name") or "")
                for m in list((body or {}).get("models") or [])
                if isinstance(m, dict)
            ]
            model = settings.planner_model or ""
            present = (not model) or any(model == n or n.startswith(f"{model}:") or n.startswith(model) for n in names)
            return PlannerStatus(
                mode=mode,
                reachable=True,
                base_url=settings.planner_base_url,
                model=settings.planner_model,
                detail=None if present else f"model not listed in /api/tags: {model}",
            )
        # openai-compatible
        response = request_client.get(f"{settings.planner_base_url.rstrip('/')}/models")
        response.raise_for_status()
        return PlannerStatus(
            mode=mode,
            reachable=True,
            base_url=settings.planner_base_url,
            model=settings.planner_model,
            detail="openai-compatible /models reachable",
        )
    except Exception as exc:  # noqa: BLE001
        return PlannerStatus(
            mode=mode,
            reachable=False,
            base_url=settings.planner_base_url,
            model=settings.planner_model,
            detail=str(exc),
        )
    finally:
        if own_client:
            request_client.close()


def probe_downstream(settings: Settings, client: httpx.Client | None = None) -> DownstreamStatus:
    own_client = client is None
    request_client = client or httpx.Client(timeout=min(settings.request_timeout_seconds, 20.0))
    try:
        response = request_client.get(f"{settings.genblaze_base_url}/health")
        response.raise_for_status()
        body = response.json()
    except Exception as exc:  # noqa: BLE001
        return DownstreamStatus(
            reachable=False,
            base_url=settings.genblaze_base_url,
            image_backend=None,
            rt4d=LaneStatus(available=False, provider="rt4d-render", detail=str(exc)),
            prompt_to_scene=LaneStatus(available=False, provider="prompt-scene-bridge", detail=str(exc)),
            render_scene=LaneStatus(available=False, provider="render-scene", detail=str(exc)),
            engine3d_still=LaneStatus(available=False, provider="engine3d-still", detail=str(exc)),
        )
    finally:
        if own_client:
            request_client.close()
    return DownstreamStatus(
        reachable=True,
        base_url=settings.genblaze_base_url,
        image_backend=body.get("image_backend") if isinstance(body, dict) else None,
        rt4d=LaneStatus(
            available=bool(((body.get("rt4d") or {}) if isinstance(body, dict) else {}).get("available")),
            provider="rt4d-render",
            detail=(body.get("rt4d_note") if isinstance(body, dict) else None),
        ),
        prompt_to_scene=LaneStatus(
            available=bool(((body.get("prompt_scene") or {}) if isinstance(body, dict) else {}).get("available")),
            provider="prompt-scene-bridge",
            detail=(body.get("prompt_scene_note") if isinstance(body, dict) else None),
        ),
        render_scene=LaneStatus(
            available=bool(((body.get("scene_spec") or {}) if isinstance(body, dict) else {}).get("available")),
            provider="render-scene",
            detail=(body.get("scene_spec_note") if isinstance(body, dict) else None),
        ),
        engine3d_still=LaneStatus(
            available=bool(((body.get("engine3d_still") or {}) if isinstance(body, dict) else {}).get("available")),
            provider="engine3d-still",
            detail=(body.get("engine3d_still_note") if isinstance(body, dict) else None),
        ),
    )
