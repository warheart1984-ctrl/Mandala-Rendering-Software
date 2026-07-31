"""Face-aware polish defaults (guidance only — not geometric silhouette locks).

Drive-G-1 / ENGINE3D_FACE_STRUCTURE_SPEC_v1.0:
  Polish may refine texture/lighting over Engine3D face structure.
  Diffusion cannot enforce jaw/eye silhouette math — keep strength modest
  and prefer structure-preserving prompts.

When media style is anime (GENBLAZE_STYLE / style=anime), defaults steer
toward cel-shaded faces instead of photoreal skin claims.
"""

from __future__ import annotations

from app.style_steer import ANIME_FACE_POLISH_PROMPT, STYLE_ANIME, normalize_style

FACE_POLISH_DEFAULT_PROMPT = (
    "realistic human face, subtle micro-expressions, natural skin, "
    "cinematic lighting, preserve facial structure and eye placement, "
    "do not alter jawline or skull silhouette"
)

FACE_POLISH_MAX_DEFAULT_STRENGTH = 0.45


def resolve_face_polish_prompt(
    prompt: str | None,
    *,
    face_rig: bool,
    style: str | None = None,
) -> str:
    text = (prompt or "").strip()
    if text:
        return text
    try:
        style_id = normalize_style(style)
    except ValueError:
        style_id = "default"
    if style_id == STYLE_ANIME:
        return ANIME_FACE_POLISH_PROMPT
    if face_rig:
        return FACE_POLISH_DEFAULT_PROMPT
    return "cinematic portrait, soft skin, natural lighting"


def resolve_face_polish_strength(
    strength: float | None,
    *,
    face_rig: bool,
    default_strength: float,
) -> float:
    if strength is not None:
        return max(0.0, min(1.0, float(strength)))
    base = float(default_strength)
    if face_rig:
        return min(base, FACE_POLISH_MAX_DEFAULT_STRENGTH)
    return max(0.0, min(1.0, base))
