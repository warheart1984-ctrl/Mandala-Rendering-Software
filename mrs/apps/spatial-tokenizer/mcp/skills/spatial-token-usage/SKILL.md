---
name: spatial-token-usage
description: Tokenize depth into HoloRT4D-Spatial-V1 JSON for ChatGPT/Codex via MCP tools.
---

# HoloRT4D Spatial Token Usage

## When to call `spatial_tokenize`

- User has a **depth grid** (chamber / opticalLength / landmark-z / stereo) → call `spatial_tokenize` with `depth`, `width`, `height`, `mode`, `resolution`.
- Need scheme field meanings → `get_spatial_scheme`.
- Need mode guidance → `list_spatial_modes` (`face` | `room` | `object`).
- Need to confirm integrity → `verify_spatial_hash`.
- Local chamber tape under `output/` → `tokenize_chamber_frame` (sandboxed).

## Determinism

Same Float32 depth + width + height + resolution (+ optional face/motion) → same SHA-256 hash. Prefer depth arrays over images.

## Honesty

| Path | Status |
|------|--------|
| Depth grid tokenize | **enforced** |
| Hash / canonical JSON | **enforced** |
| Face labels / motion | **partial** |
| Grayscale `image_base64` pseudo-depth | **partial** |
| Photo → metric depth (ML) | **declared** (not implemented) |
| Rate limit | **declared** stub |

Do not claim photoreal metric depth from a single photo unless a declared ML path is present.
