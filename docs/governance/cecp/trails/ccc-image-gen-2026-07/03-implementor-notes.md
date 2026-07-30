# CCC-ImageGen — Implementor notes

| Field | Value |
|-------|-------|
| **Trail** | `ccc-image-gen-2026-07` |
| **Date** | 2026-07-30 |
| **Status** | **partial** / PASS_WITH_GAPS |
| **Intent** | Make GPU optional for image generation; provider cascade non-blocking |

## What / Why / Files

**What:** CCC-ImageGen capability `image.gen.provider` with priority
`local.gpu → local.cpu → remote.gpu → remote.service`. Lemonade SD / SX beauty
path no longer hard-BLOCK on GPU/sd-server failure.

**Why:** User architectural fix — capability must remain available with fallback
logging when local GPU is down.

**Files:**
- `docs/4d-engine/CCC_IMAGE_GEN.md`
- `sovereign-x/governance/ccc-image-gen.json`
- `engine/governance/ccc-image-gen.capability.json` (pointer; not charter)
- `sovereign-x/router/modules/gpu/amd/ImageGenProvider.js`
- `sovereign-x/router/modules/gpu/amd/lemonadeSdAdapter.js`
- `sovereign-x/router/modules/gpu/amd/legacyEfficientBeauty.js`
- `docs/4d-engine/proofs/world-engine/RENDERER_BEHAVIOR_INVARIANTS.md`
- `sovereign-x/tests/ImageGenProvider.test.js`
- `sovereign-x/cli/sx-image-gen-provider-probe.mjs`

## Tests

```bash
node --test sovereign-x/tests/ImageGenProvider.test.js sovereign-x/tests/lemonadeSdAdapter.test.js
node sovereign-x/cli/sx-image-gen-provider-probe.mjs --force-gpu-down --write
```

Expect `fallbackUsed: true`, `blockedOnGpu: false`.

## Conformance

No change to the 16/17 CKL conformance profile checks. Soft capability only;
`default.policies.json` / `charter.js` untouched.

## Gaps (honest)

- `local.cpu` / `remote.*` execution stubs are **declared/partial** — deferred
  results without fake PNG.
- Live Lemonade pixels still host-dependent (sd-server / AVX2 / ROCm).
- Engine3D soft-raster remains a separate path (not CCC-ImageGen).
