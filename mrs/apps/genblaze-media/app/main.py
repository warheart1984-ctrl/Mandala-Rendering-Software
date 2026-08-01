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
    generate_worlddocument_rt4d_still,
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
from app.style_steer import (
    ANIME_NOTE,
    STYLE_ANIME,
    apply_style_steer,
    resolve_style,
    style_health_payload,
)
from app.anime_ue_handoff import (
    ANIME_UE_ENDPOINT,
    anime_lane_health,
    anime_ue_availability,
    build_anime_ue_handoff,
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
from app.demo_cache import (
    SOURCE_B2_CACHE,
    SOURCE_B2_STRUCTURE,
    SOURCE_LIVE_GENERATE,
    claim_label,
    demo_cache_enabled,
    fetch_frame_from_b2,
    sha256_bytes,
    structure_only_response,
)
from app.gmi_provider import gmi_availability
from app.image_polish import (
    PolishError,
    PolishNotConfiguredError,
    polish_availability,
    polish_image,
)
from app.pre_render import load_cached_structure_if_available, structure_asset_key
from app.provider_cascade import cascade_health
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
from app.constitutional_schedule import (
    ConstitutionalDispatch,
    ConstitutionalScheduleDenied,
    _estimate_scene_complexity,
    _query_audit_trail,
    build_authority_entry,
    run_conformance_checks,
)
from app.sx_kernel import (
    CIS,
    ProcessIntent,
    SovereignXKernel,
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
STATIC_MRS_LOGO = STATIC_DIR / "assets" / "mrs-logo.png"
STATIC_MRS_BRAND = STATIC_DIR / "assets" / "mrs-brand.json"

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

# Sovereign X Kernel — constitutional governance for every dispatch.
_sx_kernel = SovereignXKernel()

# Module-level cache of the last kernel governance result (attached to response).
_last_kernel_result: dict[str, Any] | None = None


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
    style: str | None = Field(
        default=None,
        max_length=32,
        description=(
            "Media look lane: 'anime' (cel-shaded FLUX/Lemonade/polish prompt steer, "
            "status partial) or 'default'. Overrides GENBLAZE_STYLE when set. "
            "Does not claim photoreal; Cycles external-pbr remains optional."
        ),
    )
    demo_cache: bool | None = Field(
        default=None,
        description=(
            "When true (or GENBLAZE_DEMO_CACHE=1), serve pre-rendered B2 frames "
            "labeled source=b2-cache. Still exercises provider health/failover "
            "disclosure. Never claims live-generate on cache hits."
        ),
    )
    shot_id: str | None = Field(
        default=None,
        max_length=64,
        description="Demo-cache shot id (default GENBLAZE_DEMO_CACHE_SHOT).",
    )
    frame: int | None = Field(
        default=None,
        ge=0,
        le=9999,
        description="Demo-cache frame index (default GENBLAZE_DEMO_CACHE_FRAME).",
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
    style: str | None = Field(
        default=None,
        max_length=32,
        description="Look lane: 'anime' | 'default' (overrides GENBLAZE_STYLE)",
    )


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


class CropRegionModel(BaseModel):
    """Pixel ROI on the full-frame canvas (top-left origin)."""

    x: int = Field(ge=0)
    y: int = Field(ge=0)
    w: int = Field(ge=1, le=1024)
    h: int = Field(ge=1, le=1024)


def _crop_region_dict(region: CropRegionModel | None) -> dict[str, int] | None:
    if region is None:
        return None
    return {"x": region.x, "y": region.y, "w": region.w, "h": region.h}


class Engine3dStillRequest(BaseModel):
    """Engine3D structure still (+ optional RT4D composite + polish)."""

    world_path: str | None = Field(
        default=None,
        max_length=512,
        description="Optional path to world JSON (camera + id)",
    )
    world_document: dict[str, Any] | None = Field(
        default=None,
        description=(
            "Optional inline Engine3DWorldDocument, typically from "
            "/api/prompt-to-scene. Mutually exclusive with world_path."
        ),
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
    style: str | None = Field(
        default=None,
        max_length=32,
        description=(
            "Look lane for optional polish: 'anime' | 'default'. "
            "Overrides GENBLAZE_STYLE; steers polish prompt when polish=true."
        ),
    )
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
    crop_region: CropRegionModel | None = Field(
        default=None,
        description="Optional ROI: render full width×height canvas then crop (tile-faithful)",
    )
    tile_index: int | None = Field(
        default=None,
        ge=0,
        description="Optional tile sequence index for staged IDAC evidence",
    )


class Engine3dTileStillRequest(BaseModel):
    """Per-tile Engine3D still — requires crop_region on the frame canvas."""

    world_path: str | None = Field(default=None, max_length=512)
    human_glb: str | None = Field(default=None, max_length=512)
    width: int = Field(default=256, ge=16, le=1024)
    height: int = Field(default=256, ge=16, le=1024)
    aov_depth: bool = Field(default=True)
    aov_normal: bool = Field(default=True)
    crop_region: CropRegionModel
    tile_index: int | None = Field(default=None, ge=0)


class AnimeUeHandoffRequest(BaseModel):
    """Governed anime pipeline handoff for UE AnimeStylizer / ffmpeg (partial)."""

    dry_run: bool = Field(
        default=True,
        description="When true, return handoff JSON only (no structure render).",
    )
    render_structure: bool = Field(
        default=False,
        description=(
            "When true (and dry_run=false), run constitutional structure-only plate "
            "via AnimeWorldProfile (offline-safe tiny plate if Engine3D unavailable)."
        ),
    )
    prompt: str | None = Field(default=None, max_length=2000)
    anime_world_profile_path: str | None = Field(
        default=None,
        max_length=512,
        description="Optional AnimeWorldProfile JSON path (default: mandala-cel-v1 example).",
    )
    projection_method: str = Field(
        default="projector4d-sot",
        max_length=64,
        description="projector4d-sot | drop_w (structure-lane; Print SoT untouched).",
    )
    width: int = Field(default=256, ge=16, le=1024)
    height: int = Field(default=256, ge=16, le=1024)
    path_trace: bool = Field(default=False)


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
            "No NVIDIA API key required. First run may pull the model. "
            "AMD hosts without sd-server: GENBLAZE_SKIP_LOCAL_SD=1 and pre-render "
            "beauty on a GMI/cloud host (docs/ops/HACKATHON_DEMO_CACHE_B2.md)."
        ),
        "skip_local_sd": bool(getattr(settings, "skip_local_sd", False)),
        "rt4d_note": (
            "Deterministic procedural 4D path-traced stills via renderer-core. "
            "NOT text-to-image / not diffusion. Prompt selects a scene archetype; "
            "seed records variation. Requires Node + render-still.mjs; the "
            "rt4d.available field above is the authoritative check for this "
            "running image."
        ),
        "media_style": style_health_payload(getattr(settings, "media_style", None)),
        "media_style_note": ANIME_NOTE,
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
        "gmi": gmi_availability(settings),
        "provider_cascade": cascade_health(settings),
        "demo_cache": {
            "enabled": settings.demo_cache_enabled,
            "shot_id": settings.demo_cache_shot_id,
            "default_frame": settings.demo_cache_default_frame,
            "b2_prefix": f"{settings.storage_prefix}/demo-cache/",
            "status": "partial",
            "note": (
                "GENBLAZE_DEMO_CACHE=1 or body demo_cache=true serves "
                "pre-rendered B2 frames labeled source=b2-cache while "
                "provider_cascade still discloses failover readiness."
            ),
        },
        "pre_render": {
            "fallback_enabled": settings.pre_render_fallback_enabled,
            "shots_per_hour": settings.pre_render_shots_per_hour,
            "b2_prefix": f"{settings.storage_prefix}/pre-render/",
            "structure_key": structure_asset_key(settings.storage_prefix),
            "status": "partial",
            "spread_mode": "schedule+run-due",
            "note": (
                "python -m app.pre_render --spawn writes structure + 24h schedule; "
                "--run-due generates due demo-cache slots. "
                "GENBLAZE_PRE_RENDER_FALLBACK=1 serves structure.png on live fail "
                "(source=b2-structure-cache). Dual-path with demo-cache/."
            ),
        },
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
        "anime_lane": anime_lane_health(),
        "anime_ue": anime_ue_availability(),
        "anime_ue_note": (
            f"POST {ANIME_UE_ENDPOINT} — Anime Lane handoff (declared/partial). "
            "Forces style=anime; returns lane + anime_lane.contract_version + provenance. "
            "Contract: docs/anime-lane/ANIME_LANE_CROSS_ENGINE_CONTRACT.v1.md. "
            "UE optional; reliable demo Genblaze→structure→ffmpeg. Not promoted."
        ),
        "sx_kernel": {
            "active": True,
            "version": "1.0",
            "cis": list(CIS.meanings().keys()),
            "governed_throughput": _sx_kernel.describe()["throughput"],
            "mandala_energy": _sx_kernel.describe()["energy"],
            "note": "Sovereign X Kernel governs every dispatch with AUTH/CONT/ENRG/EXEC/REFL/AUDT/SYNC",
        },
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


def _simulate_image_result(prompt: str) -> dict:
    """Return a simulated image result for demo mode (no GPU required).

    Produces a small checkerboard PNG encoded as base64 so the demo UI
    can display it inline without any external storage.
    """
    import base64, io, struct, uuid, zlib
    from datetime import datetime, timezone

    width, height = 256, 256
    # Build a simple PNG: checkerboard pattern, 32-bit RGBA.
    raw = bytearray()
    for y in range(height):
        for x in range(width):
            bright = 200 if ((x // 32) + (y // 32)) % 2 == 0 else 40
            raw.extend([bright, bright, bright, 255])
    # Minimum PNG: IHDR + IDAT + IEND.
    def _chunk(ctype: bytes, data: bytes) -> bytes:
        chunk = struct.pack(">I", len(data)) + ctype + data
        return chunk + struct.pack(">I", zlib.crc32(chunk) & 0xFFFFFFFF)
    ihdr = struct.pack(">IIBBBBB", width, height, 8, 6, 0, 0, 0)
    raw_data = b""
    for y in range(height):
        raw_data += b"\x00" + bytes(raw[y * width * 4 : (y + 1) * width * 4])
    idat = zlib.compress(raw_data)
    png_bytes = (
        b"\x89PNG\r\n\x1a\n"
        + _chunk(b"IHDR", ihdr)
        + _chunk(b"IDAT", idat)
        + _chunk(b"IEND", b"")
    )
    b64 = base64.b64encode(png_bytes).decode("ascii")
    now = datetime.now(timezone.utc).replace(microsecond=0).isoformat()
    return {
        "run_id": f"demo-{uuid.uuid4().hex[:12]}",
        "prompt": prompt,
        "model": "SovereignX-Demo",
        "provider": "simulated",
        "status": "ok",
        "asset_key": None,
        "manifest_key": None,
        "asset_sha256": None,
        "preview_url": None,
        "created_at": now,
        "dry_run": False,
        "detail": "SX demo mode - simulated render (no GPU)",
        "prompt_sanitized": False,
        "quality": None,
        "provenance": None,
        "image_base64": f"data:image/png;base64,{b64}",
    }


def _dispatch_image_body(intent: ProcessIntent) -> dict:
    """Wrapper for ``_dispatch_image`` that accepts a ProcessIntent.

    Used as the ``dispatch_fn`` parameter when the SX kernel schedules
    a dispatch with ``execute=true``.  When ``SX_DEMO_MODE=1`` is set in
    the environment, returns a simulated image result instead of calling
    a real GPU backend — the demo works without API keys or hardware.
    """
    if os.getenv("SX_DEMO_MODE", "").strip().lower() in {"1", "true", "yes"}:
        return _simulate_image_result(intent.prompt)
    settings = get_settings()
    result = _dispatch_image(settings, intent.prompt)
    out = result.to_dict()
    # Attach inline base64 from the local preview cache so the demo UI
    # (dashboard / CLI) can display the image without an async fetch.
    if result.run_id and not out.get("image_base64"):
        from app.preview_cache import get_preview_path
        p = get_preview_path(APP_DIR, result.run_id)
        if p and p.is_file():
            import base64 as _b64
            ext = {"png": "image/png", "jpg": "image/jpeg", "webp": "image/webp"}.get(
                p.suffix.lstrip("."), "image/png"
            )
            out["image_base64"] = f"data:{ext};base64,{_b64.b64encode(p.read_bytes()).decode('ascii')}"
    return out


def _b2_structure_fallback_response(
    settings: Any,
    *,
    detail: str,
    cascade_probe: dict[str, Any],
    started: float,
    prompt: str,
    style: str,
    style_steered: bool,
    use_demo_cache: bool,
    shot_id: str | None,
    frame: int | None,
) -> dict[str, Any] | None:
    """Serve ``{prefix}/pre-render/structure.png`` when live providers fail.

    Enabled when ``GENBLAZE_PRE_RENDER_FALLBACK=1`` or demo_cache mode is on
    (demo miss → live fail → structure failover). Returns None on miss / skip.
    """
    if not (
        getattr(settings, "pre_render_fallback_enabled", False) or use_demo_cache
    ):
        return None
    cached, reason = load_cached_structure_if_available(settings)
    if cached is None:
        return None
    digest = sha256_bytes(cached)
    run_id = f"pre-render-structure-{digest[:12]}"
    put_preview(APP_DIR, run_id, cached)
    elapsed_ms = int((time.monotonic() - started) * 1000)
    return {
        "status": "ok",
        "run_id": run_id,
        "prompt": prompt,
        "model": None,
        "provider": "b2-pre-render",
        "source": SOURCE_B2_STRUCTURE,
        "source_label": claim_label(SOURCE_B2_STRUCTURE),
        "shot_id": shot_id,
        "frame": frame,
        "asset_key": structure_asset_key(settings.storage_prefix),
        "asset_sha256": digest,
        "preview_url": f"/api/preview/{run_id}",
        "dry_run": False,
        "detail": f"{detail} | b2_structure={reason}",
        "provider_cascade": cascade_probe,
        "style": style,
        "style_steered": style_steered,
        "modality": "image",
        "elapsed_ms": elapsed_ms,
        "demo_cache": use_demo_cache,
        "pre_render_fallback": True,
        "anime_claim": False,
        "note": (
            "B2 pre-render structure fallback — not live beauty. "
            "Painters/Fal/HF/GMI failed or were unavailable."
        ),
    }


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
    try:
        style = resolve_style(
            request_style=getattr(body, "style", None),
            settings_style=getattr(settings, "media_style", None),
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    prompt_for_gen, style_steered = apply_style_steer(body.prompt, style)
    logger.info(
        "generate start · modality=%s backend=%s byok=%s style=%s steered=%s prompt_chars=%d",
        kind,
        "nvidia-video" if video else settings.image_backend,
        bool(byok_meta.get("byok_used")),
        style,
        style_steered,
        len(prompt_for_gen or ""),
    )

    # ── Demo cache (pre-render → B2) — honest source labeling ──────────
    use_demo_cache = (not video) and demo_cache_enabled(
        settings, getattr(body, "demo_cache", None)
    )
    cascade_probe = cascade_health(settings)
    if use_demo_cache:
        shot_id = (
            (getattr(body, "shot_id", None) or settings.demo_cache_shot_id or "").strip()
        )
        frame = (
            int(body.frame)
            if getattr(body, "frame", None) is not None
            else int(settings.demo_cache_default_frame)
        )
        if not shot_id:
            raise HTTPException(
                status_code=400,
                detail=(
                    "demo_cache requires shot_id "
                    "(body.shot_id or GENBLAZE_DEMO_CACHE_SHOT)"
                ),
            )
        cached = fetch_frame_from_b2(settings, shot_id, frame)
        if cached is not None:
            image_bytes, prov = cached
            run_id = f"cache-{shot_id}-f{frame:04d}"
            put_preview(APP_DIR, run_id, image_bytes)
            elapsed_ms = int((time.monotonic() - started) * 1000)
            return {
                "status": "ok",
                "run_id": run_id,
                "prompt": body.prompt,
                "model": prov.model,
                "provider": prov.provider or "b2-demo-cache",
                "source": SOURCE_B2_CACHE,
                "source_label": claim_label(SOURCE_B2_CACHE),
                "shot_id": shot_id,
                "frame": frame,
                "asset_key": prov.asset_key,
                "manifest_key": prov.manifest_key,
                "asset_sha256": prov.asset_sha256,
                "preview_url": f"/api/preview/{run_id}",
                "created_at": prov.created_at,
                "dry_run": False,
                "detail": prov.detail,
                "provenance": prov.to_dict(),
                "provider_cascade": cascade_probe,
                "style": style,
                "style_steered": style_steered,
                "modality": "image",
                "elapsed_ms": elapsed_ms,
                "demo_cache": True,
                "note": (
                    "Cached beauty from B2. Provider cascade below is a health "
                    "probe only — this response is NOT live-generate."
                ),
            }
        # Cache miss: try live generate; on failure → structure-only (fail-closed).
        logger.info(
            "demo_cache miss · shot=%s frame=%s · attempting live-generate",
            shot_id,
            frame,
        )

    # ── Constitutional governance via Sovereign X Kernel ──────────────
    global _last_kernel_result
    try:
        # Run constitutional governance checks before dispatch (all modalities).
        modality = "video" if video else "image"
        intent = ProcessIntent(
            prompt=prompt_for_gen,
            authority_id=settings.nvidia_api_key or "genblaze-operator",
            metadata={"modality": modality, "style": style},
        )
        kr = _sx_kernel.schedule(intent)
        _last_kernel_result = kr.to_dict()
        if kr.verdict == "halt":
            raise RuntimeError(f"Constitutional kernel halted: {kr.error}")

        if video:
            result = generate_video(settings, prompt_for_gen)
        else:
            result = _dispatch_image(settings, prompt_for_gen, quality=body.quality)
    except ValueError as exc:
        fallback = _b2_structure_fallback_response(
            settings,
            detail=f"live generate rejected: {exc}",
            cascade_probe=cascade_probe,
            started=started,
            prompt=body.prompt,
            style=style,
            style_steered=style_steered,
            use_demo_cache=use_demo_cache,
            shot_id=getattr(body, "shot_id", None) or settings.demo_cache_shot_id,
            frame=getattr(body, "frame", None),
        )
        if fallback is not None:
            return fallback
        if use_demo_cache:
            return {
                **structure_only_response(
                    shot_id=getattr(body, "shot_id", None) or settings.demo_cache_shot_id,
                    frame=getattr(body, "frame", None),
                    detail=f"cache miss and live generate rejected: {exc}",
                ),
                "provider_cascade": cascade_probe,
                "demo_cache": True,
            }
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except GenerationQualityError as exc:
        fallback = _b2_structure_fallback_response(
            settings,
            detail=f"quality fail: {exc}",
            cascade_probe=cascade_probe,
            started=started,
            prompt=body.prompt,
            style=style,
            style_steered=style_steered,
            use_demo_cache=use_demo_cache,
            shot_id=getattr(body, "shot_id", None) or settings.demo_cache_shot_id,
            frame=getattr(body, "frame", None),
        )
        if fallback is not None:
            return fallback
        if use_demo_cache:
            return {
                **structure_only_response(
                    shot_id=getattr(body, "shot_id", None) or settings.demo_cache_shot_id,
                    frame=getattr(body, "frame", None),
                    detail=f"cache miss and quality fail: {exc}",
                ),
                "provider_cascade": cascade_probe,
                "demo_cache": True,
            }
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except RuntimeError as exc:
        fallback = _b2_structure_fallback_response(
            settings,
            detail=f"painters unavailable: {exc}",
            cascade_probe=cascade_probe,
            started=started,
            prompt=body.prompt,
            style=style,
            style_steered=style_steered,
            use_demo_cache=use_demo_cache,
            shot_id=getattr(body, "shot_id", None) or settings.demo_cache_shot_id,
            frame=getattr(body, "frame", None),
        )
        if fallback is not None:
            return fallback
        if use_demo_cache:
            return {
                **structure_only_response(
                    shot_id=getattr(body, "shot_id", None) or settings.demo_cache_shot_id,
                    frame=getattr(body, "frame", None),
                    detail=f"cache miss and painters unavailable: {exc}",
                ),
                "provider_cascade": cascade_probe,
                "demo_cache": True,
            }
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except Exception as exc:  # noqa: BLE001
        detail = _format_generation_failure(exc)
        fallback = _b2_structure_fallback_response(
            settings,
            detail=f"live generate failed: {detail}",
            cascade_probe=cascade_probe,
            started=started,
            prompt=body.prompt,
            style=style,
            style_steered=style_steered,
            use_demo_cache=use_demo_cache,
            shot_id=getattr(body, "shot_id", None) or settings.demo_cache_shot_id,
            frame=getattr(body, "frame", None),
        )
        if fallback is not None:
            return fallback
        if use_demo_cache:
            return {
                **structure_only_response(
                    shot_id=getattr(body, "shot_id", None) or settings.demo_cache_shot_id,
                    frame=getattr(body, "frame", None),
                    detail=f"cache miss and live generate failed: {detail}",
                ),
                "provider_cascade": cascade_probe,
                "demo_cache": True,
            }
        raise HTTPException(status_code=502, detail=f"generation failed: {detail}") from exc

    if hasattr(result, "style"):
        result.style = style
    if hasattr(result, "style_steered"):
        result.style_steered = style_steered
    if style == STYLE_ANIME:
        note = "style=anime (partial: diffusion prompt steer)"
        if getattr(settings, "rt4d_selected", False) and not video:
            note += "; RT4D pixels ignore anime steer — use FLUX/Lemonade/polish for look"
        if note not in (getattr(result, "detail", None) or ""):
            result.detail = (result.detail + " · " if result.detail else "") + note

    entry = result.to_dict()
    entry["style"] = style
    entry["style_steered"] = style_steered
    entry["modality"] = "video" if video else entry.get("modality") or "image"
    if not video:
        entry["source"] = SOURCE_LIVE_GENERATE
        entry["source_label"] = claim_label(SOURCE_LIVE_GENERATE)
        entry["provider_cascade"] = cascade_probe
        if use_demo_cache:
            entry["demo_cache"] = True
            entry["demo_cache_miss"] = True
            entry["note"] = (
                "demo_cache miss → live-generate this request "
                "(not b2-cache)."
            )
    # Attach constitutional governance metadata from the kernel.
    if _last_kernel_result:
        entry["governance"] = {
            "kernel": "SovereignXKernel",
            "verdict": _last_kernel_result["verdict"],
            "governed_throughput": _last_kernel_result.get("governed_throughput"),
            "mandala_energy": _last_kernel_result.get("mandala_energy"),
            "instructions": _last_kernel_result.get("instructions", []),
        }
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
            polish_prompt, _ = apply_style_steer(polish_prompt, style)
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
        style = resolve_style(
            request_style=getattr(body, "style", None),
            settings_style=getattr(settings, "media_style", None),
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    polish_prompt, style_steered = apply_style_steer(body.prompt, style)

    # ── Constitutional governance via Sovereign X Kernel ──────────────
    try:
        intent = ProcessIntent(
            prompt=polish_prompt,
            authority_id=settings.nvidia_api_key or "genblaze-operator",
            metadata={"modality": "polish", "source_run_id": rid, "style": style},
        )
        kr = _sx_kernel.schedule(intent)
        _last_kernel_result = kr.to_dict()
        if kr.verdict == "halt":
            raise RuntimeError(f"Constitutional kernel halted: {kr.error}")
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc

    try:
        result = polish_image(
            settings,
            image_bytes,
            polish_prompt,
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
    payload["style"] = style
    payload["style_steered"] = style_steered
    payload["resolve"] = resolve_meta if isinstance(resolve_meta, dict) else {}
    payload["source_run_id"] = rid
    # Attach constitutional governance metadata from the kernel.
    if _last_kernel_result:
        payload["governance"] = {
            "kernel": "SovereignXKernel",
            "verdict": _last_kernel_result["verdict"],
            "governed_throughput": _last_kernel_result.get("governed_throughput"),
            "mandala_energy": _last_kernel_result.get("mandala_energy"),
            "instructions": _last_kernel_result.get("instructions", []),
        }

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
    """Prompt → SceneSpecification + gated Engine3D world (out-of-process bridge).

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


@app.post("/api/anime")
def api_anime(body: AnimeUeHandoffRequest) -> dict:
    """Governed creative pipeline handoff (partial).

    Intent → structure/cel plate + AnimeWorldProfile + projection_method
    provenance for UE AnimeStylizer (optional) or ffmpeg. Not Full Photoreal;
    Print SoT untouched. See docs/ops/DEVPOST_GOVERNED_ANIME_PIPELINE.md.
    """
    import tempfile
    import uuid as _uuid

    from app.pre_render import _render_structure_only

    structure_png: bytes | None = None
    structure_run_id: str | None = None
    preview_url: str | None = None
    dry = bool(body.dry_run)

    if body.render_structure and not dry:
        settings = get_settings()
        with tempfile.TemporaryDirectory(prefix="anime-ue-") as tmp:
            try:
                structure_png, man = _render_structure_only(
                    settings=settings,
                    structure_profile_path=body.anime_world_profile_path,
                    out_dir=Path(tmp),
                )
            except FileNotFoundError as exc:
                raise HTTPException(status_code=400, detail=str(exc)) from exc
            except Exception as exc:  # noqa: BLE001 — surface pipeline failures honestly
                raise HTTPException(status_code=503, detail=str(exc)) from exc
            structure_run_id = str(
                man.get("run_id") or man.get("intentId") or _uuid.uuid4()
            )
            put_preview(APP_DIR, structure_run_id, structure_png)
            preview_url = f"/api/preview/{structure_run_id}"

    try:
        payload = build_anime_ue_handoff(
            projection_method=body.projection_method,
            anime_world_profile_path=body.anime_world_profile_path,
            prompt=body.prompt,
            dry_run=dry or not body.render_structure,
            structure_png=structure_png,
            structure_preview_url=preview_url,
            structure_run_id=structure_run_id,
            width=body.width,
            height=body.height,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except FileNotFoundError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    if structure_png is not None and structure_run_id:
        entry = {
            "run_id": structure_run_id,
            "prompt": body.prompt or "anime-ue-structure",
            "model": "mrs-genblaze/anime-structure",
            "provider": "constitutional-anime-structure",
            "status": "ok",
            "asset_sha256": payload.get("provenance", {}).get("asset_sha256"),
            "preview_url": preview_url,
            "created_at": payload.get("created_at"),
            "modality": "image",
            "kind": "anime-structure-plate",
            "anime_world_profile_id": payload.get("anime_world_profile_id"),
            "projection_method": payload.get("projection_method"),
            "provenance": payload.get("provenance"),
        }
        _index.prepend(entry)

    return payload


@app.post("/api/engine3d-still")
def api_engine3d_still(body: Engine3dStillRequest) -> dict:
    """Engine3D structure still → optional RT4D composite → optional polish.

    Structure = Engine3D soft-raster triangles (beauty + AOVs). RT4D may supply
    a background plate only. Faces/skin require polish (diffusion) — never
    RT4D sphere-bridge.
    """
    settings = get_settings()
    if body.world_path and body.world_document is not None:
        raise HTTPException(
            status_code=400,
            detail="provide world_path or world_document, not both",
        )
    if body.world_document is not None:
        objects = body.world_document.get("objects")
        if not isinstance(body.world_document.get("id"), str):
            raise HTTPException(
                status_code=400,
                detail="world_document.id must be a string",
            )
        if not isinstance(objects, list):
            raise HTTPException(
                status_code=400,
                detail="world_document.objects must be an array",
            )
        if len(objects) > 2048:
            raise HTTPException(
                status_code=400,
                detail="world_document.objects exceeds the 2048 item cap",
            )
        if body.path_trace:
            raise HTTPException(
                status_code=400,
                detail="inline world_document currently supports Engine3D soft-raster only",
            )
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

    if body.path_trace:
        if not world_path:
            raise HTTPException(
                status_code=400,
                detail="path_trace=true requires world_path (Engine3D WorldDocument JSON)",
            )
        if body.polish:
            raise HTTPException(
                status_code=400,
                detail="polish=true is incompatible with path_trace structure stills",
            )
        samples = body.samples if body.samples is not None else 4
        max_depth = body.max_depth if body.max_depth is not None else 4
        crop = _crop_region_dict(body.crop_region)
        try:
            structure = generate_worlddocument_rt4d_still(
                settings,
                world_path=world_path,
                width=body.width,
                height=body.height,
                samples=samples,
                max_depth=max_depth,
                crop_region=crop,
            )
        except Engine3dStillPathError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc
        except RuntimeError as exc:
            raise HTTPException(status_code=503, detail=str(exc)) from exc
        except Engine3dStillError as exc:
            raise HTTPException(status_code=502, detail=str(exc)) from exc
    else:
        try:
            structure = generate_engine3d_still(
                settings,
                width=body.width,
                height=body.height,
                aov_depth=body.aov_depth,
                aov_normal=body.aov_normal,
                world_path=world_path,
                world_document=body.world_document,
                human_glb=human_glb,
                crop_region=_crop_region_dict(body.crop_region),
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

        try:
            eng_style = resolve_style(
                request_style=getattr(body, "style", None),
                settings_style=getattr(settings, "media_style", None),
            )
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc
        polish_prompt = resolve_face_polish_prompt(
            body.prompt,
            face_rig=face_rig,
            style=eng_style,
        )
        polish_prompt, _style_steered = apply_style_steer(polish_prompt, eng_style)
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


@app.post("/api/engine3d-tile-still")
def api_engine3d_tile_still(body: Engine3dTileStillRequest) -> dict:
    """Per-tile ROI still — full canvas render + ``crop_region`` (W-TILE-FAITHFUL downstream)."""
    still = Engine3dStillRequest(
        world_path=body.world_path,
        human_glb=body.human_glb,
        width=body.width,
        height=body.height,
        aov_depth=body.aov_depth,
        aov_normal=body.aov_normal,
        polish=False,
        path_trace=body.path_trace,
        crop_region=body.crop_region,
        tile_index=body.tile_index,
    )
    payload = api_engine3d_still(still)
    payload["tile"] = {
        "tile_index": body.tile_index,
        "crop_region": _crop_region_dict(body.crop_region),
        "endpoint": "/api/engine3d-tile-still",
    }
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
    # ── Constitutional governance via Sovereign X Kernel ──────────────
    try:
        intent = ProcessIntent(
            prompt=body.get("prompt", ""),
            authority_id=settings.nvidia_api_key or "genblaze-operator",
            metadata={"modality": "render-request"},
        )
        kr = _sx_kernel.schedule(intent)
        _last_kernel_result = kr.to_dict()
        if kr.verdict == "halt":
            raise RuntimeError(f"Constitutional kernel halted: {kr.error}")
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc

    try:
        result = run_render_request(body, settings, execute=True)
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    # Attach constitutional governance metadata.
    if isinstance(result, dict) and _last_kernel_result:
        result["governance"] = {
            "kernel": "SovereignXKernel",
            "verdict": _last_kernel_result["verdict"],
            "governed_throughput": _last_kernel_result.get("governed_throughput"),
            "mandala_energy": _last_kernel_result.get("mandala_energy"),
            "instructions": _last_kernel_result.get("instructions", []),
        }
    return result





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


@app.get("/assets/mrs-logo.png")
def mrs_logo() -> FileResponse:
    if not STATIC_MRS_LOGO.is_file():
        raise HTTPException(status_code=404, detail="MRS logo missing")
    return FileResponse(STATIC_MRS_LOGO, media_type="image/png")


@app.get("/brand/mrs.json")
def mrs_brand_profile() -> FileResponse:
    if not STATIC_MRS_BRAND.is_file():
        raise HTTPException(status_code=404, detail="MRS brand profile missing")
    return FileResponse(STATIC_MRS_BRAND, media_type="application/json")


# ---------------------------------------------------------------------------
# Sovereign X CCS — Constitutional Compute Scheduling
# ---------------------------------------------------------------------------

class CcsDispatchRequest(BaseModel):
    """Constitutional dispatch request — wraps existing render dispatch
    with authority chain, continuity verification, and ledger recording.

    This is the Sovereign X Router as Scheduler interface. Every dispatch
    carries AUTH (who authorized it), CONT (what prior state it continues),
    REFL (what happened — via RenderReceipt), and AUDT (ledger entry).
    """

    prompt: str = Field(..., min_length=1, max_length=2000)
    authority_id: str | None = Field(
        default=None,
        description="Operator or Director authority ID for the AUTH chain",
    )
    continuity_id: str | None = Field(
        default=None,
        description=(
            "Link to a prior dispatch continuity chain. When set, the "
            "scheduler verifies the prior receipt exists in the ledger "
            "before executing."
        ),
    )
    quality: str | None = Field(
        default=None,
        description="Render quality hint (draft/final) passed to the provider",
    )
    dry_run: bool = Field(
        default=False,
        description="When true, run constitutional checks only — skip actual render",
    )


@app.post("/api/ccs/dispatch")
def api_ccs_dispatch(body: CcsDispatchRequest, request: Request) -> dict:
    """POST /api/ccs/dispatch — Sovereign X Constitutional Compute Scheduling.

    Wraps the existing Genblaze render dispatch with AUTH/CONT/REFL/AUDT
    governance checks. Returns both the render result and the RenderReceipt
    with full constitutional trace.

    This endpoint does NOT replace /api/generate — it adds governance
    around the same dispatch.
    """
    settings = get_settings()
    prompt = body.prompt.strip()
    if not prompt:
        raise HTTPException(status_code=400, detail="prompt is required")

    # Build the authority entry (Director or operator signature).
    authority_entry = None
    if body.authority_id:
        authority_entry = build_authority_entry(
            authority_id=body.authority_id,
            role="infinity-director",
            statement=f"ccs dispatch for prompt: {prompt[:80]}",
        )

    # Initialize the constitutional scheduler.
    scheduler = ConstitutionalDispatch(settings)

    # AUTH: prepare the route decision with governance trace.
    try:
        decision = scheduler.prepare(
            prompt,
            authority_override=authority_entry,
            continuity_id=body.continuity_id,
            rt4d_enabled=rt4d_availability(settings)["available"],
        )
    except ConstitutionalScheduleDenied as exc:
        raise HTTPException(
            status_code=403,
            detail={
                "error": "Constitutional policy denied dispatch",
                "policies_applied": (
                    exc.decision.governance_trace.get("policiesApplied")
                    if exc.decision.governance_trace
                    else None
                ),
                "governance_trace": exc.decision.governance_trace,
            },
        ) from exc
    except Exception as exc:
        raise HTTPException(
            status_code=502,
            detail=f"Constitutional schedule preparation failed: {exc}",
        ) from exc

    # Dry-run: return the decision without executing.
    if body.dry_run:
        return {
            "status": "dry_run",
            "decision": decision.to_dict(),
            "note": "Dry-run: constitutional checks passed, render not executed.",
        }

    # CONT/REFL: execute dispatch.
    try:
        result, receipt = scheduler.execute(
            decision,
            prompt,
            dispatch_fn=generate_image_rt4d,
            quality=body.quality,
        )
    except Exception as exc:
        raise HTTPException(
            status_code=502,
            detail=f"Constitutional dispatch execution failed: {exc}",
        ) from exc

    # AUDT: record to ledger (best-effort).
    scheduler.record(receipt)

    return {
        "status": result.status,
        "run_id": result.run_id,
        "model": result.model,
        "provider": result.provider,
        "asset_sha256": result.asset_sha256,
        "preview_url": result.preview_url,
        "created_at": result.created_at,
        "detail": result.detail,
        "decision": decision.to_dict(),
        "receipt": receipt.to_dict(),
        "governance_trace": decision.governance_trace,
        "note": (
            "Constitutional schedule: AUTH (authority chain) → "
            "CONT/REFL (dispatch + receipt) → AUDT (ledger entry). "
            "result.renderer_role and result.ai_role document what each "
            "system contributed."
        ),
    }


# ── SceneSpec / SceneSpecification type alias ──────────────────────
SceneSpecification = dict[str, Any]


class CcsPlayTimelineRequest(BaseModel):
    """Request body for POST /api/ccs/play-timeline."""

    spec: SceneSpecification = Field(
        ...,
        description="SceneSpecification JSON (validated by renderer-core/scene-spec CLI)",
    )
    continuity_id: str | None = Field(
        default=None,
        description="Link this dispatch to a prior continuity chain",
    )
    authority_id: str | None = Field(
        default=None,
        description="Optional authority id (e.g. Infinity Director) signing the dispatch",
    )
    world_id: str | None = Field(
        default=None,
        description="World identifier — required for timeline dispatches (ascension evidence)",
    )
    quality: str | None = Field(
        default=None,
        description="Render quality (draft/final)",
    )


@app.post("/api/ccs/play-timeline")
def api_ccs_play_timeline(body: CcsPlayTimelineRequest, request: Request) -> dict:
    """POST /api/ccs/play-timeline — Sovereign X Timeline Scene Render.

    Wraps ``render_scene_spec()`` with AUTH/CONT/REFL/AUDT governance.

    The spec field is a SceneSpecification JSON object that is validated and
    rendered by the renderer-core scene-spec CLI (Node.js). Returns both the
    ``GenerateResult`` and the full ``RenderReceipt`` with governance trace.
    """
    from app.scene_spec_provider import render_scene_spec

    settings = get_settings()
    spec = body.spec

    # Build authority entry if provided.
    authority_entry = None
    if body.authority_id:
        authority_entry = build_authority_entry(
            authority_id=body.authority_id,
            role="infinity-director",
            statement=f"play-timeline dispatch for spec id: {spec.get('id', 'unnamed')}",
        )

    scheduler = ConstitutionalDispatch(settings)

    # AUTH.
    prompt = f"scene-spec:{spec.get('id', 'unnamed')}"
    try:
        decision = scheduler.prepare(
            prompt,
            authority_override=authority_entry,
            continuity_id=body.continuity_id,
            world_id=body.world_id,
            rt4d_enabled=True,
        )
    except ConstitutionalScheduleDenied as exc:
        raise HTTPException(
            status_code=403,
            detail={
                "error": "Constitutional policy denied play-timeline dispatch",
                "policies_applied": (
                    exc.decision.governance_trace.get("policiesApplied")
                    if exc.decision.governance_trace
                    else None
                ),
                "governance_trace": exc.decision.governance_trace,
            },
        ) from exc

    # CONT/REFL: execute scene-spec render.
    try:
        result = render_scene_spec(
            settings,
            spec,
            quality=body.quality,
            storage_kind="ccs-play-timeline",
        )
    except Exception as exc:
        raise HTTPException(
            status_code=502,
            detail=f"Scene-spec render failed: {exc}",
        ) from exc

    # Build receipt.
    receipt = build_render_receipt(
        decision=decision,
        result=result,
        renderer="scene-spec",
        quality=body.quality or "draft",
    )

    # AUDT: record to ledger (best-effort).
    scheduler.record(receipt)

    return {
        "status": result.status,
        "run_id": result.run_id,
        "asset_sha256": result.asset_sha256,
        "preview_url": result.preview_url,
        "created_at": result.created_at,
        "spec_id": spec.get("id", "unnamed"),
        "decision": decision.to_dict(),
        "receipt": receipt.to_dict(),
        "governance_trace": decision.governance_trace,
        "note": (
            "Constitutional timeline render: AUTH → scene-spec render → "
            "CONT/REFL (provenance receipt) → AUDT (ledger entry). "
            "See decision and receipt fields for full trace."
        ),
    }


# ---------------------------------------------------------------------------
# CCS Audit Trail
# ---------------------------------------------------------------------------

@app.get("/api/ccs/audit-trail")
def api_ccs_audit_trail(
    request: Request,
    authority_id: str | None = None,
    continuity_id: str | None = None,
    limit: int = 50,
) -> dict:
    """GET /api/ccs/audit-trail — query constitutional dispatch ledger.

    Returns receipts from the Memory Board matching the given authority_id
    or continuity_id, most recent first.
    """
    receipts = _query_audit_trail(
        authority_id=authority_id,
        continuity_id=continuity_id,
        limit=min(limit, 200),
    )
    return {
        "count": len(receipts),
        "authority_id": authority_id,
        "continuity_id": continuity_id,
        "receipts": receipts,
        "note": "Audit trail from Jarvis Memory Board ledger.",
    }


# ---------------------------------------------------------------------------
# CCS Conformance
# ---------------------------------------------------------------------------

@app.post("/api/ccs/conformance")
def api_ccs_conformance(request: Request) -> dict:
    """POST /api/ccs/conformance — run 16-point conformance checks.

    Evaluates each check from ``default.conformance-profile.json`` against
    the current runtime. Returns pass/fail per check.
    """
    results = run_conformance_checks()
    passed = sum(1 for r in results if r.get("status") == "pass")
    failed = sum(1 for r in results if r.get("status") == "fail")
    return {
        "total": len(results),
        "passed": passed,
        "failed": failed,
        "checks": results,
        "conformant": failed == 0,
        "note": "16-point conformance check against default.conformance-profile.json.",
    }


# ---------------------------------------------------------------------------
# CCS Scene Spec Optimisation
# ---------------------------------------------------------------------------

class CcsOptimiseRequest(BaseModel):
    """Request body for POST /api/ccs/optimise-scene."""

    spec: SceneSpecification = Field(
        ...,
        description="SceneSpecification JSON to analyse for render optimisation",
    )


class CcsMultiSignRequest(BaseModel):
    """Request body for POST /api/ccs/multi-sign-dispatch."""

    prompt: str = Field(..., min_length=1, max_length=2000)
    authorities: list[dict[str, Any]] = Field(
        default_factory=list,
        description="List of authority entries (each from build_authority_entry)",
    )
    required_signatures: int = Field(
        default=1,
        description="Minimum number of unique authorities required (N-of-M)",
        ge=0,
        le=20,
    )
    continuity_id: str | None = None
    world_id: str | None = None
    quality: str | None = None
    dry_run: bool = False


@app.post("/api/ccs/optimise-scene")
def api_ccs_optimise_scene(body: CcsOptimiseRequest, request: Request) -> dict:
    """POST /api/ccs/optimise-scene — analyse spec and tune render params.

    Inspects the SceneSpecification's object count, material references,
    animation flags, and lighting, then returns recommended render
    parameters.
    """
    analysis = _estimate_scene_complexity(body.spec)
    return {
        "analysis": analysis,
        "note": (
            "Scene complexity analysis for auto-tuning render params. "
            "Use recommended_quality, recommended_max_depth, and "
            "recommended_samples in your dispatch call."
        ),
    }


@app.post("/api/ccs/multi-sign-dispatch")
def api_ccs_multi_sign(body: CcsMultiSignRequest, request: Request) -> dict:
    """POST /api/ccs/multi-sign-dispatch — N-of-M multi-authority signing.

    Requires at least ``required_signatures`` unique authority entries
    in the ``authorities`` list before the dispatch is allowed.
    """
    settings = get_settings()
    if not body.authorities:
        raise HTTPException(status_code=400, detail="at least one authority entry required")

    scheduler = ConstitutionalDispatch(settings)

    try:
        decision = scheduler.prepare(
            body.prompt,
            authority_overrides=body.authorities,
            continuity_id=body.continuity_id,
            world_id=body.world_id,
            required_signatures=body.required_signatures,
        )
    except ConstitutionalScheduleDenied as exc:
        authority_ids = [e.get("authority_id", "?") for e in body.authorities]
        raise HTTPException(
            status_code=403,
            detail={
                "error": "Multi-authority dispatch denied",
                "authorities_provided": authority_ids,
                "required_signatures": body.required_signatures,
                "policies_applied": (
                    exc.decision.governance_trace.get("policiesApplied")
                    if exc.decision.governance_trace else None
                ),
                "governance_trace": exc.decision.governance_trace,
            },
        ) from exc

    unique_ids = len({e.get("authority_id", "") for e in body.authorities if e.get("authority_id")})
    if body.dry_run:
        return {
            "status": "dry_run",
            "decision": decision.to_dict(),
            "authorities_provided": len(body.authorities),
            "unique_authorities": unique_ids,
            "required_signatures": body.required_signatures,
            "satisfied": unique_ids >= body.required_signatures,
            "note": "Multi-authority N-of-M signing check passed.",
        }

    result, receipt = scheduler.execute(
        decision,
        body.prompt,
        quality=body.quality,
    )
    scheduler.record(receipt)

    return {
        "status": result.status,
        "run_id": result.run_id,
        "decision": decision.to_dict(),
        "receipt": receipt.to_dict(),
        "authorities_provided": len(body.authorities),
        "unique_authorities": unique_ids,
        "required_signatures": body.required_signatures,
        "satisfied": unique_ids >= body.required_signatures,
    }


# ---------------------------------------------------------------------------
# Sovereign X Kernel — Scheduling API
# ---------------------------------------------------------------------------

class SxScheduleRequest(BaseModel):
    """Request body for POST /api/sx/schedule — direct kernel scheduling."""

    prompt: str = Field(default="", max_length=2000)
    authority_id: str = Field(default="genblaze-operator", max_length=256)
    continuity_id: str = Field(default="", max_length=256)
    world_id: str = Field(default="", max_length=256)
    energy_kw: float = Field(default=150.0, ge=0.0, le=1e6)
    dispatch: bool = Field(
        default=False,
        description="If true, execute the dispatch function (dry-run otherwise)",
    )
    priority: int = Field(default=0, ge=-10, le=10)
    metadata: dict[str, Any] = Field(default_factory=dict)


@app.post("/api/sx/schedule")
def api_sx_schedule(body: SxScheduleRequest) -> dict:
    """POST /api/sx/schedule — submit a process intent to the Sovereign X Kernel.

    Runs the full CIS pipeline (AUTH/CONT/ENRG/EXEC/REFL/AUDT/SYNC) and
    returns the verdict, governed throughput, mandala energy, and instruction
    trace. When ``dispatch=true`` the kernel executes the Genblaze image
    pipeline as the dispatch function.
    """
    intent = ProcessIntent(
        prompt=body.prompt,
        authority_id=body.authority_id,
        continuity_id=body.continuity_id,
        world_id=body.world_id,
        energy_kw=body.energy_kw,
        priority=body.priority,
        metadata={**body.metadata, "source": "sx-schedule-api"},
    )
    dispatch_fn = _dispatch_image_body if body.dispatch else None
    result = _sx_kernel.schedule(intent, dispatch_fn=dispatch_fn)
    global _last_kernel_result
    _last_kernel_result = result.to_dict()
    return result.to_dict()


# ---------------------------------------------------------------------------
# Sovereign X Kernel — Telemetry / Metrics
# ---------------------------------------------------------------------------

@app.get("/api/sx/metrics")
def api_sx_metrics() -> dict:
    """GET /api/sx/metrics — kernel telemetry and operational counters.

    Returns dispatch count, halt rate, average CIS latency, sync count,
    and error frequency distribution.
    """
    return {
        "kernel": "SovereignXKernel",
        "version": "1.0",
        **(_sx_kernel.metrics()),
    }


@app.get("/legal", response_class=HTMLResponse)
def legal_page() -> HTMLResponse:
    if STATIC_LEGAL.is_file():
        return HTMLResponse(STATIC_LEGAL.read_text(encoding="utf-8"))
    return HTMLResponse("<h1>Legal</h1><p>Page missing.</p>", status_code=500)
