# ESFR Promotion Rules

> **Status:** **partial** — rules apply to CECP foreman / ESFR practice; not yet
> enforced by CI. Drive-G-1: do not claim automated promotion blocking.

Authority: `docs/governance/esfr/contract.esfr.md` · Protocol:
`docs/governance/esfr/protocol.esfr.md` · Matrix:
`docs/governance/esfr/test-matrix.esfr.md` · Probes:
`docs/governance/esfr/probes.esfr.md`.

`PromotionEligibility` enum: `PROMOTE` | `PROMOTE_WITH_GAPS` | `HOLD` | `REJECT`

---

## Rule 01 — Evidence Requirement

Promotion requires:

- Inspector `PASS` or `PASS_WITH_GAPS`
- ESFR `PASS` or `PASS_WITH_GAPS`
- Completed ESFR test-matrix categories + probes 01–08 citations (or explicit N/A with reason)

| ESFRVerdict | PromotionEligibility |
|-------------|----------------------|
| `PASS` | `PROMOTE` |
| `PASS_WITH_GAPS` | `PROMOTE_WITH_GAPS` |
| `HOLD` | `HOLD` |
| `REJECT` | `REJECT` |

Missing Inspector artifact, incomplete matrix/probes without justification, or
ESFR `HOLD` / `REJECT` → `HOLD` or `REJECT` (not `PROMOTE*`).

## Rule 02 — Gaps Declaration

`PASS_WITH_GAPS` / `PROMOTE_WITH_GAPS` must include:

- Explicit gap list with status tags (**partial** / **declared** / **skeleton**)
- Required evidence for later promotion of each gap
- No silent assumptions

## Rule 03 — Lineage Integrity

Promotion updates:

- CECPTrail (`06-engineer-standards.md` + README / acceptance block)
- LineageRecord (trail `lineage.json` when present)
- Reference ledger / ESFR seed (`docs/governance/esfr/lineage.esfr.json`) when
  registering a numbered CECP reference review

Append; do not erase prior evidence rows. Probe 07 must pass or list gaps.

## Rule 04 — Ecosystem Coherence

Module must:

- Fit AAES-OS architecture framing (**declared** unless MRS-local evidence cited)
- Fit RT4D rendering model when the change touches RT4D / Proton paths
- Fit CIEMS sovereignty stack only as **declared** unless CIEMS artifacts exist here
- Fit CHEA Ω∞ execution environment only as **declared** until CHEA exists
  (`CONSTITUTIONAL_LAYER_STACK.md`)

Matrix category: Architectural Coherence. Probe 02.

## Rule 05 — Constitutional Compliance

Module must satisfy:

- CECP Ω∞ governance (trail stages, honest tags)
- CCR capability legitimacy — **declared** until CCR artifacts exist (Probe 04)
- CDGF operational legitimacy — **declared** until CDGF artifacts exist (Probe 05)
- MRS lawbook boundaries for the ship gate (no charter edits; no secrets; MIT hygiene)

## Rule 06 — No Drift

Promotion is denied (`REJECT` or `HOLD`) if:

- Module introduces architectural drift against stated contracts / references
- Module violates ESFR or CECP invariants
- Module contradicts existing CECP references without an explicit migration /
  follow-on trail
- Matrix Promotion Readiness cannot justify `PROMOTE` / `PROMOTE_WITH_GAPS`
