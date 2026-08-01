"""Thin Genblaze → Anime Lane handoff (partial).

POST /api/anime forces style=anime and returns lane + anime_lane.contract_version
+ provenance. Health exposes anime_lane per docs/anime-lane/ANIME_LANE_HEALTH_SCHEMA.v1.json.

Drive-G-1:
  - Lane: declared; implementation: partial; UE: skeleton/partial; promotion: not promoted
  - Print SoT / Digital Printer untouched
"""

from __future__ import annotations

import hashlib
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from app.anime_world_profile import (
    default_example_path,
    load_anime_world_profile,
    validate_anime_world_profile,
)

ANIME_UE_ENDPOINT = "/api/anime"
ANIME_UE_KIND = "anime-ue-handoff"
ANIME_LANE_CODE = "anime"
ANIME_LANE_CONTRACT_VERSION = "1.0"
STATUS = "partial"
STYLE_ANIME = "anime"

CROSS_ENGINE_CONTRACT_REL = "docs/anime-lane/ANIME_LANE_CROSS_ENGINE_CONTRACT.v1.md"
HEALTH_SCHEMA_REL = "docs/anime-lane/ANIME_LANE_HEALTH_SCHEMA.v1.json"
STRUCTURE_PLATE_CONTRACT_REL = (
    "docs/4d-engine/projection/ANIME_STRUCTURE_PLATE_PROJECTOR_CONTRACT.v1.md"
)
PROVENANCE_SCHEMA_REL = (
    "schemas/4d-engine/v1/StructurePlateProjectionProvenance.v1.schema.json"
)
PROVENANCE_SCHEMA_SHORT = "StructurePlateProjectionProvenance.v1.schema.json"
UE_PLUGIN_REL = "unreal/AnimeStylizer"

PROVENANCE_FIELD_NAMES = [
    "lane",
    "style_forced",
    "palette_lut",
    "outline_pass_version",
    "cel_shading_version",
    "color_grade_version",
    "temporal_aa_version",
    "structure_plate_used",
    "structure_plate_provenance",
    "export_settings",
]

_REFERENCE_MODELS = {
    "projector4d-sot": {
        "projector_id": "projector4d-sot",
        "projection_method": "projector4d-sot",
        "reference_model": "Projector4D (d4/(d4+w)) · Print SoT closed form (structure-lane candidate)",
        "alpha": None,
        "d4": 1.0,
    },
    "drop_w": {
        "projector_id": "drop_w",
        "projection_method": "drop_w",
        "reference_model": "drop_w — literal XYZ (fourth axis discarded)",
        "alpha": None,
        "d4": None,
    },
}


def _utc_now() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def normalize_projection_method(method: str | None) -> str:
    key = (method or "projector4d-sot").strip().lower().replace("_", "-")
    if key in ("projector4d", "projector4d-sot", "projector-4d", "sot"):
        return "projector4d-sot"
    if key in ("drop-w", "dropw", "literal-xyz"):
        return "drop_w"
    return "projector4d-sot"


def build_structure_plate_provenance(
    *,
    projection_method: str,
    anime_world_profile_id: str,
    asset_sha256: str | None = None,
) -> dict[str, Any]:
    """Provenance block aligned with StructurePlateProjectionProvenance.v1 (declared)."""
    method = normalize_projection_method(projection_method)
    ref = _REFERENCE_MODELS[method]
    prov: dict[str, Any] = {
        "schema": PROVENANCE_SCHEMA_REL,
        "projector_id": ref["projector_id"],
        "projection_method": ref["projection_method"],
        "reference_model": ref["reference_model"],
        "lane": "anime-structure",
        "print_sot_touched": False,
        "digital_printer_touched": False,
        "anime_world_profile_id": anime_world_profile_id,
        "contract": STRUCTURE_PLATE_CONTRACT_REL,
        "anime_lane_contract": CROSS_ENGINE_CONTRACT_REL,
        "status": "declared",
    }
    if ref["d4"] is not None:
        prov["d4"] = ref["d4"]
        if ref["d4"]:
            prov["alpha"] = 1.0 / float(ref["d4"])
    if method == "drop_w":
        prov["alpha"] = None
        prov["d4"] = None
    if asset_sha256:
        prov["asset_sha256"] = asset_sha256
    return prov


