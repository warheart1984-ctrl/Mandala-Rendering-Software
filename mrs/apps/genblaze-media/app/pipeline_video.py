"""Genblaze/NIM Cosmos text-to-video path (CMM-NIM-Cosmos).

Parallel to the FLUX stills pipeline. No Story Forge lineage — Genblaze
``NvidiaVideoProvider`` + B2 provenance manifest only.

Status (Drive-G-1): operator video path **prepared**; JCR/CEL/Arena are
**declared** in docs, not enforced here.
"""

from __future__ import annotations

import hashlib
import json
import logging
import shutil
import uuid
from dataclasses import asdict, dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from app.config import APP_DIR, NVIDIA_SETUP_HELP, SEEDANCE_SETUP_HELP, Settings
from app.pipeline import (
    GenerationQualityError,
    _best_effort_delete_keys,
    _extract_asset_key,
    _nvidia_output_dir,
    _presign_preview,
    _read_backend_object_bytes,
    _reraise_with_transfer_cause,
    _wrap_asset_transfer,
    build_backend,
)
from app.preview_cache import put_preview
from app.prompt_sanitize import sanitize_prompt

logger = logging.getLogger(__name__)

# Minimal ISO BMFF with ftyp+mdat so dry-run writes a recognizable .mp4.
# Not a cinematic clip — offline tests / GENBLAZE_DRY_RUN only.
_MINIMAL_MP4 = bytes.fromhex(
    "000000186674797069736f6d0000020069736f6d69736f32000000000866726565"
    "000000286d64617400000000000000000000000000000000000000000000000000"
)


@dataclass
class VideoGenerateResult:
    run_id: str
    prompt: str
    model: str
    provider: str
    status: str
    asset_key: str | None
    manifest_key: str | None
    asset_sha256: str | None
    preview_url: str | None
    created_at: str
    dry_run: bool
    modality: str = "video"
    detail: str | None = None
    quality: dict[str, Any] | None = None
    # Optional — set only when Cosmos/provider payload reports them (never invent).
    duration_seconds: float | None = None
    resolution: str | None = None
    # Declared CMM identity (docs map CER fields → these keys).
    cmm_id: str = "CMM-NIM-Cosmos-v1.0"
    domain_id: str = "CH-GNMD-v1.0"

    def to_dict(self) -> dict[str, Any]:
        d = asdict(self)
        # Omit unknowns so index/UI do not imply fabricated timing or size.
        if d.get("duration_seconds") is None:
            d.pop("duration_seconds", None)
        if d.get("resolution") is None:
            d.pop("resolution", None)
        return d


def _extract_optional_video_meta(step: Any) -> tuple[float | None, str | None]:
    """Pull duration_seconds / resolution from provider payload when present.

    Never invents values — returns ``(None, None)`` when Cosmos/Genblaze omit them.
    """
    payload = getattr(step, "provider_payload", None)
    if not isinstance(payload, dict):
        return None, None

    duration: float | None = None
    for key in ("duration_seconds", "duration", "video_duration", "clip_duration"):
        raw = payload.get(key)
        if raw is None:
            continue
        try:
            duration = float(raw)
            if duration <= 0:
                duration = None
            break
        except (TypeError, ValueError):
            continue

    resolution: str | None = None
    for key in ("resolution", "video_resolution"):
        raw = payload.get(key)
        if isinstance(raw, str) and raw.strip():
            resolution = raw.strip()
            break
    if resolution is None:
        w, h = payload.get("width"), payload.get("height")
        if (
            isinstance(w, (int, float))
            and isinstance(h, (int, float))
            and int(w) > 0
            and int(h) > 0
        ):
            resolution = f"{int(w)}x{int(h)}"

    # Some NIM envelopes nest clip meta under artifacts[0].
    artifacts = payload.get("artifacts")
    if isinstance(artifacts, list) and artifacts:
        a0 = artifacts[0]
        if isinstance(a0, dict):
            if duration is None:
                for key in ("duration_seconds", "duration"):
                    raw = a0.get(key)
                    if raw is None:
                        continue
                    try:
                        duration = float(raw)
                        if duration <= 0:
                            duration = None
                        break
                    except (TypeError, ValueError):
                        continue
            if resolution is None:
                r = a0.get("resolution")
                if isinstance(r, str) and r.strip():
                    resolution = r.strip()
                else:
                    w, h = a0.get("width"), a0.get("height")
                    if (
                        isinstance(w, (int, float))
                        and isinstance(h, (int, float))
                        and int(w) > 0
                        and int(h) > 0
                    ):
                        resolution = f"{int(w)}x{int(h)}"

    return duration, resolution


