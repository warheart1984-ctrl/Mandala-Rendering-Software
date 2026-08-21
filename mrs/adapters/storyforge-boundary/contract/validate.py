"""Validate storyforge-mandala-contract/1.1 artifacts.

Status: **partial** — structural checks matching the JSON schemas.
Does not import Infinity `story_forge` packages.
Beatbox live path remains **declared**.
"""

from __future__ import annotations

from typing import Any

from .canonical import CONTRACT_VERSION

ALLOWED_HANDS = frozenset({"left", "right", "both", "sheathed", "none"})


class ContractError(ValueError):
    """Artifact failed the production contract."""


def _req_dict(data: Any, name: str) -> dict[str, Any]:
    if not isinstance(data, dict):
        raise ContractError(f"{name} must be an object")
    return data


def _req_str(obj: dict[str, Any], key: str) -> str:
    val = obj.get(key)
    if not isinstance(val, str) or not val.strip():
        raise ContractError(f"missing or empty string: {key}")
    return val


def _req_list(obj: dict[str, Any], key: str, *, min_items: int = 1) -> list[Any]:
    val = obj.get(key)
    if not isinstance(val, list) or len(val) < min_items:
        raise ContractError(f"{key} must be an array with at least {min_items} item(s)")
    return val


def _version(obj: dict[str, Any]) -> None:
    if obj.get("schemaVersion") != CONTRACT_VERSION:
        raise ContractError(f"schemaVersion must be {CONTRACT_VERSION!r}")


def validate_production_artifact(data: Any) -> dict[str, Any]:
    obj = _req_dict(data, "StoryForgeProductionArtifact")
    _version(obj)
    if obj.get("kind") != "StoryForgeProductionArtifact":
        raise ContractError("kind must be StoryForgeProductionArtifact")
    if obj.get("statusTag") != "partial":
        raise ContractError("StoryForgeProductionArtifact statusTag must be partial")
    _req_str(obj, "productionId")
    _req_str(obj, "narrativeId")
    world = _req_dict(obj.get("worldPack"), "worldPack")
    _req_str(world, "id")
    _req_str(world, "setting")
    chars = _req_list(obj, "characters")
    for ch in chars:
        c = _req_dict(ch, "character")
        _req_str(c, "characterId")
        lock = _req_dict(c.get("identityLock"), "identityLock")
        for field in (
            "species",
            "faceRefId",
            "bodyBuild",
            "armorId",
            "weaponId",
            "weaponHeldIn",
        ):
            _req_str(lock, field)
        if lock["weaponHeldIn"] not in ALLOWED_HANDS:
            raise ContractError("weaponHeldIn invalid")
    shots = _req_list(obj, "shots")
    timeline = _req_dict(obj.get("timeline"), "timeline")
    ordered = _req_list(timeline, "orderedShotIds")
    shot_ids = [_req_str(_req_dict(s, "shot"), "shotId") for s in shots]
    if ordered != shot_ids:
        raise ContractError("timeline.orderedShotIds must match shots[] order")
    orders = [s.get("order") for s in shots]
    if orders != list(range(len(shots))):
        raise ContractError("shots[].order must be 0..n-1 in sequence")
    _req_dict(obj.get("renderIntent"), "renderIntent")
    cont = _req_dict(obj.get("continuityConstraints"), "continuityConstraints")
    if cont.get("sameCharacterAcrossShots") is not True:
        raise ContractError("vertical slice requires sameCharacterAcrossShots")
    audio = _req_dict(obj.get("audioPlan"), "audioPlan")
    _validate_audio_plan(audio, shot_ids)
    _req_dict(obj.get("provenance"), "provenance")
    return obj


def _validate_audio_plan(audio: dict[str, Any], shot_ids: list[str]) -> None:
    if audio.get("statusTag") != "declared":
        raise ContractError("audioPlan.statusTag must be declared (Beatbox live path)")
    if audio.get("mappingStatusTag") != "partial":
        raise ContractError("audioPlan.mappingStatusTag must be partial")
    _req_str(audio, "scoreIdentity")
    cues = _req_list(audio, "cues", min_items=len(shot_ids) if shot_ids else 1)
    cue_ids = [_req_str(_req_dict(c, "cue"), "shotId") for c in cues]
    if cue_ids != shot_ids:
        raise ContractError("audioPlan.cues[].shotId must match shots[] order")
    for cue in cues:
        c = _req_dict(cue, "cue")
        _req_str(c, "audioCueId")
        _req_str(c, "cue")
        intensity = c.get("intensity")
        if not isinstance(intensity, (int, float)) or not 0.0 <= float(intensity) <= 1.0:
            raise ContractError("audioPlan.cues[].intensity must be 0..1")
        playback = c.get("playback")
        if playback not in ("loop", "one-shot"):
            raise ContractError("audioPlan.cues[].playback must be loop or one-shot")
    stems = _req_list(audio, "stems", min_items=1)
    if not any(_req_dict(s, "stem").get("carriesScoreIdentity") for s in stems):
        raise ContractError("audioPlan.stems must include one identity-carrying stem")
    duck = _req_list(audio, "forbiddenDucking", min_items=1)
    for rule in duck:
        r = _req_dict(rule, "forbiddenDucking")
        _req_str(r, "stemId")
        _req_str(r, "reason")


def validate_production_request(data: Any) -> dict[str, Any]:
    obj = _req_dict(data, "MandalaProductionRequest")
    _version(obj)
    if obj.get("kind") != "MandalaProductionRequest":
        raise ContractError("kind must be MandalaProductionRequest")
    _req_str(obj, "productionId")
    _req_dict(obj.get("world"), "world")
    _req_list(obj, "actors")
    _req_list(obj, "shotTimeline")
    timeline_ids = [
        _req_str(_req_dict(s, "shot"), "shotId") for s in obj["shotTimeline"]
    ]
    _validate_audio_plan(_req_dict(obj.get("audioPlan"), "audioPlan"), timeline_ids)
    _req_dict(obj.get("renderContract"), "renderContract")
    _req_dict(obj.get("continuityContract"), "continuityContract")
    _req_dict(obj.get("evidenceRequirements"), "evidenceRequirements")
    return obj


def validate_shot_artifact(data: Any) -> dict[str, Any]:
    obj = _req_dict(data, "MandalaShotArtifact")
    _version(obj)
    if obj.get("kind") != "MandalaShotArtifact":
        raise ContractError("kind must be MandalaShotArtifact")
    for key in (
        "productionId",
        "shotId",
        "characterStateHash",
        "worldStateHash",
        "meshHash",
        "rigHash",
        "renderHash",
        "projectionHash",
        "runtimeFingerprint",
        "audioCueId",
        "scoreIdentity",
    ):
        _req_str(obj, key)
    if not isinstance(obj.get("frames"), list):
        raise ContractError("frames must be an array")
    ev = _req_dict(obj.get("evidence"), "evidence")
    _req_str(ev, "limitation")
    return obj
