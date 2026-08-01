"""B2 demo-cache: pre-rendered frames with honest source labeling.

Status: **partial** — keying, provenance sidecars, and fail-closed miss
behavior are tested; live B2 I/O needs credentials.

Object layout (under ``GENBLAZE_STORAGE_PREFIX``, default ``genblaze-media``)::

    {prefix}/demo-cache/{shot_id}/f{frame:04d}/render.png
    {prefix}/demo-cache/{shot_id}/f{frame:04d}/manifest.json

Source labels (mandatory on API responses):
  - ``b2-cache``            — served from pre-rendered B2 demo-cache frame
  - ``b2-structure-cache``  — served from B2 ``{prefix}/pre-render/structure.png``
  - ``live-generate``       — produced by a live provider call this request
  - ``structure-only``      — cache miss + beauty painters failed / disabled

Dual-path (both under ``GENBLAZE_STORAGE_PREFIX``):
  - ``{prefix}/demo-cache/{shot}/fNNNN/`` — beauty/demo shot frames
  - ``{prefix}/pre-render/`` — structure still + schedule/manifest (failover)
"""

from __future__ import annotations

import hashlib
import json
import logging
import re
from dataclasses import asdict, dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

logger = logging.getLogger(__name__)

SOURCE_B2_CACHE = "b2-cache"
SOURCE_B2_STRUCTURE = "b2-structure-cache"
SOURCE_LIVE_GENERATE = "live-generate"
SOURCE_STRUCTURE_ONLY = "structure-only"

VALID_SOURCES = frozenset(
    {
        SOURCE_B2_CACHE,
        SOURCE_B2_STRUCTURE,
        SOURCE_LIVE_GENERATE,
        SOURCE_STRUCTURE_ONLY,
    }
)

_SHOT_RE = re.compile(r"^[a-zA-Z0-9][a-zA-Z0-9._-]{0,63}$")


def _utc_now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


def sha256_bytes(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def normalize_shot_id(shot_id: str) -> str:
    s = (shot_id or "").strip()
    if not s or not _SHOT_RE.match(s):
        raise ValueError(
            "shot_id must be 1–64 chars: alphanumeric start, then [A-Za-z0-9._-]"
        )
    return s


def cache_frame_key(
    storage_prefix: str,
    shot_id: str,
    frame: int,
    *,
    filename: str = "render.png",
) -> str:
    """Stable B2 object key for a demo-cache frame asset."""
    shot = normalize_shot_id(shot_id)
    if frame < 0 or frame > 9999:
        raise ValueError("frame must be in 0..9999")
    prefix = (storage_prefix or "genblaze-media").strip().strip("/")
    return f"{prefix}/demo-cache/{shot}/f{frame:04d}/{filename}"


def cache_manifest_key(storage_prefix: str, shot_id: str, frame: int) -> str:
    return cache_frame_key(storage_prefix, shot_id, frame, filename="manifest.json")


def cache_lookup_key(shot_id: str, frame: int, prompt: str | None = None) -> str:
    """Logical cache id (not the B2 path). Includes optional prompt hash."""
    shot = normalize_shot_id(shot_id)
    base = f"{shot}:f{int(frame):04d}"
    if prompt and prompt.strip():
        ph = hashlib.sha256(prompt.strip().encode("utf-8")).hexdigest()[:12]
        return f"{base}:p{ph}"
    return base


@dataclass
class FrameProvenance:
    """Sidecar written next to each pre-rendered / served frame."""

    schema_version: str = "1.0"
    kind: str = "genblaze-demo-cache-frame"
    source: str = SOURCE_LIVE_GENERATE
    intent_id: str | None = None
    world_id: str | None = None
    timeline_id: str | None = None
    time_seconds: float | None = None
    parameters: dict[str, Any] = field(default_factory=dict)
    anime_world_profile_id: str | None = None
    provider: str | None = None
    model: str | None = None
    shot_id: str | None = None
    frame: int | None = None
    asset_sha256: str | None = None
    asset_key: str | None = None
    manifest_key: str | None = None
    prompt: str | None = None
    created_at: str | None = None
    detail: str | None = None

    def __post_init__(self) -> None:
        if self.source not in VALID_SOURCES:
            raise ValueError(f"invalid source label: {self.source!r}")
        if self.created_at is None:
            self.created_at = _utc_now()

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)

    def to_json_bytes(self) -> bytes:
        return json.dumps(self.to_dict(), indent=2, sort_keys=True).encode("utf-8")


