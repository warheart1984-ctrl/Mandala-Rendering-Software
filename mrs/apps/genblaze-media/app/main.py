"""FastAPI entry: health, generate (image + video), assets list, image ingest, thin UI."""

from __future__ import annotations

import logging
import time
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Any

from fastapi import FastAPI, HTTPException, Query, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, HTMLResponse, RedirectResponse
from pydantic import BaseModel, Field, ValidationError

from app.config import APP_DIR, NVIDIA_SETUP_HELP, SEEDANCE_SETUP_HELP, get_settings
from app.embeddings import cosine_similarity, embed_texts, embedding_summary
from app.image_ingest import (
    analyze_image_bytes,
    analyze_ingested,
    decode_base64_payload,
    get_ingested_meta,
    ingest_bytes,
    is_safe_ingest_id,
    list_ingested,
    resolve_stored_file,
)
from app.image_to_scene import (
    DISCLAIMER as IMAGE_TO_SCENE_DISCLAIMER,
    image_to_scene_availability,
    interpret_image_to_scene,
    resolve_image_bytes,
)
from app.index_store import AssetIndex
from app.nvidia_errors import format_generation_failure, nvidia_nim_status_from_warmup
from app.nvidia_http import (
    NvidiaGenaiTimeouts,
    NvidiaVideoTimeouts,
    probe_genai_model_liveness,
)
from app.pipeline import GenerationQualityError, generate_image, probe_b2
from app.pipeline_video import generate_video
from app.rt4d_provider import (
    RT4D_PROVIDER_ID,
    generate_image_rt4d,
    rt4d_availability,
)
from app.rt4d_to_nvidia import (
    NvidiaUnavailableError,
    build_nvidia_vision_provenance,
    build_rt4d_to_nvidia_request,
    rt4d_to_nvidia_availability,
)
from app.scene_spec_provider import (
    SCENE_SPEC_PROVIDER_ID,
    render_scene_clip,
    render_scene_spec,
    scene_spec_availability,
)
from app.render_quality import DRAFT_QUALITY, resolve_quality
from app.preview_cache import (
    get_preview_path,
    is_run_id,
    local_preview_url,
    media_type_for_path,
)

logger = logging.getLogger(__name__)

APP_DIR = Path(__file__).resolve().parent.parent
INDEX_PATH = APP_DIR / "data" / "recent-assets.json"
STATIC_DIR = Path(__file__).resolve().parent / "static"
STATIC_UI = STATIC_DIR / "index.html"
STATIC_CROS = STATIC_DIR / "cros.html"

# Last startup warmup probe result (no secrets) — exposed on /health.
_nvidia_warmup_state: dict[str, Any] | None = None


def _prefer_local_preview(row: dict) -> dict:
    """Choose local cache vs stored cloud URL at response time.

    Index entries keep the B2 (or other cloud) ``preview_url`` when present.
    When a same-origin cache file exists for ``run_id``, swap the response URL
    to ``/api/preview/{run_id}`` so the UI works under B2 free-tier caps without
    discarding the cloud fallback from the on-disk index.
    """
    run_id = row.get("run_id")
    if isinstance(run_id, str) and get_preview_path(APP_DIR, run_id):
        row["preview_url"] = local_preview_url(run_id)
        row["preview_source"] = "local-cache"
    elif row.get("preview_url"):
        row["preview_source"] = "b2-presign"
    return row


def _default_modality(row: dict) -> str:
    """Infer modality for older index rows that omit the field."""
    explicit = row.get("modality")
    if explicit in {"image", "video"}:
        return explicit
    provider = str(row.get("provider") or "")
    if provider.endswith("video") or "video" in provider:
        return "video"
    return "image"


def _with_modality(row: dict) -> dict:
    row = dict(row)
    row["modality"] = _default_modality(row)
    return row


@asynccontextmanager
async def _lifespan(_app: FastAPI):
    """Optional one-shot NVIDIA genai warmup (invalid-payload probe)."""
    global _nvidia_warmup_state
    settings = get_settings()
    if (
        settings.nvidia_warmup_on_startup
        and settings.nvidia_configured
        and not settings.dry_run
        and settings.nvidia_api_key
    ):
        logger.info(
            "Running NVIDIA genai warmup probe for %s "
            "(GENBLAZE_NVIDIA_WARMUP_ON_STARTUP)",
            settings.image_model,
        )
        _nvidia_warmup_state = probe_genai_model_liveness(
            settings.nvidia_api_key, settings.image_model
        )
        logger.info("NVIDIA warmup probe result: %s", _nvidia_warmup_state)
    else:
        _nvidia_warmup_state = {
            "ran": False,
            "enabled": settings.nvidia_warmup_on_startup,
            "note": (
                "set GENBLAZE_NVIDIA_WARMUP_ON_STARTUP=1 to probe image model "
                "once at process start (cheap invalid-payload POST)"
            ),
        }
    yield


app = FastAPI(
    title="MRS Genblaze Media",
    description=(
        "Provenanced concept media for Mandala Rendering System / 4D scene "
        "authoring. Prompt → NVIDIA NIM FLUX (stills) or Cosmos/Seedance (video) "
        "via Genblaze → Backblaze B2 assets + SHA-256 manifest. Optional "
        "GENBLAZE_IMAGE_BACKEND=rt4d uses the MRS RT4D path tracer for "
        "deterministic procedural 4D stills (NOT text-to-image). "
        "Image ingest stores operator photos and returns heuristic 4D "
        "suggestions — does not claim Genblaze renders or reconstructs 4D scenes."
    ),
    version="0.2.3",
    lifespan=_lifespan,
)

