"""Structure → polish bridge: img2img diffusion cleanup of RT4D stills.

Drive-G-1 honesty:
    This module applies diffusion-based image editing (img2img) to a prior
    RT4D/generate still. It does **not** claim that MRS rendered the final
    pixel values — the RT4D path tracer provides the structural pass, and the
    AI model refines materials, contrast, and noise.

    The primary backend is fal.ai FLUX image-to-image (FAL_KEY). If NVIDIA
    adds a supported img2img endpoint in the future, this module will attempt
    NVIDIA first with a fal fallback.

    High strength (>0.65) can erase the input structure. For abstract/lattice
    scenes, strength 0.35-0.55 is recommended so geometry stays readable.
"""

from __future__ import annotations

import base64
import hashlib
import logging
import time
import uuid
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any

import httpx

from app.config import APP_DIR, Settings
from app.preview_cache import put_preview

logger = logging.getLogger(__name__)

POLISH_PROVIDER_ID = "fal-flux-img2img"
POLISH_DEFAULT_MODEL = "fal-ai/flux/dev/image-to-image"
POLISH_DEFAULT_STRENGTH = 0.45
POLISH_DEFAULT_NUM_STEPS = 28


class PolishError(Exception):
    """Image polish failed (upstream error, timeout, or invalid response)."""


class PolishNotConfiguredError(PolishError):
    """Polish backend is not configured (missing key or disabled)."""


@dataclass
class PolishResult:
    run_id: str
    structure_run_id: str
    structure_sha256: str
    prompt: str
    model: str
    provider: str
    strength: float
    status: str
    asset_sha256: str
    preview_url: str | None
    created_at: str
    detail: str | None = None

    def to_dict(self) -> dict[str, Any]:
        return {
            "run_id": self.run_id,
            "structure_run_id": self.structure_run_id,
            "structure_sha256": self.structure_sha256,
            "prompt": self.prompt,
            "model": self.model,
            "provider": self.provider,
            "strength": self.strength,
            "status": self.status,
            "asset_sha256": self.asset_sha256,
            "preview_url": self.preview_url,
            "created_at": self.created_at,
            "img2img": True,
            "detail": self.detail,
            "manifest": {
                "structure_run_id": self.structure_run_id,
                "structure_sha256": self.structure_sha256,
                "polish_provider": self.provider,
                "polish_model": self.model,
                "img2img": True,
            },
        }


def _utc_now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


def _sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def _fal_img2img(
    api_key: str,
    image_bytes: bytes,
    prompt: str,
    strength: float = POLISH_DEFAULT_STRENGTH,
    model: str = POLISH_DEFAULT_MODEL,
    num_inference_steps: int = POLISH_DEFAULT_NUM_STEPS,
    seed: int | None = None,
    timeout: float = 120.0,
) -> bytes:
    """Call fal.ai FLUX image-to-image endpoint.

    Args:
        api_key: FAL_KEY (``Key <key>`` auth header).
        image_bytes: Input PNG bytes (the structure still).
        prompt: Polish / refine prompt.
        strength: How much to transform (0.0 = identical, 1.0 = fully new).
        model: fal model ID (default fal-ai/flux/dev/image-to-image).
        num_inference_steps: FLUX denoising steps (more = higher quality).
        seed: Optional deterministic seed.
        timeout: HTTP timeout in seconds.

    Returns:
        Output PNG bytes from the img2img model.

    Raises:
        PolishError: on HTTP/transport/decoding failure.
    """
    input_b64 = base64.b64encode(image_bytes).decode("ascii")
    payload: dict[str, Any] = {
        "prompt": prompt,
        "image_url": f"data:image/png;base64,{input_b64}",
        "strength": strength,
        "num_inference_steps": num_inference_steps,
    }
    if seed is not None:
        payload["seed"] = seed

    headers = {
        "Authorization": f"Key {api_key}",
        "Content-Type": "application/json",
        "Accept": "application/json",
    }

    endpoint = f"https://fal.run/{model}"

    def _download(client: httpx.Client, url: str) -> bytes:
        try:
            img_resp = client.get(url)
            img_resp.raise_for_status()
            return img_resp.content
        except httpx.HTTPError as exc:
            raise PolishError(
                f"fal img2img image download failed: {exc}"
            ) from exc

    # Keep one client open for submit + image URL download (closed client → 502).
    try:
        with httpx.Client(timeout=httpx.Timeout(timeout, connect=30.0)) as client:
            resp = client.post(endpoint, json=payload, headers=headers)

            if resp.status_code != 200:
                raise PolishError(
                    f"fal img2img failed HTTP {resp.status_code}: {resp.text[:500]}"
                )

            try:
                body = resp.json()
            except ValueError as exc:
                raise PolishError(
                    f"fal img2img response is not JSON: {exc}"
                ) from exc

            images = body.get("images") or []
            if not images:
                # Some fal endpoints return image_url directly.
                img_url = body.get("image_url") or body.get("output")
                if isinstance(img_url, str) and img_url.startswith("http"):
                    return _download(client, img_url)
                raise PolishError("fal img2img response has no images")

            img_data = images[0]
            if isinstance(img_data, dict):
                url = img_data.get("url") or ""
                if url and url.startswith("http"):
                    return _download(client, url)
                b64 = img_data.get("content") or img_data.get("base64") or ""
                if b64:
                    return base64.b64decode(b64)

            if isinstance(img_data, str):
                if img_data.startswith("http"):
                    return _download(client, img_data)
                return base64.b64decode(img_data)

            raise PolishError(
                "fal img2img response format not recognised (no decodable image)"
            )
    except PolishError:
        raise
    except httpx.HTTPError as exc:
        raise PolishError(f"fal img2img transport error: {exc}") from exc


