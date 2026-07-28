# 06 — Engineer Standards (ESFR)

**Trail:** `printer-gpu-quality-speed-2026-07`  
**Stage:** ESFR  
**Status:** **partial** (implementation after APPROVED design)  
**Inspector input:** PASS_WITH_GAPS (2026-07-28 fresh tests)

## ESFRVerdict

| Field | Value |
|-------|-------|
| Verdict | **PASS_WITH_GAPS** |
| PromotionEligibility | **PROMOTE_WITH_GAPS** |
| equivalentUserLanguage | PROMOTE_WITH_GAPS |
| residualGaps | Live Node WebGPU print execute (navigator.gpu); CUDA/HIP **absent**; AMD/NVIDIA Cursor MCP not installed; compare-backends second run still CPU-identity without `--gpu-backend` live path |

## Why PROMOTE_WITH_GAPS (not HOLD)

- Design APPROVED; Tasks 1–6 landed with named tests.
- CPU SoT unchanged; ungated GPU denied; NIM labeled assist-only.
- Remaining gaps are honest **partial**/absent items, not sovereignty breaks.

## Fresh test matrix

| Probe | Result | Evidence |
|-------|--------|----------|
| 01 Intent + approval | PASS | README APPROVED 2026-07-28 |
| 02 Boundary / bans | PASS | sovereignty tests (promptSpec banned) |
| 03 Determinism | PASS | seed-locked QPS + printer tests |
| 04 Evidence chain | PASS | evidence.backend fields |
| 05 No fake free lunch | PASS | QPS MSE decreases with spp |
| 06 NVIDIA assist≠SoT | PASS | Genblaze README section |
| 07 AMD honesty | PASS | still absent |
| 08 Runtime GPU live | GAP | probe skip≠pass; gate **partial** |

### Commands (re-run)

```text
G:\.runtime\python-3.13.14\python.exe -m pytest mrs/adapters/storyforge-boundary/test_printer_mode.py -q
→ 21 passed

node mrs/packages/renderer-core/scripts/test/quality-per-sample.test.js
→ PASS

node --test mrs/packages/renderer-core/scripts/test/cpu-gpu-comparison.test.js
→ 22 pass / 0 fail
```

## Relation to Digital Printer v2.0

v2 remains **PROMOTE** / **PROMOTE_WITHOUT_GAPS**. This trail adds quality-speed + GPU *gates* without reopening v2.

## Residual gaps (for a future trail)

1. Wire real `renderGpu()` behind Dawn/browser; remove CPU-identity masquerade.
2. Fix `RT4DGPURenderer` `Date.now()` seed honesty before print route switch.
3. Optional NVIDIA catalog skills install (user must say yes) — see NVIDIA recommendations in PR notes.
