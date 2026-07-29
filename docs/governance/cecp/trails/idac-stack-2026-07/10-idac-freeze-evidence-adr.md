# Architect ADR — IDAC Core freeze & evidence hierarchy

**Trail:** `idac-stack-2026-07`  
**Date:** 2026-07-28  
**Decision status:** accepted  
**ESFR:** **PROMOTE_WITH_GAPS** (unchanged until Performance + full Conformance)

## Context

Cycles 1–4 wired IdacRouter, live E2E on `:8791`, and 51 pytest passes. User strategic SoT: **stop adding IDAC concepts**; measure maturity by **evidence class**.

## Decision

1. **Freeze** IDAC Core at v0.1 (`docs/IDAC_CORE_FREEZE.md`).
2. Adopt **five-class evidence hierarchy** (`IDAC_EVIDENCE_HIERARCHY.md`).
3. Roadmap = five items with required evidence class per promotion (`IDAC_IMPLEMENTATION_ROADMAP.md`).
4. **No certification** claim until Conformance suite complete + measured Performance bar.

## Consequences

- Agents cite evidence class on every maturity statement.
- Amendments require ADR + schema/version bump — not new markdown essays.
- `estimate_not_measured` remains non-Performance forever unless replaced by measurements.

## Acceptance

- Docs listed in freeze inventory exist and are cross-linked.
- Conformance spec maps tests → evidence classes.
- Performance harness skeleton exists; does not assert speedup.

## Handoff

Implementor: L1 live row + harness CI optional; Reviewer: block overclaim on Performance.
