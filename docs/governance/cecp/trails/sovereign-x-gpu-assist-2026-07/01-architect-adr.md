# 01 — Architect ADR: Sovereign X GPU Assist (A–E)

**Trail:** `sovereign-x-gpu-assist-2026-07`  
**Role:** Architect (+ Boundary-Guardian / Anchor / Protocol)  
**Date:** 2026-07-28  
**Status:** **declared** design; prior router **partial**  
**mode:** sage-adjacent Anchor (anti-overclaim)

## 1. Intent

Implement user SoT sections A–E on existing `@mrs/sovereign-x-router` (tip ~627023f,
PR #83): capability map aliases/classes, GpuAssistModule, GpuDispatchContract,
governance charter (docs only), SovereignLookDevEngine plan + skeleton.

## 2. ADR decision

### Context

Vendor-router trail registered NVIDIA/AMD skill IDs as upstream-only. User now
specifies a fuller GPU-assist architecture: router view, assist module exports,
dispatch contract fields/rules, constitutional charter articles A1–A5, and a
LookDev engine plan with assistOnly steps and CPU final print.

### Decision

1. **NEW** CECP trail `sovereign-x-gpu-assist-2026-07` (do not overwrite vendor-router).
2. Extend registry schema 1.1.0: canonical classes, aliases
   (`gpu.gen.nvidia.nim_flux` ↔ `ai.gen.nvidia.flux`), keep prior IDs.
3. Add `GpuDispatchContract` + `GpuAssistModule` + LookDev planner skeleton.
4. Charter under `docs/governance/` only — **not** `engine/constitution/`.
5. Spec under `docs/superpowers/specs/`.

### Consequences

- Positive: governed assist boundary; tests for printer/SoT rejection.
- Gaps: no vendor runtime; LookDev **declared** skeleton only.
- Non-consequence: Digital Printer SoT unchanged.

## 3. Interface specification

### A — Capability classes

`gpu.inference.nvidia.tao`, `gpu.compute.nvidia.cuda`, `gpu.gen.nvidia.nim_flux`,
`gpu.inference.amd.rocm`, `gpu.compute.amd.hip` (+ prior IDs).

Router: intent + modality + determinism + vendorPreference → binding +
authorityTag. Invariant: assist ↛ `/printer/*` | evidence SoT.

### B — GpuAssistModule

`routeLookDev`, `routeSceneSpecAssist`, `routeEmbeddings`.  
Policy: determinism→CPU; auto→NVIDIA→AMD→CPU; assistProvenance only.

### C — GpuDispatchContract

Fields: `intentId`, `modality`, `determinismRequired`, `vendorPreference`,
`capabilityClass`. Sovereignty override if backend missing.

### D — Charter articles A1–A5

`docs/governance/GPU_ASSISTED_COMPUTE_INTEGRATION_CHARTER.md`

### E — SovereignLookDevEngine

Steps 1–4; assistOnly 1–3; Step 4 CPU RT4D hand-off.

## 4. Constitutional boundary

| In | Out |
|----|-----|
| Package + docs/governance charter + superpowers spec + CECP trail | `engine/constitution/*`, `AGENTS.md`, printer pipeline mutation |
| Contract tests | Live CUDA/HIP/NIM |

## 5. File manifest

| Path | Action | Owner |
|------|--------|-------|
| `mrs/packages/sovereign-x-router/data/vendor-capability-registry.json` | update | Implementor |
| `mrs/packages/sovereign-x-router/src/GpuDispatchContract.js` | create | Builder→Implementor |
| `mrs/packages/sovereign-x-router/src/GpuAssistModule.js` | create | Builder→Implementor |
| `mrs/packages/sovereign-x-router/src/lookdev/SovereignLookDevEngine.js` | create | Builder→Implementor |
| `mrs/packages/sovereign-x-router/test/gpu-assist.test.js` | create | Implementor |
| `docs/governance/GPU_ASSISTED_COMPUTE_INTEGRATION_CHARTER.md` | create | Architect→Implementor |
| `docs/superpowers/specs/2026-07-28-sovereign-lookdev-engine-plan.md` | create | Architect |
| `docs/governance/cecp/trails/sovereign-x-gpu-assist-2026-07/**` | create | Crew |

## 6. Acceptance criteria

- [ ] Alias nim_flux ↔ flux resolves
- [ ] Contract rejects `/printer/*` and evidence SoT
- [ ] determinismRequired → CPU; auto cascade NVIDIA→AMD→CPU
- [ ] Assist routes expose assistProvenance only
- [ ] LookDev plan Steps 1–4 with CPU hand-off
- [ ] Unit tests pass; charter status honest

## 7. Anti-overclaim

No claim of GPU print enforcement, CHEA/CCR/CDGF gates, or commercial readiness.

## 8. Handoff order

1. Builder → scaffold modules + registry fields  
2. Implementor → logic + tests  
3. Reviewer → conformance  
4. Inspector → acceptance  
5. ESFR → promotion eligibility
