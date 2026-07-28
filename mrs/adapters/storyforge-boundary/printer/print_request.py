"""Normalize PrintRequest knobs for the digital print pipeline.

STATUS: **enforced** — deterministic defaults; draft remains separate.
"""

from __future__ import annotations

from copy import deepcopy
from typing import Any

DEFAULTS: dict[str, Any] = {
    "width": 512,
    "height": 512,
    "samples": 24,
    "maxDepth": 6,
    "variance_threshold": 0.0008,
    "color_space": "srgb",
    "tone_mapper": "aces-lite",
    "denoise": False,
    "seed": 42,
    "format": "png",
    "aovs": ["beauty"],
    "adaptiveSampling": True,
    "fireflyMax": 14,
    "minSampleFraction": 0.55,
}

ALLOWED_TONE = frozenset({"aces-lite", "reinhard", "none"})
ALLOWED_FORMAT = frozenset({"png"})
ALLOWED_COLOR = frozenset({"srgb"})


def normalize_print_request(raw: dict[str, Any] | None = None) -> dict[str, Any]:
    """Return a complete PrintRequest dict (deep copy of defaults + overrides)."""
    out = deepcopy(DEFAULTS)
    if not raw:
        return out
    for key, val in raw.items():
        if key in out or key in {
            "width",
            "height",
            "samples",
            "maxDepth",
            "variance_threshold",
            "color_space",
            "tone_mapper",
            "denoise",
            "seed",
            "format",
            "aovs",
            "adaptiveSampling",
            "fireflyMax",
            "minSampleFraction",
        }:
            out[key] = val

    out["width"] = int(max(8, min(768, int(out["width"]))))
    out["height"] = int(max(8, min(768, int(out["height"]))))
    out["samples"] = int(max(1, min(64, int(out["samples"]))))
    out["maxDepth"] = int(max(1, min(12, int(out.get("maxDepth") or 6))))
    out["seed"] = int(out["seed"])
    out["variance_threshold"] = float(out["variance_threshold"])
    out["denoise"] = bool(out["denoise"])
    out["adaptiveSampling"] = bool(out["adaptiveSampling"])

    if out["tone_mapper"] not in ALLOWED_TONE:
        out["tone_mapper"] = "aces-lite"
    if out["format"] not in ALLOWED_FORMAT:
        out["format"] = "png"
    if out["color_space"] not in ALLOWED_COLOR:
        out["color_space"] = "srgb"

    aovs = out.get("aovs") or ["beauty"]
    if not isinstance(aovs, list) or "beauty" not in aovs:
        aovs = ["beauty"] + [a for a in (aovs if isinstance(aovs, list) else []) if a != "beauty"]
    out["aovs"] = aovs
    return out


def apply_print_request_to_render_request(
    render_request: dict[str, Any],
    print_req: dict[str, Any],
) -> dict[str, Any]:
    """Patch RenderRequest payload.render + sceneSpecification.output for print mode."""
    body = deepcopy(render_request)
    body["payload"] = dict(body.get("payload") or {})
    render = dict(body["payload"].get("render") or {})
    render["width"] = print_req["width"]
    render["height"] = print_req["height"]
    render["samples"] = print_req["samples"]
    render["maxDepth"] = print_req["maxDepth"]
    render["seed"] = print_req["seed"]
    render["quality"] = "cinematic"
    body["payload"]["render"] = render

    spec = body["payload"].get("sceneSpecification")
    if isinstance(spec, dict):
        spec = dict(spec)
        out = dict(spec.get("output") or {})
        out.update(
            {
                "width": print_req["width"],
                "height": print_req["height"],
                "samples": print_req["samples"],
                "maxDepth": print_req["maxDepth"],
                "seed": print_req["seed"],
                "exposure": out.get("exposure", 1.65),
                "qualityOpts": {
                    "adaptiveSampling": print_req["adaptiveSampling"],
                    "tonemap": print_req["tone_mapper"],
                    "fireflyMax": print_req["fireflyMax"],
                    "varianceThreshold": print_req["variance_threshold"],
                    "minSampleFraction": print_req["minSampleFraction"],
                    # Denoise is declared/partial — flag recorded; CPU denoise off by default.
                    "denoise": print_req["denoise"],
                },
            }
        )
        spec["output"] = out
        body["payload"]["sceneSpecification"] = spec
    return body
