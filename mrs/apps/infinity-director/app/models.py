from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, Field, field_validator, model_validator


Quality = Literal["draft", "final"]
Lane = Literal["rt4d", "prompt_to_scene", "render_scene", "engine3d_still"]
Material = Literal["glass", "metal", "chrome", "stone", "crystal", "emissive"]
Lighting = Literal["soft_caustics", "rim_glow", "volumetric", "ambient_bloom", "high_contrast"]
Shot = Literal["wide", "hero", "close", "symmetric"]
Mood = Literal["majestic", "sacred", "technical", "dreamlike", "severe"]
Archetype = Literal[
    "tesseract_lattice",
    "mandala_star",
    "cathedral_caustic",
    "orbital_temple",
    "glass_chamber",
    "portrait_structure",
]


class MemoryContext(BaseModel):
    memoryboard_id: str | None = Field(default=None, max_length=128)
    session_id: str | None = Field(default=None, max_length=128)


class DirectRequest(BaseModel):
    prompt: str | None = Field(default=None, min_length=1, max_length=2000)
    quality: str | None = Field(default=None, description="draft/final (Genblaze quality)")
    speed_profile: str | None = Field(
        default=None,
        description="fast|beauty|auto|atcm — CPU workload profile (Director-side)",
    )
    atcm: bool = Field(
        default=False,
        description="When true (or speed_profile=atcm), run ATCM tile plan before dispatch",
    )
    idac: bool = Field(
        default=False,
        description="When true, route through IdacRouter (Intent→Plan→Evidence); implied for atcm",
    )
    mode: str = Field(default="auto", max_length=32)
    memory_context: MemoryContext | None = None
    source_run_id: str | None = Field(default=None, max_length=128)
    scene_spec: dict[str, Any] | None = None

    @field_validator("quality", mode="before")
    @classmethod
    def _normalize_quality(cls, value: str | None) -> str | None:
        if value is None:
            return None
        v = str(value).strip().lower()
        if v in {"draft", "fast"}:
            return "draft"
        if v in {"final", "high"}:
            return "final"
        raise ValueError("quality must be draft/fast or final/high")

    @field_validator("speed_profile", mode="before")
    @classmethod
    def _normalize_speed(cls, value: str | None) -> str | None:
        if value is None:
            return None
        v = str(value).strip().lower()
        if v in {"fast", "speed", "hackathon"}:
            return "fast"
        if v in {"beauty", "cinematic", "hq"}:
            return "beauty"
        if v in {"atcm", "adaptive", "tiles"}:
            return "atcm"
        if v in {"auto", ""}:
            return "auto"
        raise ValueError("speed_profile must be fast|beauty|auto|atcm")

    @field_validator("source_run_id")
    @classmethod
    def _strip_run_id(cls, value: str | None) -> str | None:
        if value is None:
            return None
        v = value.strip()
        return v or None

    @model_validator(mode="after")
    def _validate_prompt_or_scene(self) -> "DirectRequest":
        if not self.prompt and self.scene_spec is None:
            raise ValueError("prompt or scene_spec is required")
        return self


class StylePlan(BaseModel):
    material: Material
    palette: list[str] = Field(default_factory=list, min_length=0, max_length=4)
    lighting: Lighting


class CameraPlan(BaseModel):
    shot: Shot
    mood: Mood


class ConstraintPlan(BaseModel):
    deterministic: bool = True
    no_diffusion: bool = True


class NormalizedPlan(BaseModel):
    intent: Literal["render_image"] = "render_image"
    lane: Lane
    archetype: Archetype
    style: StylePlan
    camera: CameraPlan
    quality: Quality
    constraints: ConstraintPlan = Field(default_factory=ConstraintPlan)


class MemoryboardHints(BaseModel):
    themes: list[str] = Field(default_factory=list)
    style_preferences: list[str] = Field(default_factory=list)
    lane_preferences: list[str] = Field(default_factory=list)
    archetype_vocabulary: list[str] = Field(default_factory=list)
    operator_hints: list[str] = Field(default_factory=list)


class DispatchTarget(BaseModel):
    endpoint: str
    payload: dict[str, Any]


class DirectResponse(BaseModel):
    status: Literal["ok"] = "ok"
    lane: Lane
    engine: str
    plan: NormalizedPlan
    context_used: dict[str, Any]
    dispatch: DispatchTarget
    result: dict[str, Any]
    speed_profile: dict[str, Any] | None = None
    atcm: dict[str, Any] | None = None
    render_plan: dict[str, Any] | None = Field(
        default=None,
        description="RenderAccelContract RenderPlan when ATCM explicitly activated",
    )
    complexity_evidence: dict[str, Any] | None = Field(
        default=None,
        description="RenderAccelContract ComplexityEvidence when ATCM explicitly activated",
    )
    replay_record: dict[str, Any] | None = Field(
        default=None,
        description="RenderAccelContract ReplayRecord skeleton after ATCM dispatch",
    )
    idac: dict[str, Any] | None = Field(
        default=None,
        description="IDAC bundle (intent, plan, evidence, validation) when IdacRouter handled the request",
    )


class LaneStatus(BaseModel):
    available: bool
    provider: str
    detail: str | None = None


class DownstreamStatus(BaseModel):
    reachable: bool
    base_url: str
    image_backend: str | None = None
    rt4d: LaneStatus
    prompt_to_scene: LaneStatus
    render_scene: LaneStatus
    engine3d_still: LaneStatus


class PlannerStatus(BaseModel):
    mode: str
    reachable: bool | None = None
    base_url: str | None = None
    model: str | None = None
    detail: str | None = None
