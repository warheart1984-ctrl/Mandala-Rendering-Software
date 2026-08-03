# 02 — Builder scaffold manifest — RT4D Priority #7

| Field | Value |
|-------|-------|
| `trailId` | `rt4d-priority7-cost-calibration-durable-ledger-2026-08` |
| `role` | Builder |
| `status` | **partial** |
| `softwareCreationMode` | Modularist |

## Scaffold created

| Path | Kind | Status |
|------|------|--------|
| `mrs/packages/rt4d-metering/src/cost/CostObserver.js` | observers + dispatch | **partial** |
| `mrs/packages/rt4d-metering/src/cost/calibrate.js` | schedule calibration | **partial** |
| `mrs/packages/rt4d-metering/src/creditSchedule.js` | versioned schedule | **partial** |
| `mrs/packages/rt4d-metering/src/durable/DurableLedger.js` | interface | **partial** |
| `mrs/packages/rt4d-metering/src/durable/JsonlTenantLedger.js` | JSONL backend | **partial** |
| `mrs/packages/rt4d-metering/src/entitlement.js` | decision record | **partial** |
| `mrs/packages/rt4d-metering/src/audit.js` | audit chain | **partial** |
| `mrs/packages/rt4d-metering/src/mutex.js` | process mutex | **partial** |
| `mrs/packages/rt4d-metering/schemas/cost-sample.schema.json` | schema | **partial** |
| `mrs/packages/rt4d-metering/schemas/entitlement-decision.schema.json` | schema | **partial** |
| `mrs/packages/rt4d-metering/fixtures/cost-samples.json` | labeled fixtures | **partial** |
| `infra/cdk/lib/usage-ledger-stack.ts` | DynamoDB construct | **declared** |
| `infra/cdk/bin/infra.ts` | wire UsageLedgerStack | **declared** |

## Not scaffolded (honest)

- Live AWS CUR ingestion client
- Stripe / Chargebee webhooks
- Distributed lock (Redis/Dynamo conditional writes beyond table shape)
