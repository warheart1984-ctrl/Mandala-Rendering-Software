# ESFR Evidence Probes — Constitutional Set

> **Status:** **partial** — required probe set for ESFR / stage-06 returns; not
> CI-enforced. Probes 03–05 evaluate **declared** CHEA / CCR / CDGF layers until
> registries exist (Drive-G-1).
>
> Matrix: `docs/governance/esfr/test-matrix.esfr.md` · Pipeline:
> `docs/governance/esfr/pipeline.cecp-v2.md`

ESFR must run (or cite prior Inspector evidence for) these probes when producing
`ESFRVerdict`. Record citations in trail `06-engineer-standards.md`.

---

## Probe 01 — Standards Alignment Probe

- Compare module artifacts against AAES-OS engineering standards (**declared**
  cross-org unless MRS-local standards evidence is cited).
- **Evidence:** StandardsReport section A (Engineering Standards Compliance).

## Probe 02 — Architectural Coherence Probe

- Validate module against CECP Ω∞ reference architecture / registry peers.
- **Evidence:** StandardsReport section B (Architectural Coherence).

## Probe 03 — Execution Legitimacy Probe (CHEA Ω∞)

- Confirm execution environment legitimacy against the **declared** CHEA layer
  (and any MRS host evidence). Do not invent a CHEA registry.
- **Evidence:** StandardsReport section C.

## Probe 04 — Capability Legitimacy Probe (CCR)

- Validate capability against the **declared** CCR surface / module contracts.
  Do not invent a CCR registry.
- **Evidence:** StandardsReport section D.

## Probe 05 — Operational Legitimacy Probe (CDGF)

- Validate operational behavior against declared intent and the **declared**
  CDGF layer. Do not invent a CDGF fabric.
- **Evidence:** StandardsReport section E.

## Probe 06 — Determinism & Replay Probe

- Confirm deterministic behavior across multiple runs (or cite Inspector replay
  rows that already proved it).
- **Evidence:** InspectorVerdict + ESFR replay notes / cited commands.

## Probe 07 — Lineage Integrity Probe

- Validate lineage metadata completeness and correctness (trail stages, README,
  optional `lineage.json`).
- **Evidence:** LineageRecord.

## Probe 08 — Promotion Eligibility Probe

- Validate readiness for ecosystem inclusion per `promotion.esfr.md` rules 01–06
  and test-matrix Promotion Readiness.
- **Evidence:** ESFRVerdict + PromotionEligibility
  (`PROMOTE` | `PROMOTE_WITH_GAPS` | `HOLD` | `REJECT`).

---

## Recording rule

For each probe, the ESFR return / trail file SHOULD include:

| Field | Example |
|-------|---------|
| Probe id | `01` … `08` |
| Result | `PASS` / `PASS_WITH_GAPS` / `HOLD` / `REJECT` / `N/A` |
| Citation | path, command, or Inspector section |
| Notes | gaps / declared-layer caveat |
