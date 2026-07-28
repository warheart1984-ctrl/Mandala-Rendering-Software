# 05 — Inspector acceptance (v2.0 gap-closure re-run)

**Trail:** `digital-printer-v2-2026-07`  
**Role:** Inspector (Testwright)  
**InspectorVerdict:** **PASS**  
**Date:** 2026-07-28

## Residual gap probes (must be empty for PROMOTE)

| Item | Result | Evidence |
|------|--------|----------|
| Mesh SHA Unity/Unreal | PASS | `test_mesh_sync_verification`; `--verify` ok |
| CSR / GovernanceDecision / ProvenanceFrame | PASS | dry-run emits all three JSON files |
| Governance 102 / CKL / conformance | PASS | 102/102; CKL OK; 16/16 |
| Denoise all print backends | PASS | `apply-bilateral-png.test.js`; pipeline hook |
| Plate reproducibility | PASS | dual renderSceneFromSpec identical sha256 |

## Full suite (this pass)

| Command / suite | Result |
|-----------------|--------|
| `pytest …/test_printer_mode.py …/test_printer_api.py` | **24 passed** |
| `pytest …/test_printer_api.py` (solo) | **9 passed** |
| `bilateral-denoise.test.js` | PASS |
| `render-scene-print-quality.test.js` | PASS |
| `soft-penumbra-print.test.js` | PASS |
| `print-specular-ggx.test.js` | PASS |
| `apply-bilateral-png.test.js` | PASS |
| `normalization.test.js` | **23 passed** |
| `scene-spec.test.js` | **13 passed** |
| `resolve-dual-layout-proton.test.js` | PASS |
| `sync-surface-meshes.mjs --verify` | ok |
| `npm run test:governance` | **102 passed** |
| `npm run test:ckl` | OK |
| `npm run test:conformance` | **16/16** compliant |
| Dual plate hash (node renderSceneFromSpec) | match `true` |

## Acceptance

All prior residual gaps closed with tests. Recommend ESFR **PASS** / **PROMOTE**.
