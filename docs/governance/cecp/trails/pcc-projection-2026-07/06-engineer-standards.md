# 06 — Engineer Standards (ESFR) — gap-close refresh

| Field | Value |
| --- | --- |
| `mode` | Anchor |
| `cognitive-profile` | Guardian + Steward |
| `softwareCreationMode` | Runtime-Sage |
| ESFRVerdict | **PASS_WITH_GAPS** |
| PromotionEligibility | **PROMOTE_WITH_GAPS** |
| refreshed | 2026-07-28 |

> **BANNER:** Governed observation aperture — assist/preview only; CPU RT4D print
> remains SoT. Projector4D is math/print SoT. Aperture ≠ print.

## Test matrix

| Suite | Command | Result |
| --- | --- | --- |
| Continuity | `test:projection` (continuity) | PASS |
| Invariants + bind + P0 clobber | `test:projection` (invariants) | PASS |
| Lens verifier (no soft-skip) | `test:projection` (northstar) | PASS |
| Kernel strength | `test:projection` (kernel.strength) | PASS |
| Aggregate | 33 tests | **33 pass / 0 fail** |

## Probes (01–08 style)

| Probe | Citation | Result |
| --- | --- | --- |
| 01 Intent declared | PCC preamble + ADR | PASS |
| 02 SoT not duplicated | projector.js still closed form | PASS |
| 03 Status tags honest | PCC-RUNTIME-CKL stays declared | PASS |
| 04 Continuity evidence | continuity + differentiability | PASS |
| 05 Print sovereignty | aperture `printSoT:false` | PASS |
| 06 Lens north-star | energy/caustic/temporal sweeps | PASS |
| 07 Path-tracer bind | `wiredIntoPathTracer4D` + projectObservationPoint | PASS |
| 08 GPU assist-only | INTEGRATION_NOTES / PCC banner | PASS (docs) |

## Capability tags summary

| Capability | Tag |
| --- | --- |
| ProjCC contract docs | **declared** (ratified) |
| ProjectionState / Kernel / continuous P | **enforced** (unit suite) |
| Observation presets (core + orbit + soft_caustic) | **enforced** |
| ApertureFrame3D API + metadata | **enforced** |
| Hyper-Caustic north-star (tolerance) | **partial** |
| Path-tracer observation bind | **partial** |
| Package projection governance | **partial** |
| Charter CKL / runtime enforced gate | **declared** / **not claimed** |

## Irreducible gaps

- Charter policy row (protected) not added — package filter only
- Full path-tracer continuous ray rewrite
- PNG hash gallery FULL_PASS
- Production “observation engine” claim (Drive-G-2)

## PromotionEligibility

**PROMOTE_WITH_GAPS** — mergeable continuity layer with suite-enforced kernel/presets/aperture;
bind + lens + governance partial; SoT honesty preserved.

## ESFRVerdict

**PASS_WITH_GAPS**