def _utc_now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


def _attach_local_video_preview(
    gen: VideoGenerateResult, video_bytes: bytes | None
) -> None:
    """Cache mp4 bytes locally; do not overwrite stored cloud preview_url."""
    if not video_bytes or not gen.run_id:
        return
    if put_preview(APP_DIR, gen.run_id, video_bytes):
        note = "local preview cache (UI avoids B2 download)"
        if note not in (gen.detail or ""):
            gen.detail = (gen.detail + " · " if gen.detail else "") + note


def _read_local_video_bytes(output_dir: Path) -> bytes | None:
    if not output_dir.is_dir():
        return None
    candidates = sorted(
        [
            p
            for p in output_dir.iterdir()
            if p.is_file() and p.suffix.lower() in {".mp4", ".webm", ".mov"}
        ],
        key=lambda p: p.stat().st_mtime,
        reverse=True,
    )
    if not candidates:
        # Some NIM paths write without extension — pick largest non-tiny file.
        others = sorted(
            [p for p in output_dir.iterdir() if p.is_file() and p.stat().st_size > 64],
            key=lambda p: p.stat().st_size,
            reverse=True,
        )
        candidates = others[:1]
    if not candidates:
        return None
    return candidates[0].read_bytes()


def assess_video_bytes(data: bytes) -> dict[str, Any]:
    """Basic non-empty / container check (not cinematic quality scoring)."""
    ok = False
    reason = "empty"
    fmt = None
    if data and len(data) >= 8:
        if data[4:8] == b"ftyp":
            ok = True
            fmt = "mp4"
            reason = "ok"
        elif data[:4] == b"\x1aE\xdf\xa3":
            ok = True
            fmt = "webm"
            reason = "ok"
        elif len(data) > 1024:
            # Opaque payload large enough to be a clip from an unknown container.
            ok = True
            fmt = "unknown"
            reason = "ok-opaque"
        else:
            reason = "unrecognized or too small for a video asset"
    return {
        "ok": ok,
        "byte_len": len(data) if data else 0,
        "format": fmt,
        "reason": reason,
    }


def _validate_video_model(provider: Any, model: str) -> None:
    """Refresh the provider's real upstream probe before generation."""
    validation = provider.validate_model(model, refresh=True)
    if not validation.is_terminal_failure:
        return
    detail = f" ({validation.detail})" if validation.detail else ""
    raise RuntimeError(
        f"Video model {model!r} not found in upstream catalog{detail}. "
        "Set GENBLAZE_VIDEO_MODEL to an upstream-valid Cosmos 1.0 slug."
    )


