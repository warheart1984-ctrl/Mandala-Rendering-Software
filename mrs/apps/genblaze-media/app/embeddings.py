"""NVIDIA NIM embeddings (nv-embedcode) for prompt provenance + search."""

from __future__ import annotations

import math
from typing import Any

import httpx

from app.config import Settings


def embed_texts(settings: Settings, texts: list[str]) -> list[list[float]]:
    """Call NVIDIA integrate.api embeddings endpoint.

    Uses the same NVIDIA_API_KEY as image gen. Model default:
    nvidia/nv-embedcode-7b-v1 (embedding model — not chat / not FLUX).
    """
    if not settings.nvidia_configured:
        raise RuntimeError("NVIDIA_API_KEY is required for embeddings")
    if not texts:
        return []

    payload = {
        "input": texts,
        "model": settings.embed_model,
        "input_type": "query",
        "encoding_format": "float",
        "truncate": "NONE",
    }
    headers = {
        "Authorization": f"Bearer {settings.nvidia_api_key}",
        "Accept": "application/json",
        "Content-Type": "application/json",
    }
    with httpx.Client(timeout=settings.embed_timeout_seconds) as client:
        resp = client.post(settings.embed_url, headers=headers, json=payload)
        resp.raise_for_status()
        body = resp.json()

    data = body.get("data") or []
    # Preserve order by index when present
    ordered = sorted(data, key=lambda d: int(d.get("index", 0)))
    vectors: list[list[float]] = []
    for item in ordered:
        emb = item.get("embedding")
        if not isinstance(emb, list) or not emb:
            raise RuntimeError("embedding response missing vectors")
        vectors.append([float(x) for x in emb])
    if len(vectors) != len(texts):
        raise RuntimeError(
            f"expected {len(texts)} embeddings, got {len(vectors)}"
        )
    return vectors


def cosine_similarity(a: list[float], b: list[float]) -> float:
    if not a or not b or len(a) != len(b):
        return 0.0
    dot = 0.0
    na = 0.0
    nb = 0.0
    for x, y in zip(a, b, strict=True):
        dot += x * y
        na += x * x
        nb += y * y
    if na <= 0.0 or nb <= 0.0:
        return 0.0
    return dot / (math.sqrt(na) * math.sqrt(nb))


def embedding_summary(vector: list[float]) -> dict[str, Any]:
    """Store a compact summary in the index (full vectors stay optional)."""
    return {
        "dims": len(vector),
        "model": None,  # filled by caller
        "l2_norm": round(math.sqrt(sum(x * x for x in vector)), 6),
        # Keep a short prefix for debugging — not for similarity (full vector used in-memory)
        "preview": [round(x, 6) for x in vector[:8]],
    }
