"""Normalize PrintRequest knobs for the digital print pipeline.



STATUS: **enforced** — deterministic defaults + all four quality profiles

(print_fast / print_hq / print_cinematic / print_reference) with locked params.

Denoise and softPenumbra are quality-profile gated (CPU bilateral / area lights).

backend defaults to cpu; ungated gpu backends raise PrintError (SURFACE_INVALID).

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

    "denoise": True,

    "softPenumbra": True,

    "penumbraLightSamples": 4,

    "seed": 42,

    "format": "png",

    "aovs": ["beauty"],

    "adaptiveSampling": True,

    "fireflyMax": 14,

    "minSampleFraction": 0.55,

    "quality": "print_hq",

    "backend": "cpu",

}



# Drive-G-1: profiles lock deterministic params. Wall-clock is ops, not enforcement.

QUALITY_PROFILES: dict[str, dict[str, Any]] = {

    "print_fast": {

        "width": 256,

        "height": 256,

        "samples": 8,

        "maxDepth": 4,

        "adaptiveSampling": True,

        "denoise": False,

        "softPenumbra": False,

        "penumbraLightSamples": 1,

        "tone_mapper": "aces-lite",

        "statusTag": "enforced",

    },

    "print_hq": {

        "width": 512,

        "height": 512,

        "samples": 24,

        "maxDepth": 6,

        "adaptiveSampling": True,

        "denoise": True,

        "softPenumbra": True,

        "penumbraLightSamples": 4,

        "tone_mapper": "aces-lite",

        "statusTag": "enforced",

    },

    "print_cinematic": {

        "width": 768,

        "height": 768,

        "samples": 48,

        "maxDepth": 8,

        "adaptiveSampling": True,

        "denoise": True,

        "softPenumbra": True,

        "penumbraLightSamples": 4,

        "tone_mapper": "aces-lite",

        "statusTag": "enforced",

        "note": "Higher spp + denoise; wall-clock depends on host CPU (ops, not non-determinism).",

    },

    "print_reference": {

        "width": 768,

        "height": 768,

        "samples": 64,

        "maxDepth": 10,

        "adaptiveSampling": True,

        "denoise": True,

        "softPenumbra": True,

        "penumbraLightSamples": 8,

        "tone_mapper": "aces-lite",

        "statusTag": "enforced",

        "note": "Reference profile clamped by PrintRequest max dims/spp; not a commercial RIP.",

    },

}



ALLOWED_TONE = frozenset({"aces-lite", "reinhard", "none"})

ALLOWED_FORMAT = frozenset({"png"})

ALLOWED_COLOR = frozenset({"srgb"})

ALLOWED_QUALITY = frozenset(QUALITY_PROFILES.keys())



# cpu SoT always. webgpu only via parity_gate (MRS_PRINT_WEBGPU + receipt).
# cuda/hip remain absent — do not stub.

from printer.parity_gate import allowed_backends as _allowed_backends





def resolve_quality_profile(name: str | None) -> dict[str, Any]:

    """Return a deep copy of a named print quality profile (defaults to print_hq)."""

    key = (name or "print_hq").strip().lower()

    if key not in QUALITY_PROFILES:

        key = "print_hq"

    return deepcopy(QUALITY_PROFILES[key])





def normalize_print_request(raw: dict[str, Any] | None = None) -> dict[str, Any]:

    """Return a complete PrintRequest dict (profile → defaults → overrides)."""

    out = deepcopy(DEFAULTS)

    raw = dict(raw or {})

    quality = raw.get("quality") or out.get("quality") or "print_hq"

    profile = resolve_quality_profile(str(quality))

    status_tag = profile.pop("statusTag", "enforced")

    note = profile.pop("note", None)

    out.update(profile)

    out["quality"] = (

        str(quality).strip().lower()

        if str(quality).strip().lower() in ALLOWED_QUALITY

        else "print_hq"

    )

    out["qualityStatusTag"] = status_tag

    if note:

        out["qualityNote"] = note



    for key, val in raw.items():

        if key in {

            "width",

            "height",

            "samples",

            "maxDepth",

            "variance_threshold",

            "color_space",

            "tone_mapper",

            "denoise",

            "softPenumbra",

            "penumbraLightSamples",

            "seed",

            "format",

            "aovs",

            "adaptiveSampling",

            "fireflyMax",

            "minSampleFraction",

            "quality",

            "backend",

        }:

            if val is not None:

                out[key] = val



    # Re-apply quality key after overrides so explicit quality still wins for tag.

    if "quality" in raw and raw["quality"] is not None:

        q = str(raw["quality"]).strip().lower()

        out["quality"] = q if q in ALLOWED_QUALITY else "print_hq"

        prof = QUALITY_PROFILES[out["quality"]]

        out["qualityStatusTag"] = prof.get("statusTag", "enforced")

        if "note" in prof:

            out["qualityNote"] = prof["note"]

        elif "qualityNote" in out and out["quality"] in ("print_fast", "print_hq"):

            out.pop("qualityNote", None)



    out["width"] = int(max(8, min(768, int(out["width"]))))

    out["height"] = int(max(8, min(768, int(out["height"]))))

    out["samples"] = int(max(1, min(64, int(out["samples"]))))

    out["maxDepth"] = int(max(1, min(12, int(out.get("maxDepth") or 6))))

    out["seed"] = int(out["seed"])

    out["variance_threshold"] = float(out["variance_threshold"])

    out["denoise"] = bool(out["denoise"])

    out["softPenumbra"] = bool(out["softPenumbra"])

    out["penumbraLightSamples"] = int(max(1, min(8, int(out.get("penumbraLightSamples") or 1))))

    out["adaptiveSampling"] = bool(out["adaptiveSampling"])



    if out["tone_mapper"] not in ALLOWED_TONE:

        out["tone_mapper"] = "aces-lite"

    if out["format"] not in ALLOWED_FORMAT:

        out["format"] = "png"

    if out["color_space"] not in ALLOWED_COLOR:

        out["color_space"] = "srgb"

    if out["quality"] not in ALLOWED_QUALITY:

        out["quality"] = "print_hq"



    backend = str(out.get("backend") or "cpu").strip().lower() or "cpu"

    allowed = _allowed_backends()

    if backend not in allowed:

        from printer.errors import PrintError, PrintErrorState

        raise PrintError(

            PrintErrorState.SURFACE_INVALID,

            f"print backend {backend!r} denied until CPU/GPU parity receipts "

            f"(allowed: {sorted(allowed)})",

        )

    out["backend"] = backend



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

    render["backend"] = print_req.get("backend", "cpu")

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

                    # Denoise: enforced when true via BilateralDenoiser in render-scene.

                    "denoise": print_req["denoise"],

                    "softPenumbra": print_req["softPenumbra"],

                    "penumbraLightSamples": print_req["penumbraLightSamples"],

                    "printQuality": print_req.get("quality", "print_hq"),

                    "printBackend": print_req.get("backend", "cpu"),

                },

            }

        )

        spec["output"] = out

        body["payload"]["sceneSpecification"] = spec

    return body


