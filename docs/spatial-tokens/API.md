# HoloRT4D Spatial Tokens — API Reference

**Scheme:** `HoloRT4D-Spatial-V1`  
**Base URL (local stub):** `http://localhost:8792`  
**OpenAPI:** `mrs/apps/spatial-tokenizer/openapi.yaml`

## Auth & billing

| Field | Status |
|-------|--------|
| `$1` USD per successful tokenize | **declared** — returned in response as `price_usd`, **not charged** |
| API keys / Stripe | **not present** |

## `GET /health`

```json
{ "status": "ok", "scheme": "HoloRT4D-Spatial-V1", "billing": "declared" }
```

## `GET /v1/status`

Returns capability tags (`enforced` / `partial` / `declared`).

## `POST /v1/spatial-tokenize`

### Request (enforced path)

```json
{
  "depth_f32": [0.1, 0.2, "..."],
  "width": 64,
  "height": 64,
  "resolution": 16,
  "prev_depth_f32": null,
  "face_landmarks_xyz": null,
  "brief_id": "spatial-token-default",
  "bill": true
}
```

| Field | Required | Notes |
|-------|----------|-------|
| `depth_f32` | yes* | Row-major Float32 depth |
| `width`, `height` | yes with depth | Pixel dimensions |
| `resolution` | no | `8` or `16` (default 16) |
| `prev_depth_f32` | no | Enables motion (**partial**) |
| `face_landmarks_xyz` | no | Packed xyz → face labels (**partial**) |
| `image_base64` | alt | **declared** — returns HTTP 501 until metric path exists |
| `bill` | no | Stub flag; does not charge |

\* Or `image_base64` (declared / 501).

### Response

```json
{
  "scheme": "HoloRT4D-Spatial-V1",
  "hash": "<sha256 hex>",
  "resolution": 16,
  "cell_count": 256,
  "token": {
    "scheme": "HoloRT4D-Spatial-V1",
    "resolution": 16,
    "width": 64,
    "height": 64,
    "cells": [
      {
        "cell": 0,
        "depth": 0,
        "curvature": 0.0,
        "normal": [0.0, 0.0, 1.0],
        "object": "face.nose",
        "motion": { "dx": 0, "dy": 0, "mag": 0 }
      }
    ],
    "meta": {}
  },
  "price_usd": 1.0,
  "billing_status": "declared",
  "status": {
    "tokenizeFromDepthGrid": "enforced",
    "api": "partial",
    "billing": "declared"
  }
}
```

### Determinism

Same `depth_f32` + `width` + `height` + `resolution` (+ optional face/motion inputs) → same `hash` when routed through the Node math core (`scripts/holort4d-tokenize.mjs`).

### GridCell

| Field | Range / type |
|-------|----------------|
| `cell` | `0 .. resolution²-1` |
| `depth` | integer `0–255` |
| `curvature` | finite float |
| `normal` | unit `[nx, ny, nz]` |
| `object` | optional string |
| `motion` | optional `{ dx, dy, mag }` |

## Errors

| Code | Meaning |
|------|---------|
| 400 | Missing depth/dims |
| 501 | `image_base64` path declared only |
| 500 | CLI / math core failure |
