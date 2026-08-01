"""GMI Cloud image generation via GenBlaze SDK (optional dependency).

Status: **partial** — wired when ``genblaze-gmicloud`` is installed and
``GMI_API_KEY`` is set. Pre-render / live fan-out use this path for hackathon
credits; hfspace remains the free fallback (see ``provider_cascade``).

Env:
  - ``GMI_API_KEY`` (required for live)
  - ``GMI_BASE_URL`` (optional queue endpoint override — never the /v1 chat URL)
  - ``GENBLAZE_GMI_IMAGE_MODEL`` (default ``seedream-5.0-lite``)
"""

from __future__ import annotations

import logging
import uuid
from dataclasses import asdict, dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from urllib.request import urlopen

logger = logging.getLogger(__name__)

GMI_PROVIDER_ID = "gmicloud-genblaze"
GMI_DEFAULT_MODEL = "seedream-5.0-lite"


class GmiNotConfiguredError(RuntimeError):
    """Missing key or optional package."""


class GmiError(RuntimeError):
    """Upstream / SDK failure."""


def _utc_now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


def gmi_sdk_available() -> bool:
    try:
        import genblaze_gmicloud  # noqa: F401
        from genblaze_core import Modality, Pipeline  # noqa: F401

        return True
    except ImportError:
        return False


def gmi_availability(settings: Any) -> dict[str, Any]:
    """Cheap /health disclosure — no network."""
    key = bool(getattr(settings, "gmi_api_key", None))
    sdk = gmi_sdk_available()
    model = getattr(settings, "gmi_image_model", None) or GMI_DEFAULT_MODEL
    return {
        "available": key and sdk,
        "configured": key,
        "sdk_installed": sdk,
        "provider": GMI_PROVIDER_ID,
        "model": model,
        "env_vars": ["GMI_API_KEY", "GMI_BASE_URL", "GENBLAZE_GMI_IMAGE_MODEL"],
        "status": "partial" if key and sdk else "declared",
        "note": (
            "Hackathon fan-out primary via genblaze-gmicloud. "
            "Install: pip install genblaze-gmicloud. "
            "Credits: GMI Cloud free tier for eligible Devpost participants."
        ),
    }


@dataclass
class GmiGenerateResult:
    run_id: str
    prompt: str
    model: str
    provider: str
    status: str
    asset_sha256: str | None
    image_bytes: bytes | None
    created_at: str
    detail: str | None = None
    source: str = "live-generate"

    def to_dict(self) -> dict[str, Any]:
        d = asdict(self)
        d.pop("image_bytes", None)
        return d


def generate_image_gmi(
    settings: Any,
    prompt: str,
    *,
    model: str | None = None,
    timeout: float = 180.0,
) -> GmiGenerateResult:
    """Text→image via ``GMICloudImageProvider`` (live credits)."""
    api_key = getattr(settings, "gmi_api_key", None)
    if not api_key:
        raise GmiNotConfiguredError(
            "GMI_API_KEY is not set. Obtain hackathon credits at "
            "https://console.gmicloud.ai/ and export GMI_API_KEY."
        )
    if not gmi_sdk_available():
        raise GmiNotConfiguredError(
            "genblaze-gmicloud is not installed. "
            "Run: pip install genblaze-gmicloud (in the genblaze-media venv)."
        )

    from genblaze_core import Modality, Pipeline
    from genblaze_gmicloud import GMICloudImageProvider

    resolved_model = (
        model
        or getattr(settings, "gmi_image_model", None)
        or GMI_DEFAULT_MODEL
    )
    run_id = str(uuid.uuid4())
    created_at = _utc_now()

    provider_kwargs: dict[str, Any] = {"api_key": api_key}
    base_url = getattr(settings, "gmi_base_url", None)
    if base_url:
        provider_kwargs["base_url"] = base_url

    try:
        run, _manifest = (
            Pipeline(f"mrs-gmi-{run_id[:8]}")
            .step(
                GMICloudImageProvider(**provider_kwargs),
                model=resolved_model,
                prompt=prompt,
                modality=Modality.IMAGE,
            )
            .run(timeout=timeout)
        )
    except Exception as exc:  # noqa: BLE001
        raise GmiError(f"GMI Cloud generate failed: {exc}") from exc

    if not run.steps:
        raise GmiError("GMI Cloud returned no steps")
    step = run.steps[0]
    if getattr(step, "status", None) not in (None, "succeeded", "ok", "success"):
        err = getattr(step, "error", None) or getattr(step, "error_code", None)
        raise GmiError(f"GMI Cloud step failed: {err or step.status}")
    assets = getattr(step, "assets", None) or []
    if not assets:
        raise GmiError("GMI Cloud step succeeded but returned no assets")

    asset = assets[0]
    url = getattr(asset, "url", None)
    digest = getattr(asset, "sha256", None)
    image_bytes: bytes | None = None
    local_path = getattr(asset, "path", None) or getattr(asset, "local_path", None)
    if local_path and Path(str(local_path)).is_file():
        image_bytes = Path(str(local_path)).read_bytes()
    elif url:
        try:
            with urlopen(url, timeout=min(120.0, timeout)) as resp:  # noqa: S310
                image_bytes = resp.read()
        except Exception as exc:  # noqa: BLE001
            raise GmiError(f"Failed to download GMI asset: {exc}") from exc
    if not image_bytes:
        raise GmiError("GMI Cloud asset had no fetchable bytes")

    import hashlib

    computed = hashlib.sha256(image_bytes).hexdigest()
    if digest and digest != computed:
        logger.warning("GMI asset sha mismatch (manifest %s vs bytes %s)", digest, computed)

    return GmiGenerateResult(
        run_id=run_id,
        prompt=prompt,
        model=resolved_model,
        provider=GMI_PROVIDER_ID,
        status="ok",
        asset_sha256=computed,
        image_bytes=image_bytes,
        created_at=created_at,
        detail="live-generate via GMI Cloud (genblaze-gmicloud)",
        source="live-generate",
    )
