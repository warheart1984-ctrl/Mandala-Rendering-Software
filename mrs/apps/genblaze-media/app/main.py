"""FastAPI entry: health, generate (image + video), assets list, image ingest, thin UI."""

from __future__ import annotations

import hmac
import logging
import os
import time
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Any

from fastapi import FastAPI, HTTPException, Query, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, HTMLResponse, JSONResponse, RedirectResponse
from pydantic import BaseModel, Field, ValidationError
from starlette.middleware.base import BaseHTTPMiddleware

from app.chatgpt_plugin import (
    build_ai_plugin_manifest,
    build_plugin_openapi,
    is_plugin_protected_path,
    plugin_availability,
    resolve_public_base,
)
from app.config import APP_DIR, NVIDIA_SETUP_HELP, SEEDANCE_SETUP_HELP, get_settings
from app.byok import (
    BYOK_SCOPE_ASSIST,
    BYOK_SCOPE_STILLS,
    BYOK_SCOPE_VIDEO,
    ByokForbiddenError,
    ByokScopeError,
    byok_health_view,
    byok_headers_present,
    resolve_settings_for_request,
)
from app.composite_still import (
    CompositeError,
    composite_provenance,
    composite_sha256,
    composite_subject_over_background,
)
from app.embeddings import cosine_similarity, embed_texts, embedding_summary
from app.engine3d_sequence_provider import (
    ENGINE3D_SEQUENCE_KIND,
    Engine3dSequenceError,
    engine3d_sequence_availability,
    generate_engine3d_sequence,
)
from app.engine3d_still_provider import (
    ENGINE3D_STILL_KIND,
    Engine3dStillError,
    Engine3dStillPathError,
    engine3d_still_availability,
    generate_engine3d_still,
    resolve_engine3d_cli_path,
)
from app.proton_raster_provider import (
    PROTON_RASTER_KIND,
    ProtonRasterError,
    generate_proton_raster,
    proton_raster_availability,
)
from app.render_request_provider import (
    render_request_availability,
    run_render_request,
)
from app.printer_provider import (
    printer_availability,
    run_printer_print,
    run_printer_provenance,
    run_printer_validate,
)
from app.face_polish_defaults import (
    resolve_face_polish_prompt,
    resolve_face_polish_strength,
)
from app.face_creation_assist_provider import (
    FaceCreationAssistError,
    face_creation_assist_availability,
    run_face_creation_assist,
)
from app.lattice_polish_defaults import (
    LATTICE_POLISH_DEFAULT_PROMPT,
    looks_like_lattice_prompt,
    resolve_lattice_polish_prompt,
    resolve_lattice_polish_strength,
)
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
from app.image_polish import (
    PolishError,
    PolishNotConfiguredError,
    polish_availability,
    polish_image,
)
from app.image_to_scene import (
    DISCLAIMER as IMAGE_TO_SCENE_DISCLAIMER,
    extract_source_scene,
    image_to_scene_availability,
    interpret_image_to_scene,
    resolve_image_bytes,
)
from app.index_store import AssetIndex
from app.nvidia_errors import (
    format_generation_failure,
    nim_ops_checklist,
    nvidia_nim_status_from_warmup,
    resolve_nvidia_help,
)
from app.nvidia_http import (
    NvidiaGenaiTimeouts,
    NvidiaVideoTimeouts,
    probe_genai_model_liveness,
)
from app.pipeline import GenerationQualityError, generate_image, probe_b2
from app.pipeline_video import generate_video
from app.prompt_scene_provider import (
    PromptSceneBridgeError,
    prompt_scene_availability,
    prompt_to_scene,
)
from app.rt4d_provider import (
    RT4D_PROVIDER_ID,
    generate_image_rt4d,
    rt4d_availability,
)
from app.lemonade_provider import (
    LEMONADE_PROVIDER_ID,
    generate_image_lemonade,
    lemonade_availability,
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
    put_preview,
)

logger = logging.getLogger(__name__)

APP_DIR = Path(__file__).resolve().parent.parent
INDEX_PATH = APP_DIR / "data" / "recent-assets.json"
STATIC_DIR = Path(__file__).resolve().parent / "static"
STATIC_UI = STATIC_DIR / "index.html"
STATIC_CROS = STATIC_DIR / "cros.html"
STATIC_LEGAL = STATIC_DIR / "legal.html"
STATIC_LOGO = STATIC_DIR / "assets" / "engine3d-logo.svg"

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
        "suggestions — does not claim Genblaze renders or reconstructs 4D scenes. "
        "ChatGPT/Custom GPT: see /.well-known/ai-plugin.json and /plugin/openapi.json."
    ),
    version="0.2.4",
    lifespan=_lifespan,
)


class _ChatgptPluginAuthMiddleware(BaseHTTPMiddleware):
    """Optional bearer gate for Engine3D plugin paths when CHATGPT_PLUGIN_KEY is set."""

    async def dispatch(self, request: Request, call_next):
        if request.method == "OPTIONS":
            return await call_next(request)
        settings = get_settings()
        expected = (settings.chatgpt_plugin_key or "").strip()
        if not expected:
            return await call_next(request)
        path = request.url.path
        if not is_plugin_protected_path(path):
            return await call_next(request)
        auth = request.headers.get("authorization") or ""
        expected_header = f"Bearer {expected}"
        # Constant-time compare; mismatched lengths still return False safely.
        if hmac.compare_digest(auth, expected_header):
            return await call_next(request)
        return JSONResponse(
            status_code=401,
            content={
                "error": "unauthorized",
                "detail": "Authorization: Bearer <CHATGPT_PLUGIN_KEY> required",
            },
        )