def _try_nvidia_img2img(
    api_key: str,
    image_bytes: bytes,
    prompt: str,
    strength: float = POLISH_DEFAULT_STRENGTH,
    model: str = "black-forest-labs/flux.1-schnell",
    timeout: float = 60.0,
) -> bytes | None:
    """Attempt NVIDIA NIM FLUX img2img (if endpoint supports it).

    Returns image bytes on success, None if the endpoint rejects img2img payload
    (T2I-only mode), raises PolishError on transport/HTTP failure.

    NVIDIA FLUX NIM does not consistently support the ``image`` parameter.
    This is a best-effort probe; callers should fall back to fal.
    """
    input_b64 = base64.b64encode(image_bytes).decode("ascii")
    payload: dict[str, Any] = {
        "prompt": prompt,
        "image": input_b64,
        "strength": strength,
        "width": 1024,
        "height": 1024,
        "num_inference_steps": 4,
    }

    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
        "Accept": "application/json",
    }

    endpoint = f"https://ai.api.nvidia.com/v1/genai/{model}"

    try:
        with httpx.Client(timeout=httpx.Timeout(timeout, connect=30.0)) as client:
            resp = client.post(endpoint, json=payload, headers=headers)
    except httpx.HTTPError as exc:
        raise PolishError(f"NVIDIA img2img transport error: {exc}") from exc

    if resp.status_code in (400, 422):
        logger.info(
            "NVIDIA NIM %s rejected img2img payload (%s); endpoint is T2I-only",
            model,
            resp.status_code,
        )
        return None

    if resp.status_code != 200:
        raise PolishError(
            f"NVIDIA img2img failed HTTP {resp.status_code}: {resp.text[:500]}"
        )

    try:
        body = resp.json()
    except ValueError as exc:
        raise PolishError(f"NVIDIA img2img response not JSON: {exc}") from exc

    artifacts = body.get("artifacts") or []
    if not artifacts:
        return None

    b64_out = artifacts[0].get("base64") if isinstance(artifacts[0], dict) else None
    if b64_out:
        return base64.b64decode(b64_out)

    return None


