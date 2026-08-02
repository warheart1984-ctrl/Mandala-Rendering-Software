# RT4D Priority #6 — Accounts, Metering, Credits, Pricing

| Field | Value |
|-------|-------|
| `trailId` | `rt4d-priority6-accounts-metering-pricing-2026-08` |
| `feature` | Commercial layer scaffold: usage metering + credit ledger + plan gates |
| `started` | 2026-08-02 |
| `overallStatus` | **partial** |
| `softwareCreationMode` | Modularist → Constructor → Boundary-Guardian → Testwright → Anchor |
| `PromotionEligibility` | **PROMOTE_WITH_GAPS** |
| `ESFRVerdict` | **PASS_WITH_GAPS** |

## Stage files

| Stage | File |
|-------|------|
| 01 Architect | [01-architect-adr.md](./01-architect-adr.md) |
| 02 Builder | [02-builder-scaffold-manifest.md](./02-builder-scaffold-manifest.md) |
| 03 Implementor | [03-implementor-notes.md](./03-implementor-notes.md) |
| 04 Reviewer | [04-reviewer-conformance.md](./04-reviewer-conformance.md) |
| 05 Inspector | [05-inspector-acceptance.md](./05-inspector-acceptance.md) |
| 06 ESFR | [06-engineer-standards.md](./06-engineer-standards.md) |

## Product order (user-locked)

```text
Engine → Hosted runtime (P5 partial) → User accounts → Usage metering
  → Credits and limits → Pricing plans → Billing → ChatGPT app access
```

This trail delivers the **metering + credits + plan-gate scaffold**. Accounts service, live billing, and ChatGPT paid access remain **declared**.

## Authority (non-negotiable)

```text
engine verified receipt → meter → credit ledger → plan gates
```

No duplicated credit authority in plugin/gateway.

## Milestone evidence (this run)

- Package: `@mrs/rt4d-metering` under `mrs/packages/rt4d-metering`
- Tests: `pnpm --filter @mrs/rt4d-metering test` (unit suite)
- Soft emit hook: engine `maybeEmitMetering` behind `RT4D_METERING_EMIT=1`
- Stripe / Chargebee / ChatGPT billing: **not claimed**
- Hosted accounts / live URL: **not claimed** (P5 remains partial)

## Drive-G maturity (honest)

| Dimension | Rating | Evidence |
|-----------|--------|----------|
| Constitutional model | strong (existing) | P1–P3 runtime; metering respects receipt authority |
| Governance methodology | partial | CECP trail + ESFR; CIEMS/JCR external **declared** |
| Reference implementation | partial | Pure ledger + gates + soft emit; formula **declared** |
| Platform engineering | skeleton/partial | No deploy of billing; P5 hosted runtime still partial |
| Commercial operations | skeleton | Plans catalog declared; no signup/billing live |
