# 09 — Promotion request

**Trail:** `digital-printer-v2-2026-07`  
**Version:** **2.0**  
**Request filed:** yes — **PROMOTE** / user-language **PROMOTE_WITHOUT_GAPS**

## Requested eligibility

**`PROMOTE`** (ESFR enum) ≡ user-language **`PROMOTE_WITHOUT_GAPS`**

## Current eligibility

**`PROMOTE`** — `residualGaps: {}` (empty)

## Closed since prior PROMOTE_WITH_GAPS (`f158ed1`)

| Gap (before) | After | Evidence |
|--------------|-------|----------|
| Unity / Unreal / Engine mesh SHA sync | **enforced** | `printer/mesh_sync.py`, `test_mesh_sync_verification`, `sync-surface-meshes.mjs --verify` |
| Live CSR / GovernanceDecision emission | **enforced** | `csr.json`, `governance-decision.json` on every print |
| Provenance frames | **enforced** | `provenance-frames.json` |
| A-row 102 governance / CKL | **enforced** | `npm run test:governance` 102/102; `test:ckl` OK; `test:conformance` 16/16 |
| Denoise on non–scene-spec backends | **enforced** | `apply-bilateral-png.mjs` + test; pipeline post-plate |
| Print plate reproducibility | **enforced** | dual `renderSceneFromSpec` same seed → identical sha256 |

## Residual gaps

*(none)*

## What ships under PROMOTE

- Printer adapter v2.0 surface contract  
- Genblaze `/printer` HTTP (opt-in execute)  
- Profile-gated denoise (all print backends), soft penumbra, GGX print-path  
- Mesh SHA sync gate, CSR / GD / provenance emission  
