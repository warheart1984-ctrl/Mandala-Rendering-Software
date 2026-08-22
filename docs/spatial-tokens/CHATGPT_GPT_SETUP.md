# ChatGPT Custom GPT — $1 Spatial Plugin setup

Wire **HoloMath_Read** so Custom GPTs can buy a mathematically verified **Holo-Scheme V1**
(8×8 depth bins) for about **$1** per read — complementary to any MCP `/mcp` surface.

| Surface | Path | Status |
|---------|------|--------|
| Actions OpenAPI | `mrs/apps/spatial-tokenizer/openapi-gpt-actions.yaml` | **partial** (contract ready) |
| FastAPI gateway | `mrs/apps/spatial-tokenizer/` port `8792` | **partial** |
| Holo-Scheme V1 math | `buildHoloSchemeV1` in spatial-tokens core | **enforced** |
| Stripe Checkout + webhook credits | `app/billing/` | **declared** until live keys |
| Stripe Billing Meter (`successful_read`) | outbox + `/v1/billing/meter-flush` | **declared** until live meter |
| Meter calibration (world units) | marketing may say meters | **declared** unless calibrated |

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

5. **Authentication (declared)**  
   - Prefer **API Key** = `HOLOR4D_API_KEY` via `Authorization: Bearer` or `X-API-Key` for the GPT **server** (not a purchase wallet).  
   - Do **not** treat `X-Spatial-Credit` as Action auth — that header is the **$1 Spatial Credit** token for demo/direct API only.  
   - OAuth account balance is **declared** (future).  
   - With `REQUIRE_CREDIT=0` (default): tokenize works without a credit token.  
   - With `REQUIRE_CREDIT=1`: missing credit → HTTP 402 + `checkout_url` (Stripe when configured, else declared stub).

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
| Billing in this repo | n/a | **declared** until Stripe keys configured — webhook-only mint |

Positioning: a **vending machine for verified Z**, not another monthly seat. Live
charging is **declared** until Stripe is wired with real secrets outside the repo.

---

## Billing security model (webhook authority)

```
Browser / GPT ──► POST /v1/billing/checkout ──► Stripe Checkout Session
                                                      │
User pays on Stripe ◄─────────────────────────────────┘
                                                      │
Stripe ──signed──► POST /v1/billing/stripe-webhook ──► mint exactly 1 Spatial Credit
                                                      │
GET /v1/billing/success ──► HTML only (NEVER mints)
```

**Hard rules**
- Only a **verified Stripe webhook** mints credit (idempotent on `event.id`).
- The browser success URL **never** unlocks credit.
- `POST /v1/spatial-tokenize` with `REQUIRE_CREDIT=1` atomically consumes one unused credit, then tokenizes; on tokenize failure the credit is refunded.
- `X-Spatial-Credit` / `credit_token` is the **purchase wallet** for demo/direct API — **not** GPT Action server auth.
- Action auth should be OAuth (future) or shared `HOLOR4D_API_KEY` (`Authorization: Bearer` / `X-API-Key`) for the GPT server.

### Stripe Billing Meter (successful reads only) — **declared**

Complementary to prepaid Spatial Credits. Use when the customer has a Stripe
Customer on a metered $1/unit recurring price:

```
successful spatial_tokenize
        │
        ▼
  enqueue meter_outbox (identifier = read:<uuid>)
        │
        ▼
  worker POST /v1/billing/meter-flush
        │
        ▼
  stripe.billing.MeterEvent.create(event_name=successful_read, value=1)
```

**Hard rules**
- Meter **only after a successful tokenize** — never meter attempts or 4xx/5xx.
- Prefer **outbox + flush worker** so Stripe downtime is not part of the read path.
- Stable `identifier=read:<read_id>` → economic exactly-once across retries.
- Optional `METER_SYNC_FLUSH=1` + `METER_FAIL_CLOSED=1` fails closed (HTTP 503) if
  Stripe cannot record usage — use only when you must not deliver unmetered reads.
- Env: `STRIPE_METER_ENABLED=1`, `STRIPE_METER_EVENT=successful_read`,
  `STRIPE_DEFAULT_CUSTOMER_ID=cus_...` (or pass `stripe_customer_id`; production
  should map OAuth → Stripe Customer).

In Stripe: create a Billing Meter with event name `successful_read`, customer
mapping key `stripe_customer_id`, value field `value`, attach to a recurring
price at **$1.00 per unit**. Invoice lag is expected (async meter processing).

Status remains **declared** until a real meter event appears on a Stripe invoice.

### Status honesty

| Mode | When | Behavior |
|------|------|----------|
| **declared / stub** | `STRIPE_SECRET_KEY` / `STRIPE_WEBHOOK_SECRET` / `STRIPE_HOLOMATH_PRICE_ID` missing | Checkout returns stub URL; optional `ALLOW_STUB_PAY=1` simulates webhook for local tests only |
| **stripe_test_ready** | Test keys present | Real Checkout + webhook verification; still not “live production” |
| **stripe_live_ready** | Live keys present | Same flow with live Stripe |

Do **not** claim live billing is enabled until keys are configured and the gate checklist below passes.

### Env (see `.env.example`)

```
REQUIRE_CREDIT=0
STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=
STRIPE_HOLOMATH_PRICE_ID=
PUBLIC_BASE_URL=http://localhost:8792
SPATIAL_CREDITS_DB=./data/spatial_credits.sqlite3
HOLOR4D_API_KEY=
ALLOW_STUB_PAY=0
```

### Deployment gate checklist (before claiming live)

- [ ] Test Checkout Session creates and redirects
- [ ] Webhook mints **exactly one** credit on `checkout.session.completed`
- [ ] Forged `Stripe-Signature` → **400**
- [ ] Duplicate `event.id` → **200**, zero second mint
- [ ] Concurrent consume → only one succeeds
- [ ] Success URL visit mints **zero** credits
- [ ] Secrets only in env / secret manager (never committed)
- [ ] Public HTTPS base URL for Checkout + webhook
- [ ] One live $1 payment observed end-to-end before marketing “live”

### Remaining declared items

- OAuth account-bound credit balance (stub interface only today)
- Out-of-band delivery of plaintext credit token after webhook mint (email / account portal)

---

## Paywall behavior

```bash
REQUIRE_CREDIT=1 uvicorn app.main:app --host 0.0.0.0 --port 8792
```

- Missing / invalid credit → **HTTP 402**  
  `{ "error": "payment_required", "message": "...", "checkout_url": "...", "price_usd": 1, "billing_status": "declared" }`
- `REQUIRE_CREDIT=0` (default) → tokenize freely for demos.
- Local stub mint (dev only): `ALLOW_STUB_PAY=1` then `POST /v1/billing/stub-pay?pending=...`

---

## Tunnel tip

ChatGPT cannot reach `localhost`. Always put **HTTPS** in the OpenAPI `servers.url`.
If ngrok shows an interstitial, use a reserved domain or Cloudflare Tunnel for fewer
Action fetch failures.
