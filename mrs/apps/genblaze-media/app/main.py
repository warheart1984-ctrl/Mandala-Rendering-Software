"""FastAPI entry: health, generate, assets list, thin UI."""

from __future__ import annotations

from pathlib import Path

from fastapi import FastAPI, HTTPException, Query
from fastapi.responses import HTMLResponse
from pydantic import BaseModel, Field

from app.config import NVIDIA_SETUP_HELP, get_settings
from app.embeddings import cosine_similarity, embed_texts, embedding_summary
from app.index_store import AssetIndex
from app.nvidia_http import NvidiaGenaiTimeouts
from app.pipeline import generate_image, probe_b2

APP_DIR = Path(__file__).resolve().parent.parent
INDEX_PATH = APP_DIR / "data" / "recent-assets.json"
STATIC_UI = Path(__file__).resolve().parent / "static" / "index.html"

app = FastAPI(
    title="MRS Genblaze Media",
    description=(
        "Provenanced generative concept media for Mandala Rendering System / "
        "4D scene authoring. Prompt → NVIDIA NIM (via Genblaze) → Backblaze B2 "
        "assets + SHA-256 manifest. Does not claim Genblaze renders 4D."
    ),
    version="0.1.0",
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
    if settings.b2_configured:
        try:
            b2_probe = probe_b2(settings)
        except Exception as exc:  # noqa: BLE001 — surface to health JSON
            b2_error = str(exc)
    nvidia_timeouts = NvidiaGenaiTimeouts.from_env()
    return {
        "status": "ok",
        "service": "mrs-genblaze-media",
        "nvidia_configured": settings.nvidia_configured,
        "b2_configured": settings.b2_configured,
        "b2_bucket": settings.b2_bucket if settings.b2_configured else None,
        "b2_region": settings.b2_region if settings.b2_configured else None,
        "image_model": settings.image_model,
        "embed_model": settings.embed_model,
        "dry_run": settings.dry_run,
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
    }


@app.post("/api/generate")
def api_generate(body: GenerateRequest) -> dict:
    settings = get_settings()
    try:
        result = generate_image(settings, body.prompt)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except RuntimeError as exc:
        # Missing NVIDIA key or B2 config — 503 with setup text
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=502, detail=f"generation failed: {exc}") from exc

    entry = result.to_dict()
    if body.embed and settings.nvidia_configured and not settings.dry_run:
        try:
            vector = embed_texts(settings, [body.prompt])[0]
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
    return public


@app.get("/api/assets")
def api_assets(limit: int = Query(default=20, ge=1, le=50)) -> dict:
    assets = _index.list_recent(limit=limit)
    # Strip full vectors from list responses
    cleaned = []
    for a in assets:
        row = {k: v for k, v in a.items() if k != "embedding_vector"}
        if "embedding_vector" in a:
            row["embedding_stored"] = True
        cleaned.append(row)
    return {"assets": cleaned}


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
        scored.append(
            {
                "score": round(score, 6),
                "run_id": asset.get("run_id"),
                "prompt": asset.get("prompt"),
                "asset_key": asset.get("asset_key"),
                "preview_url": asset.get("preview_url"),
                "model": asset.get("model"),
                "created_at": asset.get("created_at"),
            }
        )
    scored.sort(key=lambda r: r["score"], reverse=True)
    return {
        "query": body.query,
        "embed_model": settings.embed_model,
        "results": scored[: body.limit],
    }


@app.get("/", response_class=HTMLResponse)
def ui() -> HTMLResponse:
    if STATIC_UI.is_file():
        return HTMLResponse(STATIC_UI.read_text(encoding="utf-8"))
    return HTMLResponse("<h1>MRS Genblaze Media</h1><p>UI missing.</p>", status_code=500)
