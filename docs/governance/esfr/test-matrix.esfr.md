# ESFR Test Matrix — Engineering Standards Final-Reviewer

> **Status:** **partial** — required checklist for ESFR / stage-06 returns; not
> CI-enforced. Drive-G-1: CHEA / CCR / CDGF categories evaluate against
> **declared** layers until those registries exist
> (`docs/governance/CONSTITUTIONAL_LAYER_STACK.md`).
>
> Used after Inspector. Produces category outcomes that feed `ESFRVerdict` and
> `PromotionEligibility` (`docs/governance/esfr/probes.esfr.md`).

---

## Category: Engineering Standards Compliance

- Naming conventions match AAES-OS standards (**declared** cross-org; cite MRS-local evidence when claiming match)
- Directory structure matches CECP Ω∞ reference layout
- Contract shape matches constitutional design
- No architectural drift introduced
- Deterministic behavior confirmed

**Outcome:** `PASS` / `HOLD` / `REJECT`

---

## Category: Architectural Coherence

- Module aligns with AAES-OS architecture (**declared** framing unless MRS evidence cited)
- Module aligns with RT4D rendering model (if applicable)
- Module aligns with CIEMS sovereignty stack (**declared** unless CIEMS artifacts exist here)
- No contradictions with existing CECP references

**Outcome:** `PASS` / `PASS_WITH_GAPS` / `HOLD` / `REJECT`

---

## Category: Execution Legitimacy (CHEA Ω∞)

> Evaluates against the **declared** CHEA layer until a CHEA registry/spec exists
> in this repo. Do not claim CHEA **enforced**.

- Execution environment validated (against declared expectations / MRS host evidence)
- No ungoverned external dependencies
- Replayability confirmed

**Outcome:** `PASS` / `HOLD` / `REJECT`

---

## Category: Capability Legitimacy (CCR)

> Evaluates against the **declared** CCR layer until a CCR registry exists.

- Capability is constitutionally legitimate (within declared scope / contracts)
- No unauthorized capability expansion
- No silent capability mutation

**Outcome:** `PASS` / `HOLD` / `REJECT`

---

## Category: Operational Legitimacy (CDGF)

> Evaluates against the **declared** CDGF layer until a CDGF fabric exists.

- Operational behavior matches declared intent
- No ungoverned side effects
- No operational drift

**Outcome:** `PASS` / `HOLD` / `REJECT`

---

## Category: Promotion Readiness

- InspectorVerdict is `PASS` or `PASS_WITH_GAPS`
- ESFR standards met (`ESFRVerdict` is `PASS` or `PASS_WITH_GAPS`)
- Gaps explicitly declared
- Lineage metadata complete

**Outcome:** `PROMOTE` / `PROMOTE_WITH_GAPS` / `HOLD` / `REJECT`

This category outcome **is** `PromotionEligibility` (same enum).

| ESFRVerdict | Typical PromotionEligibility |
|-------------|------------------------------|
| `PASS` | `PROMOTE` |
| `PASS_WITH_GAPS` | `PROMOTE_WITH_GAPS` |
| `HOLD` | `HOLD` |
| `REJECT` | `REJECT` |

Deprecated aliases: `PASS_WITH_NOTES` → treat as `PASS_WITH_GAPS` /
`PROMOTE_WITH_GAPS`; `FAIL` / `eligible`/`not_eligible` → map to `REJECT` /
`PROMOTE*` as appropriate when reading older trails.
