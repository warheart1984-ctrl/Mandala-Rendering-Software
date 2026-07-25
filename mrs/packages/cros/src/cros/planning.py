"""Plan derivation — CI-002's producer side.

Status: **partial** for ``cros.gen-ai-nim`` (a single-step plan is derived and
unit-tested); **declared** for ``cros.dcc-offline`` (raises
:class:`UnsupportedProfileError` — there is no offline planner).

A plan is a pure function of (RenderIntent, AdapterCapabilities, profile). It
must not require a capability the adapter did not declare, and must cite the
intent hash it was derived from.
"""

from __future__ import annotations

from typing import Any, Mapping
from uuid import uuid4

from cros.adapter import AdapterCapabilities
from cros.artifacts import RenderPlan, utc_now, validate_artifact, verify_seal
from cros.resources import load_profile

__all__ = [
    "PlanningError",
    "UnsupportedProfileError",
    "derive_plan",
]


class PlanningError(ValueError):
    """A plan cannot be derived from the given intent + capabilities."""


class UnsupportedProfileError(PlanningError):
    """The requested profile has no planner in this package."""


def derive_plan(
    render_intent: Mapping[str, Any],
    capabilities: AdapterCapabilities,
    *,
    plan_id: str | None = None,
) -> dict[str, Any]:
    """Derive a sealed RenderPlan from a sealed RenderIntent + capabilities.

    Currently implements the gen-ai subset only. Calling this with a
    ``cros.dcc-offline`` intent raises :class:`UnsupportedProfileError`.
    """
    if not verify_seal(render_intent):
        raise PlanningError("RenderIntent contentHash does not match body (CI-001)")
    validate_artifact(render_intent)

    profile_id = render_intent["profile"]
    if profile_id not in capabilities.profiles:
        raise PlanningError(
            f"adapter {capabilities.adapter.id!r} does not declare profile "
            f"{profile_id!r}; declared={list(capabilities.profiles)}"
        )

    # Touch the profile file so a missing/unknown profile fails here, not later.
    load_profile(profile_id)

    if profile_id == "cros.gen-ai-nim":
        return _derive_gen_ai(render_intent, capabilities, plan_id=plan_id)
    if profile_id == "cros.dcc-offline":
        raise UnsupportedProfileError(
            "cros.dcc-offline planner is declared, not implemented. "
            "See profiles/cros.dcc-offline.json. No Cycles/Arnold/etc. adapter exists."
        )
    raise UnsupportedProfileError(f"no planner for profile {profile_id!r}")


def _derive_gen_ai(
    render_intent: Mapping[str, Any],
    capabilities: AdapterCapabilities,
    *,
    plan_id: str | None,
) -> dict[str, Any]:
    required = ("gen.submit",)
    missing = [c for c in required if c not in capabilities.capability_names]
    if missing:
        raise PlanningError(
            f"gen-ai plan requires capabilities {list(required)}; "
            f"adapter declared {list(capabilities.capability_names)}; "
            f"missing={missing}"
        )

    modality = render_intent.get("target", {}).get("modality", "image")
    if modality not in capabilities.modality:
        raise PlanningError(
            f"intent modality {modality!r} not in adapter modality "
            f"{list(capabilities.modality)}"
        )

    params: dict[str, Any] = {
        "modality": modality,
        "promptSha256": render_intent.get("promptSha256"),
    }
    if "seed" in render_intent:
        params["seed"] = render_intent["seed"]
    target = render_intent.get("target") or {}
    for key in ("width", "height", "frameCount", "fps", "durationSeconds"):
        if key in target:
            params[key] = target[key]

    steps = (
        {
            "index": 0,
            "op": "gen.submit",
            "params": params,
            "requiresCapabilities": ["gen.submit"],
        },
    )
    plan = RenderPlan(
        id=plan_id or f"plan-{uuid4()}",
        profile="cros.gen-ai-nim",
        derived_from=render_intent["id"],
        render_intent_hash=render_intent["contentHash"],
        adapter=capabilities.adapter.to_dict(),
        capabilities_hash=capabilities.content_hash(),
        steps=steps,
        created_at=utc_now(),
        estimates={"status": "unestimated", "note": "no cost model in scaffold"},
    )
    sealed = plan.to_dict()
    validate_artifact(sealed)
    return sealed
