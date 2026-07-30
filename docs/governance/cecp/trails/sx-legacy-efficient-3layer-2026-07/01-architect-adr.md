# 01 — Architect ADR

**Role:** Architect  
**Mode:** Optimizer + Integrator + Anchor  
**Status of design:** **declared** architecture; foothold target **partial**

## Intent

Encode the **3-Layer Path That Beats Bigger GPUs (Mathematically, Not Mythically)** and hook it into Sovereign-X as a first-class AMD legacy (R9 380) efficient beauty route — raise Useful FLOPs / Total FLOPs, never claim Total FLOPs/Time > RTX 4090.

## ADR decision

| | |
|--|--|
| **Context** | Ch1 film is Engine3D CPU soft-raster; Lemonade SD fails on R9 380; SX has AMD slots but no efficiency-first route. |
| **Decision** | Add assist capability `gpu.compute.amd.legacy_efficient` following `gpu.integrator.deterministic` pattern: registry + in-repo module + `route()` branch + vendor registry row + CLI proof. |
| **Rejected** | Parallel non-SX stack; claiming HIP beauty SoT; editing protected constitution files; FLOPS bragging vs 4090. |
| **Consequences** | Operators can resolve/route efficient path with intent gate + sparse metrics; live OpenCL/Vulkan kernels remain **skeleton**. |

## Contracts

**Inputs:** `intentId` (required), `width`/`height`/`tileSize`/`salienceFraction`/`seed`, `hostGpu`, `determinismRequired=false` for GPU assist.  
**Outputs:** assist receipt with `metrics` (usefulFraction, tileOccupancy, combinedGainEstimate), `layers`, never print SoT.  
**Bans:** `asPrintSoT`, `determinismRequired` on GPU (existing safeguard → cpu.rt4d.print).

## File manifest

| Path | Action | Owner |
|------|--------|-------|
| `docs/4d-engine/PHOTOREAL_ON_R9_380.md` | create | Architect→Implementor |
| `sovereign-x/router/modules/gpu/amd/legacyEfficientBeauty.js` | create | Builder→Implementor |
| `sovereign-x/router/registry/gpuSkillsRegistry.json` | extend | Builder |
| `sovereign-x/router/index.js` | wire | Implementor |
| `mrs/packages/sovereign-x-router/data/vendor-capability-registry.json` | extend | Builder |
| `sovereign-x/cli/sx-legacy-efficient.mjs` | create | Implementor |
| `sovereign-x/tests/legacyEfficientBeauty.test.js` | create | Implementor |
| CECP trail | create | Foreman |

## Acceptance criteria

- [ ] Capability resolves via SX registry
- [ ] Route without intent → deny (L3)
- [ ] Route with intent → usefulFraction ≈ p, metrics present
- [ ] Print SoT / determinismRequired denied
- [ ] Architecture doc with 3-layer math + SX Integration
- [ ] Honest status tags; no charter edits

## Handoff

1. Builder → stubs + registry  
2. Implementor → logic + tests + CLI  
3. Reviewer → constitutional audit  
4. Inspector → run tests  
5. ESFR → promotion eligibility  

## Anti-overclaim

Must **not** claim: live photoreal on R9 380; HIP SoT; Lemonade SD working; 4090-beating throughput; CKL policy file changes.