def build_frame_provenance(
    *,
    source: str,
    shot_id: str,
    frame: int,
    asset_sha256: str,
    storage_prefix: str,
    provider: str | None = None,
    model: str | None = None,
    prompt: str | None = None,
    intent_id: str | None = None,
    world_id: str | None = None,
    timeline_id: str | None = None,
    time_seconds: float | None = None,
    parameters: dict[str, Any] | None = None,
    anime_world_profile_id: str | None = None,
    detail: str | None = None,
) -> FrameProvenance:
    asset_key = cache_frame_key(storage_prefix, shot_id, frame)
    return FrameProvenance(
        source=source,
        intent_id=intent_id or f"demo-cache:{normalize_shot_id(shot_id)}:f{frame:04d}",
        world_id=world_id or f"world:demo-cache:{normalize_shot_id(shot_id)}",
        timeline_id=timeline_id or f"timeline:demo-cache:{normalize_shot_id(shot_id)}",
        time_seconds=time_seconds if time_seconds is not None else float(frame),
        parameters=parameters or {"shot_id": shot_id, "frame": frame},
        anime_world_profile_id=anime_world_profile_id,
        provider=provider,
        model=model,
        shot_id=normalize_shot_id(shot_id),
        frame=int(frame),
        asset_sha256=asset_sha256,
        asset_key=asset_key,
        manifest_key=cache_manifest_key(storage_prefix, shot_id, frame),
        prompt=prompt,
        detail=detail,
    )


def claim_label(source: str) -> str:
    """Human-readable honesty string for UI / Devpost."""
    if source == SOURCE_B2_CACHE:
        return "Cached beauty from B2 demo-cache — not a live generate"
    if source == SOURCE_B2_STRUCTURE:
        return (
            "Cached structure still from B2 pre-render/ — not live beauty; "
            "painters failed or skipped"
        )
    if source == SOURCE_LIVE_GENERATE:
        return "Live generate this request"
    if source == SOURCE_STRUCTURE_ONLY:
        return "Structure-only (cache miss and/or painters unavailable)"
    raise ValueError(f"unknown source: {source!r}")


def demo_cache_enabled(settings: Any, request_flag: bool | None = None) -> bool:
    """Env ``GENBLAZE_DEMO_CACHE=1`` or request ``demo_cache=true``."""
    if request_flag is True:
        return True
    if request_flag is False:
        return False
    return bool(getattr(settings, "demo_cache_enabled", False))


def write_local_sidecars(
    out_dir: Path,
    image_bytes: bytes,
    provenance: FrameProvenance,
) -> dict[str, Path]:
    """Write ``render.png`` + ``manifest.json`` under a local frame directory."""
    out_dir.mkdir(parents=True, exist_ok=True)
    png_path = out_dir / "render.png"
    man_path = out_dir / "manifest.json"
    png_path.write_bytes(image_bytes)
    man_path.write_bytes(provenance.to_json_bytes())
    return {"render": png_path, "manifest": man_path}


def upload_frame_to_b2(
    settings: Any,
    image_bytes: bytes,
    provenance: FrameProvenance,
) -> dict[str, Any]:
    """Upload PNG + manifest JSON to B2. Requires B2 credentials."""
    from app.pipeline import build_backend

    if not getattr(settings, "b2_configured", False):
        raise RuntimeError(
            "B2 credentials incomplete. Set B2_KEY_ID, B2_APPLICATION_KEY "
            "(or B2_APP_KEY), and B2_BUCKET."
        )
    asset_key = provenance.asset_key or cache_frame_key(
        settings.storage_prefix, provenance.shot_id or "shot", int(provenance.frame or 0)
    )
    manifest_key = provenance.manifest_key or cache_manifest_key(
        settings.storage_prefix, provenance.shot_id or "shot", int(provenance.frame or 0)
    )
    backend = build_backend(settings)
    try:
        backend.put_bytes(asset_key, image_bytes, content_type="image/png")
        backend.put_bytes(
            manifest_key,
            provenance.to_json_bytes(),
            content_type="application/json",
        )
    finally:
        close = getattr(backend, "close", None)
        if callable(close):
            close()
    return {
        "asset_key": asset_key,
        "manifest_key": manifest_key,
        "asset_sha256": provenance.asset_sha256,
        "source": provenance.source,
    }


