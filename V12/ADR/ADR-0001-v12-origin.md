# ADR-0001 — V12: Evidence-Linked Architecture Documentation Root

- **Decision ID:** ADR-0001
- **Status:** accepted (enforced)
- **Date:** 2026-08-07T00:00:00Z
- **Author:** warheart1984-ctrl <warheart1984@gmail.com>

## Rationale

The constitutional architecture produces code, contracts, and tests, but
no single traceable record of *why* decisions were made. Without it,
future readers can look at final code and ask "where did this
architecture come from?" and get no answer. Documentation is therefore
made a first-class artifact: an evidence-linked root that records the
chain *idea → decision → implementation → test → artifact → evidence* for
every subsystem.

## Decision

1. Create `V12/` as the evidence-linked documentation root.
2. Every ADR carries a mandatory evidence block: Decision ID, Timestamp,
   Author, Rationale, Alternatives rejected, and Evidence
   (commit · test · artifact hash · replay identity).
3. Maintain machine-readable provenance (`PROVENANCE/`) and committed
   validation results (`VALIDATION/`).
4. Every push carries authorship (git author identity + author field on
   every record).

## Alternatives rejected

| Alternative | Why rejected |
|-------------|--------------|
| Inline prose only, no dedicated root | Not traceable; no evidence binding |
| Fold into existing `docs/governance/cecp/trails/` | Trail-scoped, not a whole-architecture record |
| Generate docs purely from code | Cannot capture rejected alternatives or rationale |
| No provenance JSON | Human docs alone are not machine-verifiable |

## Consequences

- All new subsystem decisions get an ADR in `V12/ADR/`.
- Documentation changes re-run validation and commit evidence.
- This tree does **not** determine legal ownership; contracts, licenses,
  and law do.

## Evidence

- **Commit:** `59b1378` (implementation of the documented subsystem)
- **Test:** `V12/VALIDATION/test-results/constitution-suite.txt` — 98/98
- **Artifact hash:** this tree's records (see `PROVENANCE/`)
- **Replay identity:** lineage records in `PROVENANCE/lineage.json`
