# 07 — Advance note: Lemonade adapter + OpenCL stand-in → **partial**

| Field | Value |
|-------|-------|
| `trailId` | `sx-legacy-efficient-3layer-2026-07` |
| `noteId` | `07-advance-partial-lemonade-opencl` |
| `date` | 2026-07-29 / 2026-07-30 |
| `roles` | Implementor (Integrator SC) + Anchor honesty |
| `hip-rocm` | Consulted — install **not feasible** on Windows R9 380 |

## Intent

Advance Lemonade SD + AMD compute from skeleton/blocked toward honest **partial** with evidence. No constitutional charter edits.

## What became **partial**

| Surface | Tag | Evidence |
|---------|-----|----------|
| SX `gpu.compute.amd.legacy_efficient` schedule + intent | **partial** | `sx-route-proof.json`, unit tests |
| Lemonade SD **adapter** (probe/cascade/retries/report + SX wire) | **partial** | `lemonadeSdAdapter.js`, `lemonade-capability-report.json` |
| OpenCL Tonga still (HIP/ROCm stand-in) | **partial** | `opencl-tonga-still.png`, `opencl-tonga-probe.json` |
| SX `--still --provider auto` beauty route | **partial** | routes Lemonade → OpenCL; still via OpenCL |

## What remains **blocked** / **absent**

| Surface | Tag | Evidence |
|---------|-----|----------|
| Lemonade SD image generation on this host | **blocked** | `model_load_error` / sd-server; AVX2 `0xC000001D` on FX-8350; ROCm unsupported for Tonga |
| ROCm / HIP toolchain | **absent** | `hip-rocm-absence-report.json` |
| Live HIP beauty kernel | **skeleton** | no hipcc |
| Photoreal diffusion vs 40-series | **not claimed** | thesis unchanged |

## Files added/updated

- `sovereign-x/router/modules/gpu/amd/lemonadeSdAdapter.js`
- `sovereign-x/router/modules/gpu/amd/openclLegacyStill.js`
- `sovereign-x/router/modules/gpu/amd/legacyEfficientBeauty.js` (async still path)
- `sovereign-x/router/index.js`
- `sovereign-x/cli/sx-legacy-efficient.mjs` (`--still`, `--probe-lemonade`)
- `scripts/legacy-efficient/opencl_tonga_still.py`
- `sovereign-x/tests/lemonadeSdAdapter.test.js`
- Proofs under `docs/4d-engine/proofs/legacy-efficient/`
- `docs/4d-engine/PHOTOREAL_ON_R9_380.md` status table

## Invoke

```bash
node sovereign-x/cli/sx-legacy-efficient.mjs --probe-lemonade
node sovereign-x/cli/sx-legacy-efficient.mjs --intent demo --still --provider opencl
python scripts/legacy-efficient/opencl_tonga_still.py
```

## Protected paths

None edited.
