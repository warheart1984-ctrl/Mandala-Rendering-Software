# 06 — ESFR / Engineer Standards — RT4D Priority #6 Metering / Credits

| Field | Value |
|-------|-------|
| `trailId` | `rt4d-priority6-accounts-metering-pricing-2026-08` |
| `role` | ESFR |
| `softwareCreationMode` | Anchor + Boundary-Guardian |
| `status` | **partial** |
| `ESFRVerdict` | **PASS_WITH_GAPS** |
| `PromotionEligibility` | **PROMOTE_WITH_GAPS** |
| `InspectorVerdict` | **PASS_WITH_GAPS** (cited) |

## Scope under review

`mrs/packages/rt4d-metering/**`, soft emit in `mrs/apps/rt4d-engine/src/meteringEmit.ts` + `index.ts`, evidence-spec Priority #6 appendix, CECP trail `01`–`06`.

## Test matrix

| Category | Outcome | Evidence |
|----------|---------|----------|
| Engineering Standards Compliance | **PASS** | Package naming `@mrs/*`, schemas package-local, MIT zod, no secrets |
| Architectural Coherence | **PASS_WITH_GAPS** | Receipt→meter→ledger→gate matches ADR; accounts/billing apps not yet present |
| Execution Legitimacy (CHEA) | **PASS** (declared-layer) | Soft emit flag-gated; no ungoverned billing SDK |
| Capability Legitimacy (CCR) | **PASS_WITH_GAPS** (declared-layer) | Metering capability scaffolded; not billed ChatGPT capability |
| Operational Legitimacy (CDGF) | **PASS_WITH_GAPS** (declared-layer) | In-memory/JSON ledger only — not HA commercial ops |
| Determinism & Replay | **PASS** | `deriveCredits` stability tests; engine ACs 23/23 |
| Lineage Integrity | **PASS** | Trail README + stages 01–06 present |
| Promotion Readiness | **PASS_WITH_GAPS** | Scaffold ship OK; commercial GA not ready |

### Focused command matrix

| Suite | Result |
|-------|--------|
| `@mrs/rt4d-metering` unit tests | **PASS** 12/12 |
| `@mrs/rt4d-engine` ACs | **PASS** 23/23 |
| Stripe / Chargebee / ChatGPT billing | **NOT LIVE** |
| Hosted accounts IdP | **NOT PRESENT** |

## Probes 01–08

| Probe | Result | Citation |
|-------|--------|----------|
| 01 Standards Alignment | **PASS** | Package layout + MIT deps; `03-implementor-notes.md` |
| 02 Architectural Coherence | **PASS_WITH_GAPS** | ADR authority diagram; no plugin credit invention |
| 03 Execution Legitimacy (CHEA) | **PASS** (declared) | Soft emit never fails render path |
| 04 Capability Legitimacy (CCR) | **PASS_WITH_GAPS** (declared) | Plans catalog declared; billing capability absent |
| 05 Operational Legitimacy (CDGF) | **PASS_WITH_GAPS** (declared) | Local ledger adapters only |
| 06 Determinism & Replay | **PASS** | credit stability tests + engine AC-R* |
| 07 Lineage Integrity | **PASS** | trail stages complete |
| 08 Promotion Eligibility | **PROMOTE_WITH_GAPS** | this document |

## StandardsReport (A–E)

- **A** Naming / structure / contracts OK for scaffold.
- **B** Aligns with Priority #4 evidence authority; CIEMS commercial **declared**.
- **C** No ungoverned cloud billing deps; CHEA **declared**.
- **D** No silent expansion into “unlimited” or fake live billing.
- **E** Ops surface honest: partial ledger, not production billing fabric.

## Gaps (required for later PROMOTE / commercial GA)

1. User accounts / identity service
2. Cost-calibrated credit formula (graduate from **declared**)
3. Durable multi-tenant ledger + billing provider (Stripe/Chargebee) with evidence
4. ChatGPT app paid access wiring after billing
5. P5 live hosted URL (prerequisite for SaaS path)
6. CIEMS/JCR commercial admission (Drive-G external)

## Anti-overclaim

Do **not** market accounts, metering, or pricing as production-ready billing. This trail promotes a **tested scaffold** into the feature branch only.

## PromotionEligibility

**PROMOTE_WITH_GAPS** — Priority #6 metering scaffold is safe to land on `feat/rt4d-chatgpt-plugin`. Commercial operations remain **skeleton/partial**.
