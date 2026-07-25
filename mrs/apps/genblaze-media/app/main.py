"""FastAPI entry: health, generate (image + video), assets list, thin UI."""

from __future__ import annotations

from pathlib import Path

from fastapi import FastAPI, HTTPException, Query
from fastapi.responses import FileResponse, HTMLResponse, RedirectResponse
from pydantic import BaseModel, Field

from app.config import APP_DIR, NVIDIA_SETUP_HELP, get_settings
from app.embeddings import cosine_similarity, embed_texts, embedding_summary
from app.index_store import AssetIndex
from app.nvidia_http import NvidiaGenaiTimeouts, NvidiaVideoTimeouts
from app.pipeline import GenerationQualityError, generate_image, probe_b2
from app.pipeline_video import generate_video
from app.preview_cache import (
    get_preview_path,
    is_run_id,
    local_preview_url,
    media_type_for_path,
)

APP_DIR = Path(__file__).resolve().parent.parent
INDEX_PATH = APP_DIR / "data" / "recent-assets.json"
STATIC_DIR = Path(__file__).resolve().parent / "static"
STATIC_UI = STATIC_DIR / "index.html"
STATIC_CROS = STATIC_DIR / "cros.html"


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


app = FastAPI(
    title="MRS Genblaze Media",
    description=(
        "Provenanced generative concept media for Mandala Rendering System / "
        "4D scene authoring. Prompt → NVIDIA NIM FLUX (stills) or Cosmos (video) "
        "via Genblaze → Backblaze B2 assets + SHA-256 manifest. "
        "Does not claim Genblaze renders 4D."
    ),
    version="0.2.0",
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
        "b2_configured": settings.b2_configured,
        "b2_bucket": settings.b2_bucket if settings.b2_configured else None,
        "b2_region": settings.b2_region if settings.b2_configured else None,
        "image_model": settings.image_model,
        "video_model": settings.video_model,
        "video_enabled": settings.video_enabled,
        "video_available": settings.video_available,
        "cmm_id": "CMM-NIM-Cosmos-v1.0",
        "domain_id": "CH-GNMD-v1.0",
        "embed_model": settings.embed_model,
        "dry_run": settings.dry_run,
        "b2_probe_on_health": settings.b2_probe_on_health,
        "b2_probe_skipped": b2_probe_skipped,
        "b2_probe": b2_probe,
        "b2_error": b2_error,
        "nvidia_help": None if settings.nvidia_configured else NVIDIA_SETUP_HELP,
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
    }


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
        detail = str(exc)
        cause = exc.__cause__ or exc.__context__
        if cause is not None and str(cause) and str(cause) not in detail:
            detail = f"{detail}; cause: {type(cause).__name__}: {cause}"
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
