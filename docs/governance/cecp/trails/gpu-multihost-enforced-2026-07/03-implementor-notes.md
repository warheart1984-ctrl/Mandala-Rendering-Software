# 03 — Implementor notes

**Trail:** `gpu-multihost-enforced-2026-07`  
**Role:** Implementor (Integrator · Testwright)  
**Date:** 2026-07-28

## What changed

1. **PostProcessor** — `_createBloomCombinePipeline` / `_createRenderPipeline` aliases; existing 4-entry bloomCombine BGL preserved.
2. **ShadowMapper** — `_createShadowPipeline` / `_runShadowPass`; mock begin/end test.
3. **EnvironmentMapper** — `_createEnvResources` / `_createEnvBindGroup`; prefilter mip layout already fixed.
4. **GPUPreviewClient** — `import.meta.url` `__dirname` retained; `route()` / `routePreviewAction` constitutional soft gates; stats expose `dirnameResolved`.
5. **BrowserRuntimeAdapter** — `getActorIdentity`, `getCapabilities`, `route` alongside CKL probes.
6. **HostConstitutionalRouter** — single SoT for deny/allow; uses `gpuPrintSafeguard` + registry.
7. **npm** — `test:gpu`, `test:gpu-live`, `test:multihost`; Mandala Agent CI + ci.yml mandala-check wired.
8. **status.md / CHARTER.md** — evidence-honest tags.

## Tests to run

```bash
npm run test:gpu
npm run test:gpu-live
npm run test:multihost
npm run test:governance
npm run test:conformance
npm run test:runtime-provenance
node mandala-agent-pack/lint/run-lint.js
```

## Conformance impact

None of the 16 probe IDs removed; new adapter methods ignored by ConformanceChecker key lookup.
