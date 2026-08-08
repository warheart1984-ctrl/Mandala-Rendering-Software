# ARCHITECTURE.md — V12

> **Author:** warheart1984-ctrl
> **Updated:** 2026-08-07

## Scope

V12 documents the constitutional architecture: the layers that govern
execution, the contracts that bind them, and the renderer/host substrate
they control.

## Layers

```
┌─────────────────────────────────────────────────────────────┐
│ 1. Charter / Lawbook          constitution/ · AGENTS.md       │
│    P1–P5 principles, agent rules, protected paths            │
├─────────────────────────────────────────────────────────────┤
│ 2. Constitutional Engine      engine/                        │
│    charter.js (SoT), contracts.js, CKL, GovernanceKernel,    │
│    conformance profile, runtime adapter (BrowserRuntime)     │
├─────────────────────────────────────────────────────────────┤
│ 3. Phase D+ Subsystem         src/                           │
│    EvidenceRoot · Inference/Continuity/Intent contracts ·    │
│    Arena certification · Promotion · CRE reasoning engine    │
├─────────────────────────────────────────────────────────────┤
│ 4. Renderer                   mrs/packages/renderer-core/    │
│    RT4D renderer, path tracer, projection, protons, BVH4D    │
├─────────────────────────────────────────────────────────────┤
│ 5. Hosts                      unity/ · unreal/ · js/         │
│    (skeletons)                                               │
├─────────────────────────────────────────────────────────────┤
│ 6. Efficiency / Router        sovereign-x/ · mrs/adapters/   │
│    Sovereign X router, GPU parity, inference provider plane  │
└─────────────────────────────────────────────────────────────┘
```

## Boundaries

- **Governance plane** (layers 1–3) decides; **execution plane** (layers
  4–6) acts. No implicit escalation across planes. See
  `ADR-0005-dar-z-separation`.
- Constitutional artifacts under `constitution/`, `engine/constitution/`,
  `engine/governance/policies/`, `engine/conformance/` are protected and
  require explicit authorization to modify (lawbook §VI).

## Phase D+ subsystem (layer 3)

| Module | Role |
|--------|------|
| `ConstitutionalEvidenceRoot.js` | Root evidence records, hashes, replay identity |
| `contracts/ConstitutionalInferenceContract.js` | Inference lifecycle, replay tokens, blind-spot checks |
| `contracts/ConstitutionalContinuityContract.js` | Continuity registration + verification |
| `contracts/IntentLifecycleContract.js` | Intent states/priorities/categories |
| `ArenaCertificationLayer.js` | Certification gates |
| `PromotionLayer.js` | Promotion lifecycle |
| `ConstitutionalReasoningEngine.js` | Queue-driven reasoning over the contracts |

## Evidence

- Implementation: commit `59b1378`
- Tests: `V12/VALIDATION/test-results/constitution-suite.txt` (98/98)
- ADRs: `V12/ADR/ADR-0001` … `ADR-0005`
