"""CPU render speed profiles for Infinity Director → Genblaze.

Status: **partial** — profiles map to real Genblaze payload fields only.
Fake flags (ao_enabled / gi_enabled / GENBLAZE_RASTER_MODE) are **not**
wired because Genblaze does not expose them on still lanes.

Honest facts:
- Engine3D stills are already soft-raster (fastest CPU lane).
- RT4D `/api/generate` uses quality=draft|final; draft caps ~256² / 4 spp.
- path_trace on Engine3D is 501 (not wired) — never send it.
- Print SoT remains cpu.rt4d.print; these profiles are preview/still assist.
"""

from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, Field

SpeedProfileId = Literal["fast", "beauty", "auto"]


class SpeedProfile(BaseModel):
    id: SpeedProfileId
    label: str
    preferred_lane: str | None = None
    genblaze_quality: Literal["draft", "final"] = "draft"
    width: int = 256
    height: int = 256
    samples: int = 2
    max_depth: int = 3
    aov_depth: bool = True
    aov_normal: bool = True
    polish: bool = False
    force_lane_when_auto: bool = False
    skip_llm: bool = True
    reuse_background: bool = True
    note: str = ""
    # Explicit non-claims (Drive-G-1)
    unsupported_flags: list[str] = Field(
        default_factory=lambda: [
            "ao_enabled",
            "gi_enabled",
            "postfx_enabled",
            "GENBLAZE_RASTER_MODE",
            "color_grade",
        ]
    )


FAST_PROFILE = SpeedProfile(
    id="fast",
    label="Fast Mode",
    preferred_lane="engine3d_still",
    genblaze_quality="draft",
    width=256,
    height=256,
    samples=1,
    max_depth=2,
    aov_depth=False,
    aov_normal=False,
    polish=False,
    force_lane_when_auto=True,
    skip_llm=True,
    reuse_background=True,
    note=(
        "CPU hackathon lane: Engine3D soft-raster @ 256², samples=1, draft quality. "
        "Skips LLM when lane forced. Not print SoT."
    ),
)

BEAUTY_PROFILE = SpeedProfile(
    id="beauty",
    label="Beauty Mode (CPU)",
    preferred_lane="engine3d_still",
    genblaze_quality="draft",
    width=512,
    height=512,
    samples=2,
    max_depth=3,
    aov_depth=True,
    aov_normal=True,
    polish=False,
    force_lane_when_auto=True,
    skip_llm=True,
    reuse_background=True,
    note=(
        "CPU 'beauty-ish': larger Engine3D soft-raster + AOVs. Still no path-trace, "
        "no GI flag, no diffusion polish unless operator enables Genblaze polish separately. "
        "Not Digital Printer beauty SoT."
    ),
)

AUTO_PROFILE = SpeedProfile(
    id="auto",
    label="Auto",
    preferred_lane=None,
    genblaze_quality="draft",
    width=256,
    height=256,
    samples=2,
    max_depth=3,
    force_lane_when_auto=False,
    skip_llm=False,
    note="Planner/heuristic picks lane; still defaults to draft Genblaze quality.",
)

PROFILES: dict[str, SpeedProfile] = {
    "fast": FAST_PROFILE,
    "beauty": BEAUTY_PROFILE,
    "auto": AUTO_PROFILE,
}


def resolve_speed_profile(value: str | None) -> SpeedProfile:
    key = (value or "auto").strip().lower()
    if key in {"fast", "speed", "hackathon"}:
        return FAST_PROFILE
    if key in {"beauty", "cinematic", "hq"}:
        return BEAUTY_PROFILE
    if key in {"atcm", "adaptive", "tiles"}:
        # ATCM resolves to a concrete profile in api_direct after planning.
        return FAST_PROFILE
    return AUTO_PROFILE


def auto_quality_for_lane(lane: str) -> SpeedProfileId:
    """Lane-aware suggestion (declared heuristic, not enforced policy)."""
    if lane in {"engine3d_still"}:
        return "beauty"
    if lane in {"rt4d", "prompt_to_scene", "render_scene"}:
        return "fast"
    return "fast"


def profile_evidence(profile: SpeedProfile, lane: str) -> dict[str, Any]:
    return {
        "id": profile.id,
        "label": profile.label,
        "lane": lane,
        "genblaze_quality": profile.genblaze_quality,
        "width": profile.width,
        "height": profile.height,
        "samples": profile.samples,
        "max_depth": profile.max_depth,
        "polish": profile.polish,
        "print_sot": False,
        "authority": "preview_still",
        "note": profile.note,
        "unsupported_flags": list(profile.unsupported_flags),
    }
