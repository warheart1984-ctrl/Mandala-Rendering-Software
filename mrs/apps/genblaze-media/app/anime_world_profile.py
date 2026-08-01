"""AnimeWorldProfile load + field validation (v1.0 contract — partial).

Drive-G-1 honesty:
  - Validates JSON shape against the v1.0 required-field contract.
  - Does **not** call CKL, Amendment VIII, or Engine3D ink-cel gates.
  - Shot-level enforcement against a live profile is **declared**.
  - Extends the Genblaze anime look lane; does not invent a third style system.
"""

from __future__ import annotations

import json
import re
from pathlib import Path
from typing import Any

from app.config import resolve_repo_root

SCHEMA_VERSION = "1.0.0"
# Mirror style_steer.STYLE_ANIME — avoid circular import with style_steer health wire.
PREFERRED_STYLE_ID = "anime"
PROFILE_STATUS_SKELETON = "skeleton"
PROFILE_STATUS_PARTIAL = "partial"
VALIDATION_STATUS = "partial"
ENFORCEMENT_STATUS = "declared"

_HEX_COLOR = re.compile(r"^#([0-9A-Fa-f]{6}|[0-9A-Fa-f]{3})$")

REQUIRED_TOP_LEVEL = (
    "profileId",
    "schemaVersion",
    "status",
    "color_palette",
    "shadow_steps",
    "outline_rules",
    "material_classes",
    "facial_proportion_profile",
    "motion_timing",
    "background_detail_budget",
    "lighting_constraints",
    "continuity_invariants",
    "provenance_requirements",
)

# Repo-relative default example (resolved from this package → workspace schemas/).
_DEFAULT_EXAMPLE_REL = Path("schemas") / "anime" / "examples" / "mandala-cel-v1.example.json"


def _repo_root() -> Path:
    # Monorepo: mrs/apps/genblaze-media → repo root; Docker: /app (shallow).
    return resolve_repo_root()


def default_example_path() -> Path:
    return _repo_root() / _DEFAULT_EXAMPLE_REL


def load_anime_world_profile(path: str | Path) -> dict[str, Any]:
    """Load a profile JSON file."""
    p = Path(path)
    with p.open(encoding="utf-8") as fh:
        data = json.load(fh)
    if not isinstance(data, dict):
        raise ValueError("AnimeWorldProfile must be a JSON object")
    return data


def validate_anime_world_profile(profile: dict[str, Any]) -> list[str]:
    """Return a list of issue strings (empty = structural OK).

    Hand validation only — no jsonschema dependency. Does not enforce
    aesthetic correctness or CKL policy.
    """
    issues: list[str] = []
    if not isinstance(profile, dict):
        return ["profile-not-object"]

    for key in REQUIRED_TOP_LEVEL:
        if key not in profile:
            issues.append(f"missing:{key}")

    if profile.get("schemaVersion") not in (None, SCHEMA_VERSION):
        issues.append(f"schemaVersion-unsupported:{profile.get('schemaVersion')}")

    status = profile.get("status")
    if status is not None and status not in (
        "declared",
        "skeleton",
        "partial",
        "enforced",
    ):
        issues.append(f"status-invalid:{status}")

    palette = profile.get("color_palette")
    if isinstance(palette, dict):
        if "roles" not in palette or "maxDistinctHues" not in palette:
            issues.append("color_palette-incomplete")
        else:
            roles = palette.get("roles")
            if not isinstance(roles, dict) or len(roles) < 1:
                issues.append("color_palette-roles-empty")
            elif isinstance(roles, dict):
                for name, hex_color in roles.items():
                    if not isinstance(hex_color, str) or not _HEX_COLOR.match(hex_color):
                        issues.append(f"color_palette-role-bad-hex:{name}")
            hues = palette.get("maxDistinctHues")
            if not isinstance(hues, int) or hues < 2 or hues > 64:
                issues.append("color_palette-maxDistinctHues-range")
    elif "color_palette" in profile:
        issues.append("color_palette-not-object")

    shadows = profile.get("shadow_steps")
    if isinstance(shadows, dict):
        for k in ("bandCount", "boundaries", "levels"):
            if k not in shadows:
                issues.append(f"shadow_steps-missing:{k}")
        levels = shadows.get("levels")
        boundaries = shadows.get("boundaries")
        if isinstance(levels, list) and isinstance(boundaries, list):
            if len(levels) < 2:
                issues.append("shadow_steps-levels-short")
            if len(boundaries) < 1:
                issues.append("shadow_steps-boundaries-empty")
    elif "shadow_steps" in profile:
        issues.append("shadow_steps-not-object")

    outlines = profile.get("outline_rules")
    if isinstance(outlines, dict):
        for k in ("enabled", "lineWidthPx", "inkStrength"):
            if k not in outlines:
                issues.append(f"outline_rules-missing:{k}")
    elif "outline_rules" in profile:
        issues.append("outline_rules-not-object")

    mats = profile.get("material_classes")
    if mats is not None and (not isinstance(mats, list) or len(mats) < 1):
        issues.append("material_classes-empty")
    elif isinstance(mats, list):
        for i, mat in enumerate(mats):
            if not isinstance(mat, dict) or "id" not in mat or "shading" not in mat:
                issues.append(f"material_classes-item-incomplete:{i}")

    face = profile.get("facial_proportion_profile")
    if isinstance(face, dict):
        for k in ("id", "eyeScaleBias", "jawSoftness"):
            if k not in face:
                issues.append(f"facial_proportion_profile-missing:{k}")
    elif "facial_proportion_profile" in profile:
        issues.append("facial_proportion_profile-not-object")

    motion = profile.get("motion_timing")
    if isinstance(motion, dict):
        if "fps" not in motion or "easingBias" not in motion:
            issues.append("motion_timing-incomplete")
        elif motion.get("fps") not in (12, 24, 30):
            issues.append(f"motion_timing-fps-invalid:{motion.get('fps')}")
    elif "motion_timing" in profile:
        issues.append("motion_timing-not-object")

    bg = profile.get("background_detail_budget")
    if isinstance(bg, dict):
        if "maxDistinctProps" not in bg or "midgroundSimplify" not in bg:
            issues.append("background_detail_budget-incomplete")
    elif "background_detail_budget" in profile:
        issues.append("background_detail_budget-not-object")

    lighting = profile.get("lighting_constraints")
    if isinstance(lighting, dict):
        if "keyFillRatioMax" not in lighting or "forbidUnmotivatedRim" not in lighting:
            issues.append("lighting_constraints-incomplete")
    elif "lighting_constraints" in profile:
        issues.append("lighting_constraints-not-object")

    cont = profile.get("continuity_invariants")
    if cont is not None and (not isinstance(cont, list) or len(cont) < 1):
        issues.append("continuity_invariants-empty")
    elif isinstance(cont, list):
        for i, inv in enumerate(cont):
            if not isinstance(inv, dict) or "id" not in inv or "rule" not in inv:
                issues.append(f"continuity_invariants-item-incomplete:{i}")

    prov = profile.get("provenance_requirements")
    if isinstance(prov, dict):
        for k in ("attachStyleId", "attachProfileId", "requireIntentId"):
            if k not in prov:
                issues.append(f"provenance_requirements-missing:{k}")
    elif "provenance_requirements" in profile:
        issues.append("provenance_requirements-not-object")

    return issues


