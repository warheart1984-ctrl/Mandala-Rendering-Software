"""Media look-lane steering (anime / default) for Genblaze diffusion prompts.

Drive-G-1 honesty:
  - ``anime`` is **partial**: FLUX / Lemonade / polish prompt steering only.
  - Does **not** claim photoreal, Cycles GI, or Digital Printer beauty SoT.
  - RT4D / Engine3D structure stills stay procedural/soft-raster; style is
    recorded for provenance and applies fully when diffusion polish runs.
"""

from __future__ import annotations

from typing import Any

from app.anime_world_profile import anime_profile_health_fragment

STYLE_DEFAULT = "default"
STYLE_ANIME = "anime"
ALLOWED_STYLES = frozenset({STYLE_DEFAULT, STYLE_ANIME})

# Suffix appended once when style=anime and the prompt lacks anime cues.
ANIME_STEER_SUFFIX = (
    "anime style, cel-shaded, clean line art, vibrant flat colors, "
    "studio anime aesthetic, not photorealistic, not 3d photoreal render"
)

ANIME_CUE_TOKENS = (
    "anime",
    "cel-shaded",
    "cel shaded",
    "manga",
    "2d animation",
    "studio ghibli",
    "makoto shinkai",
)

ANIME_FACE_POLISH_PROMPT = (
    "anime character face, clean line art, cel-shaded skin, large expressive eyes, "
    "soft studio lighting, preserve facial structure and eye placement, "
    "not photorealistic, not uncanny 3d skin"
)

ANIME_STATUS = "partial"
ANIME_NOTE = (
    "Anime look lane is partial: diffusion prompt steering (FLUX/Lemonade/polish). "
    "Cycles photoreal (external-pbr) remains optional; anime is the preferred "
    "media/hackathon beauty aspiration, not Full Photoreal."
)


def normalize_style(raw: str | None) -> str:
    """Map user/env input to an allowed style id.

    Empty / None → ``default``. Unknown values raise ``ValueError``.
    """
    text = (raw or "").strip().lower()
    if not text:
        return STYLE_DEFAULT
    # Aliases
    if text in {"anime", "cel", "celshade", "cel-shade", "stylized-anime"}:
        return STYLE_ANIME
    if text in {"default", "none", "off", "photoreal-optional", "natural"}:
        return STYLE_DEFAULT
    if text not in ALLOWED_STYLES:
        raise ValueError(
            f"unsupported style '{raw}'. Allowed: {', '.join(sorted(ALLOWED_STYLES))} "
            "(aliases: cel, manga→anime)."
        )
    return text


def resolve_style(
    *,
    request_style: str | None = None,
    settings_style: str | None = None,
) -> str:
    """Request ``style`` wins when set; else settings / ``GENBLAZE_STYLE``."""
    if request_style is not None and str(request_style).strip():
        return normalize_style(request_style)
    return normalize_style(settings_style)


def prompt_already_has_anime_cues(prompt: str) -> bool:
    lower = (prompt or "").lower()
    return any(token in lower for token in ANIME_CUE_TOKENS)


def apply_style_steer(prompt: str, style: str) -> tuple[str, bool]:
    """Return ``(steered_prompt, steered)``.

    ``steered`` is True only when anime suffix was appended.
    """
    text = (prompt or "").strip()
    style_id = normalize_style(style)
    if style_id != STYLE_ANIME or not text:
        return text, False
    if prompt_already_has_anime_cues(text):
        return text, False
    steered = f"{text.rstrip(' ,;.')}, {ANIME_STEER_SUFFIX}"
    return steered, True


def style_health_payload(settings_style: str | None) -> dict[str, Any]:
    """Honest /health fragment for the media style lane."""
    try:
        resolved = normalize_style(settings_style)
    except ValueError:
        resolved = STYLE_DEFAULT
    payload: dict[str, Any] = {
        "default": resolved,
        "allowed": sorted(ALLOWED_STYLES),
        "anime_status": ANIME_STATUS,
        "anime_note": ANIME_NOTE,
        "env": "GENBLAZE_STYLE",
        "api_field": "style",
        "entry_point": "constitutional-anime-rendering",
    }
    # AnimeWorldProfile governance validation is partial; enforcement remains declared.
    payload["anime_world_profile"] = anime_profile_health_fragment(
        settings_style=resolved
    )
    return payload
