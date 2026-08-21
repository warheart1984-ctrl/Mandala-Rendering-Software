"""Adaptive score connection: Mandala cues → Infinity Beatbox.

Does not generate music in RT4D. Does not import `story_forge` or Beatbox.
Beatbox live invoke remains **declared** (status GET only on Jarvis; score is
`BeatboxLane.score(ScoreRequest)` inside Infinity).

Status: **partial** for cue mapping + scoreIdentity compare;
**declared** for live Beatbox/Speakers mix.
"""

from __future__ import annotations

from typing import Any

from .validate import ContractError

# Jarvis HTTP surface observed in warheart1984-ctrl/infinity (read-only clone).
BEATBOX_STATUS_ENDPOINT = "GET /api/jarvis/beatbox-lane/status"
BEATBOX_SCORE_ENTRY = (
    "external/beatbox_speakers/src/beatbox/lanes/beatbox_lane.py"
    "::BeatboxLane.score(ScoreRequest)"
)
BEATBOX_SCORE_REQUEST = "ScoreRequest"
BEATBOX_SCENE_STATE_BUILDER = (
    "external/beatbox_speakers/src/beatbox/scene_state_builder.py"
    "::build_score_request_from_shot_list"
)
BEATBOX_CAPABILITY = "jarvis.capability.beatbox_score"

# Default courtyard theme — parallel to characterStateHash identity.
DEFAULT_SCORE_IDENTITY = "courtyard-warrior-theme-v1"

# Stem ids Infinity Speakers must not duck if they carry score identity.
FORBIDDEN_DUCKING = (
    "courtyard-identity-bed",
    "scoreIdentity-theme-stem",
)

_ACTION_CUES: tuple[tuple[str, str, float, str], ...] = (
    ("enter courtyard", "cue-enter-courtyard", 0.22, "loop"),
    ("begin walk", "cue-approach", 0.38, "loop"),
    ("walk mid", "cue-approach", 0.52, "loop"),
    ("stop", "cue-stop", 0.45, "one-shot"),
    ("hold", "cue-hold", 0.40, "loop"),
    ("start look", "cue-look-gate", 0.58, "loop"),
    ("look at gate", "cue-look-gate", 0.72, "loop"),
    ("settle look", "cue-look-gate", 0.68, "loop"),
)


def _cue_for_action(action: str) -> tuple[str, float, str]:
    lower = action.lower()
    for needle, cue_id, intensity, playback in _ACTION_CUES:
        if needle in lower:
            return cue_id, intensity, playback
    return "cue-bed", 0.35, "loop"


def beatbox_invoke_descriptor() -> dict[str, Any]:
    """How Infinity Beatbox would be invoked — not called from Mandala."""
    return {
        "livePathStatusTag": "declared",
        "statusEndpoint": BEATBOX_STATUS_ENDPOINT,
        "scoreEntry": BEATBOX_SCORE_ENTRY,
        "scoreRequestType": BEATBOX_SCORE_REQUEST,
        "sceneStateBuilder": BEATBOX_SCENE_STATE_BUILDER,
        "capabilityId": BEATBOX_CAPABILITY,
        "capabilityScoreAction": "posture-only in Infinity BeatboxScoreCapability._handle_score",
        "movieAudioPipeline": (
            "story_forge.movie_audio_pipeline.run_story_forge_movie_audio_pipeline "
            "requires a rendered video_path; Mandala does not call it"
        ),
        "whyDeclared": (
            "Infinity Jarvis exposes GET beatbox-lane/status only. ScoreLane is "
            "Python `BeatboxLane.score`; Mandala does not import or invoke it."
        ),
    }