def generate_video(settings: Settings, prompt: str) -> VideoGenerateResult:
    """Run video backend (NVIDIA Cosmos or Seedance) and persist assets + manifest."""
    raw = (prompt or "").strip()
    if not raw:
        raise ValueError("prompt is required")
    if not settings.video_enabled:
        raise RuntimeError(
            "Video path disabled (GENBLAZE_VIDEO_ENABLED=0). "
            "Re-enable to use /api/generate-video "
            "(GENBLAZE_VIDEO_BACKEND=nvidia|seedance)."
        )

    cleaned = sanitize_prompt(raw)
    if not cleaned:
        raise ValueError(
            "prompt is empty after removing trailing commentary. Describe the scene only."
        )

    created_at = _utc_now()
    run_id = str(uuid.uuid4())

    if settings.dry_run:
        return _dry_run_video(settings, cleaned, run_id, created_at)

    if settings.video_backend == "seedance":
        return _generate_seedance_video(settings, cleaned, raw, created_at, run_id)

    if not settings.nvidia_configured:
        raise RuntimeError(NVIDIA_SETUP_HELP)

    from app.nvidia_http import NvidiaVideoTimeouts, build_nvidia_genai_client

    timeouts = NvidiaVideoTimeouts.from_env()
    http_client = build_nvidia_genai_client(settings.nvidia_api_key or "", timeouts)
    output_dir = _nvidia_output_dir()

    try:
        gen, video_bytes = _run_live_video(
            settings=settings,
            prompt=cleaned,
            timeouts=timeouts,
            http_client=http_client,
            output_dir=output_dir,
        )
        gen.created_at = created_at
        if cleaned != raw:
            gen.detail = (gen.detail + " · " if gen.detail else "") + (
                "prompt sanitized (meta-commentary stripped)"
            )

        if video_bytes is None:
            gen.detail = (gen.detail + " · " if gen.detail else "") + (
                "video quality check skipped (bytes unavailable after transfer)"
            )
            return gen

        assessment = assess_video_bytes(video_bytes)
        gen.quality = assessment
        if not assessment["ok"]:
            # Mirror image pipeline: do not leave rejected mp4/manifest in B2.
            _best_effort_delete_keys(settings, gen.asset_key, gen.manifest_key)
            raise GenerationQualityError(
                assessment.get("reason")
                or "NVIDIA returned an unusable video asset."
            )
        _attach_local_video_preview(gen, video_bytes)
        return gen
    finally:
        http_client.close()
        shutil.rmtree(output_dir, ignore_errors=True)


def _generate_seedance_video(
    settings: Settings,
    cleaned: str,
    raw: str,
    created_at: str,
    run_id: str,
) -> VideoGenerateResult:
    """Cloud Seedance 2.0 path (fal gateway). Status: partial."""
    if not settings.seedance_configured:
        raise RuntimeError(SEEDANCE_SETUP_HELP)

    from app.seedance_provider import SeedanceVideoProvider

    provider = SeedanceVideoProvider(
        settings.fal_api_key or "",
        model_id=settings.seedance_model,
        resolution=settings.seedance_resolution,
        duration=settings.seedance_duration,
        aspect_ratio=settings.seedance_aspect_ratio,
        generate_audio=settings.seedance_generate_audio,
        watermark=settings.seedance_watermark,
    )
    try:
        result = provider.generate(cleaned)
    finally:
        provider.close()

    assessment = assess_video_bytes(result.video_bytes)
    if not assessment["ok"]:
        raise GenerationQualityError(
            assessment.get("reason") or "Seedance returned an unusable video asset."
        )

    asset_key = f"{settings.storage_prefix}/seedance/{run_id}/concept.mp4"
    manifest_key = f"{settings.storage_prefix}/seedance/{run_id}/manifest.json"
    prompt_sha = result.prompt_sha256
    manifest = {
        "schema": "mrs-genblaze-media-video-seedance",
        "cmm_id": "CMM-Seedance-v1.0",
        "domain_id": "CH-GNMD-v1.0",
        "run_id": run_id,
        "prompt": cleaned,
        "prompt_sha256": prompt_sha,
        "model": result.model_id,
        "provider": result.provider,
        "provider_request_id": result.provider_request_id,
        "modality": "video",
        "asset_sha256": result.asset_sha256,
        "seed": result.seed,
        "resolution": result.resolution,
        "duration": result.duration,
        "gateway": result.gateway,
        "replay_class": "provider-contract",
        "evidence": result.evidence(),
        "created_at": created_at,
        "lineage": "new-work-no-story-forge",
        "temporal_layers": "declared-not-implemented",
    }

    preview_url: str | None = None
    if settings.b2_configured:
        backend = build_backend(settings)
        try:
            backend.put(asset_key, result.video_bytes, content_type="video/mp4")
            backend.put(
                manifest_key,
                json.dumps(manifest, indent=2).encode("utf-8"),
                content_type="application/json",
            )
            preview_url = _presign_preview(backend, settings, asset_key, None)
        finally:
            close = getattr(backend, "close", None)
            if callable(close):
                close()
    else:
        preview_url = result.video_url

    detail = "CMM-Seedance-v1.0 substrate (fal cloud video)"
    if cleaned != raw:
        detail += " · prompt sanitized (meta-commentary stripped)"

    gen = VideoGenerateResult(
        run_id=run_id,
        prompt=cleaned,
        model=result.model_id,
        provider=result.provider,
        status="ok",
        asset_key=asset_key if settings.b2_configured else None,
        manifest_key=manifest_key if settings.b2_configured else None,
        asset_sha256=result.asset_sha256,
        preview_url=preview_url,
        created_at=created_at,
        dry_run=False,
        modality="video",
        detail=detail,
        quality=assessment,
        duration_seconds=_safe_float_duration(result.duration),
        resolution=result.resolution,
        cmm_id="CMM-Seedance-v1.0",
    )
    _attach_local_video_preview(gen, result.video_bytes)
    return gen


