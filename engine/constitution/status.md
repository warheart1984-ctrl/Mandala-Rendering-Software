# Constitutional Engine — Subsystem Status

> **Authority:** Machine-readable SoT is `charter.js`. This file provides a
> human-readable summary. Does not amend `charter.js`, `charter.test.js`, or
> `AGENTS.md`.
>
> **Drive-G-1 tags only:** **enforced** | **partial** | **declared** | **skeleton**.
>
> **Evidence (GPU mock):** `npm run test:gpu` — **81** pass (gpu-core +
> gpu-constitution). Re-count on change.
>
> **Evidence (live WebGPU):** `npm run test:gpu-live` — **skip** when no
> `navigator.gpu` adapter; live enforcement remains **partial** on CPU-only CI.
>
> **Evidence (MultiHost routing):** `npm run test:multihost` — **12** pass —
> `HostConstitutionalRouter` + Browser/Unity/Unreal JS bridges.

| Subsystem | Status | Evidence |
|-----------|--------|----------|
| GPU constitutional gates (print deny, assist-only, evidence purity) | **enforced** | `gpu-constitution.test.js` + `gpuPrintSafeguard` + skills registry; `npm run test:gpu` |
| GPU mock pipelines / BGL (PostProcessor bloomCombine, ShadowMapper, EnvironmentMapper) | **enforced** | `gpu-core.test.js` mock-device pipeline + bind-group tests |
| Live WebGPU adapter hardware | **partial** | `gpu-live-*.test.js` skip-ok without adapter; no GPU runner in default CI |
| GPU Assist Layer (vendor nvidia/amd skills) | **partial** | Assist-only; never Digital Printer SoT (`cpu.rt4d.print`) |
| MultiHost constitutional routing (JS SoT) | **enforced** | `HostConstitutionalRouter.js` + bridges; `multihost-constitution.test.js` |
| Browser host constitutional surface | **enforced** | `BrowserRuntimeAdapter` `route` / `getActorIdentity` / `getCapabilities` + host tests |
| Unity / Unreal product hosts | **skeleton** | Thin stubs under `unity/` / `unreal/` call documented JS SoT; Play Mode / PIE not CI |
| CKL | **enforced** | `ConstitutionalKnowledgeLayer.js` + `default.policies.json`; governance suite |
| RT4D Print (CPU) | **enforced** | CPU RT4D authoritative for Digital Printer; GPU paths assist-only |
| BYOK | **partial** | Genblaze BYOK suite; no claim of full product BYOK surface |
| ProvenanceRecorder | **partial** | `engine/runtime/test/`; frame fields + play recording |
| ReplayService | **partial** | `engine/runtime/test/`; deterministic param restore |
| ConformanceChecker | **partial** | Profile + `npm run test:conformance` 16/16 |
| ISL organ | **partial** | Matches `charter.js` `organ.isl` |

## Verification history

- **GPU + MultiHost constitutional FULL_PASS (2026-07-28):** Trail
  `gpu-multihost-enforced-2026-07`. Mock BGL + constitutional denies **enforced**;
  live WebGPU **partial**; Unity/Unreal product **skeleton**. ESFR:
  **PROMOTE** for constitutional enforcement (not hardware/host-product maturity).

- **GPU layer (2026-07):** WebGPU flag/`storeOp` fixes and unit coverage landed.
  Status tags use Drive-G-1 wording only.

- **Governance honesty (2026-07-28):** Protected-path alignment trail
  `protected-promote-2026-07` — AGENTS principle/policy severities, CHARTER ISL
  **partial**, CKL contract existence check.
