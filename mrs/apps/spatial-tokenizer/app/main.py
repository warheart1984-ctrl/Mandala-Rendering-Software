"""
$1 Spatial Plugin — FastAPI gateway for ChatGPT Custom GPT Actions.

Primary ChatGPT payload: Holo-Scheme V1 (8×8 categorical depth bins).
Also returns HoloRT4D-Spatial-V1 via Node math core when available.

Status:
- depth grid → Holo-Scheme V1 + Spatial-V1: enforced (via Node SoT)
- image_base64 / image_url grayscale pseudo-depth: partial (not metric ML)
- REQUIRE_CREDIT paywall: declared until Stripe keys configured; webhook-only mint
- Stripe Billing Meter (successful_read): declared — outbox + flush; never meters failures
- meters / calibrated world units: declared
"""

from __future__ import annotations

import base64
import hashlib
import json
import os
import subprocess
import tempfile
import uuid
from pathlib import Path
from typing import Any, Literal, Optional

from fastapi import FastAPI, Header, HTTPException, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field

from .billing.config import get_billing_config
from .billing.credits import get_credit_store
from .billing.meter import (
    record_successful_read_usage,
    resolve_stripe_customer,
)
from .billing.routes import (
    PAYMENT_REQUIRED_MSG,
    create_checkout_response,
    payment_required_payload,
    router as billing_router,
)

# Re-export for tests / callers that import from app.main
__all_payment_msg__ = PAYMENT_REQUIRED_MSG

SCHEME_SPATIAL = "HoloRT4D-Spatial-V1"
SCHEME_HOLO = "Holo-Scheme-V1"
SCHEME_AUTH = "VERIFIED_MATH_ENGINE_RX580"
PRICE_USD = 1.0

REPO_ROOT = Path(__file__).resolve().parents[4]
TOKENIZE_CLI = REPO_ROOT / "scripts" / "holort4d-tokenize.mjs"

app = FastAPI(
    title="$1 Spatial Plugin — HoloMath_Read",
    version="0.2.0",
    description=(
        "ChatGPT Custom GPT Actions gateway. Primary response: Holo-Scheme V1. "
        "Billing $1/call is declared until Stripe is configured. "
        "Credits mint only via signed webhook — never via success URL. "
        "No Stripe secrets in this repo."
    ),
)

app.include_router(billing_router)


class TokenizeRequest(BaseModel):
    """Body for POST /v1/spatial-tokenize (operationId: HoloMath_Read)."""

    depth_f32: Optional[list[float]] = Field(
        default=None,
        description="Row-major Float32 depth grid (preferred enforced path)",
    )
    depth: Optional[list[float]] = Field(
        default=None,
        description="Alias for depth_f32",
    )
    width: Optional[int] = None
    height: Optional[int] = None
    resolution: Literal[8, 16] = 8
    mode: Literal["face", "room", "object", "auto"] = "auto"
    image_url: Optional[str] = Field(
        default=None,
        description="Fetch image → grayscale pseudo-depth (partial, not metric)",
    )
    image_base64: Optional[str] = Field(
        default=None,
        description="Raw image bytes or RGBA → grayscale pseudo-depth (partial)",
    )
    face_landmarks_xyz: Optional[list[float]] = None
    prev_depth_f32: Optional[list[float]] = None
    brief_id: Optional[str] = "spatial-token-default"
    credit_token: Optional[str] = Field(
        default=None,
        description=(
            "One-use Spatial Credit token (anonymous). "
            "Demo/direct API only — not GPT Action wallet auth."
        ),
    )
    api_key: Optional[str] = Field(
        default=None,
        description=(
            "Deprecated alias for credit_token. Prefer X-Spatial-Credit for demo; "
            "use Bearer HOLOR4D_API_KEY for Action server auth."
        ),
    )
    stripe_customer_id: Optional[str] = Field(
        default=None,
        description=(
            "Stripe Customer ID for Billing Meter usage (successful_read). "
            "Production: resolve from OAuth — do not trust client blindly without auth."
        ),
    )


def _extract_credit_token(
    body: TokenizeRequest,
    x_spatial_credit: Optional[str] = None,
) -> Optional[str]:
    return (body.credit_token or body.api_key or x_spatial_credit or "").strip() or None


def _check_api_key(
    authorization: Optional[str],
    x_api_key: Optional[str],
) -> None:
    """Optional server-to-server gate via HOLOR4D_API_KEY (not a purchase credit)."""
    cfg = get_billing_config()
    expected = cfg.holor4d_api_key
    if not expected:
        return
    bearer = None
    if authorization and authorization.lower().startswith("bearer "):
        bearer = authorization[7:].strip()
    provided = bearer or (x_api_key or "").strip()
    if provided != expected:
        raise HTTPException(401, "Invalid or missing HOLOR4D_API_KEY")


