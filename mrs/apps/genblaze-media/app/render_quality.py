"""Render quality presets for the scene-spec / image-to-scene path.

Hackathon default is **draft**: a small, low-sample CPU path trace so
operators/judges get a still in roughly tens of seconds instead of minutes.
Draft output is intentionally smaller and noisier than final — this module
trades fidelity for latency; it does not make the tracer faster.

``final`` uses the RT4D_* settings profile. On free-tier / shared CPU deploys
that profile is also bounded by a **deploy-safe ceiling** (256×256 / 8 spp)
unless ``RT4D_ALLOW_HEAVY=1``. Dense archetypes (tesseract-lattice) get an
additional samples clamp. These are CPU budget clamps — not photoreal, not
denoising.
"""

from __future__ import annotations

import re
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
#
# DRAFT_SAMPLES stays at 4: the tesseract-lattice archetype (~540 sphere-chain
# primitives) was measured locally at roughly tens of seconds for 256×256 /
# 4 spp. Free-tier shared CPU is several× slower (see render.yaml notes), so
# 8 spp risks a short RT4D_TIMEOUT; readability comes from emissive beams /
# core / rings, not from raising the sample floor. Do not claim denoising.
DRAFT_WIDTH = 256
DRAFT_HEIGHT = 256
DRAFT_SAMPLES = 4
DRAFT_MAX_DEPTH = 3

# Hard ceiling applied to /api/generate stills when RT4D_ALLOW_HEAVY is off.
# Matches the free-tier render.yaml pin so a misconfigured/unsynced env cannot
# silently request the old 448×448 / 20-sample profile.
DEPLOY_SAFE_WIDTH = 256
DEPLOY_SAFE_HEIGHT = 256
DEPLOY_SAFE_SAMPLES = 8
DEPLOY_SAFE_MAX_DEPTH = 5

# Extra samples cap for dense procedural archetypes (tesseract-lattice ≈ 540
# objects). Mid profile leaves headroom for ~3–5× slower Render free-tier CPUs
# inside a 180s RT4D_TIMEOUT.
DENSE_SCENE_SAMPLES = 6

# Mirrors render-still.mjs pickScene tesseract-lattice cues (word-anchored).
_DENSE_SCENE_RE = re.compile(
    r"\b(tesseract|hypercube|4d|four[- ]?dimension|8-cell)",
    re.IGNORECASE,
)

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


def is_dense_rt4d_scene(prompt: str | None) -> bool:
    """True when keyword selection prefers the dense tesseract-lattice archetype.

    Matches ``pickScene`` cues in ``render-still.mjs`` (not a full scene build).
    """
    if not prompt:
        return False
    return _DENSE_SCENE_RE.search(prompt) is not None


def _allow_heavy(settings: Any) -> bool:
    return bool(getattr(settings, "rt4d_allow_heavy", False))


def apply_cpu_budget_clamp(
    params: dict[str, int],
    settings: Any,
    *,
    prompt: str | None = None,
) -> tuple[dict[str, int], dict[str, Any] | None]:
    """Clamp still params for shared-CPU deploys; return ``(params, note|None)``.

    When ``RT4D_ALLOW_HEAVY`` / ``settings.rt4d_allow_heavy`` is set, params pass
    through unchanged (local/dev heavy profiles). Otherwise:

    * Hard ceiling at deploy-safe 256×256 / 8 spp / depth 5.
    * Dense tesseract-lattice prompts further cap samples at
      ``DENSE_SCENE_SAMPLES`` (6).

    The note is suitable for provenance; absence means no clamp ran.
    """
    before = {key: int(params[key]) for key in _OUTPUT_KEYS}
    if _allow_heavy(settings):
        return before, None

    after = dict(before)
    reasons: list[str] = []

    ceiling = {
        "width": DEPLOY_SAFE_WIDTH,
        "height": DEPLOY_SAFE_HEIGHT,
        "samples": DEPLOY_SAFE_SAMPLES,
        "maxDepth": DEPLOY_SAFE_MAX_DEPTH,
    }
    for key, lim in ceiling.items():
        if after[key] > lim:
            after[key] = lim
            reasons.append(f"{key}>{lim}")

    if is_dense_rt4d_scene(prompt) and after["samples"] > DENSE_SCENE_SAMPLES:
        after["samples"] = DENSE_SCENE_SAMPLES
        reasons.append(f"dense-scene-samples>{DENSE_SCENE_SAMPLES}")

    if after == before:
        return after, None

    return after, {
        "applied": True,
        "reasons": reasons,
        "dense_scene": is_dense_rt4d_scene(prompt),
        "before": before,
        "after": dict(after),
        "note": (
            "CPU budget clamp for shared-tier deploys; not photoreal. "
            "Set RT4D_ALLOW_HEAVY=1 to skip."
        ),
    }


def resolve_still_render_params(
    settings: Any,
    quality: Any = None,
    *,
    prompt: str | None = None,
) -> dict[str, int]:
    """Effective width/height/samples/maxDepth for a prompt-driven RT4D still.

    ``draft`` **caps** each key at the draft preset (same semantics as
    :func:`apply_quality_to_output`), so an ``RT4D_*`` profile sized for a dev
    machine cannot force a render longer than ``RT4D_TIMEOUT`` on a small shared
    instance. A profile already smaller than the cap is preserved. ``final``
    starts from the ``RT4D_*`` profile, then both paths take the deploy-safe /
    dense-scene CPU budget clamp unless ``RT4D_ALLOW_HEAVY=1``.
    """
    resolved = resolve_quality(settings, quality)
    presets = quality_presets(settings)
    final = presets[FINAL_QUALITY]
    if resolved == FINAL_QUALITY:
        params = {key: int(final[key]) for key in _OUTPUT_KEYS}
    else:
        draft = presets[DRAFT_QUALITY]
        params = {
            key: max(1, min(int(final[key]), int(draft[key]))) for key in _OUTPUT_KEYS
        }
    clamped, _note = apply_cpu_budget_clamp(params, settings, prompt=prompt)
    return clamped


def resolve_still_render_budget(
    settings: Any,
    quality: Any = None,
    *,
    prompt: str | None = None,
) -> tuple[dict[str, int], dict[str, Any] | None]:
    """Like :func:`resolve_still_render_params` but also returns the clamp note."""
    resolved = resolve_quality(settings, quality)
    presets = quality_presets(settings)
    final = presets[FINAL_QUALITY]
    if resolved == FINAL_QUALITY:
        params = {key: int(final[key]) for key in _OUTPUT_KEYS}
    else:
        draft = presets[DRAFT_QUALITY]
        params = {
            key: max(1, min(int(final[key]), int(draft[key]))) for key in _OUTPUT_KEYS
        }
    return apply_cpu_budget_clamp(params, settings, prompt=prompt)


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

    Other output fields (e.g. ``seed``) pass through untouched. Deploy-safe
    ceiling is applied by the RT4D still path (:func:`resolve_still_render_budget`);
    scene-spec keeps explicit final values so operators can still request heavy
    frames when they raise ``RT4D_TIMEOUT`` / set ``RT4D_ALLOW_HEAVY``.
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