# Allow 4DRS Copilot browser fallback (Vite :1420) and local operator UIs.
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:1420",
        "http://127.0.0.1:1420",
        "http://localhost:8787",
        "http://127.0.0.1:8787",
        "tauri://localhost",
        "http://tauri.localhost",
        "https://tauri.localhost",
    ],
    allow_credentials=False,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["*"],
)

_index = AssetIndex(INDEX_PATH)


class GenerateRequest(BaseModel):
    prompt: str = Field(..., min_length=1, max_length=2000)
    embed: bool = Field(
        default=True,
        description="Also embed the prompt with NVIDIA nv-embedcode for search/provenance.",
    )
    then_scene: bool = Field(
        default=False,
        description=(
            "After a successful FLUX/RT4D still, also run image→SceneSpecification→MRS "
            "full-frame render. Returns both assets; does not replace the FLUX still. "
            "Also enabled by GENBLAZE_FLUX_THEN_SCENE=1. Uses draft quality by default."
        ),
    )
    quality: str = Field(
        default=DRAFT_QUALITY,
        description=(
            "Render quality for the RT4D still and the then_scene MRS still: "
            "'draft'/'fast' (default, smaller/noisier, typically tens of seconds) "
            "or 'final'/'high' (full RT4D_* profile, slower). Draft caps the "
            "RT4D_* profile so a CPU path trace finishes inside RT4D_TIMEOUT. "
            "Has no effect on the NVIDIA FLUX path, which has no size knob."
        ),
    )


class SearchRequest(BaseModel):
    query: str = Field(..., min_length=1, max_length=2000)
    limit: int = Field(default=8, ge=1, le=30)


class ImageIngestJsonRequest(BaseModel):
    """Base64 JSON ingest (preferred for Tauri / browser clients)."""

    image_base64: str = Field(..., min_length=8, description="Raw or data-URL base64 image bytes")
    filename: str | None = Field(default=None, max_length=200)
    mime: str | None = Field(default=None, max_length=100)


class ImageAnalyzeRequest(BaseModel):
    """Analyze an ingested id and/or fresh base64 bytes."""

    id: str | None = Field(default=None, max_length=64)
    image_base64: str | None = Field(default=None, min_length=8)
    filename: str | None = Field(default=None, max_length=200)


class ImageToSceneRequest(BaseModel):
    """Image → SceneSpecification → optional MRS full-frame render."""

    image_base64: str | None = Field(default=None, min_length=8)
    id: str | None = Field(default=None, max_length=64, description="Ingest id")
    run_id: str | None = Field(
        default=None,
        max_length=64,
        description="Prior generate run_id (local preview / B2)",
    )
    render: bool = Field(
        default=True,
        description="When true (hackathon default), path-trace a full MRS frame.",
    )
    frame: int | None = Field(default=None, ge=0, le=240)
    force_heuristic: bool = Field(
        default=False,
        description="Skip NIM vision; build heuristic SceneSpecification only.",
    )
    require_nvidia: bool = Field(
        default=False,
        description=(
            "When true, require NIM vision success — do not silently fall back to "
            "the heuristic. Missing NVIDIA_API_KEY or NIM 5xx/504 → clear error; "
            "source still (run_id) is left unchanged."
        ),
    )
    quality: str = Field(
        default=DRAFT_QUALITY,
        description=(
            "Render quality: 'draft'/'fast' (hackathon default — 256×256, 4 samples, "
            "depth 3; smaller/noisier, typically tens of seconds on CPU) or "
            "'final'/'high' (RT4D_* profile, typically slower)."
        ),
    )


class Rt4dToNvidiaRequest(BaseModel):
    """Send a prior RT4D/generate still to NVIDIA NIM vision (not img2img)."""

    run_id: str = Field(
        ...,
        min_length=8,
        max_length=64,
        description="Prior generate run_id whose PNG is the NVIDIA vision input",
    )
    render: bool = Field(
        default=True,
        description="When true, path-trace an MRS frame from the NIM SceneSpecification.",
    )
    quality: str = Field(
        default=DRAFT_QUALITY,
        description="MRS re-render quality: draft/fast (default) or final/high.",
    )


class RenderSceneRequest(BaseModel):
    """SceneSpecification still render (LLM → structured scene → RT4D)."""

    spec: dict[str, Any] = Field(..., description="SceneSpecification JSON object")
    frame: int | None = Field(default=None, ge=0, le=240)
    time: float | None = Field(default=None, ge=0)
    quality: str = Field(
        default=DRAFT_QUALITY,
        description=(
            "Render quality: 'draft'/'fast' (default) or 'final'/'high'. "
            "Draft caps output so NIM/heuristic 448/20/5 specs cannot force a "
            "multi-minute CPU render on the default path."
        ),
    )


class RenderClipRequest(BaseModel):
    """Sample AnimationTimeline → PNG frame zip (no MP4 encoding)."""

    spec: dict[str, Any] = Field(..., description="SceneSpecification with animation")
    max_frames: int = Field(default=24, ge=1, le=120)
    quality: str = Field(
        default=DRAFT_QUALITY,
        description="Per-frame render quality: 'draft'/'fast' (default) or 'final'/'high'.",
    )


