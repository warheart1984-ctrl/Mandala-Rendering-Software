# 02 — Builder Scaffold Manifest

**Trail:** `p0-ci-unblock-2026-07`  
**Role:** Builder  
**Date:** 2026-07-28  
**softwareCreationMode:** Blueprint · Constructor  
**Status:** **partial** (scaffold notes; implementation landed in stage 03)

## Scaffold plan

1. **stubFetch branch** — detect `file:` → `fileURLToPath`; else `resolve(root, href)`.
2. **bloomCombine pipeline** — stop reusing 3-binding `createRenderPipeline`; inline dedicated BGL + pipeline.
3. **package-types IGNORE** — add `"vendor"` to directory skip set.
4. **GPUPreviewClient** — import `fileURLToPath`; module-level `__dirname`.
5. **Tests** — mock layout entry counts; construct smoke without mocking findPreviewExe away for ESM path.

## Non-goals

- Live GPU device tests
- Vendor package patches
- Charter / policy changes

## Handoff to Implementor

Implement exactly the Architect file manifest; keep diffs minimal.
