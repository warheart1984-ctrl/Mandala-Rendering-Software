# 01 — Architect ADR: GPU Determinism Phase I

**Trail:** `gpu-determinism-phase1-2026-08`  
**Role:** Architect  
**Date:** 2026-07-28  
**mode:** sage  
**actorMode:** Strategist  
**lens:** Scholar  
**cognitive-profile:** Strategist (≠ Actor Strategist)  
**Status:** **declared** / **partial**

## 1. Intent

Land user-authored CIEMS/CECP drop-ins for GPU Determinism Phase I on tip
~2a33b31 / PR #83 (PR #84 announcement as draft): capability dashboard, RHI
determinism + shader pipeline specs, inspector UI mockup, promotion charter
(future draft), vendor trail dashboard/manifest/tracker/readiness, 2027
roadmap Phases 5–8, and a **skeleton** integrator promotion test that cannot
false-PASS live parity.

## 2. ADR decision

### Context

Vendor GPU assist (PR #83 Phase 1) is **PROMOTE_WITH_GAPS**. User supplied
Phase I determinism governance artifacts requiring Drive-G-1 honesty (42%
readiness assessment; metrics pending; Article IV future-only).

### Decision

1. **NEW** trail `gpu-determinism-phase1-2026-08` owns Phase I crew + ESFR.
2. Drop-ins under `docs/sx-router/specs/` + vendor trail + `cecp/charters/`.
3. Wire `route("gpu.integrator.deterministic")` → prototype integrator with
   **stub** receipts; keep registry `authority: assist`.
4. Promotion test: skip live parity; allow same-host stub-hash replay PASS.
5. Announce as PR #84 draft while landing on PR #83.

### Alternatives rejected

| Option | Why rejected |
|--------|--------------|
| Claim SSIM 1.00 measured | Stub metrics — evidence fraud |
| Enact Article IV / reclassify registry | Future charter only |
| Open empty PR #84 without content | Prefer push to #83 + draft announcement |
| Invent `nvidia-skill-finder` | Skill missing on host |

### Consequences

- Positive: honest Phase I foundation; wired assist integrator; tracker/readiness.
- Gaps: no live RHI; metrics pending; Article IV not enacted.
- Non-consequence: `cpu.rt4d.print` remains sole print SoT.

## 3. Interface specification

- Inputs: SceneSpec-like request + `seed` / `sampleCount` for assist integrator.
- Outputs: assist payload + skeleton `receipt` (`frameHash`/`replayHash` stubs).
- Bans: GPU print SoT; authoritative reclassification; false-PASS SSIM.

## 4. Constitutional boundary

**In:** docs under `docs/sx-router/specs/`, `docs/governance/cecp/**`,
`sovereign-x/router/**`, `sovereign-x/tests/**`.  
**Out:** `constitution/`, `engine/constitution/`, `AGENTS.md`, policy JSON.  
**Article IV:** future draft only.

## 5. File manifest

| Path | Action | Owner |
|------|--------|-------|
| `docs/sx-router/specs/router-capability-dashboard.md` | create | Architect→Builder |
| `docs/sx-router/specs/multi-vendor-rhi-determinism.md` | create | Architect→Builder |
| `docs/sx-router/specs/capability-inspector-ui.md` | create | Architect→Builder |
| `docs/sx-router/specs/deterministic-rhi-shader-pipeline.md` | create | Architect→Builder |
| `docs/governance/cecp/charters/gpu-integrator-promotion-charter.md` | create | Architect |
| `docs/governance/cecp/trails/vendor-gpu-integration-2026-07/{crew-manifest,promotion-tracker,readiness-report}.md` | create | Builder |
| `docs/governance/cecp/trails/pr84-announcement.md` | create | Architect |
| `docs/governance/cecp/trails/sx-router-vNext-2027/README.md` | create | Architect |
| `docs/governance/cecp/trails/gpu-determinism-phase1-2026-08/*` | create | Crew |
| `sovereign-x/router/index.js` | wire integrator | Implementor |
| `sovereign-x/router/modules/gpu/integrator/deterministicGpuIntegrator.js` | stub receipts | Implementor |
| `sovereign-x/tests/gpuIntegratorPromotion.test.js` | create skeleton | Implementor |

## 6. Acceptance criteria

- [ ] Drop-ins exist with Drive-G-1 tags
- [ ] Registry still assist-only for `gpu.integrator.deterministic`
- [ ] Promotion parity case skipped; same-host stub replay passes
- [ ] Readiness keeps 42% + metrics pending
- [ ] Article IV tagged future draft
- [ ] Trail 01–06 + ESFR recorded

## 7. Handoff to Builder

Scaffold docs paths + test file skeleton; no live GPU kernels.
