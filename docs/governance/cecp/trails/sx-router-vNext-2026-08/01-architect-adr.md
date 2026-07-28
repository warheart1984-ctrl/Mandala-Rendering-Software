# 01 — Architect ADR: Sovereign X Router vNext

**Trail:** `sx-router-vNext-2026-08`  
**Role:** Architect  
**Date:** 2026-07-28  
**Status:** Phase 1 **partial**/Done (linked); Phases 2–4 **Draft**/**declared**  
**mode:** sage  
**actorMode:** Strategist  
**softwareCreationMode:** Pipeline-Conductor  
**cognitive-profile:** Strategist (framing; ≠ Actor Strategist)

## 1. Intent

Land Sovereign X Router **vNext roadmap artifacts + prototypes** on PR #83
(tip ~2880ad9): CECP trails for Phases 1–4, GPU determinism promotion plan
(seed contract declared), CIEMS lineage/announcement/review packet, and a
**declared** deterministic GPU integrator assist capability that can **never**
be print SoT.

Requested by user crew mandate (“use every mode and skill and vendor skill”
as representative lenses + honesty consult).

## 2. ADR decision

### Context

Phase 1 vendor GPU assist (`vendor-gpu-integration-2026-07`) reached ESFR
**PROMOTE_WITH_GAPS**. Gaps include: no GPU print, no determinism receipts,
skeleton parity suite, no live skill invoke.

### Decision

1. **NEW** trail `sx-router-vNext-2026-08` owns roadmap Phases 1–4 (Phase 1
   status = Done via link; 2–4 Draft).
2. **NEW** trail `gpu-determinism-2026-09` owns Steps 1–5 promotion plan +
   mulberry32/stratified seed contract as **declared**.
3. Add prototype module `deterministicGpuIntegrator.js` + registry capability
   `gpu.integrator.deterministic` (**declared**/prototype assist).
4. Extend parity harness stubs (seed, deltaLuma/Chroma); keep SSIM cases
   **skipped** — no false-PASS live parity.
5. Publish CIEMS lineage tree, PR #83 announcement, review packet, textual
   architecture diagram.

### Alternatives considered / rejected

| Option | Rejected because |
|--------|------------------|
| Claim Phase 2–4 enforced | No live GPU / receipts (Drive-G-1) |
| Register integrator as authoritative | Violates print SoT invariant |
| Unskip SSIM with stub 1.0 | False-PASS / evidence fraud |
| Amend `engine/constitution/*` | Protected; out of scope |

### Consequences

- Positive: honest roadmap; prototype seed harness; lineage continuity.
- Gaps: Phases 2–4 remain Draft; no CUDA/HIP; integrator not print.
- Non-consequence: Digital Printer SoT unchanged (`cpu.rt4d.print`).

## 3. Interface specification

### Inputs

- Capability id / intent / modality / seed / sampleCount
- `determinismRequired`, `asPrintSoT` (must deny for GPU)

### Outputs

- Assist payloads with `assistOnly`, `nonAuthoritative`, `status: declared`
- Seed contract metadata: `{ prng: "mulberry32", sampling: "stratified" }`

### Bans

- GPU as print SoT / Digital Printer evidence
- Live CUDA/HIP claims without plates
- Silent authority expansion to authoritative for any `gpu.*`

## 4. Constitutional boundary

| In | Out |
|----|-----|
| `sovereign-x/**` prototypes, CECP trails, sx-router specs (docs) | `constitution/`, `engine/constitution/`, `AGENTS.md`, policies |
| Declared seed contract + skeleton harness | Live vendor GPU invoke |
| PROMOTE_WITH_GAPS for Phase 1 only | PROMOTE for Phases 2–4 |

## 5. File manifest

| Path | Action | Owner |
|------|--------|-------|
| `docs/governance/cecp/trails/sx-router-vNext-2026-08/*` | create | Architect→ESFR |
| `docs/governance/cecp/trails/gpu-determinism-2026-09/*` | create | Architect→ESFR |
| `docs/governance/cecp/trails/vendor-gpu-integration-2026-07/ciems-lineage-tree-vendor-gpu.md` | create | Builder→Implementor |
| `sovereign-x/router/modules/gpu/integrator/deterministicGpuIntegrator.js` | create | Builder→Implementor |
| `sovereign-x/router/registry/gpuSkillsRegistry.json` | update | Implementor |
| `sovereign-x/tests/gpuParitySuite.test.js` | update | Implementor |
| `sovereign-x/README.md`, `capabilities/README.md`, `docs/sx-router/specs/gpu-capability-map.md` | update | Implementor |

## 6. Acceptance criteria

- [ ] Trails 01–06 exist for vNext + determinism plan docs
- [ ] Phase 1 linked to vendor-gpu trail; Phases 2–4 tagged Draft/declared
- [ ] `gpu.integrator.deterministic` registered assist-only; print SoT denied
- [ ] mulberry32 deterministic in unit test; SSIM cases remain skipped
- [ ] No GPU print SoT wording in README/announcement
- [ ] ESFR: Phase 1 **PROMOTE_WITH_GAPS**; Phases 2–4 not promoted as Done

## 7. Roadmap Phases 1–4 (detail)

### Phase 1 — Done (PR #83)

Vendor GPU assist SoT layout, registry, dispatch contract, LookDev skeleton,
parity suite skeleton. ESFR **PROMOTE_WITH_GAPS**.
Evidence: `../vendor-gpu-integration-2026-07/`.

### Phase 2 — Draft / declared

Deterministic assist harness, seed contract, integrator prototype,
deltaLuma/Chroma stubs. **This trail's code drop.**

### Phase 3 — Draft / declared

Live assist invoke + non-print parity plates (NVIDIA/AMD). Requires host
skills + receipts — **not** claimed here.

### Phase 4 — Draft / declared

Determinism promotion path; hand-off to `gpu-determinism-2026-09` Steps 1–5.

## Anti-overclaim

- Must NOT claim live CUDA/HIP/NIM/ROCm.
- Must NOT claim enforced CPU↔GPU print parity.
- Must NOT claim Phases 2–4 Done or PROMOTE (only Draft/declared).
- CHEA/CCR/CDGF remain **declared** layers unless in-repo artifacts exist.
- Maturity: operator-facing scaffold **partial**; commercial readiness not claimed (Drive-G-2).

## Sage counsel

Prove seed determinism + print-SoT denial first. Leave live plates and
promotion receipts for later trails. Keep Phase 1 promotion gaps explicit.

## Cross-reference ledger

| CECP §9 / trail | Relevance | Coherence |
|-----------------|-----------|-----------|
| `vendor-gpu-integration-2026-07` | Phase 1 Done | Link, do not rewrite ESFR |
| `sovereign-x-gpu-assist-2026-07` | A–E assist design | Compatible assist-only |
| `gpu-determinism-2026-09` | Phase 4 / Steps 1–5 | Seed contract SoT draft |
| Digital Printer trails | Print SoT | Unchanged CPU path |

## Risks to sovereignty / determinism

- P4: non-deterministic GPU without seed receipts → keep assist-only.
- P5: vendor lock-in → neutral integrator + dual NVIDIA/AMD registry.
- Authority expansion via registry meta → tests assert assist ≠ authoritative.

## Handoff to Builder

Scaffold integrator module dir, trail folders, stub READMEs, test placeholders;
label all new surfaces **skeleton**/**declared**.