@app.get("/health")
def health() -> dict:
    settings = get_settings()
    b2_probe: dict | None = None
    b2_error: str | None = None
    b2_probe_skipped: bool = False
    # ListObjects on every /health burns B2 Class C (Render healthCheckPath + UI).
    # Default off; set B2_PROBE_ON_HEALTH=1 to list under the storage prefix.
    if settings.b2_configured and settings.b2_probe_on_health:
        try:
            b2_probe = probe_b2(settings)
        except Exception as exc:  # noqa: BLE001 — surface to health JSON
            b2_error = str(exc)
    elif settings.b2_configured:
        b2_probe_skipped = True
    nvidia_timeouts = NvidiaGenaiTimeouts.from_env()
    video_timeouts = NvidiaVideoTimeouts.from_env()
    return {
        "status": "ok",
        "service": "mrs-genblaze-media",
        "nvidia_configured": settings.nvidia_configured,
        "seedance_configured": settings.seedance_configured,
        "b2_configured": settings.b2_configured,
        "b2_bucket": settings.b2_bucket if settings.b2_configured else None,
        "b2_region": settings.b2_region if settings.b2_configured else None,
        "image_model": settings.image_model,
        "video_model": (
            settings.seedance_model
            if settings.video_backend == "seedance"
            else settings.video_model
        ),
        "video_backend": settings.video_backend,
        "video_enabled": settings.video_enabled,
        "video_available": settings.video_available,
        "cmm_id": (
            "CMM-Seedance-v1.0"
            if settings.video_backend == "seedance"
            else "CMM-NIM-Cosmos-v1.0"
        ),
        "domain_id": "CH-GNMD-v1.0",
        "embed_model": settings.embed_model,
        "dry_run": settings.dry_run,
        "b2_probe_on_health": settings.b2_probe_on_health,
        "b2_probe_skipped": b2_probe_skipped,
        "b2_probe": b2_probe,
        "b2_error": b2_error,
        "nvidia_help": None if settings.nvidia_configured else NVIDIA_SETUP_HELP,
        "seedance_help": (
            None
            if settings.video_backend != "seedance" or settings.seedance_configured
            else SEEDANCE_SETUP_HELP
        ),
        "nvidia_timeouts": {
            "http_read_seconds": nvidia_timeouts.http_timeout,
            "nvcf_poll_seconds": nvidia_timeouts.nvcf_poll_seconds,
            "nvcf_wait_seconds": nvidia_timeouts.nvcf_timeout,
            "pipeline_seconds": nvidia_timeouts.pipeline_timeout,
            "connect_seconds": nvidia_timeouts.connect_timeout,
        },
        "video_timeouts": {
            "http_read_seconds": video_timeouts.http_timeout,
            "nvcf_poll_seconds": video_timeouts.nvcf_poll_seconds,
            "nvcf_wait_seconds": video_timeouts.nvcf_timeout,
            "pipeline_seconds": video_timeouts.pipeline_timeout,
            "connect_seconds": video_timeouts.connect_timeout,
        },
        "empty_504_retry": settings.empty_504_retry,
        "empty_504_retry_delay_seconds": settings.empty_504_retry_delay_seconds,
        "nvidia_warmup_on_startup": settings.nvidia_warmup_on_startup,
        "nvidia_warmup": _nvidia_warmup_state or {"ran": False},
        # Derived from startup evidence; /health does not invoke NVIDIA again.
        "nvidia_nim_status": nvidia_nim_status_from_warmup(_nvidia_warmup_state),
        # Ingest routes ship in app code; a 404 on Render means that deploy
        # predates the ingest commit — redeploy this service to pick them up.
        "image_ingest_routes": True,
        # Drive-G-1 capability disclosure: NVIDIA FLUX + optional RT4D renderer.
        # Seedance/fal remains video-only (no fal image fallback).
        "image_backend": settings.image_backend,
        "image_backends": ["nvidia-genai", RT4D_PROVIDER_ID],
        "image_fallback_to_rt4d": settings.image_fallback_to_rt4d,
        "rt4d": rt4d_availability(settings),
        "rt4d_note": (
            "Deterministic procedural 4D path-traced stills via renderer-core. "
            "NOT text-to-image / not diffusion. Prompt selects a scene archetype; "
            "seed records variation. Requires Node + render-still.mjs; the "
            "rt4d.available field above is the authoritative check for this "
            "running image."
        ),
        "scene_spec": scene_spec_availability(settings),
        "scene_spec_note": (
            "POST /api/render-scene accepts a SceneSpecification JSON and renders "
            "a deterministic RT4D still. Default quality is draft (fast/noisier); "
            "pass quality=final for the RT4D_* profile. POST /api/render-clip returns "
            "a PNG frame zip when animation is present — MP4 encoding is not available "
            "in-image."
        ),
        "image_to_scene": image_to_scene_availability(settings),
        "image_to_scene_note": (
            "POST /api/image-to-scene: image → SceneSpecification → optional MRS "
            "path-traced full frame. Scene interpretation only — NOT reconstruction. "
            "Default quality is draft (typically tens of seconds on CPU; noisier/"
            "smaller). Heuristic fallback always available; NIM vision when "
            "NVIDIA_API_KEY set. Pass require_nvidia=true to forbid heuristic fallback."
        ),
        "rt4d_to_nvidia": rt4d_to_nvidia_availability(settings),
        "flux_then_scene": settings.flux_then_scene,
        "fal_image_fallback": False,
        "prefer_async": False,
        "async_note": (
            "No prefer_async flag: Genblaze polls NVCF only when NVIDIA returns "
            "202 + NVCF-REQID after NVCF-POLL-SECONDS (max 300)."
        ),
    }


