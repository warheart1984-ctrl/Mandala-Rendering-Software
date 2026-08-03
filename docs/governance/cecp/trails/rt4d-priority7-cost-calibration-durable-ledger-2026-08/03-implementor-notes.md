# 03 — Implementor notes — RT4D Priority #7

| Field | Value |
|-------|-------|
| `trailId` | `rt4d-priority7-cost-calibration-durable-ledger-2026-08` |
| `role` | Implementor |
| `status` | **partial** |
| `softwareCreationMode` | Constructor + Boundary-Guardian |

## What landed

1. **CostObserver** — `fixture` / `declared_estimate` / `aws_cur` (skeleton; no fake measured CUR).
2. **calibrateCredits** — proposes versioned `creditSchedule`; optional `apply` retargets `deriveCreditsFromReceipt` (single credit authority preserved).
3. **JsonlTenantLedger** — tenant-sharded JSONL; mutex exactly-once on `renderId`; `getAuditChain`.
4. **decideEntitlement** — structured allow/deny record for audit.
5. **UsageLedgerStack** — DynamoDB PK=`tenantId` SK=`renderId` (**declared** until deploy).
6. **Tests** — cost calibration, durable concurrent idempotency, entitlement.

## Authority chain (unchanged)

```text
engine receipt → deriveCreditsFromReceipt(schedule) → ledger → entitlement decision → audit
```

Calibration never mints credits from cost alone.

## Commands

```text
cd mrs && pnpm --filter @mrs/rt4d-metering test
cd infra/cdk && npx cdk synth
```

## Gaps

| Item | Tag |
|------|-----|
| Live CUR / Cost Explorer | **declared** / skeleton |
| DynamoDB deploy | **declared** |
| IdP / Stripe | **not live** |