def _safe_float_duration(raw: str) -> float | None:
    try:
        value = float(raw)
    except (TypeError, ValueError):
        return None
    return value if value > 0 else None


def _run_live_video(
    *,
    settings: Settings,
    prompt: str,
    timeouts: Any,
    http_client: Any,
    output_dir: Path,
) -> tuple[VideoGenerateResult, bytes | None]:
    from genblaze_core import KeyStrategy, Modality, ObjectStorageSink, Pipeline
    from genblaze_nvidia import NvidiaVideoProvider

    provider = NvidiaVideoProvider(
        api_key=settings.nvidia_api_key,
        http_timeout=timeouts.http_timeout,
        http_client=http_client,
        output_dir=output_dir,
    )
    _validate_video_model(provider, settings.video_model)
    transfer_failures: list[BaseException] = []
    backend = build_backend(settings)
    try:
        sink = ObjectStorageSink(
            backend,
            prefix=settings.storage_prefix,
            key_strategy=KeyStrategy.HIERARCHICAL,
        )
        transfer = getattr(sink, "_transfer", None)
        if transfer is not None:
            existing = list(getattr(transfer, "_allowed_roots", None) or [])
            transfer._allowed_roots = [*existing, output_dir]  # noqa: SLF001
        get_failures = _wrap_asset_transfer(sink)
        try:
            result = (
                Pipeline("mrs-cmm-nim-cosmos")
                .step(
                    provider,
                    model=settings.video_model,
                    prompt=prompt,
                    modality=Modality.VIDEO,
                )
                .run(sink=sink, timeout=timeouts.pipeline_timeout)
            )
        except Exception as exc:  # noqa: BLE001
            transfer_failures = get_failures()
            if transfer_failures or "asset transfer" in str(exc).lower():
                _reraise_with_transfer_cause(exc, transfer_failures)
            raise

        asset_url = None
        asset_sha = None
        asset_key = None
        duration_seconds: float | None = None
        resolution: str | None = None
        steps = getattr(getattr(result, "run", None), "steps", None) or []
        if steps:
            duration_seconds, resolution = _extract_optional_video_meta(steps[0])
            assets = getattr(steps[0], "assets", None) or []
            if assets:
                a0 = assets[0]
                asset_url = getattr(a0, "url", None)
                asset_sha = getattr(a0, "sha256", None)
                asset_key = _extract_asset_key(asset_url, settings.b2_bucket)
            step_err = getattr(steps[0], "error", None)
            if not assets and step_err:
                raise RuntimeError(f"video generation failed: {step_err}")

        if not asset_key and not asset_url:
            raise RuntimeError(
                "video generation produced no assets (check NVIDIA_API_KEY, "
                "Cosmos model access on the key, and network to ai.api.nvidia.com). "
                "Configured model: "
                f"{settings.video_model}. The optional Cosmos 1.0 fallback is "
                "nvidia/cosmos-1.0-12b-diffusion-text2world."
            )

        manifest = getattr(result, "manifest", None)
        manifest_uri = getattr(manifest, "manifest_uri", None) if manifest else None
        manifest_key = _extract_asset_key(manifest_uri, settings.b2_bucket)

        preview = (
            _presign_preview(backend, settings, asset_key, asset_url)
            if asset_key
            else asset_url
        )

        video_bytes = _read_local_video_bytes(output_dir)
        if video_bytes is None and asset_key:
            video_bytes = _read_backend_object_bytes(backend, asset_key)

        gen = VideoGenerateResult(
            run_id=getattr(getattr(result, "run", None), "run_id", None)
            or str(uuid.uuid4()),
            prompt=prompt,
            model=settings.video_model,
            provider="nvidia-video",
            status="ok",
            asset_key=asset_key,
            manifest_key=manifest_key,
            asset_sha256=asset_sha,
            preview_url=preview,
            created_at=_utc_now(),
            dry_run=False,
            modality="video",
            detail="CMM-NIM-Cosmos substrate (Genblaze NIM video)",
            duration_seconds=duration_seconds,
            resolution=resolution,
        )
        return gen, video_bytes
    finally:
        close = getattr(backend, "close", None)
        if callable(close):
            close()


