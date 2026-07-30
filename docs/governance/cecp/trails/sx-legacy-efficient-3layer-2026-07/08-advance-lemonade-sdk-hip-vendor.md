# 08 — Advance note: Lemonade SDK upstream + HIP pin → **partial** / **absent**

| Field | Value |
|-------|-------|
| `trailId` | `sx-legacy-efficient-3layer-2026-07` |
| `noteId` | `08-advance-lemonade-sdk-hip-vendor` |
| `date` | 2026-07-29 / 2026-07-30 |
| `roles` | Implementor (Integrator SC) + hip-rocm skill consult + Anchor honesty |
| `crew` | mrs-crew foreman cycle (no full 01–06 re-run; advance note only) |

## Intent

Pull upstream Lemonade SDK + ROCm HIP into `vendor/` (gitignored), wire OpenAI-compatible **Lemonade SDK** chat client beside existing multimodal SD adapter, document HIP Windows/Tonga feasibility honestly. No constitutional charter edits.

## Upstream pins

| Repo | Path | SHA | Tag |
|------|------|-----|-----|
| [lemonade-sdk/lemonade](https://github.com/lemonade-sdk/lemonade) | `vendor/lemonade` | `044138de2694562f8128ba1254960c34ff866465` | pin **partial** (clone) |
| [ROCm/HIP](https://github.com/ROCm/HIP) | `vendor/HIP` | `1377114f8220724206f1f5a770501fda11d8d1e1` | headers on disk; toolchain **absent** |

Evidence: `docs/4d-engine/proofs/legacy-efficient/upstream-vendor-pins.json`

## What advanced (**partial**)

| Surface | Tag | Evidence |
|---------|-----|----------|
| Lemonade SDK OpenAI chat adapter | **partial** | `lemonadeSdkAdapter.js` — probes `:8000` then `:13305`, chat/completions |
| SX CLI `--provider lemonade-sdk` / `--probe-lemonade-sdk` / `--chat` | **partial** | `sx-legacy-efficient.mjs` |
| Legacy route `beauty.lemonadeSdk` | **partial** | `legacyEfficientBeauty.js` async path |
| Port probe | **partial** | `:13305` up (Lemonade 11.5.0); `:8000` down on this host |

## What remains **blocked** / **absent**

| Surface | Tag | Evidence |
|---------|-----|----------|
| Lemonade SDK live chat (no LLM downloaded) | **blocked** / pending model | `NO_LLM_MODEL_DOWNLOADED` until `lemonade pull` a GGUF chat model |
| Lemonade SD image generation | **blocked** | unchanged — AVX2/ROCm/Tonga |
| ROCm / HIP `hipcc` toolchain | **absent** | `hip-rocm-absence-report.json` — no Program Files SDK, no cmake/MSVC |
| HIP beauty on R9 380 Windows | **absent** | Tonga outside supported ROCm gfx families |
| Photoreal diffusion vs 40-series | **not claimed** | thesis unchanged |

## Documented HIP build path (not runnable here)

1. Install ROCm Core SDK / HIP SDK for Windows (requires supported GPU + VS + Windows SDK) — `vendor/HIP/docs/install/install.rst`
2. Or source-build via `rocm-systems` / TheRock — `vendor/HIP/docs/install/build.rst`
3. Verify: `hipconfig --full`, `hipcc --version`
4. On this host: stop after documenting — do **not** claim partial HIP runtime

## Files added/updated

- `vendor/lemonade`, `vendor/HIP` (gitignored clones)
- `sovereign-x/router/modules/gpu/amd/lemonadeSdkAdapter.js`
- `sovereign-x/router/modules/gpu/amd/legacyEfficientBeauty.js`
- `sovereign-x/cli/sx-legacy-efficient.mjs`
- `sovereign-x/tests/lemonadeSdkAdapter.test.js`
- `docs/4d-engine/proofs/legacy-efficient/upstream-vendor-pins.json`
- `docs/4d-engine/proofs/legacy-efficient/hip-rocm-absence-report.json`
- `docs/4d-engine/proofs/legacy-efficient/lemonade-sdk-capability-report.json`
- `docs/4d-engine/PHOTOREAL_ON_R9_380.md`

## Invoke

```bash
node sovereign-x/cli/sx-legacy-efficient.mjs --probe-lemonade-sdk
node sovereign-x/cli/sx-legacy-efficient.mjs --intent demo --provider lemonade-sdk --chat "ping"
node sovereign-x/cli/sx-legacy-efficient.mjs --intent demo --still --provider opencl
```

## Protected paths

None edited.

