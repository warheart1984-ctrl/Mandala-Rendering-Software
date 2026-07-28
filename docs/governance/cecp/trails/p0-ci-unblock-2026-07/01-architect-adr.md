# 01 — Architect ADR: P0 CI Unblock

**Trail:** `p0-ci-unblock-2026-07`  
**Role:** Architect  
**Date:** 2026-07-28  
**actorMode:** Navigator  
**mode:** Warrior  
**softwareCreationMode:** Debugger  
**Status:** **enforced** (acceptance criteria verified)

## 1. Intent

Unblock root CI and local gates blocked by four P0 defects:
1. Conformance stubFetch cannot resolve CKL `file://` URLs → 0/16.
2. PostProcessor bloomCombine BGL has 3 bindings while shader/createBindGroup use 0–3.
3. `check-package-types` fails on vendored `package.json` missing `"type":"module"`.
4. `GPUPreviewClient` references bare `__dirname` under ESM → ReferenceError risk.

## 2. ADR decision

### Context

CI and local operator loops fail on first-party scripts/runtime without needing charter edits.

### Decision

1. Fix `stubFetch` with `fileURLToPath` for `file:` URLs (Node adapter only).
2. Give bloomCombine a **dedicated** BGL with bindings 0–3; pair `float` + filtering sampler.
3. Ignore `vendor/**` in package-types walker (do not patch third-party packages).
4. Define `__dirname` via `fileURLToPath(import.meta.url)` in GPUPreviewClient.
5. Add focused unit tests for bloom BGL entry counts and preview construct smoke.

### Alternatives rejected

| Option | Why rejected |
|--------|--------------|
| Patch vendor genblaze package.json | Third-party; ignore is correct |
| Change CKL.loadDefault itself | Works in browser; bug is Node stub |
| Auto-layout from shader reflection | Out of scope; no reflection tooling |
| Claim live GPU bloom validation | Mock-device tests only |

### Consequences

- Positive: conformance 16/16; package-types green; ESM preview path safe.
- Residual: non-combine PostProcessor pipelines still use `unfilterable-float` + filtering sampler.

## 3. Interface specification

- Inputs: CKL `file://` policy URL; WebGPU mock device; package.json tree.
- Outputs: compliant conformance report; bind groups matching layouts; exit 0 checks.
- Bans: charter/policy edits; GPU print SoT; vendor mutation.

## 4. Constitutional boundary

- In-scope: scripts + renderer-core GPU helpers + unit tests + CECP trail.
- Out-of-scope: protected charter/policies; Unity/Unreal hosts; live WebGPU hardware.
- Protected paths: untouched.

## 5. File manifest

| Path | Action | Owner |
|------|--------|-------|
| `scripts/test-conformance.mjs` | modify | Implementor |
| `scripts/check-package-types.mjs` | modify | Implementor |
| `mrs/packages/renderer-core/src/gpu/PostProcessor.js` | modify | Implementor |
| `mrs/packages/renderer-core/src/gpu/GPUPreviewClient.js` | modify | Implementor |
| `mrs/packages/renderer-core/test/gpu/gpu-core.test.js` | modify | Implementor |
| `docs/governance/cecp/trails/p0-ci-unblock-2026-07/*` | create | Foreman |

## 6. Acceptance criteria

1. `npm run test:conformance` → 16/16.
2. `node scripts/check-package-types.mjs` → exit 0.
3. bloomCombine layout mock test asserts bindings `[0,1,2,3]`.
4. GPUPreviewClient construct + `findPreviewExe` does not throw ReferenceError.
5. No protected-path edits.

## 7. Handoff to Builder

Scaffold: dedicated bloomCombine pipeline layout method; stubFetch URL branch; IGNORE vendor; ESM dirname constant; two new test describes.