def audio_plan_from_shots(
    shots: list[dict[str, Any]],
    *,
    score_identity: str = DEFAULT_SCORE_IDENTITY,
) -> dict[str, Any]:
    """Build an adaptive audioPlan tied to shotIds (mapper default)."""
    if not shots:
        raise ContractError("audioPlan requires shots")
    cursor = 0.0
    cues: list[dict[str, Any]] = []
    for shot in shots:
        shot_id = str(shot["shotId"])
        action = str(shot.get("action") or "")
        duration = float(shot.get("durationSeconds") or 2.0)
        cue_id, intensity, playback = _cue_for_action(action)
        audio_cue_id = f"{shot_id}:{cue_id}"
        layers = ["courtyard-identity-bed"]
        if "approach" in cue_id:
            layers.append("approach-percussion")
        if "stop" in cue_id or "look-gate" in cue_id:
            layers.append("gate-focus-sting")
        cues.append(
            {
                "shotId": shot_id,
                "audioCueId": audio_cue_id,
                "cue": cue_id,
                "action": action,
                "intensity": intensity,
                "playback": playback,
                "cueStartSeconds": round(cursor, 3),
                "durationSeconds": duration,
                "layers": layers,
            }
        )
        cursor += duration
    return {
        "statusTag": "declared",
        "mappingStatusTag": "partial",
        "fallbackStatusTag": "partial",
        "scoreIdentity": score_identity,
        "scoreIdentityKind": "theme-id",
        "beatbox": beatbox_invoke_descriptor(),
        "speakers": {
            "statusTag": "declared",
            "mixEntry": "external/beatbox_speakers/src/speakers/mix_lane.py",
            "whyDeclared": "Speakers mix/stems are Infinity-owned; not exercised here.",
        },
        "stems": [
            {
                "id": "courtyard-identity-bed",
                "role": "theme",
                "playback": "loop",
                "carriesScoreIdentity": True,
            },
            {
                "id": "approach-percussion",
                "role": "layer",
                "playback": "loop",
                "carriesScoreIdentity": False,
            },
            {
                "id": "gate-focus-sting",
                "role": "sting",
                "playback": "one-shot",
                "carriesScoreIdentity": False,
            },
        ],
        "forbiddenDucking": [
            {
                "stemId": stem_id,
                "reason": "Ducking this stem would collapse scoreIdentity / theme continuity.",
            }
            for stem_id in FORBIDDEN_DUCKING
        ],
        "cues": cues,
        "limitation": (
            "Cues are a handoff for Infinity Beatbox ScoreRequest. Mandala RT4D "
            "does not compose original music."
        ),
    }


def cue_index(plan: dict[str, Any]) -> dict[str, dict[str, Any]]:
    cues = plan.get("cues")
    if not isinstance(cues, list):
        raise ContractError("audioPlan.cues must be an array")
    out: dict[str, dict[str, Any]] = {}
    for item in cues:
        if not isinstance(item, dict):
            raise ContractError("audioPlan.cues[] must be objects")
        shot_id = str(item.get("shotId") or "")
        if not shot_id:
            raise ContractError("audioPlan.cues[].shotId required")
        out[shot_id] = item
    return out


def compare_score_identity(first: dict[str, Any], last: dict[str, Any]) -> dict[str, Any]:
    """Parallel to compare_identity: theme id holds while cues/intensity evolve."""
    findings: list[str] = []
    a = first.get("scoreIdentity")
    b = last.get("scoreIdentity")
    if not a or a != b:
        findings.append("scoreIdentity drifted")
    cue_a = first.get("audioCueId")
    cue_b = last.get("audioCueId")
    intensity_a = first.get("audioIntensity")
    intensity_b = last.get("audioIntensity")
    evolved = cue_a != cue_b or intensity_a != intensity_b
    if not evolved:
        findings.append("cue/intensity did not evolve between shots")
    return {
        "equal": a == b and bool(a),
        "cuesEvolved": evolved,
        "findings": findings,
        "shotFirst": first.get("shotId"),
        "shotLast": last.get("shotId"),
        "scoreIdentity": a,
    }


def local_click_playlist(plan: dict[str, Any]) -> dict[str, Any]:
    """Declared/partial fallback when Beatbox is unreachable.

    Maps intensity → deterministic click Hz. Does **not** claim an original score.
    """
    cues = plan.get("cues") if isinstance(plan.get("cues"), list) else []
    entries = []
    for item in cues:
        if not isinstance(item, dict):
            continue
        intensity = float(item.get("intensity") or 0.0)
        intensity = max(0.0, min(1.0, intensity))
        click_hz = round(220.0 + 220.0 * intensity, 2)
        entries.append(
            {
                "shotId": item.get("shotId"),
                "audioCueId": item.get("audioCueId"),
                "intensity": intensity,
                "clickHz": click_hz,
                "stemId": str((item.get("layers") or ["courtyard-identity-bed"])[0]),
            }
        )
    return {
        "statusTag": "partial",
        "claim": "deterministic click/stem playlist — not an original Beatbox score",
        "beatboxInvoked": False,
        "scoreIdentity": plan.get("scoreIdentity"),
        "entries": entries,
    }