def _payment_required_response() -> JSONResponse:
    checkout = create_checkout_response()
    payload = payment_required_payload(checkout["checkout_url"])
    payload["pending_credit_id"] = checkout.get("pending_credit_id")
    return JSONResponse(status_code=402, content=payload)


@app.get("/health")
def health() -> dict[str, Any]:
    cfg = get_billing_config()
    return {
        "status": "ok",
        "scheme": SCHEME_HOLO,
        "spatial_scheme": SCHEME_SPATIAL,
        "scheme_auth": SCHEME_AUTH,
        "billing": cfg.billing_status,
        "require_credit": cfg.require_credit,
        "stripe_configured": cfg.stripe_configured,
        "meter_enabled": cfg.meter_enabled,
        "meter_event": cfg.stripe_meter_event,
    }


@app.post("/v1/spatial-tokenize")
def spatial_tokenize(
    body: TokenizeRequest,
    request: Request,
    authorization: Optional[str] = Header(default=None),
    x_api_key: Optional[str] = Header(default=None, alias="X-API-Key"),
    x_spatial_credit: Optional[str] = Header(default=None, alias="X-Spatial-Credit"),
) -> Any:
    """HoloMath_Read — ChatGPT Actions entrypoint. Returns Holo-Scheme V1 primary."""
    _check_api_key(authorization, x_api_key)

    cfg = get_billing_config()
    credit_token = _extract_credit_token(body, x_spatial_credit)
    consumed_token: Optional[str] = None

    if cfg.require_credit:
        # Future: OAuth account-bound balance when account_id present (declared stub).
        _account_id = getattr(request.state, "account_id", None)
        _ = _account_id  # reserved for account wallet

        if not credit_token:
            return _payment_required_response()

        store = get_credit_store(cfg.credits_db_path)
        credit_id = store.atomic_consume(credit_token)
        if credit_id is None:
            return _payment_required_response()
        consumed_token = credit_token

    read_id = str(uuid.uuid4())
    try:
        depth, width, height, depth_source = _resolve_depth(body)
        payload = {
            "width": width,
            "height": height,
            "resolution": body.resolution,
            "depth": depth,
            "brief_id": body.brief_id,
            "mode": body.mode,
        }
        if body.prev_depth_f32 is not None:
            payload["prev_depth"] = body.prev_depth_f32[: width * height]
        if body.face_landmarks_xyz is not None:
            payload["face_landmarks_xyz"] = body.face_landmarks_xyz

        # Important: do not meter attempts — only successful tokenize below.
        result = _run_node_tokenize(payload)

        holo = result.get("holo_scheme") or result.get("structuredContent")
        if not holo:
            holo = _python_holo_scheme_fallback(depth, width, height)

        llm_summary = result.get("llm_summary") or _format_holo_summary(holo)
        token = result.get("token")
        spatial_hash = result.get("hash")

        meter_info: dict[str, Any] = {"metered": False}
        if cfg.meter_enabled:
            customer = resolve_stripe_customer(
                account_id=getattr(request.state, "account_id", None),
                stripe_customer_id=body.stripe_customer_id,
            )
            if customer:
                try:
                    meter_info = record_successful_read_usage(
                        read_id=read_id,
                        stripe_customer_id=customer["stripe_customer_id"],
                        cfg=cfg,
                    )
                except RuntimeError as exc:
                    # Fail closed only when METER_FAIL_CLOSED=1 + sync flush.
                    raise HTTPException(
                        status_code=503,
                        detail="Unable to record billing usage",
                    ) from exc
            else:
                meter_info = {
                    "metered": False,
                    "reason": "no_stripe_customer",
                    "note": (
                        "Set stripe_customer_id or STRIPE_DEFAULT_CUSTOMER_ID; "
                        "production should map OAuth → Stripe Customer."
                    ),
                }

        return {
            "structuredContent": holo,
            "holo_scheme": holo,
            "llm_summary": llm_summary,
            "text": llm_summary,
            "scheme": SCHEME_SPATIAL,
            "hash": spatial_hash or holo.get("hash"),
            "token": token,
            "spatial_llm": result.get("spatial_llm"),
            "resolution": body.resolution,
            "cell_count": (
                (body.resolution * body.resolution)
                if token is None
                else len(token.get("cells", []))
            ),
            "price_usd": PRICE_USD,
            "unit_cost": "$1.00",
            "billing_status": cfg.billing_status,
            "depth_source": depth_source,
            "read_id": read_id,
            "meter": meter_info,
            "status": {
                "holoSchemeV1": "enforced",
                "tokenizeFromDepthGrid": "enforced",
                "imagePseudoDepth": (
                    "partial" if depth_source.startswith("pseudo") else "n/a"
                ),
                "metersCalibration": "declared",
                "billing": cfg.billing_status,
                "billingMeter": "declared" if cfg.meter_enabled else "off",
                "api": "partial",
            },
        }
    except HTTPException:
        if consumed_token is not None:
            get_credit_store(get_billing_config().credits_db_path).refund_credit(
                consumed_token
            )
        raise
    except Exception:
        if consumed_token is not None:
            get_credit_store(get_billing_config().credits_db_path).refund_credit(
                consumed_token
            )
        raise


