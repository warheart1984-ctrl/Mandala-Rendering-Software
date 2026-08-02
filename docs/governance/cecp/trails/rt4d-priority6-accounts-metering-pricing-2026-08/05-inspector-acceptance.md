# 05 — Inspector acceptance — Priority #6

| Field | Value |
|-------|-------|
| `trailId` | `rt4d-priority6-accounts-metering-pricing-2026-08` |
| `role` | Inspector |
| `softwareCreationMode` | Testwright |
| `InspectorVerdict` | **PASS_WITH_GAPS** |

## 1. Commands + evidence

| Command | Result |
|---------|--------|
| `node --test packages/rt4d-metering/test/*.test.js` | **12/12 pass** |
| `pnpm --filter @mrs/rt4d-engine test` | **23/23 pass** |

### Metering suite breakdown

| Suite | Tests | Result |
|-------|-------|--------|
| `deriveCreditsFromReceipt` | 4 | pass |
| `join-to-renderId` | 2 | pass |
| `ledger idempotency` | 2 | pass |
| `assertWithinPlanLimits` | 4 | pass |

## 2. Claim ↔ evidence ledger

| Claim | Evidence | Tag |
|-------|----------|-----|
| Idempotent meter on `renderId` | `ledger.idempotent.test.js` | **partial** (enforced in package tests) |
| Credit derivation stable | `deriveCredits.test.js` | formula **declared** |
| Plan deny fail-closed | `planGate.test.js` | **partial** |
| Join to engine hashes | `joinRenderId.test.js` | **partial** |
| Soft emit does not break ACs | engine 23/23 with flag default-off | **partial** |
| Stripe/billing live | none | **not live** |
| Hosted accounts | none | **declared** / skeleton |

## 3. Gaps (honest)

1. No live billing provider
2. No user-account IdP
3. Credit formula not cost-calibrated
4. Soft emit requires future identity headers / accounts layer
5. P5 hosted runtime still not live URL
6. CIEMS/JCR commercial admission external **declared**

## 4. Verdict

**PASS_WITH_GAPS** — scaffold tests green; commercial operations not live.

## 5. Handoff to ESFR

Produce StandardsReport + PromotionEligibility. Expect `PROMOTE_WITH_GAPS` for scaffold ship into PR, not commercial GA.
