"""Abstract lattice polish defaults (glass + chrome + emissive core).

Drive-G-1:
  Polish is diffusion over an RT4D/Engine3D structure pass. It cannot invent
  smooth cylinders if the structure is still a sphere-chain, but it can push
  materials toward glass transmission, chrome joints, and a glowing core when
  the structure already reads as a lattice.
"""

from __future__ import annotations

LATTICE_POLISH_DEFAULT_PROMPT = (
    "refine the existing glass-and-chrome geometric lattice with enhanced studio lighting, "
    "sharper reflections, intensified neon rim highlights, clearer transmission, "
    "and a brighter glowing core; preserve all structure and composition; "
    "abstract only; no characters, no faces, no skin."
)

LATTICE_POLISH_DEFAULT_STRENGTH = 0.42

_LATTICE_HINTS = (
    "lattice",
    "tesseract",
    "glass",
    "chrome",
    "mandala",
    "neural",
    "hypercube",
    "geometric",
    "neon",
)


def looks_like_lattice_prompt(prompt: str | None) -> bool:
    text = (prompt or "").strip().lower()
    if not text:
        return False
    return any(h in text for h in _LATTICE_HINTS)


def resolve_lattice_polish_prompt(
    prompt: str | None,
    *,
    lattice: bool,
) -> str | None:
    """Return lattice default when lattice=True and prompt empty; else None."""
    text = (prompt or "").strip()
    if text:
        return text
    if lattice:
        return LATTICE_POLISH_DEFAULT_PROMPT
    return None


def resolve_lattice_polish_strength(
    strength: float | None,
    *,
    lattice: bool,
    default_strength: float,
) -> float:
    if strength is not None:
        return max(0.0, min(1.0, float(strength)))
    base = float(default_strength)
    if lattice:
        return min(base, LATTICE_POLISH_DEFAULT_STRENGTH)
    return max(0.0, min(1.0, base))
