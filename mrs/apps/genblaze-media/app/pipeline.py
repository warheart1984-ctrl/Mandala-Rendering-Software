"""Genblaze image pipeline → Backblaze B2 with SHA-256 provenance."""

from __future__ import annotations

import hashlib
import json
import logging
import shutil
import tempfile
import time
import uuid
from dataclasses import asdict, dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Callable

from app.config import APP_DIR, NVIDIA_SETUP_HELP, Settings
from app.image_quality import assess_image_bytes, extract_nvidia_warnings
from app.nvidia_errors import is_empty_nvidia_gateway_504
from app.preview_cache import put_preview
from app.prompt_rewrite import looks_like_people_prompt, rewrite_as_abstract_geometry
from app.prompt_sanitize import sanitize_prompt

logger = logging.getLogger(__name__)


class GenerationQualityError(Exception):
    """NIM returned a blank/invalid still or an explicit refusal warning."""


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
    prompt_sanitized: bool = False
    quality: dict[str, Any] | None = None

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


def _attach_local_preview(gen: GenerateResult, image_bytes: bytes | None) -> None:
    """Cache still bytes for same-origin ``/api/preview`` without discarding B2 URL.

    Must not overwrite ``gen.preview_url``: that field is persisted in the
    recent-assets index and is the cloud fallback after prune / restart.
    ``api_assets`` / ``api_generate`` prefer the local URL at response time when
    the cache file is present.
    """
    if not image_bytes or not gen.run_id:
        return
    if put_preview(APP_DIR, gen.run_id, image_bytes):
        note = "local preview cache (UI avoids B2 download)"
        if note not in (gen.detail or ""):
            gen.detail = (gen.detail + " · " if gen.detail else "") + note


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


def _nvidia_output_dir() -> Path:
    """Temp dir for NVIDIA base64 → file:// assets (must be under Genblaze allowlist).

    ``NvidiaImageProvider`` defaults ``output_dir`` to CWD. On Docker that is
    ``/app``, which ``AssetTransfer`` rejects (only ``tempfile.gettempdir()``
    and ``/tmp`` are allowlisted). Writing under the system temp dir keeps
    ``file://`` assets readable for the Genblaze→B2 transfer step.
    """
    root = Path(tempfile.gettempdir()).resolve() / "mrs-genblaze-nvidia"
    root.mkdir(parents=True, exist_ok=True)
    return Path(tempfile.mkdtemp(prefix="run-", dir=str(root)))


def _format_transfer_failures(failures: list[BaseException]) -> str:
    """Compact underlying transfer exceptions for API/UI detail strings."""
    if not failures:
        return ""
    parts: list[str] = []
    for exc in failures[:3]:
        parts.append(f"{type(exc).__name__}: {exc}")
    extra = len(failures) - len(parts)
    if extra > 0:
        parts.append(f"(+{extra} more)")
    return "; ".join(parts)


def _wrap_asset_transfer(sink: Any) -> Callable[[], list[BaseException]]:
    """Record AssetTransfer exceptions; Genblaze SinkError omits the cause.

    Returns a zero-arg getter for the captured failure list.
    """
    transfer = getattr(getattr(sink, "_transfer", None), "transfer", None)
    if not callable(transfer):
        return lambda: []

    captured: list[BaseException] = []
    original = transfer

    def wrapped(asset: Any, **kwargs: Any) -> Any:
        try:
            return original(asset, **kwargs)
        except BaseException as exc:  # noqa: BLE001 — re-raise after capture
            captured.append(exc)
            logger.warning(
                "Asset transfer failed for %s: %s: %s",
                getattr(asset, "asset_id", "?"),
                type(exc).__name__,
                exc,
            )
            raise

    sink._transfer.transfer = wrapped  # noqa: SLF001 — intentional error capture
    return lambda: list(captured)


def _reraise_with_transfer_cause(exc: BaseException, failures: list[BaseException]) -> None:
    """Re-raise ``exc`` with underlying B2/transfer detail in the message.

    Keeps the original exception type when possible so FastAPI still maps
    Genblaze ``SinkError`` to HTTP 502 (not 503, which is reserved for missing
    NVIDIA/B2 config via ``RuntimeError``).
    """
    detail = _format_transfer_failures(failures)
    if not detail:
        raise exc
    message = f"{exc}; underlying transfer error: {detail}"
    cause = failures[0] if failures else exc
    try:
        raised: BaseException = type(exc)(message)
    except Exception:  # noqa: BLE001 — exotic constructors
        raised = Exception(message)
    raise raised from cause



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