def polish_image(
    settings: Settings,
    image_bytes: bytes,
    prompt: str,
    *,
    structure_run_id: str | None = None,
    structure_sha256: str | None = None,
    strength: float | None = None,
    quality: str | None = None,
) -> PolishResult:
    """Run img2img polish on the given structure still bytes.

    Tries NVIDIA NIM FLUX img2img first (if configured and if the endpoint
    supports it), then falls back to fal.ai FLUX img2img (if FAL_KEY set).

    Args:
        settings: App settings.
        image_bytes: Input PNG bytes (structure still).
        prompt: Polish / refine prompt.
        structure_run_id: Prior generate/RT4D run_id (for provenance).
        structure_sha256: SHA-256 of the input image (for provenance).
        strength: Img2img strength (0.0-1.0). Default from env/settings.
        quality: Render quality hint (not used directly, reserved).

    Returns:
        PolishResult with output metadata.

    Raises:
        PolishNotConfiguredError: No img2img provider is configured.
        PolishError: Upstream failure.
    """
    if not settings.polish_enabled:
        raise PolishNotConfiguredError(
            "Image polish is disabled (GENBLAZE_POLISH_ENABLED=0 or unset). "
            "Set GENBLAZE_POLISH_ENABLED=1 and configure a provider (FAL_KEY)."
        )

    resolved_strength = (
        float(strength) if strength is not None else settings.polish_default_strength
    )
    resolved_strength = max(0.0, min(1.0, resolved_strength))

    resolved_sha256 = structure_sha256 or _sha256(image_bytes)
    run_id = str(uuid.uuid4())
    created_at = _utc_now()

    polished_bytes: bytes | None = None
    provider_used: str | None = None
    model_used: str | None = None

    # Try NVIDIA first if API key is configured and polish_backend allows it.
    if settings.polish_backend in ("nvidia", "auto") and settings.nvidia_configured:
        try:
            logger.info("Attempting NVIDIA NIM img2img polish...")
            nvidia_result = _try_nvidia_img2img(
                settings.nvidia_api_key,
                image_bytes,
                prompt,
                strength=resolved_strength,
            )
            if nvidia_result is not None:
                polished_bytes = nvidia_result
                provider_used = "nvidia-nim-img2img"
                model_used = settings.polish_model or "black-forest-labs/flux.1-schnell"
                logger.info("NVIDIA NIM img2img succeeded")
        except PolishError:
            logger.warning("NVIDIA NIM img2img failed; will try fallback")

    # Try fal.ai if NVIDIA didn't work and if configured.
    if polished_bytes is None and settings.polish_backend in ("fal", "auto"):
        if not settings.fal_api_key:
            if settings.polish_backend == "fal":
                raise PolishNotConfiguredError(
                    "Polish backend is 'fal' but FAL_KEY is not configured."
                )
        else:
            try:
                logger.info("Attempting fal.ai FLUX img2img polish...")
                model = settings.polish_model or POLISH_DEFAULT_MODEL
                fal_seed = (
                    int(hashlib.sha256((prompt + run_id).encode()).hexdigest()[:8], 16)
                    & 0xFFFFFFFF
                )
                polished_bytes = _fal_img2img(
                    settings.fal_api_key,
                    image_bytes,
                    prompt,
                    strength=resolved_strength,
                    model=model,
                    seed=fal_seed,
                )
                provider_used = POLISH_PROVIDER_ID
                model_used = model
                logger.info("fal.ai FLUX img2img succeeded")
            except PolishError:
                raise

    if polished_bytes is None:
        if settings.polish_backend == "nvidia":
            raise PolishError(
                "NVIDIA img2img did not return a result "
                "(endpoint may be T2I-only). "
                "Set GENBLAZE_POLISH_BACKEND=fal and configure FAL_KEY."
            )
        raise PolishNotConfiguredError(
            "No img2img provider available. "
            "Configure FAL_KEY (or NVIDIA_API_KEY if NIM supports img2img on your key) "
            "and set GENBLAZE_POLISH_ENABLED=1."
        )

    polished_sha256 = _sha256(polished_bytes)

    # Cache preview locally.
    put_preview(APP_DIR, run_id, polished_bytes)

    return PolishResult(
        run_id=run_id,
        structure_run_id=structure_run_id or "",
        structure_sha256=resolved_sha256,
        prompt=prompt,
        model=model_used or "",
        provider=provider_used or "",
        strength=resolved_strength,
        status="ok",
        asset_sha256=polished_sha256,
        preview_url=f"/api/preview/{run_id}",
        created_at=created_at,
        detail=(
            f"img2img polish via {provider_used} (strength={resolved_strength}). "
            "Structure pass = MRS RT4D; polish = diffusion edit."
        ),
    )


def polish_availability(settings: Settings) -> dict[str, Any]:
    """Cheap /health disclosure — whether the polish path can work."""
    nvidia_img2img_possible = bool(settings.nvidia_configured)
    fal_img2img_possible = bool(settings.fal_api_key)
    enabled = bool(settings.polish_enabled)
    ready = enabled and (
        (settings.polish_backend == "fal" and fal_img2img_possible)
        or (settings.polish_backend == "nvidia" and nvidia_img2img_possible)
        or (settings.polish_backend == "auto" and (nvidia_img2img_possible or fal_img2img_possible))
    )
    return {
        "available": ready,
        "enabled": enabled,
        "backend": settings.polish_backend,
        "model": settings.polish_model or POLISH_DEFAULT_MODEL,
        "default_strength": settings.polish_default_strength,
        "nvidia_img2img_possible": nvidia_img2img_possible,
        "fal_img2img_possible": fal_img2img_possible,
        "img2img_wired": ready,
        "note": (
            "POST /api/polish-still applies diffusion img2img to a prior "
            "RT4D/generate still. Structure pass = MRS; polish = diffusion edit. "
            "Not geometric reconstruction."
        ),
    }
