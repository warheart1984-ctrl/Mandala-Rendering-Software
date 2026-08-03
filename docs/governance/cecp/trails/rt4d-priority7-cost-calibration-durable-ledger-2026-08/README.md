# CECP Trail — RT4D Priority #7 Cost Calibration + Durable Commercial Ledger

| Field | Value |
|-------|-------|
| `trailId` | `rt4d-priority7-cost-calibration-durable-ledger-2026-08` |
| `feature` | Cost calibration (pluggable CostObserver) + durable multi-tenant ledger + entitlement audit |
| `lineage` | Priority #6 `@mrs/rt4d-metering` → this trail |
| `started` | 2026-08-02 |
| `overallStatus` | **partial** |
| `protocol` | `docs/governance/CECP_OMEGA_PROTOCOL.md` |
| `mode` | sage |
| `softwareCreationMode` | Modularist + Boundary-Guardian |
| `PromotionEligibility` | **PROMOTE_WITH_GAPS** (see `06-engineer-standards.md`) |

## Milestone questions

| # | Question | Scaffold answer | Tag |
|---|----------|-----------------|-----|
| 1 | What did this render cost? | `CostObserver` + `CostSample.source` | **declared** / **partial** until live CUR |
| 2 | How many credits? | Versioned schedule via `calibrateCredits` → `deriveCreditsFromReceipt` | formula **declared** until CUR-backed |
| 3 | Entitled to run? | `decideEntitlement` + plan gate | **partial** |
| 4 | Recorded exactly once? | Durable ledger idempotent on `renderId` | **partial** (JSONL); DynamoDB **declared** |
| 5 | Auditable later? | `getAuditChain(renderId)` | **partial** |

## Stage checklist

- [x] `01-architect-adr.md`
- [x] `02-builder-scaffold-manifest.md`
- [x] `03-implementor-notes.md`
- [x] `04-reviewer-conformance.md`
- [x] `05-inspector-acceptance.md`
- [x] `06-engineer-standards.md`

## Package

`mrs/packages/rt4d-metering` (`@mrs/rt4d-metering`)

## Not claimed

- Live AWS CUR / Cost Explorer as measured truth
- Stripe / Chargebee / ChatGPT billing
- Hosted IdP accounts
- CIEMS/JCR commercial admission (Drive-G external, **declared**)
