"""Render quality presets for the scene-spec / image-to-scene path.

Hackathon default is **draft**: a small, low-sample CPU path trace so
operators/judges get a still in roughly tens of seconds instead of minutes.
Draft output is intentionally smaller and noisier than final — this module
trades fidelity for latency; it does not make the tracer faster.

``final`` keeps the RT4D_* settings profile (448×448 / 20 samples / depth 5
by default) for nicer stills when operators can wait.
"""

from __future__ import annotations

from typing import Any

DRAFT_QUALITY = "draft"
FINAL_QUALITY = "final"

_QUALITY_ALIASES = {
    "draft": DRAFT_QUALITY,
    "fast": DRAFT_QUALITY,
    "final": FINAL_QUALITY,
    "high": FINAL_QUALITY,
}

# Draft constants — also referenced by the heuristic builder and the
# image-to-scene prompt copy. Env RT4D_DRAFT_* can tune them per deploy.
DRAFT_WIDTH = 256
DRAFT_HEIGHT = 256
DRAFT_SAMPLES = 4
DRAFT_MAX_DEPTH = 3

_OUTPUT_KEYS = ("width", "height", "samples", "maxDepth")


def normalize_quality(value: Any, default: str = DRAFT_QUALITY) -> str:
    """Map draft/fast/final/high (any case) to a canonical quality; else default."""
    if isinstance(value, str):
        key = value.strip().lower()
        if key in _QUALITY_ALIASES:
            return _QUALITY_ALIASES[key]
    return default


def resolve_quality(settings: Any, requested: Any = None) -> str:
    """Requested quality wins when valid; else the settings/env default (draft)."""
    default = normalize_quality(
        getattr(settings, "render_quality_default", DRAFT_QUALITY)
    )
    return normalize_quality(requested, default)


def quality_presets(settings: Any) -> dict[str, dict[str, int]]:
    """Draft + final output presets derived from settings (env-tunable)."""
    return {
        DRAFT_QUALITY: {
            "width": int(getattr(settings, "rt4d_draft_width", DRAFT_WIDTH)),
            "height": int(getattr(settings, "rt4d_draft_height", DRAFT_HEIGHT)),
            "samples": int(getattr(settings, "rt4d_draft_samples", DRAFT_SAMPLES)),
            "maxDepth": int(
                getattr(settings, "rt4d_draft_max_depth", DRAFT_MAX_DEPTH)
            ),
        },
        FINAL_QUALITY: {
            "width": int(settings.rt4d_width),
            "height": int(settings.rt4d_height),
            "samples": int(settings.rt4d_samples),
            "maxDepth": int(settings.rt4d_max_depth),
        },
    }


def resolve_still_render_params(settings: Any, quality: Any = None) -> dict[str, int]:
    """Effective width/height/samples/maxDepth for a prompt-driven RT4D still.

    ``draft`` **caps** each key at the draft preset (same semantics as
    :func:`apply_quality_to_output`), so an ``RT4D_*`` profile sized for a dev
    machine cannot force a render longer than ``RT4D_TIMEOUT`` on a small shared
    instance. A profile already smaller than the cap is preserved. ``final``
    uses the ``RT4D_*`` profile unchanged.
    """
    resolved = resolve_quality(settings, quality)
    presets = quality_presets(settings)
    final = presets[FINAL_QUALITY]
    if resolved == FINAL_QUALITY:
        return {key: int(final[key]) for key in _OUTPUT_KEYS}
    draft = presets[DRAFT_QUALITY]
    return {
        key: max(1, min(int(final[key]), int(draft[key]))) for key in _OUTPUT_KEYS
    }


def apply_quality_to_output(
    spec: dict[str, Any],
    settings: Any,
    quality: str,
) -> tuple[dict[str, Any], dict[str, int]]:
    """Return ``(spec_copy, applied_output)`` with the preset applied.

    * ``draft`` — **caps** width/height/samples/maxDepth at the draft preset,
      overwriting larger requests. This is deliberate: NIM/heuristic specs may
      ask for 448/20/5 and would otherwise force a multi-minute CPU render on
      the default path. Smaller explicit requests are preserved.
    * ``final`` — fills only missing fields from the RT4D_* settings profile;
      explicit spec values win (current pre-preset behaviour).

    Other output fields (e.g. ``seed``) pass through untouched.
    """
    quality = normalize_quality(quality)
    preset = quality_presets(settings)[quality]

    spec_out = dict(spec)
    output = dict(spec_out.get("output") or {})

    if quality == DRAFT_QUALITY:
        for key in _OUTPUT_KEYS:
            requested = output.get(key)
            if isinstance(requested, (int, float)) and not isinstance(requested, bool):
                output[key] = max(1, min(int(requested), preset[key]))
            else:
                output[key] = preset[key]
    else:
        for key in _OUTPUT_KEYS:
            output.setdefault(key, preset[key])

    spec_out["output"] = output
    applied = {key: int(output[key]) for key in _OUTPUT_KEYS}
    return spec_out, applied
