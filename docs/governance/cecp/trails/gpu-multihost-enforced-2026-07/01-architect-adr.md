# 01 — Architect ADR

**Trail:** `gpu-multihost-enforced-2026-07`  
**Role:** Architect (Sage · Anchor · Boundary-Guardian)  
**Date:** 2026-07-28

## 1. Intent

Achieve **constitutional FULL_PASS** for GPU print/assist/evidence gates and MultiHost JS routing; extend real GPU modules — never replace with toy stubs. Honest status: live WebGPU **partial**; Unity/Unreal product **skeleton**.

**Authorization:** Operator authorized protected edits for PROMOTE path (`status.md`, `CHARTER.md`).

## 2. ADR

| | |
|---|---|
| **Context** | Prior GPU work fixed bloomCombine BGL / shadow frag_depth / env prefilter; MultiHost lacked shared constitutional SoT. |
| **Decision** | Shared `HostConstitutionalRouter.js` as SoT; thin Unity/Unreal stubs; mock tests **enforced**; live tests skip-ok; vendor nvidia/amd skills remain assist-only. |
| **Consequences** | ESFR can **PROMOTE** constitutional enforcement; hardware/host-product residuals labeled honestly. |

## 3. Interface

- Inputs: existing GPU modules, `gpuPrintSafeguard`, skills registry.
- Outputs: host `route()` / `getActorIdentity` / `getCapabilities`; npm `test:gpu` / `test:gpu-live` / `test:multihost`.
- Bans: no GPU print SoT; no evidence apiKey; no fake Play Mode CI.

## 4. Constitutional boundary

| In scope | Out of scope |
|----------|--------------|
| Extend real GPU modules + JS host router | Replacing PostProcessor/etc with stubs |
| status.md / CHARTER honesty rows | Claiming live WebGPU or Unity Play Mode enforced |
| CECP trail | charter.js principle status edits |

## 5. File manifest

| Path | Action | Role |
|------|--------|------|
| `engine/runtime/hosts/*` | Create router + bridges | Implementor |
| GPU modules + tests | Extend | Implementor |
| `BrowserRuntimeAdapter.js` / `GPUPreviewClient.js` | Extend | Implementor |
| Unity/Unreal thin stubs | Create | Implementor |
| `package.json` + CI | Wire scripts | Implementor |
| `status.md` / `CHARTER.md` | Honest tags | Implementor |

## 6. Acceptance criteria

1. Mock bloomCombine / shadow pass / env BGL tests green.
2. `gpu-constitution` denies print / determinism-as-print / apiKey; allows renderAssist.
3. Live tests skip without adapter (CI green).
4. MultiHost bridges share SoT; 16/16 conformance preserved.
5. Status tags match evidence.

## 7. Handoff to Builder

Scaffold trail + host folder; do not invent orphan FULL_PASS natives.