def _read_local_image_bytes(output_dir: Path) -> bytes | None:
    """Prefer the NVIDIA-written file under ``output_dir`` (still present pre-rmtree)."""
    if not output_dir.is_dir():
        return None
    candidates = sorted(
        [
            p
            for p in output_dir.iterdir()
            if p.is_file() and p.suffix.lower() in {".png", ".jpg", ".jpeg", ".webp"}
        ],
        key=lambda p: p.stat().st_mtime,
        reverse=True,
    )
    if not candidates:
        return None
    return candidates[0].read_bytes()


def _read_backend_object_bytes(backend: Any, asset_key: str) -> bytes | None:
    """Best-effort download of the uploaded object for quality checks."""
    getters = ("get_bytes", "get", "download_bytes", "read")
    for name in getters:
        fn = getattr(backend, name, None)
        if not callable(fn):
            continue
        try:
            raw = fn(asset_key)
        except TypeError:
            try:
                raw = fn(key=asset_key)
            except Exception:  # noqa: BLE001
                continue
        except Exception:  # noqa: BLE001
            continue
        if isinstance(raw, (bytes, bytearray)):
            return bytes(raw)
        # Some backends return (bytes, meta) or a response object.
        if isinstance(raw, tuple) and raw and isinstance(raw[0], (bytes, bytearray)):
            return bytes(raw[0])
        body = getattr(raw, "body", None) or getattr(raw, "data", None)
        if isinstance(body, (bytes, bytearray)):
            return bytes(body)
        read = getattr(raw, "read", None)
        if callable(read):
            try:
                data = read()
                if isinstance(data, (bytes, bytearray)):
                    return bytes(data)
            except Exception:  # noqa: BLE001
                pass
    return None


def _presign_preview(backend: Any, settings: Settings, asset_key: str, asset_url: str | None) -> str | None:
    try:
        from genblaze_s3 import URLPolicy

        preview = backend.get_url(
            asset_key,
            policy=URLPolicy.PRESIGNED,
            expires_in=settings.presign_expires_seconds,
        )
        return getattr(preview, "url", None) or str(preview)
    except Exception:
        try:
            ps = backend.presigned_get(
                asset_key, expires_in=settings.presign_expires_seconds
            )
            return getattr(ps, "url", None) or str(ps)
        except Exception:
            return asset_url


def _collect_step_warnings(step: Any) -> list[str]:
    """Surface NVIDIA warning/refusal fields when Genblaze left them on the step."""
    warnings: list[str] = []
    payload = getattr(step, "provider_payload", None)
    if isinstance(payload, dict):
        warnings.extend(extract_nvidia_warnings(payload))
        nvidia = payload.get("nvidia")
        if isinstance(nvidia, dict):
            warnings.extend(extract_nvidia_warnings(nvidia))
            body = nvidia.get("body") or nvidia.get("response")
            if isinstance(body, dict):
                warnings.extend(extract_nvidia_warnings(body))
    # Deduplicate
    seen: set[str] = set()
    out: list[str] = []
    for w in warnings:
        if w not in seen:
            seen.add(w)
            out.append(w)
    return out


_SAFETY_TOKENS = (
    "nsfw",
    "safety",
    "blocked",
    "refus",
    "content policy",
    "not allowed",
)


def _looks_like_safety_block(warnings: list[str]) -> bool:
    """True when NVIDIA warning text suggests an explicit refusal/block."""
    if not warnings:
        return False
    lower = " | ".join(warnings).lower()
    return any(tok in lower for tok in _SAFETY_TOKENS)


