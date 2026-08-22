# HoloRT4D Spatial Tokens — API Reference

**Primary ChatGPT payload:** `Holo-Scheme V1` (`structuredContent`)  
**Wrapped math scheme:** `HoloRT4D-Spatial-V1`  
**Base URL (local stub):** `http://localhost:8792`  
**Actions OpenAPI:** `mrs/apps/spatial-tokenizer/openapi-gpt-actions.yaml`  
**operationId:** `HoloMath_Read`

## Auth & billing

| Field | Status |
|-------|--------|
| `$1` USD per successful tokenize | **declared** — stub paywall / checkout URL |
| `REQUIRE_CREDIT=1` → HTTP 402 | **declared** stub |
| Live Stripe keys | **not present** |
| Meter calibration | **declared** |

## `GET /health`

```json
{ "status": "ok", "scheme": "Holo-Scheme-V1", "scheme_auth": "VERIFIED_MATH_ENGINE_RX580", "billing": "declared" }
```

## `GET /v1/credits/status?key=`

Stub credit check → `{ "valid": true|false, "price_usd": 1.0, "billing_status": "declared" }`.

## `POST /v1/credits/checkout`

Returns placeholder Stripe Payment Link + optional `demo_credit_token` for local Actions testing. **Declared** — no secrets.

## `POST /v1/spatial-tokenize` (HoloMath_Read)

### Request

```json
{
  "depth_f32": [0.1, 0.2],
  "width": 64,
  "height": 64,
  "resolution": 8,
  "mode": "auto",
  "image_base64": null,
  "image_url": null,
  "face_landmarks_xyz": null,
  "credit_token": null,
  "brief_id": "spatial-token-default"
}
```

| Field | Required | Notes |
|-------|----------|-------|
| `depth_f32` / `depth` | preferred | Row-major Float32 depth (**enforced**) |
| `width`, `height` | with depth | Pixel dimensions |
| `resolution` | no | `8` or `16` (default **8** for Actions) |
| `image_base64` / `image_url` | alt | Grayscale pseudo-depth (**partial**) |
| `credit_token` | if `REQUIRE_CREDIT=1` | Spatial Credit stub |
| (none) | smoke | Synthetic ramp for demos |

### Response (200)

Primary body fields:

- `structuredContent` / `holo_scheme` — **Holo-Scheme V1** (8×8 bins)
- `llm_summary` / `text` — compact LLM text
- `token` — full `HoloRT4D-Spatial-V1` when Node core available
- `hash` — Spatial-V1 hash (scheme also has its own `hash`)
- `price_usd`: `1.0`, `billing_status`: `declared`

### Response (402)

```json
{
  "error": "payment_required",
  "message": "I can see the image, but I don't have the 4D math yet. It costs $1...",
  "checkout_url": "https://buy.stripe.com/test_spatial_credit_1usd_PLACEHOLDER",
  "price_usd": 1
}
```

## Holo-Scheme V1 shape

See [CHATGPT_GPT_SETUP.md](./CHATGPT_GPT_SETUP.md) for the exact template (`scheme_auth`, `spatial_grid_8x8`, `execution_instruction`, …).

## Determinism

Same depth + dimensions → same Holo-Scheme `hash` and Spatial-V1 `hash` via Node math core (`scripts/holort4d-tokenize.mjs`).
