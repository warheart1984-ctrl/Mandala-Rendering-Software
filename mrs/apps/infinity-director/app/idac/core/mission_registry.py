"""IDAC mission registry — validate mission_ref against known missions."""

from __future__ import annotations

from app.idac.core.contracts import PlanViolationError

KNOWN_MISSIONS: dict[str, str] = {
    "cecp/idac-stack-2026-07": "IDAC reference runtime under CECP trail",
    "mission/test": "Test mission for IDAC charter gate",
}

DEFAULT_MISSION_REF = "cecp/idac-stack-2026-07"


def validate_mission_ref(mission_ref: str, *, intent_ref: str = "") -> None:
    """Raise PlanViolationError if mission_ref is not in KNOWN_MISSIONS."""
    if not str(mission_ref or "").strip():
        raise PlanViolationError(
            code="idac.mission_ref_empty",
            message="Mission ref is required",
            plan_ref="",
            intent_ref=intent_ref,
        )
    if mission_ref not in KNOWN_MISSIONS:
        raise PlanViolationError(
            code="idac.mission_ref_unknown",
            message=f"Unknown mission ref: {mission_ref!r}. Known: {sorted(KNOWN_MISSIONS)}",
            plan_ref="",
            intent_ref=intent_ref,
        )


def list_known_missions() -> dict[str, str]:
    return dict(KNOWN_MISSIONS)
