# 03 — Implementor notes

| Field | Value |
| --- | --- |
| `mode` | Physicist |
| `softwareCreationMode` | Constructor + Testwright |
| Status | **partial** |

## What shipped

1. Continuous \(P\) with \(\tau\) as \(w\)-offset, \(\kappa\) as soft d4 scale (identity at 0),
   \(\theta,\varphi\) as post-project view orientation.
2. Fidelity at zero params ≡ `Projector4D` / `classic4Dto3D`.
3. Observation presets mapping LiveLink policy ids.
4. `ApertureFrame3D` with `role: observation_aperture`.
5. Hyper-Caustic verifier: factory + structural projection + north-star soft-skip.
6. Path-tracer hooks explicitly `wiredIntoPathTracer4D: false`.

## Gap-close (2026-07-28)

1. **P0:** `resolveObservationPreset` filters `undefined` overrides; hooks only forward defined opts — orbit/soft_caustic no longer clobber to 0.
2. PathTracer4D `bindObservationProjection` / `projectObservationPoint` with `printSoT:false`.
3. Hyper-Caustic north-star: energy/caustic/temporal tolerance sweeps (no soft-skip default).
4. Package `evaluateProjectionGovernance` (deny missing PCC metadata / attachProvenance).
5. Kernel strength: differentiability, reversible snapshot, extreme-param graceful.
6. Aperture/preset/kernel banners: aperture ≠ print; Projector4D remains math/print SoT.

## Tests

```bash
cd mrs/packages/renderer-core
pnpm run test:projection
# 20/20 pass (2026-07-28)
```

## Series mapping (01–10)

| Step | Artifact |
| --- | --- |
| 01 | PCC docs + ProjectionState + kernel |
| 02 | pccInvariants |
| 03 | HyperCausticLensVerifier |
| 04 | continuityMath |
| 05 | ObservationModePresets |
| 06 | ApertureFrame3D |
| 07–09 | projection.*.test.js |
| 10 | INTEGRATION_NOTES + pathTracerHooks + CECP + ESFR |

## Regressions preserved

- `Projector4D` formulas unchanged
- `createHyperCausticLens` factory untouched in behavior
- CPU print path not redirected through aperture
