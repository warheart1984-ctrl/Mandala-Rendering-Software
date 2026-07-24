"""Detect blank / near-black / tiny generative stills before treating them as OK.

NVIDIA FLUX.1-schnell (and some NIM safety paths) can return HTTP 200 with a
valid JPEG that is solid black - typically photoreal-people prompts. Our
pipeline previously uploaded those to B2 as successful assets.
"""

from __future__ import annotations

import io
from dataclasses import dataclass

# Solid-black 1024 JPEG from the live failure was ~6.4 KiB; real FLUX stills
# are usually tens to hundreds of KiB. Tiny payloads are almost always empty.
_MIN_BYTES = 12_000
_NEAR_BLACK_MEAN = 8.0
_NEAR_BLACK_UNIQUE = 8
_NEAR_BLACK_FRAC = 0.985


@dataclass(frozen=True)
class ImageAssessment:
    ok: bool
    reason: str | None
    byte_len: int
    width: int | None = None
    height: int | None = None
    mean_luminance: float | None = None
    unique_colors: int | None = None
    format: str | None = None

    @property
    def is_blank(self) -> bool:
        return not self.ok


def assess_image_bytes(data: bytes) -> ImageAssessment:
    """Return whether ``data`` looks like a usable still (not empty/black)."""
    n = len(data or b"")
    if n < 100:
        return ImageAssessment(
            ok=False,
            reason=f"image payload too small ({n} bytes)",
            byte_len=n,
        )
    if n < _MIN_BYTES:
        # Still try to open - but flag as blank if also near-black / undecodable.
        pass

    try:
        from PIL import Image, ImageStat
    except ImportError:
        # Pillow missing: fall back to size heuristic only.
        if n < _MIN_BYTES:
            return ImageAssessment(
                ok=False,
                reason=(
                    f"image payload suspiciously small ({n} bytes; "
                    f"expected >= {_MIN_BYTES} for a real FLUX still)"
                ),
                byte_len=n,
            )
        return ImageAssessment(ok=True, reason=None, byte_len=n)

    width = height = None
    mean_lum = None
    unique = None
    fmt = None
    frac_black = 0.0

    try:
        with Image.open(io.BytesIO(data)) as im:
            fmt = im.format
            width, height = im.size
            rgb = im.convert("RGB")
            sample = rgb
            if max(width, height) > 256:
                sample = rgb.resize((256, 256))
            stat = ImageStat.Stat(sample)
            r, g, b = stat.mean[0], stat.mean[1], stat.mean[2]
            mean_lum = 0.299 * r + 0.587 * g + 0.114 * b
            colors = sample.getcolors(maxcolors=256 * 256) or []
            unique = len(colors) if colors else 256 * 256
            flat = sample.tobytes()
            near_black = 0
            total = len(flat) // 3
            for i in range(0, len(flat) - 2, 3):
                if flat[i] + flat[i + 1] + flat[i + 2] < 15:
                    near_black += 1
            frac_black = near_black / max(total, 1)
    except Exception as exc:  # noqa: BLE001 - treat undecodable as blank
        return ImageAssessment(
            ok=False,
            reason=f"could not decode image bytes: {exc}",
            byte_len=n,
        )

    if width is None or height is None or width < 8 or height < 8:
        return ImageAssessment(
            ok=False,
            reason=f"image dimensions too small ({width}x{height})",
            byte_len=n,
            width=width,
            height=height,
            mean_luminance=mean_lum,
            unique_colors=unique,
            format=fmt,
        )

    blankish = (
        mean_lum is not None
        and mean_lum <= _NEAR_BLACK_MEAN
        and (
            (unique is not None and unique <= _NEAR_BLACK_UNIQUE)
            or frac_black >= _NEAR_BLACK_FRAC
        )
    ) or (
        n < _MIN_BYTES
        and mean_lum is not None
        and mean_lum <= _NEAR_BLACK_MEAN
    )

    if blankish:
        return ImageAssessment(
            ok=False,
            reason=(
                "NVIDIA returned a near-black / empty still "
                f"(mean luminance {mean_lum:.2f}, unique colors {unique}, "
                f"{n} bytes). Photoreal people often fail on FLUX.1-schnell NIM; "
                "retry with abstract geometry / mandala / tesseract prompts "
                "without faces or skin."
            ),
            byte_len=n,
            width=width,
            height=height,
            mean_luminance=mean_lum,
            unique_colors=unique,
            format=fmt,
        )

    return ImageAssessment(
        ok=True,
        reason=None,
        byte_len=n,
        width=width,
        height=height,
        mean_luminance=mean_lum,
        unique_colors=unique,
        format=fmt,
    )


def extract_nvidia_warnings(body: dict | None) -> list[str]:
    """Collect warning / refusal / finish-reason strings from an NIM body."""
    if not isinstance(body, dict):
        return []
    out: list[str] = []
    for key in (
        "warning",
        "warnings",
        "message",
        "finish_reason",
        "finishReason",
        "nsfw",
        "safety",
        "blocked",
        "detail",
    ):
        val = body.get(key)
        if isinstance(val, str) and val.strip():
            out.append(f"{key}: {val.strip()}")
        elif isinstance(val, list):
            for item in val:
                if isinstance(item, str) and item.strip():
                    out.append(f"{key}: {item.strip()}")
                elif isinstance(item, dict):
                    nested = item.get("message") or item.get("detail") or item.get("reason")
                    if isinstance(nested, str) and nested.strip():
                        out.append(f"{key}: {nested.strip()}")
        elif isinstance(val, bool) and val and key in {"nsfw", "blocked", "safety"}:
            out.append(f"{key}: true")

    artifacts = body.get("artifacts")
    if isinstance(artifacts, list):
        for i, art in enumerate(artifacts):
            if not isinstance(art, dict):
                continue
            for key in (
                "finish_reason",
                "finishReason",
                "warning",
                "nsfw",
                "safety",
                "blocked_reason",
                "reason",
            ):
                val = art.get(key)
                if isinstance(val, str) and val.strip():
                    out.append(f"artifacts[{i}].{key}: {val.strip()}")
                elif isinstance(val, bool) and val:
                    out.append(f"artifacts[{i}].{key}: true")
    seen: set[str] = set()
    uniq: list[str] = []
    for w in out:
        if w not in seen:
            seen.add(w)
            uniq.append(w)
    return uniq