def _best_effort_delete_keys(settings: Settings, *keys: str | None) -> None:
    """Delete rejected B2 objects after a blank/safety reject (best-effort).

    Opens a fresh backend because ``_run_live_once`` already closed its own.
    Failures are logged; callers still raise ``GenerationQualityError``.
    """
    to_delete = [k for k in keys if k]
    if not to_delete or not settings.b2_configured:
        return
    backend = None
    try:
        backend = build_backend(settings)
        for key in to_delete:
            try:
                backend.delete(key)
                logger.info("Deleted rejected B2 object after quality fail: %s", key)
            except Exception as exc:  # noqa: BLE001 — best-effort cleanup
                logger.warning(
                    "Failed to delete rejected B2 object %s: %s: %s",
                    key,
                    type(exc).__name__,
                    exc,
                )
    except Exception as exc:  # noqa: BLE001 — best-effort cleanup
        logger.warning(
            "Could not open B2 backend to delete rejected assets: %s: %s",
            type(exc).__name__,
            exc,
        )
    finally:
        if backend is not None:
            close = getattr(backend, "close", None)
            if callable(close):
                try:
                    close()
                except Exception:  # noqa: BLE001
                    pass


def _run_live_once(
    *,
    settings: Settings,
    prompt: str,
    timeouts: Any,
    http_client: Any,
    output_dir: Path,
) -> tuple[GenerateResult, bytes | None, list[str]]:
    """One Genblaze→B2 attempt. Returns result, image bytes (if found), warnings."""
    from genblaze_core import KeyStrategy, Modality, ObjectStorageSink, Pipeline
    from genblaze_nvidia import NvidiaImageProvider

    provider = NvidiaImageProvider(
        api_key=settings.nvidia_api_key,
        http_timeout=timeouts.http_timeout,
        nvcf_timeout=timeouts.nvcf_timeout,
        http_client=http_client,
        output_dir=output_dir,
    )
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
                Pipeline("mrs-concept-media")
                .step(
                    provider,
                    model=settings.image_model,
                    prompt=prompt,
                    modality=Modality.IMAGE,
                )
                .run(sink=sink, timeout=timeouts.pipeline_timeout)
            )
        except Exception as exc:  # noqa: BLE001 — attach transfer cause then re-raise
            transfer_failures = get_failures()
            if transfer_failures or "asset transfer" in str(exc).lower():
                _reraise_with_transfer_cause(exc, transfer_failures)
            raise

        asset_url = None
        asset_sha = None
        asset_key = None
        warnings: list[str] = []
        steps = getattr(getattr(result, "run", None), "steps", None) or []
        if steps:
            warnings = _collect_step_warnings(steps[0])
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

        preview = (
            _presign_preview(backend, settings, asset_key, asset_url)
            if asset_key
            else asset_url
        )

        image_bytes = _read_local_image_bytes(output_dir)
        if image_bytes is None and asset_key:
            image_bytes = _read_backend_object_bytes(backend, asset_key)

        gen = GenerateResult(
            run_id=getattr(getattr(result, "run", None), "run_id", None) or str(uuid.uuid4()),
            prompt=prompt,
            model=settings.image_model,
            provider="nvidia-image",
            status="ok",
            asset_key=asset_key,
            manifest_key=manifest_key,
            asset_sha256=asset_sha,
            preview_url=preview,
            created_at=_utc_now(),
            dry_run=False,
        )
        return gen, image_bytes, warnings
    finally:
        close = getattr(backend, "close", None)
        if callable(close):
            close()
        # Never close the injected httpx client here — generate_image() owns it
        # for the whole retry loop. NvidiaClient.close() skips non-owned clients,
        # but we still avoid provider.close() so a future Genblaze change cannot
        # tear down the shared client between attempts.
        # (http_client.close() runs only in generate_image's outer finally.)