def build_anime_lane_provenance(
    *,
    structure_plate_provenance: dict[str, Any],
    structure_plate_used: bool,
    palette_lut: str | None = None,
) -> dict[str, Any]:
    """Lane-level provenance fields from the Anime Lane contract (§7)."""
    return {
        "lane": ANIME_LANE_CODE,
        "style_forced": True,
        "palette_lut": palette_lut,
        "outline_pass_version": "skeleton-0.1",
        "cel_shading_version": "skeleton-0.1",
        "color_grade_version": "skeleton-0.1",
        "temporal_aa_version": "skeleton-0.1",
        "structure_plate_used": structure_plate_used,
        "structure_plate_provenance": structure_plate_provenance,
        "export_settings": {
            "status": "declared",
            "recipe": "ffmpeg -framerate N -i frame_%04d.png -c:v libx264 -pix_fmt yuv420p anime_demo.mp4",
        },
        "schema": PROVENANCE_SCHEMA_REL,
        "anime_lane_contract": CROSS_ENGINE_CONTRACT_REL,
    }


def anime_lane_health() -> dict[str, Any]:
    """`/health.anime_lane` payload matching ANIME_LANE_HEALTH_SCHEMA.v1.json (+ maturity)."""
    return {
        "contract_version": ANIME_LANE_CONTRACT_VERSION,
        "endpoint": ANIME_UE_ENDPOINT,
        "status": {
            "reachable": True,
            "style_forced": True,
            "governed": True,
            "maturity": STATUS,
            "lane_status": "declared",
            "promoted": False,
        },
        "contract_notes": (
            f"{CROSS_ENGINE_CONTRACT_REL} — declared; scaffold partial; "
            "UE AnimeStylizer skeleton/partial; not promoted."
        ),
        "provenance_schema": PROVENANCE_SCHEMA_SHORT,
        "provenance": {
            "schema": PROVENANCE_SCHEMA_SHORT,
            "fields": list(PROVENANCE_FIELD_NAMES),
        },
        "ue_plugin": {
            "module": "AnimeStylizerModule",
            "path": UE_PLUGIN_REL,
            "passes": [
                "AnimeOutlinePass",
                "AnimeCelShadingPass",
                "AnimeColorGradePass",
                "AnimeTemporalAAPass",
            ],
            "structure_plate_blend": True,
            "structure_plate_blend_maturity": "skeleton",
            "ue_status": "skeleton/partial",
            "compile": "unknown",
        },
        "promotion": {
            "eligible": True,
            "promoted": False,
            "blockers": [
                "ink_cel_evidence",
                "pole_stress_thresholds",
                "ci_provenance_validator",
                "shading_space_alignment",
            ],
        },
        "docs": {
            "contract": CROSS_ENGINE_CONTRACT_REL,
            "health_schema": HEALTH_SCHEMA_REL,
            "index": "docs/anime-lane/README.md",
        },
    }


def anime_ue_availability() -> dict[str, Any]:
    """Backward-compatible availability fragment (also embeds anime_lane health)."""
    profile_path = default_example_path()
    profile_id = None
    profile_valid = False
    example_error: str | None = None
    if profile_path.is_file():
        try:
            profile = load_anime_world_profile(profile_path)
            issues = validate_anime_world_profile(profile)
            profile_id = profile.get("profileId")
            profile_valid = len(issues) == 0
        except (OSError, ValueError) as exc:
            example_error = str(exc)
    else:
        example_error = f"missing:{profile_path}"

    lane = anime_lane_health()
    out: dict[str, Any] = {
        "endpoint": ANIME_UE_ENDPOINT,
        "kind": ANIME_UE_KIND,
        "status": STATUS,
        "available": True,
        "example_profile_id": profile_id,
        "example_profile_valid": profile_valid,
        "ue_plugin": UE_PLUGIN_REL,
        "ue_status": "skeleton/partial",
        "contract": CROSS_ENGINE_CONTRACT_REL,
        "anime_lane": lane,
        "note": (
            "POST /api/anime forces style=anime; returns lane + anime_lane + provenance. "
            "UE AnimeStylizer optional; reliable demo is Genblaze→structure→ffmpeg."
        ),
    }
    if example_error:
        out["example_error"] = example_error
    return out


