"""Identity hashes from Infinity-mapped lock fields (not pose).

Status: **partial**. Same lock → same characterStateHash across shots.
"""

from __future__ import annotations

from typing import Any

from .canonical import digest

IDENTITY_LOCK_KEYS = (
    "species",
    "rigSpecies",
    "faceRefId",
    "bodyBuild",
    "armorId",
    "weaponId",
    "weaponHeldIn",
    "meshHash",
    "rigHash",
    "prohibitedMutations",
)

LIMITATION = (
    "Continuity can DETECT identityLock mutation; it cannot guarantee "
    "diffusion/sampler obedience."
)


def identity_lock_body(lock: dict[str, Any]) -> dict[str, Any]:
    body: dict[str, Any] = {}
    for key in IDENTITY_LOCK_KEYS:
        if key in lock:
            body[key] = lock[key]
    return body


def character_state_hash(lock: dict[str, Any]) -> str:
    return digest(identity_lock_body(lock))


def equipment_hash(lock: dict[str, Any]) -> str:
    return digest(
        {
            "armorId": lock.get("armorId"),
            "weaponId": lock.get("weaponId"),
            "weaponHeldIn": lock.get("weaponHeldIn"),
        }
    )


def world_state_hash(world: dict[str, Any]) -> str:
    return digest(
        {
            "id": world.get("id") or world.get("worldPackId"),
            "setting": world.get("setting"),
            "fortress": world.get("fortress"),
            "weather": world.get("weather"),
            "lighting": world.get("lighting"),
        }
    )
