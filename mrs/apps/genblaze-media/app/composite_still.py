"""Composite Engine3D subject beauty over an RT4D background plate.

Drive-G-1: composite is still a *structure* plate (structure_source may be
engine3d_composite). It does not claim photoreal skin; polish remains separate.
"""

from __future__ import annotations

import hashlib
import io
import logging
from typing import Any

logger = logging.getLogger(__name__)


class CompositeError(Exception):
    """Composite failed (decode / size / empty)."""


def composite_subject_over_background(
    *,
    background_png: bytes,
    subject_png: bytes,
    target_size: tuple[int, int] | None = None,
) -> bytes:
    """Alpha-over subject onto background.

    If subject has no useful alpha, treat near-clear / dark-studio pixels as
    transparent using a simple luminance + chroma heuristic so demo sphere/box
    subjects sit over RT4D lattices.

    When ``target_size`` is set, both images are resized (LANCZOS) to match.
    """
    try:
        from PIL import Image
    except ImportError as exc:  # pragma: no cover
        raise CompositeError("Pillow is required for composite_still") from exc

    try:
        bg = Image.open(io.BytesIO(background_png)).convert("RGBA")
        sub = Image.open(io.BytesIO(subject_png)).convert("RGBA")
    except Exception as exc:  # noqa: BLE001
        raise CompositeError(f"failed to decode PNG: {exc}") from exc

    if target_size is not None:
        tw, th = target_size
        if tw > 0 and th > 0:
            bg = bg.resize((tw, th), Image.Resampling.LANCZOS)
            sub = sub.resize((tw, th), Image.Resampling.LANCZOS)
    elif bg.size != sub.size:
        sub = sub.resize(bg.size, Image.Resampling.LANCZOS)

    # Build soft mask: opaque where subject differs from dark clear color.
    pixels = sub.load()
    w, h = sub.size
    assert pixels is not None
    has_alpha = False
    for y in range(0, h, max(1, h // 32)):
        for x in range(0, w, max(1, w // 32)):
            if pixels[x, y][3] < 250:
                has_alpha = True
                break
        if has_alpha:
            break

    if not has_alpha:
        # Heuristic: treat near-clear (dark gray studio) as transparent.
        for y in range(h):
            for x in range(w):
                r, g, b, a = pixels[x, y]
                # Default clear in soft raster is ~0.12,0.13,0.16 → ~31,33,41
                if r < 55 and g < 55 and b < 60:
                    pixels[x, y] = (r, g, b, 0)
                else:
                    pixels[x, y] = (r, g, b, 255)

    out = Image.alpha_composite(bg, sub)
    buf = io.BytesIO()
    out.convert("RGB").save(buf, format="PNG", optimize=True)
    data = buf.getvalue()
    if not data:
        raise CompositeError("composite produced empty PNG")
    return data


def composite_sha256(png: bytes) -> str:
    return hashlib.sha256(png).hexdigest()


def composite_provenance(
    *,
    structure_run_id: str,
    rt4d_background_run_id: str,
    composite_sha256_hex: str,
    resized: bool,
) -> dict[str, Any]:
    return {
        "kind": "engine3d-rt4d-composite",
        "structure_source": "engine3d_composite",
        "structure_run_id": structure_run_id,
        "rt4d_background_run_id": rt4d_background_run_id,
        "composite_sha256": composite_sha256_hex,
        "resized": resized,
        "note": (
            "Engine3D subject over RT4D background. Structure plate only — "
            "not photoreal skin; polish separately."
        ),
    }