def build_anime_ue_handoff(
    *,
    projection_method: str = "projector4d-sot",
    anime_world_profile_path: str | Path | None = None,
    prompt: str | None = None,
    dry_run: bool = True,
    structure_png: bytes | None = None,
    structure_preview_url: str | None = None,
    structure_run_id: str | None = None,
    width: int = 256,
    height: int = 256,
) -> dict[str, Any]:
    """Assemble Anime Lane handoff JSON (partial). Always forces style=anime."""
    path = Path(anime_world_profile_path) if anime_world_profile_path else default_example_path()
    profile = load_anime_world_profile(path)
    issues = validate_anime_world_profile(profile)
    if issues:
        raise ValueError(f"AnimeWorldProfile invalid: {', '.join(issues)}")

    profile_id = str(profile.get("profileId") or "unknown")
    method = normalize_projection_method(projection_method)
    run_id = structure_run_id or str(uuid.uuid4())
    asset_sha: str | None = None
    if structure_png is not None:
        asset_sha = hashlib.sha256(structure_png).hexdigest()

    structure_plate_prov = build_structure_plate_provenance(
        projection_method=method,
        anime_world_profile_id=profile_id,
        asset_sha256=asset_sha,
    )
    structure_used = structure_png is not None or bool(structure_preview_url)
    lane_provenance = build_anime_lane_provenance(
        structure_plate_provenance=structure_plate_prov,
        structure_plate_used=structure_used,
        palette_lut=None,
    )

    structure: dict[str, Any] | None = None
    if structure_used:
        structure = {
            "run_id": run_id,
            "kind": "anime-structure-plate",
            "width": width,
            "height": height,
            "asset_sha256": asset_sha,
            "preview_url": structure_preview_url,
            "bytes_present": structure_png is not None,
            "source": "live" if structure_png is not None and not dry_run else "handoff",
        }

    return {
        "lane": ANIME_LANE_CODE,
        "style": STYLE_ANIME,
        "style_forced": True,
        "status": STATUS,
        "kind": ANIME_UE_KIND,
        "run_id": run_id,
        "created_at": _utc_now(),
        "dry_run": dry_run,
        "prompt": (prompt or "").strip() or None,
        "anime_world_profile_id": profile_id,
        "anime_world_profile_version": profile.get("schemaVersion"),
        "anime_world_profile_path": str(path).replace("\\", "/"),
        "anime_world_profile_status": profile.get("status"),
        "projection_method": method,
        "anime_lane": {
            "contract_version": ANIME_LANE_CONTRACT_VERSION,
            "style_forced": True,
            "status": "declared",
            "maturity": STATUS,
            "promoted": False,
            "contract": CROSS_ENGINE_CONTRACT_REL,
            "provenance": lane_provenance,
        },
        "provenance": lane_provenance,
        "structure": structure,
        "capability_tags": {
            "genblaze_api_anime": "partial",
            "structure_plate": "partial" if structure else "declared",
            "ue_anime_stylizer": "skeleton/partial",
            "ffmpeg_export": "declared",
            "replay": "declared",
            "print_sot": "untouched",
            "promotion": "not_promoted",
        },
        "ue_consumer": {
            "plugin_path": UE_PLUGIN_REL,
            "plugin_status": "skeleton/partial",
            "load_api": "UAnimeStylizerBlueprintLibrary::LoadStructurePlate",
            "config_api": "FAnimeStylizerConfig (bUseStructurePlate, StructureBlend)",
            "contract": CROSS_ENGINE_CONTRACT_REL,
            "structure_plate_contract": STRUCTURE_PLATE_CONTRACT_REL,
            "note": (
                "Optional leg. Reliable hackathon demo does not require UE compile — "
                "use Genblaze structure plate → ffmpeg."
            ),
        },
        "pipeline_story": [
            "intent",
            "genblaze:/api/anime",
            "structure_plate+provenance",
            "ue:AnimeStylizer (optional)",
            "ffmpeg",
            "evidence",
            "replay (declared)",
        ],
        "non_claims": [
            "Not Full Photoreal / Digital Printer SoT",
            "Not a verified UE 5.3+ compile in this repo",
            "Not CKL-enforced provenance (declared schema only)",
            "Not a measured R9 380 / 1.1 ms profile",
            "Not a promoted default lane",
            "ffmpeg H.264 cleanliness is operator-side (declared unless artifact hashed)",
        ],
        "note": (
            "Anime Lane handoff (declared/partial). style forced to anime. "
            "See docs/anime-lane/ANIME_LANE_CROSS_ENGINE_CONTRACT.v1.md."
        ),
    }
