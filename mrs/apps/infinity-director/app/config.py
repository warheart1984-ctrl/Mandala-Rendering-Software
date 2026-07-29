from __future__ import annotations

import os
from functools import lru_cache

from pydantic import BaseModel, Field


class Settings(BaseModel):
    service_name: str = "mrs-infinity-director"
    genblaze_base_url: str = "http://127.0.0.1:8787"
    cors_allow_origins: list[str] = Field(default_factory=lambda: ["*"])
    memoryboard_base_url: str | None = None
    memoryboard_timeout_seconds: float = 10.0
    planner_mode: str = "heuristic"
    planner_url: str | None = None
    planner_base_url: str | None = None
    planner_model: str | None = None
    planner_api_key: str | None = None
    planner_timeout_seconds: float = 90.0
    request_timeout_seconds: float = 180.0
    prompt_max_length: int = 2000
    default_quality: str = "draft"
    default_prompt_to_scene_width: int = 256
    default_prompt_to_scene_height: int = 192
    default_prompt_to_scene_samples: int = 4
    default_prompt_to_scene_max_depth: int = 4
    default_engine3d_width: int = 256
    default_engine3d_height: int = 256


def _as_float(name: str, fallback: float) -> float:
    raw = (os.getenv(name) or "").strip()
    if not raw:
      return fallback
    try:
        return float(raw)
    except ValueError:
        return fallback


def _as_csv(name: str, fallback: list[str]) -> list[str]:
    raw = (os.getenv(name) or "").strip()
    if not raw:
        return fallback
    values = [item.strip() for item in raw.split(",")]
    cleaned = [item for item in values if item]
    return cleaned or fallback


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    return Settings(
        genblaze_base_url=(os.getenv("DIRECTOR_GENBLAZE_BASE_URL") or "http://127.0.0.1:8787").rstrip("/"),
        cors_allow_origins=_as_csv("DIRECTOR_CORS_ALLOW_ORIGINS", ["*"]),
        memoryboard_base_url=((os.getenv("DIRECTOR_MEMORYBOARD_BASE_URL") or "").strip() or None),
        memoryboard_timeout_seconds=_as_float("DIRECTOR_MEMORYBOARD_TIMEOUT_SECONDS", 10.0),
        planner_mode=((os.getenv("DIRECTOR_PLANNER_MODE") or "heuristic").strip().lower() or "heuristic"),
        planner_url=((os.getenv("DIRECTOR_PLANNER_URL") or "").strip() or None),
        planner_base_url=((os.getenv("DIRECTOR_PLANNER_BASE_URL") or "").strip().rstrip("/") or None),
        planner_model=((os.getenv("DIRECTOR_PLANNER_MODEL") or "").strip() or None),
        planner_api_key=((os.getenv("DIRECTOR_PLANNER_API_KEY") or os.getenv("LEMONADE_API_KEY") or "").strip() or None),
        planner_timeout_seconds=_as_float("DIRECTOR_PLANNER_TIMEOUT_SECONDS", 90.0),
        request_timeout_seconds=_as_float("DIRECTOR_REQUEST_TIMEOUT_SECONDS", 180.0),
        default_quality=((os.getenv("DIRECTOR_DEFAULT_QUALITY") or "draft").strip().lower() or "draft"),
        default_prompt_to_scene_width=int((os.getenv("DIRECTOR_PROMPT_TO_SCENE_WIDTH") or "256").strip() or "256"),
        default_prompt_to_scene_height=int((os.getenv("DIRECTOR_PROMPT_TO_SCENE_HEIGHT") or "192").strip() or "192"),
        default_prompt_to_scene_samples=int((os.getenv("DIRECTOR_PROMPT_TO_SCENE_SAMPLES") or "4").strip() or "4"),
        default_prompt_to_scene_max_depth=int((os.getenv("DIRECTOR_PROMPT_TO_SCENE_MAX_DEPTH") or "4").strip() or "4"),
        default_engine3d_width=int((os.getenv("DIRECTOR_ENGINE3D_WIDTH") or "256").strip() or "256"),
        default_engine3d_height=int((os.getenv("DIRECTOR_ENGINE3D_HEIGHT") or "256").strip() or "256"),
    )
