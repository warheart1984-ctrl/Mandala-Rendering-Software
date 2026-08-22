# HoloRT4D Spatial Tokens

Deterministic **spatial tokens** for LLMs: depth + curvature + normals on an 8×8 / 16×16 grid, scheme `HoloRT4D-Spatial-V1`.

## Status table (honest)

| Surface | Status | Notes |
|---------|--------|-------|
| `tokenizeFromDepthGrid` (chamber / opticalLength / landmark-z) | **enforced** | Math + tests |
| Curvature / normals from gradients | **enforced** | Finite differences |
| Canonical JSON + sha256 hash | **enforced** | Deterministic |
| Face object labels | **partial** | Landmark region heuristics |
| Motion from prev depth / flow | **partial** | Cell averages |
| Grayscale pseudo-depth | **partial** | Luminance invert — not metric |
| Photo → metric depth (no ML) | **declared** | Not implemented |
| FastAPI `/v1/spatial-tokenize` | **partial** | Stub; delegates to Node CLI |
| Billing `$1`/call | **declared** | Documented, not charged |
| Marketing landing | **skeleton** | `mrs/apps/spatial-tokenizer/web/` |
| SDK client | **skeleton** | Posts to API |

## Docs

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
| `mrs/apps/spatial-tokenizer/` | FastAPI stub + landing |
| `scripts/holort4d-tokenize.mjs` | CLI |

## Quick CLI

```bash
node scripts/holort4d-tokenize.mjs --synthetic 64 --resolution 16
```

## Tests

```bash
node --test mrs/packages/renderer-core/src/render/rt4d/holort4d/spatial-tokens/spatial-tokens.test.js
```
