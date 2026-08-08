# CONSTITUTION.md — V12

> **Author:** warheart1984-ctrl
> **Updated:** 2026-08-07

## Sources of truth

| Artifact | Path | Status |
|----------|------|--------|
| Master charter (human) | `constitution/CHARTER.md` | constitutional |
| Machine charter (SoT) | `engine/constitution/charter.js` | runtime gate status |
| Authority contracts | `engine/constitution/contracts.js` | authority allow-lists |
| Policies | `engine/governance/policies/default.policies.json` | 7 enforced policies |
| Conformance | `engine/conformance/default.conformance-profile.json` | 16 checks |

## Principles (P1–P5)

| # | Principle | Rule |
|---|-----------|------|
| P1 | No execution without intent | declare intent before acting |
| P2 | No state change without evidence | every mutation is evidenced |
| P3 | No authority without contract | scope is bounded by contract |
| P4 | Replayable reality | deterministic, reproducible |
| P5 | Sovereign independence | platform-agnostic, no lock-in |

## Phase D+ contracts (src/)

- **ConstitutionalInferenceContract** — evidence-backed inference records,
  replay tokens, blind-spot checks, lineage (revise/derive).
- **ConstitutionalContinuityContract** — temporal/causal/identity
  continuity registration and verification.
- **IntentLifecycleContract** — intent state machine (pending → declared
  → committed → executed → …), priorities, categories.
- **ConstitutionalEvidenceRoot** — root of evidence records with
  replayable identity.
- **ConstitutionalReasoningEngine** — enforces reasoning through the
  contracts above (mode thresholds, quality validators, blind-spot gate).

## Enforcement

Runtime enforcement is verified by `npm run test:conformance`
(16/16) and the CKL policy engine. See `GOVERNANCE.md` and
`V12/VALIDATION/conformance-results/`.

## Evidence

- Charter hashes: `engine/constitution/charter.js` (see `PROVENANCE/`).
- Contract artifact hashes: `ADR-0002` Evidence block.