def profile_gate_points() -> dict[str, Any]:
    """Document where future shot checks should attach (declared)."""
    return {
        "validation_status": VALIDATION_STATUS,
        "enforcement_status": ENFORCEMENT_STATUS,
        "schema": "schemas/anime/AnimeWorldProfile.v1.schema.json",
        "example": str(_DEFAULT_EXAMPLE_REL).replace("\\", "/"),
        "gate_points": [
            {
                "id": "genblaze-style-steer",
                "path": "mrs/apps/genblaze-media/app/style_steer.py",
                "status": "partial",
                "note": "style=anime prompt steer; profile id not yet required on generate",
            },
            {
                "id": "engine3d-ink-cel",
                "path": "docs/governance/cecp/trails/ink-cel-render-lane-2026-07/",
                "status": "partial",
                "note": "Designed cel/ink soft-raster; not implemented; binds via outline_rules + shadow_steps",
            },
            {
                "id": "ckl-world-profile-bridge",
                "path": "engine/governance/biometric/amendmentVIII.js",
                "status": "declared",
                "note": "AnimeWorldProfile is style governance; Amendment VIII remains biogeometric world law",
            },
            {
                "id": "provenance-manifest",
                "path": "mrs/apps/genblaze-media/app/constitutional_anime_render.py",
                "status": "partial",
                "note": (
                    "constitutional_anime_render manifests require validated "
                    "anime_world_profile_id; anime_claim fail-closed in Genblaze "
                    "(CKL policy still declared)"
                ),
            },
            {
                "id": "replay-service",
                "path": "replay.service-exists conformance",
                "status": "declared",
                "note": "Deterministic shot replay against frozen profile params",
            },
            {
                "id": "unity-unreal-hosts",
                "path": "unity/ · unreal/",
                "status": "declared",
                "note": "Hosts skeleton; consume profile as declared contract only",
            },
        ],
        "non_claims": [
            "Not Full Photoreal",
            "Not Digital Printer SoT",
            "Not CKL-enforced until tests exist",
        ],
    }


def anime_profile_health_fragment(
    *,
    settings_style: str | None = None,
    profile_path: str | Path | None = None,
) -> dict[str, Any]:
    """Honest /health fragment for profile governance (partial validation)."""
    style = (settings_style or "").strip().lower() or "default"
    fragment: dict[str, Any] = {
        "validation_status": VALIDATION_STATUS,
        "enforcement_status": ENFORCEMENT_STATUS,
        "schema_version": SCHEMA_VERSION,
        "preferred_when_style": PREFERRED_STYLE_ID,
        "active_style": style,
        "gate_points": profile_gate_points()["gate_points"],
    }
    path = Path(profile_path) if profile_path else default_example_path()
    if path.is_file():
        try:
            profile = load_anime_world_profile(path)
            issues = validate_anime_world_profile(profile)
            fragment["example_profile_id"] = profile.get("profileId")
            fragment["example_valid"] = len(issues) == 0
            if issues:
                fragment["example_issues"] = issues
        except (OSError, ValueError, json.JSONDecodeError) as exc:
            fragment["example_valid"] = False
            fragment["example_error"] = str(exc)
    else:
        fragment["example_valid"] = False
        fragment["example_error"] = f"missing:{path}"
    return fragment
