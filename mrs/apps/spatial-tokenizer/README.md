# HoloRT4D Spatial Tokenizer (API stub + MCP + GPT Actions)

CPU-only FastAPI gateway for the **$1 Spatial Plugin** (ChatGPT Custom GPT Actions),
plus an optional MCP surface. Primary ChatGPT payload: **Holo-Scheme V1**.

| Capability | Status |
|------------|--------|
| Depth grid → Holo-Scheme V1 (`buildHoloSchemeV1`) | **enforced** |
| Depth grid → Spatial-V1 token (Node math core) | **enforced** |
| GPT Actions OpenAPI | **partial** — `openapi-gpt-actions.yaml` |
| MCP Streamable HTTP (`mcp/`) | **enforced** tools; UI **skeleton** |
| `REQUIRE_CREDIT` 402 paywall | **declared** — webhook-only mint when Stripe configured |
| Billing `$1`/call Stripe live | **declared** (no secrets in repo; stub until keys set) |
| `image_base64` → grayscale pseudo-depth | **partial** |
| Meter calibration | **declared** |

## GPT Actions (ChatGPT Custom GPT)

See [`docs/spatial-tokens/CHATGPT_GPT_SETUP.md`](../../../docs/spatial-tokens/CHATGPT_GPT_SETUP.md).

```bash
cd mrs/apps/spatial-tokenizer
pip install -r requirements.txt
uvicorn app.main:app --host 0.0.0.0 --port 8792
# tunnel: ngrok http 8792  → paste HTTPS into openapi-gpt-actions.yaml servers.url
```

OpenAPI for Actions: [`openapi-gpt-actions.yaml`](./openapi-gpt-actions.yaml)  
operationId: `HoloMath_Read`

## MCP (ChatGPT / Codex)

```bash
cd mrs/apps/spatial-tokenizer/mcp
npm install && npm start
```

See [`mcp/README.md`](./mcp/README.md). Actions OpenAPI stays separate; both share tokenize core.

## Prefer CLI for local determinism

```bash
node scripts/holort4d-tokenize.mjs --synthetic 64 --resolution 8
```

## Tests

```bash
node --test mrs/packages/renderer-core/src/render/rt4d/holort4d/spatial-tokens/spatial-tokens.test.js
cd mrs/apps/spatial-tokenizer && pip install -r requirements.txt && pytest -q
```