def _format_generation_failure(exc: Exception) -> str:
    """Preserve provider detail and clarify an empty NVIDIA gateway 504."""
    return format_generation_failure(exc, warmup=_nvidia_warmup_state)


def _dispatch_image(settings: Any, prompt: str, quality: str | None = None):
    """Select the image backend and, when enabled, fall back to RT4D.

    - ``GENBLAZE_IMAGE_BACKEND=rt4d`` → deterministic RT4D render (no API).
    - default NVIDIA; if it fails and ``GENBLAZE_IMAGE_FALLBACK_TO_RT4D=1`` and
      the RT4D CLI/node are available, render deterministically instead of
      surfacing the NVIDIA failure (blank still, empty 504, etc.).
    ``quality`` sizes the RT4D render only (draft caps the RT4D_* profile).
    Bad input (``ValueError``) never triggers fallback.
    """
    if settings.rt4d_selected:
        return generate_image_rt4d(settings, prompt, quality=quality)
    try:
        return generate_image(settings, prompt)
    except ValueError:
        raise
    except Exception as exc:  # noqa: BLE001 — optional deterministic fallback
        if settings.image_fallback_to_rt4d and rt4d_availability(settings)["available"]:
            logger.warning(
                "NVIDIA image backend failed (%s: %s); falling back to RT4D render",
                type(exc).__name__,
                exc,
            )
            gen = generate_image_rt4d(settings, prompt, quality=quality)
            note = f"RT4D fallback after NVIDIA failure ({type(exc).__name__})"
            gen.detail = (gen.detail + " · " if gen.detail else "") + note
            return gen
        raise


