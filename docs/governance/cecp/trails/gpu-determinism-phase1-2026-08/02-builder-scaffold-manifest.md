# 02 — Builder Scaffold Manifest

**Trail:** `gpu-determinism-phase1-2026-08`  
**Role:** Builder  
**Date:** 2026-07-28  
**softwareCreationMode:** Constructor + Blueprint  
**Status:** **partial** (scaffolds filled by Implementor)

## Scaffold tree

```text
docs/sx-router/specs/
  ├─ router-capability-dashboard.md
  ├─ multi-vendor-rhi-determinism.md
  ├─ capability-inspector-ui.md
  └─ deterministic-rhi-shader-pipeline.md

docs/governance/cecp/charters/
  └─ gpu-integrator-promotion-charter.md   # Draft / future Article IV

docs/governance/cecp/trails/
  ├─ pr84-announcement.md                  # draft for next PR
  ├─ sx-router-vNext-2027/README.md        # Phases 5–8
  ├─ vendor-gpu-integration-2026-07/
  │    ├─ crew-manifest.md
  │    ├─ promotion-tracker.md
  │    └─ readiness-report.md
  └─ gpu-determinism-phase1-2026-08/       # this trail

sovereign-x/
  ├─ router/index.js                       # wire integrator route
  ├─ router/modules/gpu/integrator/deterministicGpuIntegrator.js
  └─ tests/gpuIntegratorPromotion.test.js  # skeleton
```

## Stub rules

- No live CUDA/HIP kernels.
- SSIM cases must `skip` or carry `status: "skeleton"`.
- Charter Article IV must say **future draft only**.

## Handoff to Implementor

Fill content from user drop-ins; wire route; run promotion + parity suites.