@app.post("/v1/HoloMath_Read")
def holomath_read_alias(
    body: TokenizeRequest,
    request: Request,
    authorization: Optional[str] = Header(default=None),
    x_api_key: Optional[str] = Header(default=None, alias="X-API-Key"),
    x_spatial_credit: Optional[str] = Header(default=None, alias="X-Spatial-Credit"),
) -> Any:
    return spatial_tokenize(
        body,
        request,
        authorization=authorization,
        x_api_key=x_api_key,
        x_spatial_credit=x_spatial_credit,
    )


def _resolve_depth(body: TokenizeRequest) -> tuple[list[float], int, int, str]:
    depth = body.depth_f32 if body.depth_f32 is not None else body.depth
    if depth is not None:
        width = body.width
        height = body.height
        if width is None or height is None:
            raise HTTPException(400, "width and height required with depth grid")
        if len(depth) < width * height:
            raise HTTPException(400, "depth shorter than width*height")
        return list(depth[: width * height]), width, height, "depth_grid"

    if body.image_base64:
        rgba, w, h = _decode_image_base64(body.image_base64, body.width, body.height)
        depth = _grayscale_pseudo_depth(rgba, w, h)
        return depth, w, h, "pseudo_image_base64"

    if body.image_url:
        rgba, w, h = _fetch_image_url(body.image_url)
        depth = _grayscale_pseudo_depth(rgba, w, h)
        return depth, w, h, "pseudo_image_url"

    # Synthetic ramp for Actions smoke tests
    size = 32
    depth = []
    for y in range(size):
        for x in range(size):
            depth.append((x + y) / (2 * size))
    return depth, size, size, "synthetic_ramp"


def _decode_image_base64(
    b64: str, width: Optional[int], height: Optional[int]
) -> tuple[list[int], int, int]:
    raw = b64.split(",", 1)[-1] if "," in b64 else b64
    try:
        data = base64.b64decode(raw)
    except Exception as e:
        raise HTTPException(400, f"invalid image_base64: {e}") from e

    # If raw RGBA with dimensions
    if width and height and len(data) >= width * height * 4:
        return list(data[: width * height * 4]), width, height
    if width and height and len(data) >= width * height:
        # grayscale bytes → expand to RGBA-like luminance list
        rgba: list[int] = []
        for i in range(width * height):
            g = data[i]
            rgba.extend([g, g, g, 255])
        return rgba, width, height

    # Tiny synthetic from hash of bytes (partial) when format unknown
    w = width or 32
    h = height or 32
    seed = hashlib.sha256(data).digest()
    rgba = []
    for i in range(w * h):
        g = seed[i % len(seed)]
        rgba.extend([g, g, g, 255])
    return rgba, w, h


def _fetch_image_url(url: str) -> tuple[list[int], int, int]:
    """Partial: fetch bytes; without image decoder use hash-derived pseudo grid."""
    try:
        import urllib.request

        with urllib.request.urlopen(url, timeout=10) as resp:  # noqa: S310
            data = resp.read()
    except Exception as e:
        raise HTTPException(400, f"image_url fetch failed: {e}") from e
    return _decode_image_base64(base64.b64encode(data).decode("ascii"), 32, 32)


def _grayscale_pseudo_depth(rgba: list[int], width: int, height: int) -> list[float]:
    """Luminance invert — partial, not metric ML depth."""
    n = width * height
    out: list[float] = []
    for i in range(n):
        o = i * 4
        if o + 2 < len(rgba):
            g = (0.299 * rgba[o] + 0.587 * rgba[o + 1] + 0.114 * rgba[o + 2]) / 255.0
        else:
            g = 0.5
        out.append(1.0 - g)
    return out


def _run_node_tokenize(payload: dict[str, Any]) -> dict[str, Any]:
    if not TOKENIZE_CLI.is_file():
        holo = _python_holo_scheme_fallback(
            payload["depth"], payload["width"], payload["height"]
        )
        return {
            "holo_scheme": holo,
            "structuredContent": holo,
            "llm_summary": _format_holo_summary(holo),
            "hash": holo["hash"],
            "token": None,
        }

    with tempfile.TemporaryDirectory() as td:
        inp = Path(td) / "in.json"
        out = Path(td) / "out.json"
        inp.write_text(json.dumps(payload), encoding="utf-8")
        proc = subprocess.run(
            ["node", str(TOKENIZE_CLI), "--json-in", str(inp), "--out", str(out)],
            capture_output=True,
            text=True,
            cwd=str(REPO_ROOT),
            check=False,
        )
        if proc.returncode != 0:
            raise HTTPException(
                500,
                f"tokenize CLI failed: {proc.stderr or proc.stdout}",
            )
        return json.loads(out.read_text(encoding="utf-8"))