def _run_generate_common(body: GenerateRequest, *, video: bool) -> dict:
    """Shared generate path: image or video → embed → index → response-local preview."""
    settings = get_settings()
    # Uvicorn writes its access-log line only after the response is sent, and this
    # path can block for the full NVIDIA pipeline budget (see
    # settings.nvidia_pipeline_seconds). Without this the operator log shows only
    # the periodic GET /health while a generate is in flight, which reads as
    # "the UI never called the API". Log arrival and completion explicitly.
    kind = "video" if video else "image"
    started = time.monotonic()
    logger.info(
        "generate start · modality=%s backend=%s prompt_chars=%d",
        kind,
        "nvidia-video" if video else settings.image_backend,
        len(body.prompt or ""),
    )
    try:
        result = (
            generate_video(settings, body.prompt)
            if video
            else _dispatch_image(settings, body.prompt, quality=body.quality)
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except GenerationQualityError as exc:
        # Blank/near-black NIM still or unusable video — not a missing key.
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except RuntimeError as exc:
        # Missing NVIDIA/RT4D setup, video disabled, or B2 config — 503 with setup text.
        # RT4D CLI crashes/timeouts raise RT4DRenderError (not RuntimeError) → 502 below.
        # Transfer/sink failures are re-raised as non-RuntimeError (see pipeline).
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except Exception as exc:  # noqa: BLE001
        # Include chained transfer cause when present (Genblaze SinkError omits it).
        # Also covers RT4DRenderError (present CLI, failed/timed-out render).
        detail = _format_generation_failure(exc)
        raise HTTPException(status_code=502, detail=f"generation failed: {detail}") from exc

    entry = result.to_dict()
    entry["modality"] = "video" if video else entry.get("modality") or "image"
    # Persist cloud/synthetic preview_url only — never rewrite to /api/preview before index.
    if body.embed and settings.nvidia_configured and not settings.dry_run:
        try:
            # Embed the sanitized prompt we actually sent to NIM when available.
            embed_text = entry.get("prompt") or body.prompt
            vector = embed_texts(settings, [embed_text])[0]
            summary = embedding_summary(vector)
            summary["model"] = settings.embed_model
            entry["embedding"] = summary
            if settings.store_full_embeddings:
                entry["embedding_vector"] = vector
        except Exception as exc:  # noqa: BLE001 — generate still succeeds
            entry["embedding_error"] = str(exc)
    _index.prepend(entry)
    # Do not echo full vectors in HTTP response (large); keep summary + keys
    public = {k: v for k, v in entry.items() if k != "embedding_vector"}
    if "embedding_vector" in entry:
        public["embedding_stored"] = True
    public = _prefer_local_preview(public)

    # Opt-in dual path: keep FLUX/RT4D concept + add MRS scene interpretation frame.
    if (
        not video
        and (body.then_scene or settings.flux_then_scene)
        and public.get("run_id")
    ):
        try:
            scene_payload = _image_to_scene_pipeline(
                settings,
                run_id=str(public["run_id"]),
                render=True,
                frame=None,
                force_heuristic=False,
                quality=body.quality,
            )
            public["then_scene"] = scene_payload
            public["dual_path_note"] = (
                "FLUX/RT4D concept still preserved; then_scene is a separate "
                "scene-interpretation + path-traced MRS full frame (not a replacement)."
            )
        except HTTPException as exc:
            public["then_scene_error"] = exc.detail
        except Exception as exc:  # noqa: BLE001 — never fail the FLUX still
            public["then_scene_error"] = str(exc)
    logger.info(
        "generate done · modality=%s run=%s elapsed_s=%.1f",
        kind,
        public.get("run_id") or "—",
        time.monotonic() - started,
    )
    return public


def _index_lookup_run(run_id: str) -> dict[str, Any] | None:
    for asset in _index.list_recent(limit=80):
        if asset.get("run_id") == run_id:
            return asset
    return None


def _b2_fetch_bytes(settings: Any, asset_key: str) -> bytes | None:
    if not settings.b2_configured or not asset_key:
        return None
    try:
        from app.pipeline import build_backend

        backend = build_backend(settings)
        try:
            get = getattr(backend, "get", None) or getattr(backend, "download", None)
            if not callable(get):
                return None
            data = get(asset_key)
            if isinstance(data, (bytes, bytearray)) and data:
                return bytes(data)
            # Some backends return a file-like / response object.
            read = getattr(data, "read", None)
            if callable(read):
                blob = read()
                if isinstance(blob, (bytes, bytearray)) and blob:
                    return bytes(blob)
        finally:
            close = getattr(backend, "close", None)
            if callable(close):
                close()
    except Exception as exc:  # noqa: BLE001
        logger.warning("B2 fetch for image-to-scene failed: %s", exc)
    return None


def _image_to_scene_pipeline(
    settings: Any,
    *,
    image_base64: str | None = None,
    ingest_id: str | None = None,
    run_id: str | None = None,
    render: bool = True,
    frame: int | None = None,
    force_heuristic: bool = False,
    require_nvidia: bool = False,
    quality: str | None = None,
    provenance_kind: str | None = None,
) -> dict[str, Any]:
    """Resolve image → interpret → optional MRS full-frame render."""
    try:
        image_bytes, resolve_meta = resolve_image_bytes(
            image_base64=image_base64,
            ingest_id=ingest_id,
            run_id=run_id,
            app_dir=APP_DIR,
            index_lookup=_index_lookup_run,
            b2_fetch=lambda key: _b2_fetch_bytes(settings, key),
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc

    try:
        interpreted = interpret_image_to_scene(
            settings,
            image_bytes,
            force_heuristic=force_heuristic,
            require_nvidia=require_nvidia,
        )
    except NvidiaUnavailableError as exc:
        status = 503 if exc.reason == "missing_key" else 502
        raise HTTPException(
            status_code=status,
            detail={
                "message": str(exc),
                "reason": exc.reason,
                "nvidia_unavailable": True,
                "source_run_id": run_id,
                "note": (
                    "RT4D / source still is unchanged. Configure NVIDIA_API_KEY "
                    "or retry when NIM recovers."
                ),
            },
        ) from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    resolved_quality = resolve_quality(settings, quality)
    nvidia_prov = None
    if run_id and (require_nvidia or interpreted.get("source") == "nim-vision"):
        nvidia_prov = build_nvidia_vision_provenance(
            settings,
            source_run_id=str(run_id),
            image_sha256=str(interpreted.get("image_sha256") or ""),
            scene_source=str(interpreted.get("source") or ""),
            resolve_meta=resolve_meta if isinstance(resolve_meta, dict) else {},
            nim_error=interpreted.get("nim_error"),
        )
    payload: dict[str, Any] = {
        **interpreted,
        "resolve": resolve_meta,
        "analysis_mode": interpreted.get("analysis_mode"),
        "note": interpreted.get("note") or IMAGE_TO_SCENE_DISCLAIMER,
        "quality": resolved_quality,
        "source_run_id": run_id,
    }
    if nvidia_prov is not None:
        payload["nvidia_provenance"] = nvidia_prov

    if not render:
        return payload

    try:
        result = render_scene_spec(
            settings,
            interpreted["spec"],
            frame=frame,
            storage_kind="image-to-scene",
            quality=resolved_quality,
        )
    except ValueError as exc:
        err_payload = exc.args[0] if exc.args else str(exc)
        if isinstance(err_payload, dict) and "errors" in err_payload:
            raise HTTPException(
                status_code=400,
                detail={
                    "message": "invalid or unsupported SceneSpecification after interpret",
                    "errors": err_payload["errors"],
                    "analysis_mode": interpreted.get("analysis_mode"),
                    "note": IMAGE_TO_SCENE_DISCLAIMER,
                },
            ) from exc
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except GenerationQualityError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except Exception as exc:  # noqa: BLE001
        detail = _format_generation_failure(exc)
        raise HTTPException(
            status_code=502, detail=f"image-to-scene render failed: {detail}"
        ) from exc

    entry = result.to_dict()
    entry["modality"] = "image"
    entry["kind"] = provenance_kind or "image-to-scene-mrs-full-frame"
    entry["provider_label"] = (
        "nvidia-nim-vision+mrs"
        if interpreted.get("source") == "nim-vision"
        else "mrs-scene-interpretation"
    )
    entry["analysis_mode"] = interpreted.get("analysis_mode")
    entry["note"] = IMAGE_TO_SCENE_DISCLAIMER
    entry["scene_source"] = interpreted.get("source")
    entry["image_sha256"] = interpreted.get("image_sha256")
    entry["spec"] = interpreted.get("spec")
    entry["source_run_id"] = run_id
    if nvidia_prov is not None:
        # Attach under provenance without clobbering RT4D render provenance.
        base_prov = entry.get("provenance")
        if isinstance(base_prov, dict):
            entry["provenance"] = {**base_prov, "nvidia_vision": nvidia_prov}
        else:
            entry["provenance"] = {"nvidia_vision": nvidia_prov}
    _index.prepend(entry)
    render_public = {k: v for k, v in entry.items() if k != "embedding_vector"}
    payload["render"] = _prefer_local_preview(render_public)
    return payload


@app.post("/api/generate")
def api_generate(body: GenerateRequest) -> dict:
    return _run_generate_common(body, video=False)


@app.post("/api/generate-video")
def api_generate_video(body: GenerateRequest) -> dict:
    return _run_generate_common(body, video=True)


@app.post("/api/image-to-scene")
def api_image_to_scene(body: ImageToSceneRequest) -> dict:
    """Image bytes → SceneSpecification → optional MRS path-traced full frame.

    Honest scope: scene interpretation + path-traced full frame — NOT reconstruction.
    """
    if not body.image_base64 and not body.id and not body.run_id:
        raise HTTPException(
            status_code=400,
            detail="provide image_base64, id (ingest), or run_id",
        )
    if body.require_nvidia and body.force_heuristic:
        raise HTTPException(
            status_code=400,
            detail="require_nvidia and force_heuristic are mutually exclusive",
        )
    settings = get_settings()
    return _image_to_scene_pipeline(
        settings,
        image_base64=body.image_base64,
        ingest_id=body.id,
        run_id=body.run_id,
        render=body.render,
        frame=body.frame,
        force_heuristic=body.force_heuristic,
        require_nvidia=body.require_nvidia,
        quality=body.quality,
    )


@app.post("/api/rt4d-to-nvidia")
def api_rt4d_to_nvidia(body: Rt4dToNvidiaRequest) -> dict:
    """RT4D / generate still (run_id) → NVIDIA NIM vision → optional MRS re-render.

    Uses the existing NIM vision image→scene path (not img2img). Requires
    NVIDIA_API_KEY; on missing key or NIM 5xx/504 returns a clear NVIDIA-unavailable
    error and does not replace the source still.
    """
    settings = get_settings()
    try:
        req = build_rt4d_to_nvidia_request(
            run_id=body.run_id,
            quality=body.quality,
            render=body.render,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    if not is_run_id(req["run_id"]):
        raise HTTPException(status_code=400, detail="invalid run_id")

    return _image_to_scene_pipeline(
        settings,
        run_id=req["run_id"],
        render=req["render"],
        force_heuristic=False,
        require_nvidia=True,
        quality=req["quality"],
        provenance_kind="rt4d-to-nvidia-mrs-full-frame",
    )


def _validate_spec_shape(spec: dict[str, Any]) -> list[dict[str, str]] | None:
    """Lightweight pre-check before invoking Node (returns error list or None)."""
    errors: list[dict[str, str]] = []
    if not isinstance(spec, dict):
        return [{"path": "", "message": "expected object"}]
    if spec.get("schemaVersion") not in (None, "1.0"):
        # Allow missing for hackathon flexibility; Node parse requires it.
        pass
    if "schemaVersion" not in spec:
        errors.append({"path": "schemaVersion", "message": "required (expected \"1.0\")"})
    if not isinstance(spec.get("id"), str) or not spec.get("id"):
        errors.append({"path": "id", "message": "expected non-empty string"})
    entities = spec.get("entities")
    if not isinstance(entities, list) or len(entities) < 1:
        errors.append({"path": "entities", "message": "expected at least 1 item(s)"})
    return errors or None


@app.post("/api/render-scene")
def api_render_scene(body: RenderSceneRequest) -> dict:
    """SceneSpecification → deterministic RT4D still → B2/local preview."""
    shape_errors = _validate_spec_shape(body.spec)
    if shape_errors:
        raise HTTPException(
            status_code=400,
            detail={"message": "invalid SceneSpecification", "errors": shape_errors},
        )

    settings = get_settings()
    try:
        result = render_scene_spec(
            settings,
            body.spec,
            frame=body.frame,
            time=body.time,
            quality=body.quality,
        )
    except ValueError as exc:
        payload = exc.args[0] if exc.args else str(exc)
        if isinstance(payload, dict) and "errors" in payload:
            raise HTTPException(
                status_code=400,
                detail={
                    "message": "invalid or unsupported SceneSpecification",
                    "errors": payload["errors"],
                },
            ) from exc
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except GenerationQualityError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except Exception as exc:  # noqa: BLE001 — RT4DRenderError → 502
        detail = _format_generation_failure(exc)
        raise HTTPException(
            status_code=502, detail=f"scene-spec render failed: {detail}"
        ) from exc

    entry = result.to_dict()
    entry["modality"] = "image"
    entry["kind"] = "deterministic-scene-spec-4d-render"
    _index.prepend(entry)
    public = {k: v for k, v in entry.items() if k != "embedding_vector"}
    return _prefer_local_preview(public)


@app.post("/api/render-clip")
def api_render_clip(body: RenderClipRequest) -> dict:
    """Sample AnimationTimeline → PNG frame zip. No MP4 encoding (declared)."""
    shape_errors = _validate_spec_shape(body.spec)
    if shape_errors:
        raise HTTPException(
            status_code=400,
            detail={"message": "invalid SceneSpecification", "errors": shape_errors},
        )
    if not isinstance(body.spec.get("animation"), dict):
        raise HTTPException(
            status_code=400,
            detail={
                "message": "spec.animation is required for render-clip",
                "errors": [{"path": "animation", "message": "required object"}],
            },
        )

    settings = get_settings()
    try:
        result = render_scene_clip(
            settings, body.spec, max_frames=body.max_frames, quality=body.quality
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except Exception as exc:  # noqa: BLE001
        detail = _format_generation_failure(exc)
        raise HTTPException(
            status_code=502, detail=f"scene-spec clip failed: {detail}"
        ) from exc

    entry = {
        **result,
        "modality": "image",
        "prompt": f"scene-spec-clip:{body.spec.get('id', 'unnamed')}",
    }
    _index.prepend(entry)
    return entry


@app.get("/api/assets")
def api_assets(
    limit: int = Query(default=20, ge=1, le=50),
    modality: str | None = Query(
        default=None,
        description='Optional filter: "image" or "video".',
    ),
) -> dict:
    if modality is not None and modality not in {"image", "video"}:
        raise HTTPException(
            status_code=400,
            detail='modality must be "image" or "video" when provided',
        )
    assets = _index.list_recent(limit=max(limit * 3, 50) if modality else limit)
    # Strip full vectors from list responses; prefer local preview cache over B2.
    cleaned = []
    for a in assets:
        row = {k: v for k, v in a.items() if k != "embedding_vector"}
        if "embedding_vector" in a:
            row["embedding_stored"] = True
        row = _with_modality(row)
        if modality and row["modality"] != modality:
            continue
        cleaned.append(_prefer_local_preview(row))
        if len(cleaned) >= limit:
            break
    return {"assets": cleaned}


@app.get("/api/preview/{run_id}")
def api_preview(run_id: str):
    """Same-origin preview bytes from ephemeral disk cache (avoids B2 GET)."""
    if not is_run_id(run_id):
        raise HTTPException(status_code=400, detail="invalid run_id")
    path = get_preview_path(APP_DIR, run_id)
    if path is None:
        raise HTTPException(
            status_code=404,
            detail=(
                "preview not in local cache on this instance "
                "(Render disk is ephemeral; B2 free-tier caps may also block "
                "presigned downloads until daily reset)"
            ),
        )
    return FileResponse(
        path,
        media_type=media_type_for_path(path),
        headers={"Cache-Control": "private, max-age=3600"},
    )


@app.post("/api/search")
def api_search(body: SearchRequest) -> dict:
    """Semantic search over recent prompts using NVIDIA nv-embedcode embeddings."""
    settings = get_settings()
    if not settings.nvidia_configured:
        raise HTTPException(status_code=503, detail=NVIDIA_SETUP_HELP)
    try:
        query_vec = embed_texts(settings, [body.query])[0]
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=502, detail=f"embed failed: {exc}") from exc

    scored: list[dict] = []
    for asset in _index.list_recent(limit=50):
        vec = asset.get("embedding_vector")
        if not isinstance(vec, list) or not vec:
            continue
        score = cosine_similarity(query_vec, vec)
        preview_row = _prefer_local_preview(
            {
                "run_id": asset.get("run_id"),
                "preview_url": asset.get("preview_url"),
            }
        )
        scored.append(
            {
                "score": round(score, 6),
                "run_id": asset.get("run_id"),
                "prompt": asset.get("prompt"),
                "asset_key": asset.get("asset_key"),
                "preview_url": preview_row.get("preview_url"),
                "preview_source": preview_row.get("preview_source"),
                "model": asset.get("model"),
                "modality": _default_modality(asset),
                "created_at": asset.get("created_at"),
            }
        )
    scored.sort(key=lambda r: r["score"], reverse=True)
    return {
        "query": body.query,
        "embed_model": settings.embed_model,
        "results": scored[: body.limit],
    }


def _ingest_response(meta: Any) -> dict:
    from dataclasses import asdict

    row = asdict(meta) if hasattr(meta, "__dataclass_fields__") else dict(meta)
    row["preview_url"] = f"/api/image/ingested/{row['id']}/file"
    row["disclaimer"] = (
        "Ingest stores operator photos locally under Genblaze data/ingested. "
        "Heuristic analyze / image_to_4d suggestions are not RT4D reconstruction."
    )
    return row


@app.post("/api/image/ingest")
async def api_image_ingest(request: Request) -> dict:
    """Accept multipart file or JSON base64; store under data/ingested/.

    Validates JPG/PNG/GIF/WebP/BMP/TIFF. Rejects path-traversal filenames.
    """
    content_type = (request.headers.get("content-type") or "").lower()
    data: bytes | None = None
    name: str | None = None
    mime: str | None = None

    if "multipart/form-data" in content_type:
        try:
            form = await request.form()
        except (RuntimeError, AssertionError) as exc:
            # Starlette needs python-multipart for request.form(); missing install
            # previously surfaced as an unhandled 500 on production file uploads.
            detail = str(exc).lower()
            if "python-multipart" in detail or "multipart" in detail:
                logger.error(
                    "multipart ingest unavailable (install python-multipart==0.0.31): %s",
                    exc,
                )
                raise HTTPException(
                    status_code=503,
                    detail=(
                        "Multipart uploads require python-multipart in the runtime image. "
                        "Pin python-multipart==0.0.31 in requirements-docker.txt / "
                        "requirements.txt and redeploy."
                    ),
                ) from exc
            raise
        upload = form.get("file")
        if upload is None:
            raise HTTPException(status_code=400, detail="multipart field 'file' required")
        filename_field = form.get("filename")
        if hasattr(upload, "read"):
            data = await upload.read()  # type: ignore[misc]
            name = (
                str(filename_field)
                if isinstance(filename_field, str) and filename_field
                else getattr(upload, "filename", None)
            )
            mime = getattr(upload, "content_type", None)
        else:
            raise HTTPException(status_code=400, detail="multipart field 'file' must be a file")
    else:
        try:
            raw = await request.json()
        except Exception as exc:  # noqa: BLE001
            raise HTTPException(
                status_code=400,
                detail="Provide multipart file or JSON { image_base64, filename?, mime? }",
            ) from exc
        try:
            body = ImageIngestJsonRequest.model_validate(raw)
        except ValidationError as exc:
            raise HTTPException(status_code=422, detail=exc.errors()) from exc
        try:
            data = decode_base64_payload(body.image_base64)
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc
        name = body.filename
        mime = body.mime

    assert data is not None
    try:
        meta = ingest_bytes(APP_DIR, data, filename=name, declared_mime=mime)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return _ingest_response(meta)


@app.post("/api/image/analyze")
async def api_image_analyze(body: ImageAnalyzeRequest) -> dict:
    """Heuristic 4D surface/color/style suggestion from ingested id or bytes.

    Labeled heuristic — not full RT4D conversion.
    """
    if body.id:
        if not is_safe_ingest_id(body.id):
            raise HTTPException(status_code=400, detail="invalid image id")
        try:
            return analyze_ingested(APP_DIR, body.id)
        except FileNotFoundError as exc:
            raise HTTPException(status_code=404, detail=str(exc)) from exc
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc

    if body.image_base64:
        try:
            data = decode_base64_payload(body.image_base64)
            return analyze_image_bytes(data)
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc

    raise HTTPException(status_code=400, detail="Provide id or image_base64")


@app.get("/api/image/ingested")
def api_image_ingested_list(
    limit: int = Query(default=50, ge=1, le=200),
) -> dict:
    """List recently ingested operator photos (local index)."""
    items = list_ingested(APP_DIR, limit=limit)
    return {
        "items": items,
        "count": len(items),
        "disclaimer": (
            "Local ingest index only. Analyze suggestions are heuristic; "
            "not RT4D scene reconstruction."
        ),
    }


@app.get("/api/image/ingested/{image_id}")
def api_image_ingested_meta(image_id: str) -> dict:
    if not is_safe_ingest_id(image_id):
        raise HTTPException(status_code=400, detail="invalid image id")
    meta = get_ingested_meta(APP_DIR, image_id)
    if meta is None:
        raise HTTPException(status_code=404, detail="ingested image not found")
    return meta


@app.get("/api/image/ingested/{image_id}/file")
def api_image_ingested_file(image_id: str):
    if not is_safe_ingest_id(image_id):
        raise HTTPException(status_code=400, detail="invalid image id")
    path = resolve_stored_file(APP_DIR, image_id)
    if path is None:
        raise HTTPException(status_code=404, detail="ingested file not found")
    meta = get_ingested_meta(APP_DIR, image_id) or {}
    media = str(meta.get("mime") or media_type_for_path(path))
    return FileResponse(
        path,
        media_type=media,
        headers={"Cache-Control": "private, max-age=3600"},
    )


@app.get("/media/stills")
def media_stills() -> RedirectResponse:
    return RedirectResponse(url="/#stills", status_code=302)


@app.get("/media/nvidia")
def media_nvidia() -> RedirectResponse:
    return RedirectResponse(url="/#stills", status_code=302)


@app.get("/media/nim-cosmos")
def media_nim_cosmos() -> RedirectResponse:
    # Judge-safe: when video is disabled, send operators to stills instead of
    # an empty Cosmos section that would only produce 503s.
    settings = get_settings()
    if not settings.video_enabled:
        return RedirectResponse(url="/#stills", status_code=302)
    return RedirectResponse(url="/#nim-cosmos", status_code=302)


@app.get("/", response_class=HTMLResponse)
def ui() -> HTMLResponse:
    if STATIC_UI.is_file():
        # The UI ships its behaviour in an inline <script>. Without an explicit
        # directive a browser may heuristically cache this document, so a client
        # can keep running a superseded copy after a redeploy.
        return HTMLResponse(
            STATIC_UI.read_text(encoding="utf-8"),
            headers={"Cache-Control": "no-store"},
        )
    return HTMLResponse("<h1>MRS Genblaze Media</h1><p>UI missing.</p>", status_code=500)


@app.get("/cros", response_class=HTMLResponse)
def cros_page() -> HTMLResponse:
    """Read-only CROS reference-architecture page.

    Documentation only. This app does not implement CROS and does not import the
    ``cros`` package — CI-006 (adapter isolation) bans in-process coupling in both
    directions, so the page is static text rather than live package introspection.
    """
    if STATIC_CROS.is_file():
        return HTMLResponse(STATIC_CROS.read_text(encoding="utf-8"))
    return HTMLResponse(
        "<h1>CROS</h1><p>Page missing. See <code>mrs/packages/cros/README.md</code>.</p>",
        status_code=500,
    )