def fetch_frame_from_b2(
    settings: Any,
    shot_id: str,
    frame: int,
) -> tuple[bytes, FrameProvenance] | None:
    """Download cached frame + manifest. Returns None on miss."""
    from app.pipeline import build_backend

    if not getattr(settings, "b2_configured", False):
        logger.info("demo_cache: B2 not configured; cache miss")
        return None

    asset_key = cache_frame_key(settings.storage_prefix, shot_id, frame)
    manifest_key = cache_manifest_key(settings.storage_prefix, shot_id, frame)
    backend = build_backend(settings)
    try:
        get_bytes = getattr(backend, "get_bytes", None) or getattr(backend, "download_bytes", None)
        if get_bytes is None:
            # genblaze-s3 S3StorageBackend exposes get_object / read patterns
            client = getattr(backend, "_client", None) or getattr(backend, "client", None)
            if client is None:
                logger.warning("demo_cache: backend has no get_bytes; miss")
                return None
            bucket = settings.b2_bucket
            try:
                obj = client.get_object(Bucket=bucket, Key=asset_key)
                image_bytes = obj["Body"].read()
            except Exception as exc:  # noqa: BLE001
                logger.info("demo_cache miss for %s: %s", asset_key, exc)
                return None
            try:
                man_obj = client.get_object(Bucket=bucket, Key=manifest_key)
                man_raw = man_obj["Body"].read()
                man = json.loads(man_raw.decode("utf-8"))
            except Exception:  # noqa: BLE001
                man = {}
        else:
            try:
                image_bytes = get_bytes(asset_key)
            except Exception as exc:  # noqa: BLE001
                logger.info("demo_cache miss for %s: %s", asset_key, exc)
                return None
            try:
                man = json.loads(get_bytes(manifest_key).decode("utf-8"))
            except Exception:  # noqa: BLE001
                man = {}
    finally:
        close = getattr(backend, "close", None)
        if callable(close):
            close()

    digest = sha256_bytes(image_bytes)
    expected = man.get("asset_sha256")
    if expected and expected != digest:
        logger.warning(
            "demo_cache sha mismatch for %s (expected %s got %s)",
            asset_key,
            expected,
            digest,
        )
        return None

    prov = FrameProvenance(
        source=SOURCE_B2_CACHE,
        intent_id=man.get("intent_id") or man.get("intentId"),
        world_id=man.get("world_id") or man.get("worldId"),
        timeline_id=man.get("timeline_id") or man.get("timelineId"),
        time_seconds=man.get("time_seconds") or man.get("timeSeconds"),
        parameters=man.get("parameters") or {},
        anime_world_profile_id=man.get("anime_world_profile_id"),
        provider=man.get("provider"),
        model=man.get("model"),
        shot_id=normalize_shot_id(shot_id),
        frame=int(frame),
        asset_sha256=digest,
        asset_key=asset_key,
        manifest_key=manifest_key,
        prompt=man.get("prompt"),
        detail=claim_label(SOURCE_B2_CACHE),
    )
    return image_bytes, prov


def structure_only_response(
    *,
    shot_id: str | None,
    frame: int | None,
    detail: str,
) -> dict[str, Any]:
    """Fail-closed payload when cache miss and painters fail."""
    return {
        "status": "structure-only",
        "source": SOURCE_STRUCTURE_ONLY,
        "source_label": claim_label(SOURCE_STRUCTURE_ONLY),
        "shot_id": shot_id,
        "frame": frame,
        "detail": detail,
        "beauty": False,
    }
