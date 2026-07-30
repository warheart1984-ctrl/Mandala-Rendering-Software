# 05 — Inspector acceptance

**Role:** Inspector  
**InspectorVerdict:** **PASS_WITH_GAPS**

## Evidence commands

| Command | Result |
|---------|--------|
| `node --test sovereign-x/tests/legacyEfficientBeauty.test.js` | 7/7 pass |
| `node sovereign-x/cli/sx-legacy-efficient.mjs --intent crew-proof-1 …` | ok; proof JSON written |
| `dispatchVendorCapability('gpu.compute.amd.legacy_efficient')` | `ALLOWED_UPSTREAM` |
| Lemonade `load` SD/RealESRGAN (prior probe) | HTTP 500 — **blocked** |
| OpenCL/Vulkan detect (prior) | R9 380 present — **enforced-detect** |

## Claim ↔ evidence

| Claim | Evidence | Tag |
|-------|----------|-----|
| SX route selectable | registry + route + CLI | partial |
| L1 sparse metric | usefulFraction ≈ 0.094 at p=0.1 | partial |
| L3 intent gate | GOVERNANCE_INTENT_REQUIRED test | partial |
| L2 bandwidth | estimate fields in receipt | declared |
| Live beauty GPU | none | skeleton |
| Beats 4090 FLOPS | **not claimed** | n/a |

## Gaps

- Device kernel not implemented
- Capability report JSON may need refresh if hardware changes