def _dry_run_video(
    settings: Settings, prompt: str, run_id: str, created_at: str
) -> VideoGenerateResult:
    """Upload a tiny MP4 stub + provenance JSON when GENBLAZE_DRY_RUN=1."""
    mp4 = _MINIMAL_MP4
    sha = hashlib.sha256(mp4).hexdigest()
    prompt_sha = hashlib.sha256(prompt.encode("utf-8")).hexdigest()
    backend = settings.video_backend
    if backend == "seedance":
        model = settings.seedance_model
        provider = "seedance-video"
        cmm_id = "CMM-Seedance-v1.0"
        detail = "dry-run video stub (not live Seedance)"
        schema = "mrs-genblaze-media-video-dry-run-seedance"
        prefix = f"{settings.storage_prefix}/dry-run-seedance/{run_id}"
    else:
        model = settings.video_model
        provider = "nvidia-video"
        cmm_id = "CMM-NIM-Cosmos-v1.0"
        detail = "dry-run video stub (not live NIM Cosmos)"
        schema = "mrs-genblaze-media-video-dry-run"
        prefix = f"{settings.storage_prefix}/dry-run/{run_id}"
    asset_key = f"{prefix}/concept.mp4"
    manifest_key = f"{prefix}/manifest.json"
    manifest = {
        "schema": schema,
        "cmm_id": cmm_id,
        "domain_id": "CH-GNMD-v1.0",
        "run_id": run_id,
        "prompt": prompt,
        "prompt_sha256": prompt_sha,
        "model": model,
        "provider": provider,
        "modality": "video",
        "asset_sha256": sha,
        "created_at": created_at,
        "lineage": "new-work-no-story-forge",
        "replay_class": "provider-contract",
        "temporal_layers": "declared-not-implemented",
        "video_backend": backend,
    }
    preview_url = None
    if settings.b2_configured:
        backend_store = build_backend(settings)
        try:
            backend_store.put(asset_key, mp4, content_type="video/mp4")
            backend_store.put(
                manifest_key,
                json.dumps(manifest, indent=2).encode("utf-8"),
                content_type="application/json",
            )
            preview_url = _presign_preview(backend_store, settings, asset_key, None)
        finally:
            close = getattr(backend_store, "close", None)
            if callable(close):
                close()
    else:
        # Offline unit tests: synthetic cloud URL so index retains non-local fallback.
        preview_url = f"https://example.invalid/dry-run/{run_id}/concept.mp4"

    gen = VideoGenerateResult(
        run_id=run_id,
        prompt=prompt,
        model=model,
        provider=provider,
        status="ok",
        asset_key=asset_key,
        manifest_key=manifest_key,
        asset_sha256=sha,
        preview_url=preview_url,
        created_at=created_at,
        dry_run=True,
        modality="video",
        detail=detail,
        quality=assess_video_bytes(mp4),
        cmm_id=cmm_id,
    )
    _attach_local_video_preview(gen, mp4)
    return gen