def generate_image(settings: Settings, prompt: str) -> GenerateResult:
    """Run Genblaze NVIDIA image step and persist assets + manifest to B2.

    Live mode requires NVIDIA_API_KEY. Dry-run writes a tiny PNG + manifest only
    when GENBLAZE_DRY_RUN=1 (unit tests / offline demos — not for Devpost live).

    Before upload success is returned to the client, stills are checked for
    near-black / tiny / undecodable payloads (common FLUX.1-schnell NIM blank
    for photoreal people). Trailing user meta-commentary is stripped up front
    so the first FLUX call uses the cleaned prompt. When a people-like prompt
    blanks and ``GENBLAZE_ABSTRACT_RETRY`` is on (default), one more attempt
    rewrites toward abstract geometry / mandala / tesseract (no faces/skin).
    Rejected blank uploads are best-effort deleted from B2 so they are not left
    as successful objects.
    """
    raw_prompt = (prompt or "").strip()
    if not raw_prompt:
        raise ValueError("prompt is required")

    cleaned = sanitize_prompt(raw_prompt)
    if not cleaned:
        raise ValueError(
            "prompt is empty after removing trailing commentary "
            "(e.g. 'Ok this not good'). Describe the scene only."
        )
    prompt_sanitized = cleaned != raw_prompt
    if prompt_sanitized:
        logger.info("Using sanitized prompt (meta-commentary stripped) for first attempt")

    created_at = _utc_now()
    run_id = str(uuid.uuid4())

    if settings.dry_run:
        result = _dry_run_generate(settings, cleaned, run_id, created_at)
        result.prompt_sanitized = prompt_sanitized
        if prompt_sanitized:
            result.detail = (
                (result.detail + " · " if result.detail else "")
                + "prompt sanitized (meta-commentary stripped)"
            )
        return result

    if not settings.nvidia_configured:
        raise RuntimeError(NVIDIA_SETUP_HELP)

    from app.nvidia_http import NvidiaGenaiTimeouts, build_nvidia_genai_client

    timeouts = NvidiaGenaiTimeouts.from_env()
    http_client = build_nvidia_genai_client(settings.nvidia_api_key or "", timeouts)
    output_dir = _nvidia_output_dir()

    try:
        # Prefer cleaned prompt first so meta-commentary does not burn a FLUX call.
        attempt_prompts: list[str] = [cleaned]
        last_quality_reason: str | None = None
        last_warnings: list[str] = []
        last_gen: GenerateResult | None = None
        abstract_retry_used = False
        empty_504_retry_used = False

        def _attempt_live(attempt_idx: int, attempt_prompt: str) -> tuple[GenerateResult, bytes | None, list[str]]:
            attempt_dir = output_dir / f"attempt-{attempt_idx}"
            attempt_dir.mkdir(parents=True, exist_ok=True)
            return _run_live_once(
                settings=settings,
                prompt=attempt_prompt,
                timeouts=timeouts,
                http_client=http_client,
                output_dir=attempt_dir,
            )

        attempt_idx = 0
        while attempt_idx < len(attempt_prompts):
            attempt_prompt = attempt_prompts[attempt_idx]
            try:
                gen, image_bytes, warnings = _attempt_live(attempt_idx, attempt_prompt)
            except Exception as exc:  # noqa: BLE001 — classify empty 504 then re-raise
                # Opt-in: one delayed retry after empty gateway 504 only.
                # Safe-ish only when no asset was returned (exception path —
                # nothing uploaded yet). Still may double-bill if NIM completed
                # after the gateway timed out; default remains OFF.
                if (
                    settings.empty_504_retry
                    and not empty_504_retry_used
                    and is_empty_nvidia_gateway_504(exc)
                ):
                    empty_504_retry_used = True
                    delay = settings.empty_504_retry_delay_seconds
                    logger.warning(
                        "Empty NVIDIA gateway 504; waiting %.0fs then one retry "
                        "(GENBLAZE_EMPTY_504_RETRY=1). First call may still bill.",
                        delay,
                    )
                    time.sleep(delay)
                    attempt_prompts.append(attempt_prompt)
                    attempt_idx += 1
                    continue
                raise

            last_warnings = warnings
            last_gen = gen
            # `prompt_sanitized` means meta-commentary was stripped from the raw
            # prompt (cleaned != raw_prompt). The abstract-geometry rewrite is a
            # different transform with its own detail note, so don't let it flip
            # this flag — otherwise a successful abstract retry is mislabeled as
            # "meta-commentary stripped" in the note and the API response.
            gen.prompt_sanitized = prompt_sanitized
            gen.created_at = created_at
            if empty_504_retry_used and attempt_idx > 0:
                note = (
                    f"empty-504 delayed retry after "
                    f"{settings.empty_504_retry_delay_seconds:.0f}s"
                )
                if note not in (gen.detail or ""):
                    gen.detail = (gen.detail + " · " if gen.detail else "") + note
            if abstract_retry_used and attempt_idx > 0:
                note = "abstract geometry retry after blank still"
                if note not in (gen.detail or ""):
                    gen.detail = (gen.detail + " · " if gen.detail else "") + note

            if warnings and not _looks_like_safety_block(warnings):
                joined = " | ".join(warnings)
                gen.detail = (gen.detail + " · " if gen.detail else "") + (
                    "nvidia warnings: " + joined
                )

            if image_bytes is None:
                if _looks_like_safety_block(warnings):
                    _best_effort_delete_keys(settings, gen.asset_key, gen.manifest_key)
                    raise GenerationQualityError(
                        "NVIDIA refused or safety-blocked this prompt (no usable image): "
                        + " | ".join(warnings)
                    )
                gen.detail = (gen.detail + " · " if gen.detail else "") + (
                    "image quality check skipped (bytes unavailable after transfer)"
                )
                return gen

            assessment = assess_image_bytes(image_bytes)
            gen.quality = {
                "ok": assessment.ok,
                "byte_len": assessment.byte_len,
                "width": assessment.width,
                "height": assessment.height,
                "mean_luminance": assessment.mean_luminance,
                "unique_colors": assessment.unique_colors,
                "format": assessment.format,
            }
            if assessment.ok:
                # Soft safety-ish warning strings must not discard a usable still.
                if warnings:
                    joined = " | ".join(warnings)
                    if "nvidia warnings:" not in (gen.detail or ""):
                        gen.detail = (gen.detail + " · " if gen.detail else "") + (
                            "nvidia warnings: " + joined
                        )
                if gen.prompt_sanitized and "prompt sanitized" not in (gen.detail or ""):
                    note = "prompt sanitized (meta-commentary stripped)"
                    gen.detail = (gen.detail + " · " if gen.detail else "") + note
                _attach_local_preview(gen, image_bytes)
                return gen

            last_quality_reason = assessment.reason
            logger.warning(
                "Blank/near-black still from NVIDIA (attempt %s): %s",
                attempt_idx,
                assessment.reason,
            )
            # Remove blank JPEG/manifest from B2 so they are not left as "ok".
            _best_effort_delete_keys(settings, gen.asset_key, gen.manifest_key)

            if _looks_like_safety_block(warnings):
                raise GenerationQualityError(
                    "NVIDIA refused or safety-blocked this prompt (blank/unusable still): "
                    + " | ".join(warnings)
                )

            # Legacy retry: only if a caller path still queued the raw prompt
            # first and cleaning differs (sanitize-first normally skips this).
            if (
                attempt_idx == 0
                and attempt_prompt == raw_prompt
                and cleaned != raw_prompt
            ):
                attempt_prompts.append(cleaned)
                attempt_idx += 1
                continue

            # Photoreal-people blanks: one abstract geometry rewrite (costs a
            # second FLUX + B2 write; disable with GENBLAZE_ABSTRACT_RETRY=0).
            if (
                settings.abstract_retry_on_blank
                and not abstract_retry_used
                and looks_like_people_prompt(cleaned)
            ):
                rewritten = rewrite_as_abstract_geometry(cleaned)
                if rewritten and rewritten.lower() != attempt_prompt.lower():
                    abstract_retry_used = True
                    logger.info(
                        "Retrying blank still with abstract rewrite: %s",
                        rewritten[:160],
                    )
                    attempt_prompts.append(rewritten)

            attempt_idx += 1

        warn_suffix = ""
        if last_warnings:
            warn_suffix = " NVIDIA fields: " + " | ".join(last_warnings)
        # Keys already deleted on the blank path above; delete again if last_gen
        # somehow skipped cleanup (defensive).
        if last_gen is not None:
            _best_effort_delete_keys(settings, last_gen.asset_key, last_gen.manifest_key)
        raise GenerationQualityError(
            (last_quality_reason or "NVIDIA returned an unusable blank still.")
            + warn_suffix
        )
    finally:
        http_client.close()
        shutil.rmtree(output_dir, ignore_errors=True)


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
        gen = GenerateResult(
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
        _attach_local_preview(gen, png)
        return gen

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
        gen = GenerateResult(
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
        _attach_local_preview(gen, png)
        return gen
    finally:
        close = getattr(backend, "close", None)
        if callable(close):
            close()
