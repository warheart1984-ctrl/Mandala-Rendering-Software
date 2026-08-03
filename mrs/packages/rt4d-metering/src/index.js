/**
 * @mrs/rt4d-metering — usage metering + credit ledger scaffold
 *
 * Authority chain (non-negotiable):
 *   engine verified receipt → deriveCreditsFromReceipt → usage ledger → plan gates
 *
 * Status tags:
 * - credit formula: **declared** (until CUR-backed calibration)
 * - credit schedule + CostObserver: **partial** (fixture/declared_estimate)
 * - durable JSONL ledger: **partial**
 * - DynamoDB usage ledger CDK: **declared**
 * - HTTP stub / soft emit: **partial**
 * - Stripe / Chargebee / ChatGPT billing: **not live** (declared product intent only)
 */
export {
  PlanIdSchema,
  UsageRecordSchema,
  CreditLedgerEntrySchema,
  EngineReceiptSchema,
  UsageStatusSchema,
  CostSampleSchema,
  EntitlementDecisionSchema,
  AuditChainSchema,
  METERABLE_EVIDENCE_STATUSES,
} from "./types.js";

export {
  deriveCreditsFromReceipt,
  CREDIT_FORMULA,
  CREDIT_FORMULA_STATUS,
} from "./deriveCredits.js";

export {
  DEFAULT_CREDIT_SCHEDULE,
  getCreditSchedule,
  applyCreditSchedule,
  resetCreditSchedule,
} from "./creditSchedule.js";

export {
  CostObserver,
  FixtureCostObserver,
  DeclaredEstimateCostObserver,
  AwsCurCostObserver,
  observeCost,
} from "./cost/CostObserver.js";

export { calibrateCredits, creditsFromCostUsd } from "./cost/calibrate.js";

export { decideEntitlement } from "./entitlement.js";
export { buildAuditChain } from "./audit.js";

export { DurableLedger } from "./durable/DurableLedger.js";
export { JsonlTenantLedger } from "./durable/JsonlTenantLedger.js";

export { PLAN_CATALOG, monthlyCreditAllotment } from "./plans.js";
export { assertWithinPlanLimits } from "./planGate.js";
export { InMemoryLedger, JsonFileLedger } from "./ledger.js";
export { softEmitUsage, getDefaultSoftEmitLedger } from "./softEmit.js";
export { createMeteringStubServer } from "./httpStub.js";
