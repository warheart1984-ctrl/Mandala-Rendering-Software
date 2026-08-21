"""Emit MandalaShotArtifacts for a production request (vertical slice).

Status: **partial**. Does not render film. Hashes are deterministic.
"""

from __future__ import annotations

from typing import Any

from .audio import cue_index
from .canonical import CONTRACT_VERSION, digest
from .identity import (
    LIMITATION,
    character_state_hash,
    equipment_hash,
    world_state_hash,
)
from .validate import ContractError, validate_production_request, validate_shot_artifact

RUNTIME_FINGERPRINT = "mrs-storyforge-boundary/contract/1.1"


def emit_shot_artifacts(request: dict[str, Any]) -> list[dict[str, Any]]:
    request = validate_production_request(request)
    actor = request["actors"][0]
    lock = actor["identityLock"]
    char_hash = character_state_hash(lock)
    if char_hash != actor.get("characterStateHash"):
        raise ContractError("actor.characterStateHash does not match identityLock")
    eq_hash = equipment_hash(lock)
    world_hash = world_state_hash(request["world"])
    mesh = str(lock.get("meshHash") or digest({"mesh": actor["characterId"]}))
    rig = str(lock.get("rigHash") or digest({"rig": actor["characterId"]}))
    artifacts: list[dict[str, Any]] = []
    prev: str | None = None
    plan = request.get("audioPlan") or {}
    cues = cue_index(plan) if plan.get("cues") else {}
    score_identity = str(plan.get("scoreIdentity") or "")
    if not score_identity:
        raise ContractError("audioPlan.scoreIdentity required on production request")
    for shot in request["shotTimeline"]:
        shot_id = shot["shotId"]
        cue = cues.get(shot_id)
        if not cue:
            raise ContractError(f"audioPlan missing cue for shotId {shot_id}")
        render_hash = digest(
            {
                "shotId": shot_id,
                "pose": shot.get("pose"),
                "action": shot.get("action"),
                "camera": shot.get("camera"),
            }
        )
        projection_hash = digest({"camera": shot.get("camera"), "shotId": shot_id})
        artifact = {
            "schemaVersion": CONTRACT_VERSION,
            "kind": "MandalaShotArtifact",
            "statusTag": "partial",
            "productionId": request["productionId"],
            "shotId": shot_id,
            "parentShotId": prev,
            "characterId": actor["characterId"],
            "characterStateHash": char_hash,
            "worldStateHash": world_hash,
            "meshHash": mesh,
            "rigHash": rig,
            "equipmentHash": eq_hash,
            "renderHash": render_hash,
            "projectionHash": projection_hash,
            "runtimeFingerprint": RUNTIME_FINGERPRINT,
            "audioCueId": str(cue["audioCueId"]),
            "scoreIdentity": score_identity,
            "audioIntensity": float(cue["intensity"]),
            "audioPlayback": str(cue["playback"]),
            "cueStartSeconds": float(cue.get("cueStartSeconds") or 0.0),
            "audioDurationSeconds": float(
                cue.get("durationSeconds") or shot.get("durationSeconds") or 0.0
            ),
            "pose": shot.get("pose"),
            "camera": shot.get("camera"),
            "frames": [
                {
                    "role": "fixture-placeholder",
                    "sha256": digest({"shotId": shot_id, "role": "fixture"}),
                }
            ],
            "evidence": {
                "intentId": f"intent-{request['productionId']}-{shot_id}",
                "worldId": request["world"].get("worldPackId"),
                "limitation": LIMITATION,
            },
        }
        artifacts.append(validate_shot_artifact(artifact))
        prev = shot_id
    return artifacts


def emit_ntp_handoff(request: dict[str, Any], shots: list[dict[str, Any]]) -> dict[str, Any]:
    """Declared Narrative Trust Pack adapter view — Infinity owns the pack."""
    hashes = [s["characterStateHash"] + ":" + s["renderHash"] for s in shots]
    return {
        "schemaVersion": CONTRACT_VERSION,
        "kind": "NarrativeTrustPackHandoff",
        "statusTag": "declared",
        "productionId": request["productionId"],
        "narrative_trust_pack_version": "narrative_trust_pack.v1",
        "module_id": "storyforge-mandala-contract",
        "cisiv_stage": "identity",
        "claim_label": "asserted",
        "shotArtifactHashes": hashes,
        "notes": "Declared handoff. Do not merge with Jarvis Continuity Ledger chat dumps.",
    }


def compare_identity(first: dict[str, Any], last: dict[str, Any]) -> dict[str, Any]:
    validate_shot_artifact(first)
    validate_shot_artifact(last)
    findings: list[str] = []
    for field in (
        "characterStateHash",
        "worldStateHash",
        "meshHash",
        "rigHash",
        "equipmentHash",
    ):
        if first.get(field) != last.get(field):
            findings.append(f"{field} drifted")
    return {
        "equal": not findings,
        "findings": findings,
        "shotFirst": first["shotId"],
        "shotLast": last["shotId"],
        "characterStateHash": first.get("characterStateHash"),
    }