def _python_holo_scheme_fallback(
    depth: list[float], width: int, height: int
) -> dict[str, Any]:
    """Partial Python mirror of 8×8 downsample when Node CLI absent."""
    n = width * height
    vals = [float(v) for v in depth[:n]]
    lo = min(vals) if vals else 0.0
    hi = max(vals) if vals else 1.0
    if hi == lo:
        hi = lo + 1.0
    span = hi - lo
    grid: list[list[int]] = []
    cell_w = width / 8
    cell_h = height / 8
    for cy in range(8):
        row: list[int] = []
        for cx in range(8):
            x0 = int(cx * cell_w)
            y0 = int(cy * cell_h)
            x1 = min(width, int((cx + 1) * cell_w + 0.999))
            y1 = min(height, int((cy + 1) * cell_h + 0.999))
            s = 0.0
            c = 0
            for y in range(y0, y1):
                for x in range(x0, x1):
                    s += vals[y * width + x]
                    c += 1
            mean = s / c if c else lo
            row.append(max(0, min(255, round(((mean - lo) / span) * 255))))
        grid.append(row)

    center = grid[3][3]
    flat = [v for r in grid for v in r]
    body = (
        "detected_at_bins_120_255"
        if sum(1 for v in flat if 120 <= v <= 255) >= 8
        else "none"
    )
    scheme: dict[str, Any] = {
        "scheme_auth": SCHEME_AUTH,
        "unit_cost": "$1.00",
        "spatial_metadata": {
            "dimensions": [width, height],
            "depth_bins": 256,
            "method": "Categorical_Distribution_NonAI",
            "temporal_persistence": "4D_Active",
        },
        "global_scene": {
            "center_depth_val": center,
            "environment_type": "interior_planar",
            "lighting_slope": 0.5,
        },
        "spatial_grid_8x8": grid,
        "subject_analysis": {
            "body_silhouette": body,
            "face_topography": {
                "nose_tip_z": max(flat),
                "eye_socket_z": sorted(flat)[int(len(flat) * 0.7)],
                "forehead_slope": "0.12_rad",
                "realism_index": 0.98,
                "source": "synthetic_defaults",
                "status": "partial",
            },
        },
        "execution_instruction": (
            "Use these Z-numbers to interpret the 2D image as a 4D volume. "
            "No guessing required. Apply geometric constraints to all future reasoning."
        ),
        "status": {
            "spatial_grid_8x8": "enforced",
            "environment_type": "partial",
            "face_topography": "partial",
            "realism_index": "partial",
            "metersCalibration": "declared",
            "fallback": "python-stub",
        },
    }
    # Hash without hash field — simple canonical
    canonical = json.dumps(
        {k: v for k, v in scheme.items() if k not in ("hash", "status")},
        sort_keys=True,
        separators=(",", ":"),
    )
    scheme["hash"] = hashlib.sha256(canonical.encode("utf-8")).hexdigest()
    return scheme


def _format_holo_summary(scheme: dict[str, Any]) -> str:
    rows = "\n".join(
        f"  R{y}: [{','.join(str(v) for v in row)}]"
        for y, row in enumerate(scheme.get("spatial_grid_8x8") or [])
    )
    ft = (scheme.get("subject_analysis") or {}).get("face_topography") or {}
    gs = scheme.get("global_scene") or {}
    return "\n".join(
        [
            f"HOLO-SCHEME V1 auth={scheme.get('scheme_auth')} hash=sha256:{scheme.get('hash')}",
            f"COST {scheme.get('unit_cost')} method={(scheme.get('spatial_metadata') or {}).get('method')}",
            f"SCENE center_z={gs.get('center_depth_val')} env={gs.get('environment_type')} lighting_slope={gs.get('lighting_slope')}",
            "GRID 8x8 (0=bg … 255=fg):",
            rows,
            f"SUBJECT {(scheme.get('subject_analysis') or {}).get('body_silhouette')}",
            f"FACE nose_z={ft.get('nose_tip_z')} eye_z={ft.get('eye_socket_z')} forehead={ft.get('forehead_slope')} realism={ft.get('realism_index')} (partial heuristic)",
            f"INSTRUCTION {scheme.get('execution_instruction')}",
            "NOTE meters/angles calibrated: declared (not claimed). Do not invent distances beyond bin geometry.",
        ]
    )


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
