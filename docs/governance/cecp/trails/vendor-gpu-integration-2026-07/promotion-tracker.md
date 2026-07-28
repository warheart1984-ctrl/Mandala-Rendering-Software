# Vendor Compute Promotion Tracker

**Artifact:** `docs/governance/cecp/trails/vendor-gpu-integration-2026-07/promotion-tracker.md`  
**Trail:** `vendor-gpu-integration-2026-07`  
**Status:** Operator assessment (**declared** tracker; not a runtime gate)

## Promotion Stages

| Stage | Description | Status |
|-------|-------------|--------|
| Assist Layer | GPU compute allowed as assist-only | ✔ Completed (PR #83) |
| Parity Layer | GPU vs CPU deterministic comparison | In progress |
| Deterministic Integrator | GPU integrator with seed + receipts | Prototype ready |
| Multi-host Reproducibility | NVIDIA/AMD/WebGPU parity | Pending |
| GPU Print Candidate | GPU eligible for print SoT | Future |
| GPU Print Promotion | GPU becomes authoritative | Future (**charter draft only** — Article IV not enacted) |

## Current Metrics

| Metric | Value | Honesty tag |
|--------|-------|-------------|
| Parity suite | 2 pass, 2 skipped | **skeleton** / harness |
| SSIM/MSE | placeholder values | **not** measured live parity |
| Replay receipts | prototype | **declared** |
| Vendor neutrality | enforced at registry layer | **partial** / protocol |
| DeterminismRequired override | working (router stub) | **partial** |

## Risks

- Driver drift
- Vendor-specific nondeterminism
- RHI inconsistencies
- Seed contract violations

## Next Required Trails

- `gpu-determinism-phase1-2026-08` (Phase I materials — this PR / next PR)
- `gpu-parity-2026-09` (**declared** follow-on)
- `gpu-deterministic-integrator-2026-10` (**declared** follow-on)
- `gpu-print-candidate-2027-01` (**declared** follow-on)

## Anti-overclaim

“GPU Print Promotion / GPU becomes authoritative” remains **Future**. The
promotion charter Article IV is a **future draft** only — registry is **not**
reclassified.
