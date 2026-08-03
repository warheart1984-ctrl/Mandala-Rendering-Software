# 01 — Architect ADR — RT4D Priority #7 Cost Calibration + Durable Ledger

| Field | Value |
|-------|-------|
| `trailId` | `rt4d-priority7-cost-calibration-durable-ledger-2026-08` |
| `feature` | Cost calibration + durable multi-tenant commercial ledger + entitlement audit |
| `role` | Architect |
| `mode` | sage |
| `softwareCreationMode` | Modularist + Boundary-Guardian |
| `status` | **partial** |
| `started` | 2026-08-02 |
| `lineage` | Continues `rt4d-priority6-accounts-metering-pricing-2026-08` |

## 1. Intent

Answer five commercial questions with an honest scaffold: render cost (observer), credit calibration (versioned schedule), entitlement, exactly-once durable usage, and auditable decision chains — without inventing a second credit authority, live Stripe, or fake “measured” AWS costs.

## 2. ADR decision

### Context

- P6 landed `@mrs/rt4d-metering`: receipt → `deriveCreditsFromReceipt` → memory/JSON ledger → plan gate; soft emit opt-in.
- Credit formula remains **declared** until unit economics are calibrated against labeled cost samples.
- P5 CDK has S3/Redis/ECS/API Gateway; parallel agents may deploy — avoid thrashing `artifact-storage-stack.ts`.
- Live CUR/billing/IdP are unavailable on this host path.

### Decision

1. **Keep single credit authority:** only `deriveCreditsFromReceipt` mints credits for a render. Calibration updates a **versioned credit schedule** that `deriveCredits` reads — never plugin/gateway wall-clock invent.
2. **Pluggable `CostObserver`:** inputs `CostSample { renderId, computeSeconds, storageBytes, awsCostUsd?, source }` where `source ∈ {fixture, declared_estimate, aws_cur}`. Live CUR adapter is **declared/skeleton** until wired to real billing data.
3. **Durable ledger adapter:** interface `DurableLedger` with:
   - **Dev/offline (partial):** JSONL sharded by `tenantId` under a base directory (no native SQLite dep — P5 sovereignty / Windows-friendly).
   - **Cloud (declared):** DynamoDB table CDK construct in new `infra/cdk/lib/usage-ledger-stack.ts` — synthable stub; deploy left to ops / parallel P5 agent.
4. **Entitlement decision records** always accompany meter attempts: `{ userId, tenantId, planId, renderId, allowed, reason, creditsUsed, at }`.
5. **Exactly-once:** usage keyed by `renderId` under a mutex; concurrent double-submit charges once (tested).
6. **Audit export:** `getAuditChain(renderId)` returns receipt refs + usage + entitlement decision(s) + ledger entry.
7. **No Stripe live; no fake measured CUR** — estimates labeled by `source`.

### Consequences

- Commercial ops remain **partial**; GA blocked on CUR + IdP + Stripe evidence.
- DynamoDB stack is **declared** until deploy evidence exists.
- Formula may gain `scheduleVersion` while `CREDIT_FORMULA_STATUS` stays **declared** until `aws_cur`-backed calibration lands.

## 3. Interface specification

| Surface | Contract |
|---------|----------|
| `CostSample` | `renderId`, `computeSeconds`, `storageBytes`, optional `awsCostUsd`, `source` |
| `CostObserver.observe(sample)` | returns labeled cost view; never silent “measured” without `aws_cur` |
| `calibrateCredits(sample)` | proposes/applies versioned schedule coefficients; does not bypass receipt path |
| `DurableLedger` | `recordUsageFromReceipt`, `getUsage`, `getAuditChain`, tenant-scoped |
| `EntitlementDecision` | allow/deny with reason + credits + ids + `at` |
| `AuditChain` | `{ renderId, usage?, decisions[], ledgerEntries[], receiptRef? }` |
| CDK | `UsageLedgerStack` DynamoDB PK=`tenantId` SK=`renderId` (**declared** deploy) |
| Ban | No second credit mint path; no Stripe claims; no constitution/renderer-core/AGENTS edits |

