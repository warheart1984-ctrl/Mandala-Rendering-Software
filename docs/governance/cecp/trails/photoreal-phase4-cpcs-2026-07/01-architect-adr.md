# ADR — Phase 4 CPCS / RCS / PGDS

## Intent

Add Constitutional Photoreal Certification (CPCS), a Renderer Conformance Suite (RCS), and a Photoreal Governance Dashboard (PGDS) on top of Phase 3 FPEC/CEL/CAT/CPP/DRE — without claiming Full Photoreal.

## Decision

1. **CPCS** evaluates FPEC + pep≥0.95 + spr===1.0 + T-01..T-13 all pass + DRE dual-run match **and** pixel replay verified + CAT `PASS`.
2. Hook CPCS into `runPhotorealPromotionPipeline` after CAT (consumes FPEC+CAT).
3. **RCS** prefers 1–2 real `--out-dir` runs; declared multi-scene stubs stay PARTIAL (CLI has no `--scene`).
4. **PGDS** uses Node `http` (no new Express dep).

## Non-goals

- Auto `PHASE_4_FULL_PHOTOREAL`
- Charter / policy edits
- Fake four-scene certified RCS
