"""Multi-provider polish / beauty failover order for hackathon demos.

Status: **partial** — order and health disclosure are enforced in tests;
live GMI Cloud calls require ``genblaze-gmicloud`` + ``GMI_API_KEY``.

Judge-facing cascade (fan-out primary → free fallback):
  1. ``gmi``     — GMI Cloud via GenBlaze SDK (hackathon credits)
  2. ``fal``     — fal.ai FLUX img2img (optional paid leg)
  3. ``nvidia``  — NVIDIA NIM FLUX img2img (armed when key present)
  4. ``hfspace`` — keyless HF Space FLUX.2-Klein (free fallback)

Honest labeling: callers must surface which leg succeeded; never claim
``live-generate`` beauty when serving ``b2-cache`` frames.
"""

from __future__ import annotations

from typing import Any, Sequence

# Canonical failover order for ``polish_backend=auto`` / demo health probes.
DEFAULT_CASCADE: tuple[str, ...] = ("gmi", "fal", "nvidia", "hfspace")

PROVIDER_ENV: dict[str, tuple[str, ...]] = {
    "gmi": ("GMI_API_KEY", "GMI_BASE_URL"),
    "fal": ("FAL_KEY", "FAL_API_KEY", "SEEDANCE_API_KEY"),
    "nvidia": ("NVIDIA_API_KEY", "NGC_API_KEY", "NVIDIA_NIM_API_KEY"),
    "hfspace": ("GENBLAZE_HFSPACE_URL",),
}


def normalize_cascade(order: Sequence[str] | None = None) -> list[str]:
    """Return a de-duplicated cascade; unknown names are dropped."""
    raw = list(order) if order else list(DEFAULT_CASCADE)
    seen: set[str] = set()
    out: list[str] = []
    for name in raw:
        key = str(name or "").strip().lower()
        if not key or key in seen:
            continue
        if key not in DEFAULT_CASCADE and key not in PROVIDER_ENV:
            continue
        seen.add(key)
        out.append(key)
    return out or list(DEFAULT_CASCADE)


def cascade_for_backend(backend: str) -> list[str]:
    """Map ``GENBLAZE_POLISH_BACKEND`` to an ordered try-list."""
    b = (backend or "auto").strip().lower()
    if b in ("auto", "cascade", "failover"):
        return list(DEFAULT_CASCADE)
    if b in PROVIDER_ENV or b in DEFAULT_CASCADE:
        return [b]
    return list(DEFAULT_CASCADE)


def provider_configured(name: str, settings: Any) -> bool:
    """Cheap credential / URL presence check (no network)."""
    key = (name or "").strip().lower()
    if key == "gmi":
        return bool(getattr(settings, "gmi_configured", False) or getattr(settings, "gmi_api_key", None))
    if key == "fal":
        return bool(getattr(settings, "fal_api_key", None))
    if key == "nvidia":
        return bool(getattr(settings, "nvidia_configured", False))
    if key == "hfspace":
        return bool(getattr(settings, "hfspace_configured", False))
    return False


def cascade_health(settings: Any, *, order: Sequence[str] | None = None) -> dict[str, Any]:
    """``/health`` disclosure for multi-provider failover (no secrets)."""
    cascade = normalize_cascade(order or cascade_for_backend(getattr(settings, "polish_backend", "auto")))
    legs: list[dict[str, Any]] = []
    first_ready: str | None = None
    for name in cascade:
        configured = provider_configured(name, settings)
        if configured and first_ready is None:
            first_ready = name
        legs.append(
            {
                "provider": name,
                "configured": configured,
                "env_vars": list(PROVIDER_ENV.get(name, ())),
                "role": (
                    "primary_fanout"
                    if name == "gmi"
                    else "free_fallback"
                    if name == "hfspace"
                    else "optional"
                ),
            }
        )
    return {
        "cascade": cascade,
        "first_configured": first_ready,
        "legs": legs,
        "status": "partial",
        "note": (
            "GMI Cloud (GenBlaze SDK) is the hackathon fan-out primary; "
            "hfspace is the free fallback. Live calls need credits/keys; "
            "demo_cache serves B2 frames while this probe still runs."
        ),
    }
