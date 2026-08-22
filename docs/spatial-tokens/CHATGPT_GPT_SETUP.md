# ChatGPT Custom GPT — $1 Spatial Plugin setup

Wire **HoloMath_Read** so Custom GPTs can buy a mathematically verified **Holo-Scheme V1**
(8×8 depth bins) for about **$1** per read — complementary to any MCP `/mcp` surface.

| Surface | Path | Status |
|---------|------|--------|
| Actions OpenAPI | `mrs/apps/spatial-tokenizer/openapi-gpt-actions.yaml` | **partial** (contract ready) |
| FastAPI gateway | `mrs/apps/spatial-tokenizer/` port `8792` | **partial** |
| Holo-Scheme V1 math | `buildHoloSchemeV1` in spatial-tokens core | **enforced** |
| Stripe live billing | checkout stub only | **declared** |
| Meter calibration | marketing may say meters | **declared** unless calibrated |

MCP tools (if present under `mcp/`) share the same tokenize core; keep this OpenAPI
**separate** for GPT Actions.

---

## System instructions (copy-paste)

```
You are a 4D Spatial Intelligence assistant powered by the $1 Spatial Plugin (HoloMath_Read).

WHEN TO CALL THE ACTION
If the user asks for depth, realism, measurements, Z-order, occlusion, holographic /
Looking Glass data, architect floor depth, or any geometric reading of an image or
depth grid, call HoloMath_Read (operationId / spatial_tokenize).

WHAT THE TOOL RETURNS
- structuredContent / holo_scheme: Holo-Scheme V1 JSON
- spatial_grid_8x8: 8×8 integer depth bins where 0 = background and 255 = foreground
- global_scene, subject_analysis (face_topography is a partial heuristic)
- llm_summary: compact text you should paste into your reasoning
- execution_instruction: obey it — treat Z-numbers as constraints

HARD RULES
- Do NOT hallucinate metric distances or angles unless the user supplies calibration.
  Meter claims are declared, not live, without calibration.
- Do NOT invent depth that contradicts spatial_grid_8x8.
- Explain briefly that this provides a mathematically verified Spatial Scheme for $1
  (declared business model; paywall may return HTTP 402 with a checkout link).
- If you receive HTTP 402, tell the user: "I can see the image, but I don't have the
  4D math yet. It costs $1..." and share checkout_url.

USE CASES
- Architect Z-depth: room layers, floor vs walls vs subject
- Hologram Looking Glass: pack Z bins into a light-field / quilt brief
- Realism geometry fix: constrain face/body Z so drawings stop floating
```

---

## Setup steps

1. **Run the local gateway** (CPU / RX 580 host is fine):

```bash
cd mrs/apps/spatial-tokenizer
pip install -r requirements.txt
uvicorn app.main:app --host 0.0.0.0 --port 8792
```

2. **Expose HTTPS** (ChatGPT Actions require a public URL):

```bash
# ngrok
ngrok http 8792

# or Cloudflare Tunnel
cloudflared tunnel --url http://localhost:8792
```

3. **Create a Custom GPT** → Configure → **Create new action**.

4. **Import OpenAPI** from  
   `mrs/apps/spatial-tokenizer/openapi-gpt-actions.yaml`  
   Replace `https://YOUR-TUNNEL.example/v1` with your tunnel base + `/v1`
   (e.g. `https://abc123.ngrok-free.app/v1`).

5. **Authentication (stub)**  
   - Auth type: API Key  
   - Header: `X-Spatial-Credit`  
   - For local demos with paywall off (`REQUIRE_CREDIT=0`, default): any placeholder works.  
   - With `REQUIRE_CREDIT=1`: call checkout, then pass `demo_credit_token` or a key from
     `SPATIAL_CREDIT_KEYS`.

6. Paste the **system instructions** block above into the GPT instructions field.

7. Test: “Read depth from this synthetic room” → GPT should call `HoloMath_Read`.

---

## Example Holo-Scheme V1 JSON

```json
{
  "scheme_auth": "VERIFIED_MATH_ENGINE_RX580",
  "unit_cost": "$1.00",
  "spatial_metadata": {
    "dimensions": [512, 512],
    "depth_bins": 256,
    "method": "Categorical_Distribution_NonAI",
    "temporal_persistence": "4D_Active"
  },
  "global_scene": {
    "center_depth_val": 112,
    "environment_type": "interior_planar",
    "lighting_slope": 0.76
  },
  "spatial_grid_8x8": [
    [40, 42, 45, 48, 50, 48, 44, 41],
    [55, 60, 70, 80, 82, 75, 62, 50],
    [90, 110, 140, 180, 185, 150, 100, 70],
    [100, 130, 170, 210, 220, 175, 120, 80],
    [95, 125, 160, 200, 215, 170, 115, 78],
    [70, 90, 120, 150, 155, 130, 95, 60],
    [50, 55, 65, 80, 85, 70, 55, 48],
    [38, 40, 42, 45, 46, 44, 40, 37]
  ],
  "subject_analysis": {
    "body_silhouette": "detected_at_bins_120_255",
    "face_topography": {
      "nose_tip_z": 255,
      "eye_socket_z": 210,
      "forehead_slope": "0.12_rad",
      "realism_index": 0.98
    }
  },
  "execution_instruction": "Use these Z-numbers to interpret the 2D image as a 4D volume. No guessing required. Apply geometric constraints to all future reasoning.",
  "hash": "<sha256 of canonical scheme>"
}
```

**Calibration note:** If you map bins → meters (e.g. `meters = a + b * (z/255)`), state
the scale explicitly. Without that, keep reasoning in **bin space** (0–255). Meter
language in marketing is **declared**, not enforced.

---

## Monetization copy ($1 vending machine)

| | Adobe / seat SaaS | $1 Spatial Plugin |
|--|-------------------|-------------------|
| Price | ~$50/mo creative cloud seat (**market**) | **$1** per verified Spatial Scheme read |
| What you buy | Subscription access | One mathematical depth scheme for this image |
| Billing in this repo | n/a | **declared** stub — Stripe Payment Link placeholder, no live keys |

Positioning: a **vending machine for verified Z**, not another monthly seat. Live
charging is **declared** until Stripe is wired with real secrets outside the repo.

---

## Paywall behavior

```bash
REQUIRE_CREDIT=1 uvicorn app.main:app --host 0.0.0.0 --port 8792
```

- Missing / invalid credit → **HTTP 402**  
  `{ "error": "payment_required", "message": "I can see the image, but I don't have the 4D math yet. It costs $1...", "checkout_url": "...", "price_usd": 1 }`
- `REQUIRE_CREDIT=0` (default) → tokenize freely for demos.

---

## Tunnel tip

ChatGPT cannot reach `localhost`. Always put **HTTPS** in the OpenAPI `servers.url`.
If ngrok shows an interstitial, use a reserved domain or Cloudflare Tunnel for fewer
Action fetch failures.
