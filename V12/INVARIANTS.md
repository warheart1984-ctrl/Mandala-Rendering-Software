# INVARIANTS.md — V12

> **Author:** warheart1984-ctrl
> **Updated:** 2026-08-07

These invariants must never break. A change that violates one is
rejected regardless of convenience (lawbook R10).

## Constitutional invariants

| ID | Invariant | Enforcement |
|----|-----------|-------------|
| I-1 | No execution without intent | CKL deny-if-false (`policy-no-execution-without-intent`) |
| I-2 | No state change without evidence | CKL deny-if-false (`policy-no-state-change-without-evidence`) |
| I-3 | No authority without contract | CKL deny-if-false (`policy-no-authority-without-contract`) |
| I-4 | play_timeline requires world | CKL deny-if-missing-world |
| I-5 | Dual evidence for Mythar Ascension | CKL deny-if-false (`policy-ascension-evidence`) |
| I-6 | Every render carries provenance | CKL attach-provenance |
| I-7 | Replay tokens recompute identically | `verifyReplayToken` — proven in replay probe |

## Math invariants

| ID | Invariant | Evidence |
|----|-----------|----------|
| M-1 | BRDF normalization = 3ρ/(4π) | `normalization.brdf-energy` conformance check; `normalization.test.js` 23/23 |
| M-2 | pdf = 3cosθ/(4π) | same suite |
| M-3 | GGX4D reciprocity f(wi,wo)=f(wo,wi) | same suite |
| M-4 | AABB4 slab intersection correctness | BVH4D tests |

## Data-shape invariants

| ID | Invariant |
|----|-----------|
| D-1 | Every frame carries intentId, timelineId, worldId, timeSeconds, parameters |
| D-2 | Every evidence bundle carries id, worldId, timelineId |
| D-3 | Every track binding resolves to a scene object |
| D-4 | Replay restores identical parameter values |

## Enforcement evidence

- `npm run test:conformance` → 16/16 (recorded under
  `V12/VALIDATION/conformance-results/`)
- `node src/render/rt4d/test/normalization.test.js` → 23/23
- Constitution suite → 98/98 (`V12/VALIDATION/test-results/`)
