"""FastAPI entry: health, generate (image + video), assets list, image ingest, thin UI."""

from __future__ import annotations

import logging
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
from app.index_store import AssetIndex
from app.nvidia_errors import format_generation_failure
from app.nvidia_http import (
    NvidiaGenaiTimeouts,
    NvidiaVideoTimeouts,
    probe_genai_model_liveness,
)
from app.pipeline import GenerationQualityError, generate_image, probe_b2
from app.pipeline_video import generate_video
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
        "Provenanced generative concept media for Mandala Rendering System / "
        "4D scene authoring. Prompt → NVIDIA NIM FLUX (stills) or Cosmos (video) "
        "via Genblaze → Backblaze B2 assets + SHA-256 manifest. "
        "Image ingest stores operator photos and returns heuristic 4D suggestions — "
        "does not claim Genblaze renders or reconstructs 4D scenes."
    ),
    version="0.2.2",
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
        # Ingest routes ship in app code; a 404 on Render means that deploy
        # predates the ingest commit — redeploy this service to pick them up.
        "image_ingest_routes": True,
    }


def _format_generation_failure(exc: Exception) -> str:
    """Preserve provider detail and clarify an empty NVIDIA gateway 504."""
    return format_generation_failure(exc)


def _run_generate_common(body: GenerateRequest, *, video: bool) -> dict:
    """Shared generate path: image or video → embed → index → response-local preview."""
    settings = get_settings()
    try:
        result = generate_video(settings, body.prompt) if video else generate_image(
            settings, body.prompt
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except GenerationQualityError as exc:
        # Blank/near-black NIM still or unusable video — not a missing key.
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except RuntimeError as exc:
        # Missing NVIDIA key, video disabled, or B2 config — 503 with setup text.
        # Transfer/sink failures are re-raised as non-RuntimeError (see pipeline).
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except Exception as exc:  # noqa: BLE001
        # Include chained transfer cause when present (Genblaze SinkError omits it).
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
    return _prefer_local_preview(public)


@app.post("/api/generate")
def api_generate(body: GenerateRequest) -> dict:
    return _run_generate_common(body, video=False)


@app.post("/api/generate-video")
def api_generate_video(body: GenerateRequest) -> dict:
    return _run_generate_common(body, video=True)


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
        form = await request.form()
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
        return HTMLResponse(STATIC_UI.read_text(encoding="utf-8"))
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
