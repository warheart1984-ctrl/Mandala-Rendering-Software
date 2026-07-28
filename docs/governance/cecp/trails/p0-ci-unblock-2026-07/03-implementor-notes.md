# 03 — Implementor Notes

**Trail:** `p0-ci-unblock-2026-07`  
**Role:** Implementor  
**Date:** 2026-07-28  
**mode:** Debugger  
**softwareCreationMode:** Integrator · Testwright  
**Status:** **enforced** (focused tests green)

## Changes landed

### 1. `scripts/test-conformance.mjs`
`stubFetch` now converts `file:` URLs with `fileURLToPath` so `CKL.loadDefault` Node paths resolve to real filesystem paths (fixes Windows `ENOENT` on `file:\G:\...` joined under repo root).

### 2. `mrs/packages/renderer-core/src/gpu/PostProcessor.js`
`createBloomCombinePipeline` creates a dedicated BGL with bindings:
- 0 scene texture (`float`)
- 1 bloom texture (`float`)
- 2 filtering sampler
- 3 uniform buffer

Matches WGSL `@binding(0..3)` and `createBindGroup('bloomCombine')`.

### 3. `scripts/check-package-types.mjs`
`IGNORE` includes `vendor` so third-party trees are not gated for `"type":"module"`.

### 4. `mrs/packages/renderer-core/src/gpu/GPUPreviewClient.js`
```js
const __dirname = path.dirname(fileURLToPath(import.meta.url));
```

### 5. Tests
`gpu-core.test.js`: bloomCombine layout/bind-group entry counts; ESM `__dirname` construct smoke.

## Focused verification

| Command | Result |
|---------|--------|
| `npm run test:conformance` | 16/16 |
| `node scripts/check-package-types.mjs` | 0 |
| `node --test …/gpu-core.test.js` | 64/64 |

## Residual (not fixed here)

- Other PostProcessor pipelines still create BGL with `unfilterable-float` + filtering sampler.
- Pre-existing `opencode.json` deletion in working tree is unrelated to this trail.
