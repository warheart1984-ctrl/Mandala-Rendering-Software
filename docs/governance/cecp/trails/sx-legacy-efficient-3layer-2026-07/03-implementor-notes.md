# 03 — Implementor notes

**Role:** Implementor  
**Status delivered:** **partial**

## Intent

Fill Architect/Builder surfaces: 3-layer schedule math, SX `route()` hookup, CLI proof, unit tests.

## Files touched

- `docs/4d-engine/PHOTOREAL_ON_R9_380.md`
- `sovereign-x/router/modules/gpu/amd/legacyEfficientBeauty.js`
- `sovereign-x/router/index.js`
- `sovereign-x/router/registry/gpuSkillsRegistry.json`
- `sovereign-x/router/modules/gpu/amd/README.md`
- `sovereign-x/cli/sx-legacy-efficient.mjs`
- `sovereign-x/cli/sx-capabilities.js`
- `sovereign-x/tests/legacyEfficientBeauty.test.js`
- `sovereign-x/tests/sxCapabilitiesCli.test.js`
- `mrs/packages/sovereign-x-router/data/vendor-capability-registry.json`
- `package.json`
- `docs/4d-engine/proofs/legacy-efficient/*`

## Tests run

```text
node --test sovereign-x/tests/legacyEfficientBeauty.test.js
→ 7 pass, 0 fail
```

```text
node sovereign-x/cli/sx-legacy-efficient.mjs --intent crew-proof-1 --width 64 --height 64 --tile 8 --p 0.1
→ ok, usefulFraction=0.09375, combinedGainEstimate=16 (schedule math)
```

## Gaps (honest)

- No OpenCL/Vulkan beauty kernel (**skeleton**)
- Lemonade SD still **blocked** on R9 380
- ROCm/HIP **absent** on this Windows host (hip-rocm skill consulted)
- Memory layer gain is **declared** arithmetic (halo can make bpf ≥ dense)

## Protected paths

None edited (`constitution/`, `charter.js`, `default.policies.json`, `AGENTS.md`).
