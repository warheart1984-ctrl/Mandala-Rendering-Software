"""Rewrite fragile photoreal-people prompts toward abstract geometry.

FLUX.1-schnell on NVIDIA NIM frequently returns solid-black JPEGs for prompts
with faces / skin / portraits. Operators are told to retry with mandala /
tesseract wording; this module automates one rewrite attempt.
"""

from __future__ import annotations

import re

_PEOPLE = re.compile(
    r"""
    \b(
      person|people|human|humans|man|men|woman|women|girl|girls|boy|boys|
      face|faces|skin|portrait|portraits|selfie|selfies|
      model|models|actress|actor|photoreal|photorealistic|
      body|bodies|hands?\s+holding|someone|somebody
    )\b
    """,
    re.IGNORECASE | re.VERBOSE,
)

_DEFAULT_ABSTRACT = (
    "isometric concept still of a translucent 4D tesseract mandala, "
    "neon wireframe geometry, cool studio light, no people, no faces, no skin"
)


def looks_like_people_prompt(prompt: str) -> bool:
    """True when the prompt likely asks for photoreal people / faces / skin."""
    return bool(_PEOPLE.search(prompt or ""))


def rewrite_as_abstract_geometry(prompt: str) -> str:
    """Strip people/face/skin tokens and frame remaining scene as abstract geometry.

    Does not invent unrelated stories. If stripping leaves too little content,
    falls back to a known-good mandala / tesseract default.
    """
    text = (prompt or "").strip()
    if not text:
        return _DEFAULT_ABSTRACT

    stripped = _PEOPLE.sub(" ", text)
    stripped = re.sub(r"\s+", " ", stripped).strip(" ,;.")
    # Drop leftover articles that became orphaned ("a  of a").
    stripped = re.sub(r"\b(a|an|the|of|with|and|or)\s+(?=(a|an|the|of|with|and|or)\b)", "", stripped, flags=re.I)
    stripped = re.sub(r"\s+", " ", stripped).strip(" ,;.")

    if len(stripped) < 12:
        return _DEFAULT_ABSTRACT

    lower = stripped.lower()
    has_geo = any(
        token in lower
        for token in (
            "mandala",
            "tesseract",
            "torus",
            "geometry",
            "geometric",
            "wireframe",
            "cube",
            "hypercube",
            "lattice",
            "grid",
            "neon",
            "abstract",
            "4d",
            "four-dimensional",
        )
    )
    if not has_geo:
        stripped = (
            f"abstract geometric concept still inspired by: {stripped}; "
            "translucent mandala / tesseract forms, neon wireframe, studio light"
        )

    suffix = "no people, no faces, no skin, no portrait"
    if "no people" not in lower:
        stripped = f"{stripped}, {suffix}"
    return stripped.strip(" ,;.")
