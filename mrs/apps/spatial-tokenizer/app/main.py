"""
HoloRT4D Spatial Tokenizer API stub (CPU-only).

Status: partial — FastAPI scaffold; billing field declared ($1/call, not charged).
Deterministic tokenize uses Float32 depth grids via the Node math core CLI,
or a local JS bridge. This Python stub mirrors the OpenAPI contract and
delegates to `scripts/holort4d-tokenize.mjs` when available.
"""

from __future__ import annotations

import hashlib
import json
import os
import subprocess
import tempfile
from pathlib import Path
from typing import Any, Literal, Optional

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field

SCHEME = "HoloRT4D-Spatial-V1"
PRICE_USD_DECLARED = 1.0
# app/main.py → spatial-tokenizer → apps → mrs → repo root
REPO_ROOT = Path(__file__).resolve().parents[4]
TOKENIZE_CLI = REPO_ROOT / "scripts" / "holort4d-tokenize.mjs"

app = FastAPI(
    title="HoloRT4D Spatial Tokenizer",
    version="0.1.0",
    description=(
        "Spatial token API stub. Billing: $1/call documented (declared — not charged). "
        "Enforced path: depth grid → HoloRT4D-Spatial-V1. "
        "image_base64 → metric depth without ML: declared."
    ),
)


class TokenizeRequest(BaseModel):
    """POST /v1/spatial-tokenize body."""

    depth_f32: Optional[list[float]] = Field(
        default=None,
        description="Row-major Float32 depth (preferred enforced path)",
    )
    width: Optional[int] = None
    height: Optional[int] = None
    resolution: Literal[8, 16] = 16
    image_base64: Optional[str] = Field(
        default=None,
        description="Declared/partial path — not metric depth without ML",
    )
    face_landmarks_xyz: Optional[list[float]] = None
    prev_depth_f32: Optional[list[float]] = None
    brief_id: Optional[str] = "spatial-token-default"
    # Billing stub — never charged in this scaffold
    bill: bool = Field(default=True, description="Declared $1 stub flag; not a payment")


class TokenizeResponse(BaseModel):
    scheme: str = SCHEME
    hash: str
    resolution: int
    cell_count: int
    token: dict[str, Any]
    price_usd: float = PRICE_USD_DECLARED
    billing_status: str = "declared"
    status: dict[str, str]


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok", "scheme": SCHEME, "billing": "declared"}


@app.get("/v1/status")
def status() -> dict[str, Any]:
    return {
        "scheme": SCHEME,
        "tokenizeFromDepthGrid": "enforced",
        "apiServerStub": "partial",
        "billingUsdPerCall": "declared",
        "price_usd": PRICE_USD_DECLARED,
        "imageBase64ToDepth": "declared",
        "note": "Same depth bytes → same hash via Node math core.",
    }


@app.post("/v1/spatial-tokenize", response_model=TokenizeResponse)
def spatial_tokenize(body: TokenizeRequest) -> TokenizeResponse:
    if body.depth_f32 is None and body.image_base64 is None:
        raise HTTPException(400, "Provide depth_f32 (enforced) or image_base64 (declared)")

    if body.image_base64 is not None and body.depth_f32 is None:
        raise HTTPException(
            501,
            "image_base64→metric depth is declared (not implemented). "
            "Send depth_f32 from chamber/opticalLength/landmark-z, or use CLI "
            "--pseudo-depth for partial luminance heuristic.",
        )

    width = body.width
    height = body.height
    if width is None or height is None:
        raise HTTPException(400, "width and height required with depth_f32")
    if len(body.depth_f32) < width * height:
        raise HTTPException(400, "depth_f32 shorter than width*height")

    payload = {
        "width": width,
        "height": height,
        "resolution": body.resolution,
        "depth": body.depth_f32[: width * height],
        "brief_id": body.brief_id,
    }
    if body.prev_depth_f32 is not None:
        payload["prev_depth"] = body.prev_depth_f32[: width * height]
    if body.face_landmarks_xyz is not None:
        payload["face_landmarks_xyz"] = body.face_landmarks_xyz

    token_obj, token_hash = _run_node_tokenize(payload)
    return TokenizeResponse(
        scheme=SCHEME,
        hash=token_hash,
        resolution=body.resolution,
        cell_count=len(token_obj.get("cells", [])),
        token=token_obj,
        price_usd=PRICE_USD_DECLARED if body.bill else 0.0,
        billing_status="declared",
        status={
            "tokenizeFromDepthGrid": "enforced",
            "api": "partial",
            "billing": "declared",
        },
    )


def _run_node_tokenize(payload: dict[str, Any]) -> tuple[dict[str, Any], str]:
    """Delegate to Node math core for deterministic hash."""
    if not TOKENIZE_CLI.is_file():
        # Fallback: deterministic stub hash of depth bytes only (partial)
        raw = json.dumps(payload["depth"], separators=(",", ":")).encode("utf-8")
        h = hashlib.sha256(raw).hexdigest()
        cells = [
            {
                "cell": i,
                "depth": 0,
                "curvature": 0.0,
                "normal": [0.0, 0.0, 1.0],
            }
            for i in range(payload["resolution"] ** 2)
        ]
        return {
            "scheme": SCHEME,
            "resolution": payload["resolution"],
            "width": payload["width"],
            "height": payload["height"],
            "cells": cells,
            "meta": {"fallback": "python-stub-no-cli"},
        }, h

    with tempfile.TemporaryDirectory() as td:
        inp = Path(td) / "in.json"
        out = Path(td) / "out.json"
        inp.write_text(json.dumps(payload), encoding="utf-8")
        env = os.environ.copy()
        env["HOLORT4D_TOKENIZE_JSON"] = str(inp)
        proc = subprocess.run(
            ["node", str(TOKENIZE_CLI), "--json-in", str(inp), "--out", str(out)],
            capture_output=True,
            text=True,
            cwd=str(REPO_ROOT),
            env=env,
            check=False,
        )
        if proc.returncode != 0:
            raise HTTPException(
                500,
                f"tokenize CLI failed: {proc.stderr or proc.stdout}",
            )
        data = json.loads(out.read_text(encoding="utf-8"))
        return data["token"], data["hash"]


def main() -> None:
    import uvicorn

    uvicorn.run(
        "app.main:app",
        host="0.0.0.0",
        port=int(os.environ.get("PORT", "8792")),
        reload=False,
    )


if __name__ == "__main__":
    main()
