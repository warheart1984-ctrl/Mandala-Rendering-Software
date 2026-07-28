# 03 — Implementor Notes

**Trail:** `e2e-close-gaps-2026-07`  
**Date:** 2026-07-28  
**Status:** **enforced**

## Changes

### GPU / renderer-core
- PostProcessor `createRenderPipeline`: `float` + filtering sampler (was unfilterable-float mismatch).
- ShadowMapper: `@builtin(frag_depth)` depth-only FS; separate consumer BGL (bindings 0–2).
- EnvironmentMapper: prefilter `size: [128,128,6]` + `mipLevelCount: 5`; layout/bindings 0–5 with envParams UBO.
- GPUPreviewClient: `lastError` on empty catches; exposed in `getStats()`.
- package.json `files` includes wgsl/json/schemas; export `./node`.
- Index comment downgraded from “browser-safe” to honest mixed surface.

### CI / provenance
- `npm run test:runtime-provenance`
- Wired into `.github/workflows/ci.yml`, `mandala-agent-ci.yml`, pack CI.
- `hashFrameProvenance` (SHA-256) + `ReplayService.createLineageReceipt`.

### Genblaze / security
- SECURITY.md Genblaze/BYOK section.
- byok.rules.md: `GENBLAZE_ALLOW_BYOK`; UI→Genblaze→NIM path honesty.
- XSS: BYOK diag / capability registry use DOM text APIs.
- Polish route rejects BYOK headers with 400.
- Soft model catalog warn (server + UI).

### Vendor
- nvidia/amd assist consulted as assist-only; no print SoT promotion.