## 4. Constitutional boundary

| In scope | Out of scope |
|----------|--------------|
| `mrs/packages/rt4d-metering/**` | `constitution/`, `engine/constitution/`, `AGENTS.md` |
| `infra/cdk/lib/usage-ledger-stack.ts` (+ careful `bin/infra.ts` wire) | Thrashing `artifact-storage-stack` during P5 deploy |
| Evidence-spec P7 appendix | Live Stripe / IdP / CUR ingestion |
| CECP trail 01–06 | `mrs/packages/renderer-core/**` |

## 5. File manifest

| Path | Action | Owner |
|------|--------|-------|
| `mrs/packages/rt4d-metering/src/cost/*` | create | Builder/Implementor |
| `mrs/packages/rt4d-metering/src/durable/*` | create | Builder/Implementor |
| `mrs/packages/rt4d-metering/src/creditSchedule.js` | create | Implementor |
| `mrs/packages/rt4d-metering/src/entitlement.js` | create | Implementor |
| `mrs/packages/rt4d-metering/src/audit.js` | create | Implementor |
| `mrs/packages/rt4d-metering/src/{types,deriveCredits,ledger,planGate,index}.js` | extend | Implementor |
| `mrs/packages/rt4d-metering/test/*.test.js` | add | Implementor |
| `mrs/packages/rt4d-metering/fixtures/cost-samples.json` | create | Builder |
| `infra/cdk/lib/usage-ledger-stack.ts` | create | Implementor |
| `infra/cdk/bin/infra.ts` | wire stack | Implementor (minimal) |
| `docs/4d-engine/rt4d/RT4D_ENGINE_EVIDENCE_SPEC.v1.md` | P7 appendix | Implementor |
| CECP trail | create | Crew |

## 6. Acceptance criteria

- [ ] CostObserver + calibrateCredits tests with fixture samples; sources labeled
- [ ] JSONL tenant ledger persists; concurrent double-submit → one charge
- [ ] Entitlement decisions recorded; audit chain by renderId
- [ ] Plan gate remains fail-closed; no credit authority outside deriveCredits
- [ ] DynamoDB CDK construct synthable; status **declared** until deploy
- [ ] Metering tests expand; workspace `test:rt4d-metering` green
- [ ] Engine ACs 23/23 preserved
- [ ] Protected paths untouched

## 7. Handoff order

1. Builder → stubs, fixtures, schemas, CDK empty construct shell
2. Implementor → logic + tests + evidence appendix
3. Reviewer → authority/conformance
4. Inspector → acceptance vs questions 1–5
5. ESFR → PromotionEligibility

## Anti-overclaim

- Do not claim calibrated production economics without `aws_cur` samples.
- Do not claim DynamoDB ledger live without deploy evidence.
- Do not claim Stripe/IdP/CIEMS commercial admission.
- Drive-G-2: commercial ops ≠ constitutional maturity.

## Sage counsel

Prove exactly-once + audit chain + labeled cost fixtures first. Leave CUR adapter and DynamoDB deploy **declared**. Keep schedule versioning so later CUR calibration is a data update, not a second mint path.

## Cross-reference ledger

| CECP §9 / trail | Relevance |
|-----------------|-----------|
| `rt4d-priority6-accounts-metering-pricing-2026-08` | Parent commercial scaffold |
| `rt4d-priority5-hosted-mcp-2026-08` | Hosted runtime / CDK lineage |
| Priority #4 layered evidence | Receipt join fields |
| `RT4D_ENGINE_EVIDENCE_SPEC.v1.md` | Metering appendices |

## Risks to sovereignty / determinism

- Wall-clock `at` on decisions must not enter credit hashes.
- DynamoDB introduces AWS coupling — keep adapter interface; local JSONL default (P5).
- Calibration must not let cost samples mint credits without a receipt.