# CORS: local operator UIs by default; widen only when GENBLAZE_CORS_ALLOW_ALL=1.
# CHATGPT_PLUGIN_KEY enables bearer auth only — it does not auto-open CORS.
# Warning: allow_origins=["*"] lets any website trigger spendy render/polish
# POSTs (fal/NIM). Prefer GENBLAZE_CORS_ORIGINS=https://chatgpt.com,... when
# possible; use "*" only for short-lived ngrok demos.
_cors_settings = get_settings()
_cors_origins: list[str] | str
_cors_origins_env = (os.getenv("GENBLAZE_CORS_ORIGINS") or "").strip()
if _cors_origins_env:
    if _cors_origins_env == "*":
        _cors_origins = ["*"]
    else:
        _cors_origins = [o.strip() for o in _cors_origins_env.split(",") if o.strip()]
elif _cors_settings.cors_allow_all:
    _cors_origins = ["*"]
else:
    _cors_origins = [
        "http://localhost:1420",
        "http://127.0.0.1:1420",
        "http://localhost:8787",
        "http://127.0.0.1:8787",
        "tauri://localhost",
        "http://tauri.localhost",
        "https://tauri.localhost",
    ]

app.add_middleware(
    CORSMiddleware,
    allow_origins=_cors_origins,
    allow_credentials=False,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["*"],
)
app.add_middleware(_ChatgptPluginAuthMiddleware)

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
    then_polish: bool = Field(
        default=False,
        description=(
            "After a successful RT4D still, also run diffusion img2img polish "
            "via the configured provider (fal.ai FLUX by default). Returns both "
            "assets; does not replace the structure still. Structure pass = MRS; "
            "polish = diffusion edit."
        ),
    )
    polish_prompt: str | None = Field(
        default=None,
        max_length=2000,
        description=(
            "Optional separate prompt for the img2img polish step. "
            "When omitted, the main prompt is reused."
        ),
    )
    polish_strength: float | None = Field(
        default=None,
        ge=0.0,
        le=1.0,
        description=(
            "Img2img strength (0.0 = identical, 1.0 = fully new). "
            "Default from GENBLAZE_POLISH_DEFAULT_STRENGTH (env). "
            "Abstract/lattice scenes: 0.35-0.55 recommended."
        ),
    )
    model: str | None = Field(
        default=None,
        max_length=200,
        description=(
            "Optional NIM / GenAI model id override (BYOK). "
            "Honored for stills only; ignored for video."
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


class FaceCreationAssistRequest(BaseModel):
    """Opt-in Face Creation Assist → Sovereign X Node CLI (assistOnly)."""

    prompt: str | None = Field(default=None, max_length=2000)
    image_path: str | None = Field(
        default=None,
        max_length=1024,
        description="Optional reference still path for lookdev-from-image",
    )
    dry_run: bool = Field(
        default=True,
        description="Default true — force FLUX stub (no live NIM). Set false for live assist.",
    )
    model: str | None = Field(
        default=None,
        max_length=200,
        description="Optional BYOK model override (stills+assist only).",
    )


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


class PolishStillRequest(BaseModel):
    """Apply diffusion img2img polish to a prior generate/RT4D still."""

    run_id: str = Field(
        ...,
        min_length=8,
        max_length=64,
        description="Prior generate run_id whose PNG is the img2img input",
    )
    prompt: str = Field(
        ...,
        min_length=1,
        max_length=2000,
        description="Polish / refine prompt for the img2img model",
    )
    strength: float | None = Field(
        default=None,
        ge=0.0,
        le=1.0,
        description="Img2img strength; default from GENBLAZE_POLISH_DEFAULT_STRENGTH",
    )
    quality: str | None = Field(default=None, description="Reserved quality hint")


class PromptToSceneRequest(BaseModel):
    """Natural-language prompt → SceneSpecification + Engine3D world stub."""

    prompt: str = Field(..., min_length=1, max_length=2000)
    render: bool = Field(
        default=False,
        description="When true, RT4D-render sceneSpecification after the bridge",
    )
    quality: str = Field(
        default=DRAFT_QUALITY,
        description="Render quality when render=true: draft/fast (default) or final/high.",
    )
    width: int = Field(default=256, ge=16, le=1024)
    height: int = Field(default=192, ge=16, le=1024)
    samples: int = Field(default=4, ge=1, le=64)
    max_depth: int = Field(default=4, ge=1, le=12)


class Engine3dStillRequest(BaseModel):
    """Engine3D structure still (+ optional RT4D composite + polish)."""

    world_path: str | None = Field(
        default=None,
        max_length=512,
        description="Optional path to world JSON (camera + id)",
    )
    human_glb: str | None = Field(
        default=None,
        max_length=512,
        description="Optional HumanRig GLB path; falls back to demo portrait meshes",
    )
    width: int = Field(default=256, ge=16, le=1024)
    height: int = Field(default=256, ge=16, le=1024)
    aov_depth: bool = Field(default=True)
    aov_normal: bool = Field(default=True)
    polish: bool = Field(
        default=False,
        description="When true, run diffusion polish on the structure (or composite) still",
    )
    prompt: str | None = Field(
        default=None,
        max_length=2000,
        description="Polish prompt (required when polish=true)",
    )
    polish_strength: float | None = Field(default=None, ge=0.0, le=1.0)
    rt4d_background_run_id: str | None = Field(
        default=None,
        max_length=64,
        description="Optional prior RT4D/generate run_id used as background plate",
    )
    path_trace: bool = Field(
        default=False,
        description=(
            "When true, PathTracer4D consumes WorldDocumentRt4d (capsules) from "
            "world_path instead of soft-raster. Requires world_path."
        ),
    )
    samples: int | None = Field(
        default=None,
        ge=1,
        le=64,
        description="Path-trace samples/pixel (path_trace only; default draft samples)",
    )
    max_depth: int | None = Field(
        default=None,
        ge=1,
        le=12,
        description="Path-trace max bounce depth (path_trace only)",
    )


class ProtonRasterRequest(BaseModel):
    """Proton six-mod soft-splat still (default-off provider)."""

    width: int = Field(default=256, ge=8, le=1024)
    height: int = Field(default=256, ge=8, le=1024)
    mode: str = Field(
        default="demo",
        description="demo | star-demo | lattice-demo | scene-spec",
    )
    aov_depth: bool = Field(default=True)
    aov_normal: bool = Field(default=True)
    seed: str | None = Field(default=None, max_length=64)
    scene_spec: dict[str, Any] | None = Field(
        default=None,
        description="Optional SceneSpecification when mode=scene-spec",
    )


class Engine3dSequenceRequest(BaseModel):
    """Short Engine3D soft-raster cinematic sequence (structure AOVs only)."""

    width: int = Field(default=64, ge=16, le=512)
    height: int = Field(default=48, ge=16, le=512)
    duration: float = Field(default=0.5, ge=0.1, le=5.0)
    fps: float = Field(default=4.0, ge=1.0, le=24.0)


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
def health(request: Request) -> dict:
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
        "byok": byok_health_view(settings, request),
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
        "nvidia_help": resolve_nvidia_help(
            nvidia_configured=settings.nvidia_configured,
            missing_key_help=NVIDIA_SETUP_HELP,
            warmup=_nvidia_warmup_state,
        ),
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
        # Ordered debug layers (dynamo-troubleshoot pattern) — no extra NIM calls.
        "nim_ops_checklist": nim_ops_checklist(
            nvidia_configured=settings.nvidia_configured,
            warmup=_nvidia_warmup_state,
            empty_504_retry=settings.empty_504_retry,
            nvcf_poll_seconds=nvidia_timeouts.nvcf_poll_seconds,
        ),
        # Ingest routes ship in app code; a 404 on Render means that deploy
        # predates the ingest commit — redeploy this service to pick them up.
        "image_ingest_routes": True,
        # Drive-G-1 capability disclosure: NVIDIA FLUX + optional RT4D renderer.
        # Seedance/fal remains video-only (no fal image fallback).
        "image_backend": settings.image_backend,
        "image_backends": [
            "nvidia-genai",
            RT4D_PROVIDER_ID,
            LEMONADE_PROVIDER_ID,
        ],
        "image_fallback_to_rt4d": settings.image_fallback_to_rt4d,
        "rt4d": rt4d_availability(settings),
        "lemonade": lemonade_availability(settings),
        "lemonade_note": (
            "Set GENBLAZE_IMAGE_BACKEND=lemonade to generate concept stills via "
            "local Lemonade Server (default SD-Turbo on localhost:13305). "
            "No NVIDIA API key required. First run may pull the model."
        ),
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
        "polish": polish_availability(settings),
        "polish_note": (
            "POST /api/polish-still applies diffusion img2img (fal.ai FLUX) to a "
            "prior RT4D/generate still. Structure pass = MRS RT4D; polish = "
            "diffusion edit. Not geometric reconstruction. Set "
            "GENBLAZE_POLISH_ENABLED=1 and configure FAL_KEY."
        ),
        "engine3d_still": engine3d_still_availability(settings),
        "engine3d_still_note": (
            "POST /api/engine3d-still renders Engine3D triangle structure "
            "(beauty + optional depth/normal). Optional RT4D background composite "
            "and polish. Faces/skin require polish — not RT4D sphere-bridge."
        ),
        "proton_raster": proton_raster_availability(settings),
        "proton_raster_note": (
            "POST /api/proton-raster runs six-mod proton soft-splat when "
            "PROTON_RASTER_ENABLED=1 (default off). Sibling to Engine3D "
            "triangle soft-raster."
        ),
        "render_request": render_request_availability(settings),
        "render_request_note": (
            "POST /api/render-request accepts RenderRequest JSON (MRS crossing). "
            "Opt-in: RENDER_REQUEST_API_ENABLED=1. Upstream Story→PromptSpec "
            "remains outside this host."
        ),
        "printer": printer_availability(settings),
        "printer_note": (
            "POST /printer/print | /printer/validate | /printer/provenance ; "
            "GET /printer/health. Opt-in execute: PRINTER_API_ENABLED=1. "
            "Timeout: MRS_PRINT_TIMEOUT_SECONDS."
        ),
        "engine3d_sequence": engine3d_sequence_availability(settings),
        "engine3d_sequence_note": (
            "POST /api/engine3d-sequence renders a short Engine3D soft-raster "
            "orbit sequence (structure). NOT 8K farm; NOT per-frame polish."
        ),
        "face_creation_assist": face_creation_assist_availability(settings),
        "face_creation_assist_note": (
            "POST /api/face-creation-assist (opt-in FACE_CREATION_ASSIST_ENABLED=1) "
            "shells to sovereign-x sx-face-creation CLI. assistOnly draft CharacterSpec; "
            "never Digital Printer SoT."
        ),
        "prompt_scene": prompt_scene_availability(settings),
        "prompt_scene_note": (
            "POST /api/prompt-to-scene: prompt → SceneSpecification + Engine3D "
            "world stub via out-of-process bridge. Optional render=true uses "
            "SceneSpecification → RT4D. Infinity narrative lane is out-of-process only."
        ),
        "chatgpt_plugin": plugin_availability(settings),
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
    - ``GENBLAZE_IMAGE_BACKEND=lemonade`` → local Lemonade diffusion (AMD).
    - default NVIDIA; if it fails and ``GENBLAZE_IMAGE_FALLBACK_TO_RT4D=1`` and
      the RT4D CLI/node are available, render deterministically instead of
      surfacing the NVIDIA failure (blank still, empty 504, etc.).
    ``quality`` sizes the RT4D render only (draft caps the RT4D_* profile).
    Bad input (``ValueError``) never triggers fallback.
    """
    if settings.rt4d_selected:
        return generate_image_rt4d(settings, prompt, quality=quality)
    if getattr(settings, "lemonade_selected", False):
        return generate_image_lemonade(settings, prompt)
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


def _run_generate_common(
    body: GenerateRequest,
    *,
    video: bool,
    request: Request | None = None,
) -> dict:
    """Shared generate path: image or video → embed → index → response-local preview."""
    base_settings = get_settings()
    byok_meta: dict[str, Any] = {}
    if request is not None:
        try:
            if video and byok_headers_present(request):
                raise ByokScopeError(
                    "BYOK scope is stills + assist only. "
                    "Video generate does not accept per-request keys."
                )
            settings, byok_meta = resolve_settings_for_request(
                base_settings,
                request,
                body_model=getattr(body, "model", None),
                scope=BYOK_SCOPE_VIDEO if video else BYOK_SCOPE_STILLS,
            )
        except ByokForbiddenError as exc:
            raise HTTPException(status_code=403, detail=str(exc)) from exc
        except ByokScopeError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc
    else:
        settings = base_settings
    # Uvicorn writes its access-log line only after the response is sent, and this
    # path can block for the full NVIDIA pipeline budget (see
    # settings.nvidia_pipeline_seconds). Without this the operator log shows only
    # the periodic GET /health while a generate is in flight, which reads as
    # "the UI never called the API". Log arrival and completion explicitly.
    kind = "video" if video else "image"
    started = time.monotonic()
    logger.info(
        "generate start · modality=%s backend=%s byok=%s prompt_chars=%d",
        kind,
        "nvidia-video" if video else settings.image_backend,
        bool(byok_meta.get("byok_used")),
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
    # Opt-in polish path: after successful generate, also run diffusion img2img.
    if (
        not video
        and body.then_polish
        and settings.polish_enabled
        and public.get("run_id")
    ):
        try:
            polish_prompt = body.polish_prompt or body.prompt
            if not (body.polish_prompt or "").strip() and looks_like_lattice_prompt(
                body.prompt
            ):
                polish_prompt = resolve_lattice_polish_prompt(
                    body.polish_prompt, lattice=True
                ) or LATTICE_POLISH_DEFAULT_PROMPT
            pol_res = _polish_pipeline(
                # Polish is out of BYOK scope — never proxy per-request keys into polish.
                base_settings,
                run_id=str(public["run_id"]),
                prompt=polish_prompt,
                strength=body.polish_strength,
            )
            public["polish"] = pol_res
            public["dual_path_note"] = (
                "Structure still preserved; polish is a separate diffusion edit "
                "(not a replacement)."
            )
        except HTTPException as exc:
            public["polish_error"] = exc.detail
        except Exception as exc:  # noqa: BLE001 — never fail the original still
            public["polish_error"] = str(exc)

    logger.info(
        "generate done · modality=%s run=%s byok=%s elapsed_s=%.1f",
        kind,
        public.get("run_id") or "—",
        bool(byok_meta.get("byok_used")),
        time.monotonic() - started,
    )
    if byok_meta:
        # Never include raw keys — meta is boolean provenance only.
        public["byok"] = {
            k: v
            for k, v in byok_meta.items()
            if k
            in {
                "byok_used",
                "byok_key_present",
                "byok_model_override",
                "byok_source",
                "byok_scope",
                "byok_permitted",
                "assistOnly",
                "printSoT",
            }
        }
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

    source_scene = None
    if run_id:
        source_scene = extract_source_scene(_index_lookup_run(run_id))

    try:
        interpreted = interpret_image_to_scene(
            settings,
            image_bytes,
            force_heuristic=force_heuristic,
            require_nvidia=require_nvidia,
            source_scene=source_scene,
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


def _polish_pipeline(
    settings: Any,
    *,
    run_id: str,
    prompt: str,
    strength: float | None = None,
) -> dict[str, Any]:
    """Resolve prior still → polish → return payload (no index, caller owns that)."""
    try:
        image_bytes, resolve_meta = resolve_image_bytes(
            image_base64=None,
            ingest_id=None,
            run_id=run_id,
            app_dir=APP_DIR,
            index_lookup=_index_lookup_run,
            b2_fetch=lambda key: _b2_fetch_bytes(settings, key),
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc

    source_entry = _index_lookup_run(run_id)
    source_sha256 = None
    if isinstance(source_entry, dict):
        source_sha256 = source_entry.get("asset_sha256")

    try:
        result = polish_image(
            settings,
            image_bytes,
            prompt,
            structure_run_id=run_id,
            structure_sha256=source_sha256,
            strength=strength,
        )
    except PolishNotConfiguredError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except PolishError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc

    payload = result.to_dict()
    # Index the polish result.
    entry: dict[str, Any] = {
        "run_id": payload["run_id"],
        "prompt": prompt,
        "model": payload["model"],
        "provider": payload["provider"],
        "status": "ok",
        "asset_sha256": payload["asset_sha256"],
        "preview_url": payload["preview_url"],
        "created_at": payload["created_at"],
        "modality": "image",
        "kind": "img2img-polish",
        "source_run_id": run_id,
        "img2img": True,
        "detail": payload.get("detail"),
        "manifest": payload.get("manifest"),
    }
    _index.prepend(entry)
    return {"polish_run_id": result.run_id, **payload}


@app.post("/api/generate")
def api_generate(body: GenerateRequest, request: Request) -> dict:
    return _run_generate_common(body, video=False, request=request)


@app.post("/api/generate-video")
def api_generate_video(body: GenerateRequest, request: Request) -> dict:
    return _run_generate_common(body, video=True, request=request)


@app.post("/api/image-to-scene")
def api_image_to_scene(body: ImageToSceneRequest, request: Request) -> dict:
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
    base = get_settings()
    try:
        settings, byok_meta = resolve_settings_for_request(
            base,
            request,
            scope=BYOK_SCOPE_ASSIST,
        )
    except ByokForbiddenError as exc:
        raise HTTPException(status_code=403, detail=str(exc)) from exc
    except ByokScopeError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    payload = _image_to_scene_pipeline(
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
    if byok_meta.get("byok_used"):
        payload["byok"] = {
            "byok_used": True,
            "byok_source": byok_meta.get("byok_source"),
            "assistOnly": True,
            "printSoT": False,
        }
    return payload


@app.post("/api/rt4d-to-nvidia")
def api_rt4d_to_nvidia(body: Rt4dToNvidiaRequest, request: Request) -> dict:
    """RT4D / generate still (run_id) → NVIDIA NIM vision → optional MRS re-render.

    Uses the existing NIM vision image→scene path (not img2img). Requires
    NVIDIA_API_KEY; on missing key or NIM 5xx/504 returns a clear NVIDIA-unavailable
    error and does not replace the source still.
    """
    base = get_settings()
    try:
        settings, byok_meta = resolve_settings_for_request(
            base,
            request,
            scope=BYOK_SCOPE_ASSIST,
        )
    except ByokForbiddenError as exc:
        raise HTTPException(status_code=403, detail=str(exc)) from exc
    except ByokScopeError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
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

    payload = _image_to_scene_pipeline(
        settings,
        run_id=req["run_id"],
        render=req["render"],
        force_heuristic=False,
        require_nvidia=True,
        quality=req["quality"],
        provenance_kind="rt4d-to-nvidia-mrs-full-frame",
    )
    if byok_meta.get("byok_used"):
        payload["byok"] = {
            "byok_used": True,
            "byok_source": byok_meta.get("byok_source"),
            "assistOnly": True,
            "printSoT": False,
        }
    return payload


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


@app.post("/api/polish-still")
def api_polish_still(body: PolishStillRequest, request: Request) -> dict:
    """Prior generate/RT4D still (run_id) → diffusion img2img polish.

    Structure pass = MRS RT4D; polish = diffusion edit. The source still is
    unchanged; a new run_id is returned for the polished result.

    Requires GENBLAZE_POLISH_ENABLED=1 and one of:
    - FAL_KEY (for fal.ai FLUX image-to-image)
    - NVIDIA_API_KEY (if NIM supports img2img on your key — not guaranteed)

    BYOK headers are rejected (400) — polish is out of BYOK scope.
    """
    if byok_headers_present(request):
        raise HTTPException(
            status_code=400,
            detail=(
                "BYOK scope is stills + assist only. "
                "Polish does not accept per-request keys/models."
            ),
        )

    settings = get_settings()

    if not settings.polish_enabled:
        raise HTTPException(
            status_code=503,
            detail=(
                "Image polish is disabled. Set GENBLAZE_POLISH_ENABLED=1 and "
                "configure FAL_KEY (or NVIDIA_API_KEY if NIM supports img2img)."
            ),
        )

    rid = (body.run_id or "").strip()
    if not rid or not is_run_id(rid):
        raise HTTPException(status_code=400, detail="invalid run_id")

    # Resolve image bytes from local preview cache or B2.
    try:
        image_bytes, resolve_meta = resolve_image_bytes(
            image_base64=None,
            ingest_id=None,
            run_id=rid,
            app_dir=APP_DIR,
            index_lookup=_index_lookup_run,
            b2_fetch=lambda key: _b2_fetch_bytes(settings, key),
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc

    # Look up the source entry for provenance.
    source_entry = _index_lookup_run(rid)
    source_sha256 = None
    if isinstance(source_entry, dict):
        source_sha256 = source_entry.get("asset_sha256")

    try:
        result = polish_image(
            settings,
            image_bytes,
            body.prompt,
            structure_run_id=rid,
            structure_sha256=source_sha256,
            strength=body.strength,
            quality=body.quality,
        )
    except PolishNotConfiguredError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except PolishError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc

    payload = result.to_dict()
    payload["resolve"] = resolve_meta if isinstance(resolve_meta, dict) else {}
    payload["source_run_id"] = rid

    # Index the polish result so it appears in /api/assets.
    entry: dict[str, Any] = {
        "run_id": payload["run_id"],
        "prompt": body.prompt,
        "model": payload["model"],
        "provider": payload["provider"],
        "status": "ok",
        "asset_sha256": payload["asset_sha256"],
        "preview_url": payload["preview_url"],
        "created_at": payload["created_at"],
        "modality": "image",
        "kind": "img2img-polish",
        "source_run_id": rid,
        "img2img": True,
        "detail": payload.get("detail"),
        "manifest": payload.get("manifest"),
    }
    _index.prepend(entry)

    return payload


@app.post("/api/prompt-to-scene")
def api_prompt_to_scene(body: PromptToSceneRequest) -> dict:
    """Prompt → SceneSpecification + Engine3D world stub (out-of-process bridge).

    Optional render=true path-traces the SceneSpecification via RT4D.
    Infinity narrative packages stay out-of-process (not imported under app/).
    """
    settings = get_settings()
    try:
        return prompt_to_scene(
            settings,
            body.prompt,
            render=body.render,
            quality=body.quality,
            width=body.width,
            height=body.height,
            samples=body.samples,
            max_depth=body.max_depth,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except GenerationQualityError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except PromptSceneBridgeError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc


@app.post("/api/face-creation-assist")
def api_face_creation_assist(body: FaceCreationAssistRequest, request: Request) -> dict:
    """Opt-in Face Creation Assist (Sovereign X CLI shell).

    assistOnly draft CharacterSpec / lookdev — never Digital Printer SoT.
    Requires FACE_CREATION_ASSIST_ENABLED=1.
    """
    base = get_settings()
    try:
        settings, byok_meta = resolve_settings_for_request(
            base,
            request,
            body_model=body.model,
            scope=BYOK_SCOPE_ASSIST,
        )
    except ByokForbiddenError as exc:
        raise HTTPException(status_code=403, detail=str(exc)) from exc
    except ByokScopeError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    avail = face_creation_assist_availability(settings)
    if not avail.get("enabled"):
        raise HTTPException(
            status_code=503,
            detail=(
                "Face Creation Assist disabled. "
                "Set FACE_CREATION_ASSIST_ENABLED=1 to opt in "
                "(assistOnly; not print SoT)."
            ),
        )
    try:
        payload = run_face_creation_assist(
            settings,
            prompt=body.prompt,
            image_path=body.image_path,
            dry_run=body.dry_run,
        )
    except FaceCreationAssistError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    if byok_meta.get("byok_used"):
        payload["byok"] = {
            "byok_used": True,
            "byok_source": byok_meta.get("byok_source"),
            "assistOnly": True,
            "printSoT": False,
        }
    return payload


@app.post("/api/engine3d-still")
def api_engine3d_still(body: Engine3dStillRequest) -> dict:
    """Engine3D structure still → optional RT4D composite → optional polish.

    Structure = Engine3D soft-raster triangles (beauty + AOVs). RT4D may supply
    a background plate only. Faces/skin require polish (diffusion) — never
    RT4D sphere-bridge.
    """
    settings = get_settings()
    # Face-aware polish may supply a default prompt when structure has face_rig;
    # still require an explicit prompt for non-face polish requests.
    if body.polish and not (body.prompt or "").strip():
        # Allow empty prompt — face defaults applied later if face_rig; otherwise
        # resolve_face_polish_prompt still returns a generic cinematic prompt.
        pass
    if body.polish and not settings.polish_enabled:
        raise HTTPException(
            status_code=503,
            detail=(
                "polish=true but image polish is disabled. "
                "Set GENBLAZE_POLISH_ENABLED=1 and configure FAL_KEY."
            ),
        )

    try:
        world_path = resolve_engine3d_cli_path(body.world_path, field="world_path")
        human_glb = resolve_engine3d_cli_path(body.human_glb, field="human_glb")
    except Engine3dStillPathError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    try:
        structure = generate_engine3d_still(
            settings,
            width=body.width,
            height=body.height,
            aov_depth=body.aov_depth,
            aov_normal=body.aov_normal,
            world_path=world_path,
            human_glb=human_glb,
            path_trace=bool(body.path_trace),
            samples=body.samples,
            max_depth=body.max_depth,
        )
    except Engine3dStillPathError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except Engine3dStillError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc

    structure_entry = structure.to_dict()
    structure_entry["modality"] = "image"
    structure_entry["kind"] = (
        "worlddocument-rt4d-path-trace" if body.path_trace else ENGINE3D_STILL_KIND
    )
    structure_entry["structure_source"] = (
        "path_trace" if body.path_trace else "engine3d_raster"
    )
    prov = structure_entry.get("provenance")
    if isinstance(prov, dict):
        structure_entry["face_rig"] = bool(prov.get("face_rig"))
        structure_entry["face_asset"] = prov.get("face_asset") or "none"
        if prov.get("structure_source"):
            structure_entry["structure_source"] = prov.get("structure_source")
        sr = prov.get("structure_record")
        if isinstance(sr, dict):
            structure_entry["face_rig"] = bool(
                structure_entry.get("face_rig") or sr.get("face_rig")
            )
            if sr.get("face_asset"):
                structure_entry["face_asset"] = sr.get("face_asset")
    _index.prepend(structure_entry)
    structure_public = _prefer_local_preview(
        {k: v for k, v in structure_entry.items() if k != "embedding_vector"}
    )

    payload: dict[str, Any] = {
        "structure": structure_public,
        "note": (
            "WorldDocumentRt4d → PathTracer4D. Oriented capsules + lattice materials. "
            "NOT soft-raster faces; NOT diffusion."
            if body.path_trace
            else (
                "Engine3D soft-raster structure still. NOT photoreal skin; "
                "NOT RT4D sphere-bridge. Optional composite/polish are separate."
            )
        ),
    }

    polish_run_id = str(structure.run_id)
    bg_rid = (body.rt4d_background_run_id or "").strip() or None

    if bg_rid:
        if not is_run_id(bg_rid):
            raise HTTPException(status_code=400, detail="invalid rt4d_background_run_id")
        try:
            subject_bytes, _ = resolve_image_bytes(
                run_id=str(structure.run_id),
                app_dir=APP_DIR,
                index_lookup=_index_lookup_run,
                b2_fetch=lambda key: _b2_fetch_bytes(settings, key),
            )
            bg_bytes, _ = resolve_image_bytes(
                run_id=bg_rid,
                app_dir=APP_DIR,
                index_lookup=_index_lookup_run,
                b2_fetch=lambda key: _b2_fetch_bytes(settings, key),
            )
            composite_png = composite_subject_over_background(
                background_png=bg_bytes,
                subject_png=subject_bytes,
                target_size=(body.width, body.height),
            )
        except (ValueError, FileNotFoundError) as exc:
            raise HTTPException(status_code=404, detail=str(exc)) from exc
        except CompositeError as exc:
            raise HTTPException(status_code=502, detail=str(exc)) from exc

        import uuid as _uuid
        from app.pipeline import _utc_now as _utc

        comp_run = str(_uuid.uuid4())
        put_preview(APP_DIR, comp_run, composite_png)
        comp_sha = composite_sha256(composite_png)
        comp_entry: dict[str, Any] = {
            "run_id": comp_run,
            "prompt": f"composite:{structure.run_id}+{bg_rid}",
            "model": "mrs-genblaze/composite",
            "provider": "engine3d-rt4d-composite",
            "status": "ok",
            "asset_sha256": comp_sha,
            "preview_url": f"/api/preview/{comp_run}",
            "created_at": _utc(),
            "modality": "image",
            "kind": "engine3d-rt4d-composite",
            "structure_source": "engine3d_composite",
            "structure_run_id": structure.run_id,
            "rt4d_background_run_id": bg_rid,
            "provenance": composite_provenance(
                structure_run_id=str(structure.run_id),
                rt4d_background_run_id=bg_rid,
                composite_sha256_hex=comp_sha,
                resized=True,
            ),
        }
        _index.prepend(comp_entry)
        payload["composite"] = _prefer_local_preview(comp_entry)
        polish_run_id = comp_run

    if body.polish:
        face_rig = False
        struct_prov = getattr(structure, "provenance", None)
        if isinstance(struct_prov, dict):
            sr = struct_prov.get("structure_record") or struct_prov
            if isinstance(sr, dict) and sr.get("face_rig"):
                face_rig = True
        # Also sniff public structure entry
        if structure_public.get("face_rig") or (
            isinstance(structure_public.get("provenance"), dict)
            and (
                structure_public["provenance"].get("face_rig")
                or (structure_public["provenance"].get("structure_record") or {}).get(
                    "face_rig"
                )
            )
        ):
            face_rig = True

        polish_prompt = resolve_face_polish_prompt(body.prompt, face_rig=face_rig)
        polish_strength = resolve_face_polish_strength(
            body.polish_strength,
            face_rig=face_rig,
            default_strength=settings.polish_default_strength,
        )
        # Non-face Engine3D stills default to glass/chrome lattice polish (not portrait).
        if not face_rig:
            lattice = looks_like_lattice_prompt(body.prompt) or not (body.prompt or "").strip()
            lattice_prompt = resolve_lattice_polish_prompt(body.prompt, lattice=lattice)
            if lattice_prompt:
                polish_prompt = lattice_prompt
            elif not (body.prompt or "").strip():
                polish_prompt = LATTICE_POLISH_DEFAULT_PROMPT
            polish_strength = resolve_lattice_polish_strength(
                body.polish_strength,
                lattice=lattice,
                default_strength=settings.polish_default_strength,
            )
        try:
            polish_payload = _polish_pipeline(
                settings,
                run_id=polish_run_id,
                prompt=polish_prompt,
                strength=polish_strength,
            )
            payload["polish"] = polish_payload
            payload["face_polish"] = {
                "face_rig": face_rig,
                "prompt_used": polish_prompt,
                "strength_used": polish_strength,
                "note": (
                    "Face-aware defaults are prompt/strength guidance only — "
                    "diffusion does not geometrically lock silhouette."
                ),
            }
            if not face_rig:
                payload["lattice_polish"] = {
                    "lattice": looks_like_lattice_prompt(body.prompt)
                    or not (body.prompt or "").strip(),
                    "prompt_used": polish_prompt,
                    "strength_used": polish_strength,
                    "note": (
                        "Glass/chrome lattice polish defaults refine materials/lighting; "
                        "sphere-chain structure is preserved, not replaced with true cylinders."
                    ),
                }
        except HTTPException:
            raise
        except Exception as exc:  # noqa: BLE001
            payload["polish_error"] = str(exc)

    return payload


@app.post("/api/render-request")
def api_render_request(body: dict[str, Any]) -> dict:
    """MRS crossing: RenderRequest JSON → RenderResult (optional PNG).

    Opt-in via RENDER_REQUEST_API_ENABLED=1. Does not implement upstream
    Story→PromptSpec stages (those remain outside this host).
    """
    settings = get_settings()
    avail = render_request_availability(settings)
    if not avail.get("enabled"):
        raise HTTPException(
            status_code=503,
            detail=(
                "RenderRequest API disabled. Set RENDER_REQUEST_API_ENABLED=1 "
                "and ensure the boundary run_pipeline.py is discoverable."
            ),
        )
    try:
        return run_render_request(body, settings, execute=True)
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=502, detail=str(exc)) from exc





@app.get("/printer/health")
def printer_health() -> dict:
    """Deterministic Digital Printer health (no execute)."""
    settings = get_settings()
    avail = printer_availability(settings)
    return {
        "status": "ok" if avail.get("pipeline_found") else "degraded",
        "kind": "mrs-digital-printer",
        "deterministic": True,
        **avail,
    }


@app.post("/printer/print")
def printer_print(body: dict[str, Any], dry_run: bool = Query(False)) -> dict:
    """Run the deterministic print pipeline (opt-in execute).

    Body: RenderRequest **or** ``{ scene, surfaces?, samples?, quality? }``.
    Set ``PRINTER_API_ENABLED=1`` for live Node prints. ``?dry_run=true`` forces
    sovereignty + evidence only.
    """
    settings = get_settings()
    avail = printer_availability(settings)
    if not avail.get("enabled") and not dry_run:
        raise HTTPException(
            status_code=503,
            detail=(
                "Printer API disabled. Set PRINTER_API_ENABLED=1 "
                "or pass dry_run=true for sovereignty-only."
            ),
        )
    try:
        return run_printer_print(body, settings, execute=not dry_run)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=502, detail=str(exc)) from exc


@app.post("/printer/validate")
def printer_validate(body: dict[str, Any]) -> dict:
    """Validate surface contract + SceneSpec / RenderRequest for print."""
    settings = get_settings()
    try:
        return run_printer_validate(body, settings)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=502, detail=str(exc)) from exc


@app.post("/printer/provenance")
def printer_provenance(body: dict[str, Any]) -> dict:
    """Return provenance frames for a print (dry-run evidence or caller echo)."""
    settings = get_settings()
    try:
        return run_printer_provenance(body, settings)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=502, detail=str(exc)) from exc


@app.post("/api/proton-raster")
def api_proton_raster(body: ProtonRasterRequest) -> dict:
    """Proton six-mod soft-splat still (beauty + optional AOVs).

    Default-off: requires PROTON_RASTER_ENABLED=1. Sibling path to Engine3D
    triangle soft-raster — not photoreal diffusion.
    """
    settings = get_settings()
    if not settings.proton_raster_enabled:
        raise HTTPException(
            status_code=503,
            detail=(
                "Proton raster is disabled. Set PROTON_RASTER_ENABLED=1 "
                "and ensure Node + render-proton-splat.mjs are available."
            ),
        )
    mode = (body.mode or "demo").strip().lower()
    if mode not in {"demo", "star-demo", "lattice-demo", "scene-spec"}:
        raise HTTPException(
            status_code=400,
            detail="mode must be demo|star-demo|lattice-demo|scene-spec",
        )
    if mode == "scene-spec" and body.scene_spec is None:
        raise HTTPException(
            status_code=400,
            detail="scene_spec required when mode=scene-spec",
        )
    try:
        result = generate_proton_raster(
            settings,
            width=body.width,
            height=body.height,
            mode=mode,
            aov_depth=body.aov_depth,
            aov_normal=body.aov_normal,
            seed=body.seed,
            scene_spec=body.scene_spec,
        )
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except ProtonRasterError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc

    entry = result.to_dict()
    entry["modality"] = "image"
    entry["kind"] = PROTON_RASTER_KIND
    return entry


@app.post("/api/engine3d-sequence")
def api_engine3d_sequence(body: Engine3dSequenceRequest) -> dict:
    """Short Engine3D soft-raster cinematic sequence (structure AOVs).

    Orbit camera timeline; preview is the first final frame. NOT 8K farm,
    NOT per-frame polish, NOT RT4D sphere-bridge for faces.
    """
    settings = get_settings()
    try:
        result = generate_engine3d_sequence(
            settings,
            width=body.width,
            height=body.height,
            duration=body.duration,
            fps=body.fps,
        )
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except Engine3dSequenceError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc

    entry = result.to_dict()
    entry["modality"] = "image"
    entry["kind"] = ENGINE3D_SEQUENCE_KIND
    entry["structure_source"] = "engine3d_raster"
    _index.prepend(entry)
    public = _prefer_local_preview(
        {k: v for k, v in entry.items() if k != "embedding_vector"}
    )
    return {
        "sequence": public,
        "note": (
            "Engine3D soft-raster short sequence. First frame previewed. "
            "NOT photoreal; NOT 8K farm; polish/RT4D composite not applied here."
        ),
    }


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


@app.get("/.well-known/ai-plugin.json")
def chatgpt_ai_plugin_manifest(request: Request) -> JSONResponse:
    """ChatGPT / Custom GPT plugin manifest (absolute URLs from request or env)."""
    settings = get_settings()
    base = resolve_public_base(settings, str(request.base_url))
    require_bearer = bool((settings.chatgpt_plugin_key or "").strip())
    body = build_ai_plugin_manifest(base, require_bearer=require_bearer)
    return JSONResponse(body)


@app.get("/plugin/openapi.json")
def chatgpt_plugin_openapi(request: Request) -> JSONResponse:
    """Scoped OpenAPI for Engine3D plugin / Custom GPT Actions."""
    settings = get_settings()
    base = resolve_public_base(settings, str(request.base_url))
    require_bearer = bool((settings.chatgpt_plugin_key or "").strip())
    return JSONResponse(build_plugin_openapi(base, require_bearer=require_bearer))


@app.get("/assets/engine3d-logo.svg")
def engine3d_logo() -> FileResponse:
    if not STATIC_LOGO.is_file():
        raise HTTPException(status_code=404, detail="logo missing")
    return FileResponse(STATIC_LOGO, media_type="image/svg+xml")


@app.get("/legal", response_class=HTMLResponse)
def legal_page() -> HTMLResponse:
    if STATIC_LEGAL.is_file():
        return HTMLResponse(STATIC_LEGAL.read_text(encoding="utf-8"))
    return HTMLResponse("<h1>Legal</h1><p>Page missing.</p>", status_code=500)
