"""Genblaze image pipeline → Backblaze B2 with SHA-256 provenance."""

from __future__ import annotations

import hashlib
import json
import uuid
from dataclasses import asdict, dataclass
from datetime import datetime, timezone
from typing import Any

from app.config import NVIDIA_SETUP_HELP, Settings


@dataclass
class GenerateResult:
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
    detail: str | None = None

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


def _utc_now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


def _extract_asset_key(url_or_key: str | None, bucket: str) -> str | None:
    if not url_or_key:
        return None
    if "://" not in url_or_key:
        return url_or_key.lstrip("/")
    # Strip query (presigned) and common B2/S3 path forms.
    bare = url_or_key.split("?", 1)[0]
    markers = [f"/{bucket}/", f"/{bucket}?"]
    for m in markers:
        if m in bare:
            return bare.split(m, 1)[1]
    # Path-style: .../bucket/key
    parts = bare.split("/")
    if bucket in parts:
        i = parts.index(bucket)
        return "/".join(parts[i + 1 :]) or None
    return bare.rsplit("/", 1)[-1] or None


def build_backend(settings: Settings):
    """Construct genblaze-s3 Backblaze backend (caller should close())."""
    from genblaze_s3 import S3StorageBackend

    if not settings.b2_configured:
        raise RuntimeError(
            "B2 credentials incomplete. Set B2_KEY_ID, B2_APPLICATION_KEY (or B2_APP_KEY), "
            "and B2_BUCKET in repo-root .env."
        )

    kwargs: dict[str, Any] = {
        "region": settings.b2_region,
        "key_id": settings.b2_key_id,
        "app_key": settings.b2_app_key,
        "auto_lifecycle": False,
        # Bucket-scoped B2 application keys often cannot HeadBucket (403).
        # Skip construction-time preflight; mark region verified when the
        # operator supplied an explicit B2_REGION (MRS .env always does).
        "preflight": False,
    }
    backend = S3StorageBackend.for_backblaze(settings.b2_bucket, **kwargs)
    # genblaze-s3 still HeadBucket-checks lazily on first list/put; that fails
    # for many bucket-scoped keys. Trust operator-configured region instead.
    if settings.b2_region:
        backend._region_verified = True  # noqa: SLF001 — intentional B2 key workaround
        backend._preflight_error = None  # noqa: SLF001
    return backend



def probe_b2(settings: Settings) -> dict[str, Any]:
    """List a few objects to prove credentials load (no generation)."""
    backend = build_backend(settings)
    try:
        page = backend.list(prefix=settings.storage_prefix + "/", max_keys=5)
        entries = getattr(page, "entries", None) or []
        keys = []
        for e in entries:
            key = getattr(e, "key", None) or getattr(e, "Key", None) or str(e)
            keys.append(key)
        return {
            "ok": True,
            "bucket": settings.b2_bucket,
            "region": settings.b2_region,
            "prefix": settings.storage_prefix,
            "sample_keys": keys,
            "count_listed": len(keys),
        }
    finally:
        close = getattr(backend, "close", None)
        if callable(close):
            close()


