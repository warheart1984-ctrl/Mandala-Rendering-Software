"""RT4D still → NVIDIA NIM vision (scene interpretation).

Drive-G-1 honesty:
    No img2img / FLUX enhance endpoint is wired in this app. The only NVIDIA
    path that *uses an existing picture* is NIM vision chat/completions
    (``meta/llama-3.2-11b-vision-instruct`` by default) → SceneSpecification.
    This module builds provenance for that path and classifies NVIDIA-unavailable
    failures without inventing a successful enhance.
"""

from __future__ import annotations

from typing import Any

from app.config import Settings
from app.nvidia_errors import is_empty_nvidia_gateway_504

# Capability id for health / manifests — vision interpret, not diffusion img2img.
RT4D_TO_NVIDIA_CAPABILITY = "nim-vision-image-to-scene"
RT4D_TO_NVIDIA_KIND = "rt4d-to-nvidia-vision"

NVIDIA_UNAVAILABLE_MISSING_KEY = (
    "NVIDIA unavailable: NVIDIA_API_KEY is not configured. "
    "The RT4D still is unchanged; set NVIDIA_API_KEY to interpret it with NIM vision."
)

NVIDIA_UNAVAILABLE_UPSTREAM = (
    "NVIDIA unavailable: NIM vision failed upstream. "
    "The RT4D still remains usable; retry when NVIDIA recovers."
)


class NvidiaUnavailableError(RuntimeError):
    """NIM was required but the key is missing or the upstream call failed."""

    def __init__(
        self,
        message: str,
        *,
        reason: str,
        detail: str | None = None,
    ) -> None:
        super().__init__(message)
        self.reason = reason
        self.detail = detail


def classify_nim_failure(exc: BaseException | str) -> str:
    """Map a NIM exception to a stable reason token (no secrets)."""
    if is_empty_nvidia_gateway_504(exc):
        return "upstream_504"
    text = str(exc).lower()
    if "401" in text or "unauthorized" in text or "403" in text:
        return "upstream_auth"
    if "504" in text or "503" in text or "502" in text:
        return "upstream_5xx"
    return "upstream_error"


def build_rt4d_to_nvidia_request(
    *,
    run_id: str,
    quality: str = "draft",
    render: bool = True,
) -> dict[str, Any]:
    """Validate and normalize the operator request (no network)."""
    rid = (run_id or "").strip()
    if not rid:
        raise ValueError("run_id is required (prior RT4D / generate still)")
    if len(rid) > 64:
        raise ValueError("run_id too long")
    q = (quality or "draft").strip().lower() or "draft"
    if q not in {"draft", "fast", "final", "high"}:
        raise ValueError("quality must be draft/fast or final/high")
    return {
        "run_id": rid,
        "quality": q,
        "render": bool(render),
        "require_nvidia": True,
        "capability": RT4D_TO_NVIDIA_CAPABILITY,
        "kind": RT4D_TO_NVIDIA_KIND,
    }


def build_nvidia_vision_provenance(
    settings: Settings,
    *,
    source_run_id: str,
    image_sha256: str,
    scene_source: str,
    resolve_meta: dict[str, Any] | None = None,
    nim_error: str | None = None,
) -> dict[str, Any]:
    """Provenance block linking the NVIDIA result back to the RT4D still."""
    return {
        "kind": RT4D_TO_NVIDIA_KIND,
        "capability": RT4D_TO_NVIDIA_CAPABILITY,
        "source_run_id": source_run_id,
        "nvidia_model": settings.image_to_scene_model,
        "nvidia_endpoint": settings.image_to_scene_chat_url,
        "image_sha256": image_sha256,
        "scene_source": scene_source,
        "resolve": resolve_meta or {},
        "nim_error": nim_error,
        "note": (
            "NVIDIA NIM vision interpreted the RT4D PNG into a SceneSpecification. "
            "Not img2img enhancement; not geometric reconstruction."
        ),
    }


def rt4d_to_nvidia_availability(settings: Settings) -> dict[str, Any]:
    """Cheap /health disclosure — does not claim img2img."""
    return {
        "available": bool(settings.nvidia_configured),
        "capability": RT4D_TO_NVIDIA_CAPABILITY,
        "kind": RT4D_TO_NVIDIA_KIND,
        "model": settings.image_to_scene_model,
        "endpoint": settings.image_to_scene_chat_url,
        "img2img_wired": False,
        "note": (
            "POST /api/rt4d-to-nvidia sends a prior still (run_id) to NIM vision → "
            "SceneSpecification → optional MRS re-render. No NVIDIA img2img endpoint "
            "is configured in this app. Requires NVIDIA_API_KEY; fails clearly on "
            "missing key or NIM 5xx/504 without replacing the RT4D still."
        ),
    }


def raise_if_nvidia_required_unavailable(
    settings: Settings,
    *,
    nim_error: str | None = None,
    scene_source: str | None = None,
) -> None:
    """Raise when require_nvidia path did not get a real NIM vision result."""
    if not settings.nvidia_configured:
        raise NvidiaUnavailableError(
            NVIDIA_UNAVAILABLE_MISSING_KEY,
            reason="missing_key",
        )
    if scene_source == "nim-vision":
        return
    detail = (nim_error or "NIM vision did not return a valid SceneSpecification")[:500]
    reason = classify_nim_failure(detail)
    raise NvidiaUnavailableError(
        f"{NVIDIA_UNAVAILABLE_UPSTREAM} ({reason}: {detail})",
        reason=reason,
        detail=detail,
    )
