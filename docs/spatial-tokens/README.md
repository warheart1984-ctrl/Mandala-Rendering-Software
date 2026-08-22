# HoloRT4D Spatial Tokens

Deterministic **spatial tokens** for LLMs: depth + curvature + normals on an 8×8 / 16×16 grid, scheme `HoloRT4D-Spatial-V1`, plus ChatGPT-primary **Holo-Scheme V1** (8×8 categorical bins).

## Status table (honest)

| Surface | Status | Notes |
|---------|--------|-------|
| `tokenizeFromDepthGrid` (chamber / opticalLength / landmark-z) | **enforced** | Math + tests |
| `buildHoloSchemeV1` (8×8 ChatGPT payload) | **enforced** | Tiny token footprint |
| `formatForLLM` | **enforced** | Deterministic compact text |
| Curvature / normals from gradients | **enforced** | Finite differences |
| Canonical JSON + sha256 hash | **enforced** | Deterministic |
| Face object / face_topography | **partial** | Landmark heuristics |
| Motion from prev depth / flow | **partial** | Cell averages |
| environment_type / realism_index | **partial** | Heuristics, not anatomical truth |
| Grayscale pseudo-depth | **partial** | Luminance invert — not metric |
| Photo → metric depth (no ML) | **declared** | Not implemented |
| Meter / angle calibration | **declared** | State scale explicitly if used |
| FastAPI `/v1/spatial-tokenize` (Actions) | **partial** | HoloMath_Read + 402 stub |
| Billing `$1`/call Stripe live | **declared** | Documented, not charged |
| Marketing landing | **skeleton** | `mrs/apps/spatial-tokenizer/web/` |
| SDK client | **skeleton** | Posts to API |

## Docs

- [CHATGPT_GPT_SETUP.md](./CHATGPT_GPT_SETUP.md) — Custom GPT Actions + system prompt
- [API.md](./API.md)
- [SDK.md](./SDK.md)
- [INVESTOR_ONE_PAGER.md](./INVESTOR_ONE_PAGER.md)
- [LAUNCH_ANNOUNCEMENT.md](./LAUNCH_ANNOUNCEMENT.md)
- [PITCH_DECK.md](./PITCH_DECK.md)

## Code

| Path | Role |
|------|------|
| `mrs/packages/renderer-core/src/render/rt4d/holort4d/spatial-tokens/` | Math core |
| `mrs/packages/spatial-tokens-sdk/` | TS SDK skeleton |
| `mrs/apps/spatial-tokenizer/` | FastAPI + GPT Actions OpenAPI + MCP |
| `scripts/holort4d-tokenize.mjs` | CLI |

## Quick CLI

```bash
node scripts/holort4d-tokenize.mjs --synthetic 64 --resolution 8
```

## Tests

```bash
node --test mrs/packages/renderer-core/src/render/rt4d/holort4d/spatial-tokens/spatial-tokens.test.js
cd mrs/apps/spatial-tokenizer && pytest -q
```