def generate_image(settings: Settings, prompt: str) -> GenerateResult:
    """Run Genblaze NVIDIA image step and persist assets + manifest to B2.

    Live mode requires NVIDIA_API_KEY. Dry-run writes a tiny PNG + manifest only
    when GENBLAZE_DRY_RUN=1 (unit tests / offline demos — not for Devpost live).
    """
    prompt = (prompt or "").strip()
    if not prompt:
        raise ValueError("prompt is required")

    created_at = _utc_now()
    run_id = str(uuid.uuid4())

    if settings.dry_run:
        return _dry_run_generate(settings, prompt, run_id, created_at)

    if not settings.nvidia_configured:
        raise RuntimeError(NVIDIA_SETUP_HELP)

    from genblaze_core import KeyStrategy, Modality, ObjectStorageSink, Pipeline
    from genblaze_nvidia import NvidiaImageProvider

    from app.nvidia_http import NvidiaGenaiTimeouts, build_nvidia_genai_client

    timeouts = NvidiaGenaiTimeouts.from_env()
    http_client = build_nvidia_genai_client(settings.nvidia_api_key or "", timeouts)
    provider = NvidiaImageProvider(
        api_key=settings.nvidia_api_key,
        http_timeout=timeouts.http_timeout,
        nvcf_timeout=timeouts.nvcf_timeout,
        http_client=http_client,
    )

    try:
        backend = build_backend(settings)
        try:
            sink = ObjectStorageSink(
                backend,
                prefix=settings.storage_prefix,
                key_strategy=KeyStrategy.HIERARCHICAL,
            )
            result = (
                Pipeline("mrs-concept-media")
                .step(
                    provider,
                    model=settings.image_model,
                    prompt=prompt,
                    modality=Modality.IMAGE,
                )
                .run(sink=sink, timeout=timeouts.pipeline_timeout)
            )

            asset_url = None
            asset_sha = None
            asset_key = None
            steps = getattr(getattr(result, "run", None), "steps", None) or []
            if steps:
                assets = getattr(steps[0], "assets", None) or []
                if assets:
                    a0 = assets[0]
                    asset_url = getattr(a0, "url", None)
                    asset_sha = getattr(a0, "sha256", None)
                    asset_key = _extract_asset_key(asset_url, settings.b2_bucket)
                step_err = getattr(steps[0], "error", None)
                if not assets and step_err:
                    raise RuntimeError(f"generation failed: {step_err}")

            if not asset_key and not asset_url:
                raise RuntimeError(
                    "generation produced no assets (check NVIDIA_API_KEY, model access, "
                    "and network to ai.api.nvidia.com)"
                )

            manifest = getattr(result, "manifest", None)
            manifest_uri = getattr(manifest, "manifest_uri", None) if manifest else None
            manifest_key = _extract_asset_key(manifest_uri, settings.b2_bucket)

            preview = None
            if asset_key:
                try:
                    from genblaze_s3 import URLPolicy

                    preview = backend.get_url(
                        asset_key,
                        policy=URLPolicy.PRESIGNED,
                        expires_in=settings.presign_expires_seconds,
                    )
                    # PresignedURL value object may redact in str(); prefer .url
                    preview = getattr(preview, "url", None) or str(preview)
                except Exception:
                    # Fallback helper name across versions
                    try:
                        ps = backend.presigned_get(
                            asset_key, expires_in=settings.presign_expires_seconds
                        )
                        preview = getattr(ps, "url", None) or str(ps)
                    except Exception:
                        preview = asset_url

            return GenerateResult(
                run_id=getattr(getattr(result, "run", None), "run_id", None) or run_id,
                prompt=prompt,
                model=settings.image_model,
                provider="nvidia-image",
                status="ok",
                asset_key=asset_key,
                manifest_key=manifest_key,
                asset_sha256=asset_sha,
                preview_url=preview,
                created_at=created_at,
                dry_run=False,
            )
        finally:
            close = getattr(backend, "close", None)
            if callable(close):
                close()
    finally:
        # We own the injected httpx client; Genblaze skips close when injected.
        try:
            close_p = getattr(provider, "close", None)
            if callable(close_p):
                close_p()
        finally:
            http_client.close()


def _dry_run_generate(
    settings: Settings, prompt: str, run_id: str, created_at: str
) -> GenerateResult:
    """Upload a 1x1 PNG + provenance JSON when GENBLAZE_DRY_RUN=1."""
    # Minimal valid PNG (1x1 gray)
    png = bytes.fromhex(
        "89504e470d0a1a0a0000000d49484452000000010000000108000000003a7e9b55"
        "0000000a49444154789c63000100000500010d0a2db40000000049454e44ae426082"
    )
    sha = hashlib.sha256(png).hexdigest()
    asset_key = f"{settings.storage_prefix}/dry-run/{run_id}/concept.png"
    manifest_key = f"{settings.storage_prefix}/dry-run/{run_id}/manifest.json"
    manifest = {
        "run_id": run_id,
        "prompt": prompt,
        "model": "dry-run/mock",
        "provider": "dry-run",
        "created_at": created_at,
        "asset_sha256": sha,
        "note": "GENBLAZE_DRY_RUN=1 — not a live NVIDIA generation",
    }

    if not settings.b2_configured:
        return GenerateResult(
            run_id=run_id,
            prompt=prompt,
            model="dry-run/mock",
            provider="dry-run",
            status="ok",
            asset_key=asset_key,
            manifest_key=manifest_key,
            asset_sha256=sha,
            preview_url=None,
            created_at=created_at,
            dry_run=True,
            detail="B2 not configured; dry-run stayed local-only (no upload).",
        )

    backend = build_backend(settings)
    try:
        backend.put(asset_key, png, content_type="image/png")
        backend.put(
            manifest_key,
            json.dumps(manifest, indent=2).encode("utf-8"),
            content_type="application/json",
        )
        preview = None
        try:
            ps = backend.presigned_get(
                asset_key, expires_in=settings.presign_expires_seconds
            )
            preview = getattr(ps, "url", None) or str(ps)
        except Exception:
            preview = None
        return GenerateResult(
            run_id=run_id,
            prompt=prompt,
            model="dry-run/mock",
            provider="dry-run",
            status="ok",
            asset_key=asset_key,
            manifest_key=manifest_key,
            asset_sha256=sha,
            preview_url=preview,
            created_at=created_at,
            dry_run=True,
        )
    finally:
        close = getattr(backend, "close", None)
        if callable(close):
            close()
