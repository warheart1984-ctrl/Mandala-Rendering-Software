"""Map Infinity BackendBuildArtifact-shaped JSON into the production contract.

Does not import `story_forge`. Accepts a JSON payload whose fields match
`BackendBuildArtifact.to_payload()` plus nested lists when present
(`narrative_state`, `temporal_shot_list`, characters).

Status: **partial**.
"""

from __future__ import annotations

from typing import Any

from .audio import audio_plan_from_shots
from .canonical import CONTRACT_VERSION
from .identity import character_state_hash, equipment_hash
from .validate import ContractError, validate_production_artifact


def _as_dict(value: Any) -> dict[str, Any]:
    return value if isinstance(value, dict) else {}


def _shots_from_infinity(raw: dict[str, Any], character_id: str) -> list[dict[str, Any]]:
    temporal = _as_dict(raw.get("temporal_shot_list"))
    shots_in = temporal.get("shots")
    if not isinstance(shots_in, list) or not shots_in:
        cinematic = _as_dict(raw.get("cinematic_shot_list"))
        shots_in = cinematic.get("shots") if isinstance(cinematic.get("shots"), list) else []
    if not shots_in:
        raise ContractError("Infinity artifact has no temporal/cinematic shots")
    out: list[dict[str, Any]] = []
    for i, item in enumerate(shots_in):
        s = _as_dict(item)
        shot_id = str(s.get("shotId") or s.get("shot_id") or f"S{i+1:02d}")
        action = str(s.get("action") or s.get("description") or "").strip() or f"shot-{i+1}"
        pose_id = str(s.get("pose") or s.get("framing") or f"pose-{i+1}")
        camera_move = str(s.get("camera_motion") or s.get("camera_move") or "static")
        lens = str(s.get("framing") or s.get("lens") or "50mm")
        duration = s.get("duration_seconds")
        if duration is None:
            duration = s.get("duration_est") or 2.0
        out.append(
            {
                "shotId": shot_id,
                "order": i,
                "characterId": character_id,
                "durationSeconds": float(duration),
                "action": action,
                "background": str(s.get("background") or ""),
                "pose": {"id": pose_id},
                "camera": {"lens": lens, "move": camera_move},
                "negativeConstraints": list(s.get("negativeConstraints") or []),
            }
        )
    return out


def _character_from_infinity(raw: dict[str, Any]) -> dict[str, Any]:
    ns = _as_dict(raw.get("narrative_state"))
    chars = ns.get("characters") if isinstance(ns.get("characters"), list) else raw.get("characters")
    if not isinstance(chars, list) or not chars:
        raise ContractError("Infinity artifact missing characters")
    first = _as_dict(chars[0])
    lock = _as_dict(first.get("identityLock") or first.get("identity_lock"))
    if not lock:
        # Infinity Entity is name/role/description — vertical-slice fixtures
        # attach identityLock. Bare entities are refused rather than invented.
        raise ContractError(
            "Infinity character has no identityLock; Mandala will not invent a Story Bible"
        )
    character_id = str(first.get("characterId") or first.get("id") or first.get("name") or "").strip()
    if not character_id:
        raise ContractError("character id missing")
    return {
        "characterId": character_id,
        "displayName": str(first.get("displayName") or first.get("name") or character_id),
        "identityLock": lock,
    }


def from_infinity_backend_build(raw: dict[str, Any]) -> dict[str, Any]:
    """Map Infinity-shaped JSON → StoryForgeProductionArtifact."""
    if not isinstance(raw, dict):
        raise ContractError("Infinity payload must be an object")
    character = _character_from_infinity(raw)
    shots = _shots_from_infinity(raw, character["characterId"])
    ns = _as_dict(raw.get("narrative_state"))
    world = _as_dict(raw.get("worldPack") or raw.get("world_pack"))
    if not world:
        world = {
            "id": str(raw.get("world_pack_id") or "infinity-worldpack"),
            "setting": str(ns.get("setting") or raw.get("scene_id") or "unspecified"),
        }
    production_id = str(raw.get("productionId") or raw.get("build_id") or "").strip()
    if not production_id:
        raise ContractError("build_id/productionId required")
    narrative_id = str(
        raw.get("narrativeId") or ns.get("prompt") or raw.get("session_id") or production_id
    )
    artifact = {
        "schemaVersion": CONTRACT_VERSION,
        "kind": "StoryForgeProductionArtifact",
        "statusTag": "partial",
        "productionId": production_id,
        "narrativeId": narrative_id[:128],
        "infinityBuildId": str(raw.get("build_id") or production_id),
        "worldPack": world,
        "characters": [character],
        "shots": shots,
        "timeline": {"orderedShotIds": [s["shotId"] for s in shots]},
        "renderIntent": dict(raw.get("renderIntent") or {"summary": "infinity-handoff", "route": "rt4d"}),
        "continuityConstraints": dict(
            raw.get("continuityConstraints")
            or {
                "sameCharacterAcrossShots": True,
                "persistentEquipment": True,
                "persistentWorld": True,
            }
        ),
        "audioPlan": dict(raw.get("audioPlan") or audio_plan_from_shots(shots)),
        "provenance": dict(
            raw.get("provenance")
            or {
                "source": "infinity-BackendBuildArtifact",
                "infinityRepo": "warheart1984-ctrl/infinity",
            }
        ),
    }
    return validate_production_artifact(artifact)


def to_mandala_production_request(artifact: dict[str, Any]) -> dict[str, Any]:
    artifact = validate_production_artifact(artifact)
    lock = artifact["characters"][0]["identityLock"]
    cid = artifact["characters"][0]["characterId"]
    wp = artifact["worldPack"]
    request = {
        "schemaVersion": CONTRACT_VERSION,
        "kind": "MandalaProductionRequest",
        "statusTag": "partial",
        "productionId": artifact["productionId"],
        "world": {
            "worldPackId": wp["id"],
            "setting": wp["setting"],
            "fortress": wp.get("fortress"),
            "weather": wp.get("weather"),
            "lighting": wp.get("lighting"),
        },
        "actors": [
            {
                "characterId": cid,
                "identityLock": lock,
                "characterStateHash": character_state_hash(lock),
                "equipmentHash": equipment_hash(lock),
            }
        ],
        "shotTimeline": [
            {
                "shotId": s["shotId"],
                "order": s["order"],
                "characterId": s["characterId"],
                "action": s.get("action"),
                "pose": s["pose"],
                "camera": s["camera"],
                "durationSeconds": s.get("durationSeconds"),
            }
            for s in artifact["shots"]
        ],
        "renderContract": {
            "route": (artifact.get("renderIntent") or {}).get("route") or "rt4d",
            "quality": (artifact.get("renderIntent") or {}).get("quality") or "draft",
            "notes": "Per-shot pixels still cross as RenderRequest; this is production intake.",
        },
        "continuityContract": {
            "requireStableCharacterStateHash": True,
            "requireStableWorldHash": True,
            "requireStableEquipmentHash": True,
            "limitation": (
                "Continuity can DETECT identityLock mutation; it cannot guarantee "
                "diffusion/sampler obedience."
            ),
        },
        "evidenceRequirements": {
            "shotArtifacts": True,
            "narrativeTrustPackHandoff": True,
        },
        "audioPlan": artifact["audioPlan"],
    }
    return request
