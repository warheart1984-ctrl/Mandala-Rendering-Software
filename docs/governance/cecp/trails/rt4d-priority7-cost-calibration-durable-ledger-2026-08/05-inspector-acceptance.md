# 05 — Inspector acceptance — RT4D Priority #7

| Field | Value |
|-------|-------|
| `trailId` | `rt4d-priority7-cost-calibration-durable-ledger-2026-08` |
| `role` | Inspector |
| `status` | **partial** |
| `InspectorVerdict` | **PASS_WITH_GAPS** |

## Milestone questions

| # | Question | Evidence | Tag |
|---|----------|----------|-----|
| 1 | What did this render cost? | `CostObserver` + labeled `CostSample.source` | **declared** / **partial** until CUR |
| 2 | How many credits? | `calibrateCredits` → versioned schedule → `deriveCreditsFromReceipt` | formula **declared** |
| 3 | Entitled to run? | `decideEntitlement` + plan gate | **partial** |
| 4 | Recorded exactly once? | `JsonlTenantLedger` concurrent test | **partial** (JSONL); Dynamo **declared** |
| 5 | Auditable later? | `getAuditChain(renderId)` | **partial** |

## Acceptance

Scaffold answers all five questions with honest tags. Commercial GA / live CUR / IdP / Stripe remain blocked.
