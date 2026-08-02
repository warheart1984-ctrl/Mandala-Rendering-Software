/**
 * @mrs/rt4d-metering — usage metering + credit ledger scaffold
 *
 * Authority chain (non-negotiable):
 *   engine verified receipt → deriveCreditsFromReceipt → usage ledger → plan gates
 *
 * Status tags:
 * - credit formula: **declared** (until cost-calibrated)
 * - ledger adapters: **partial**
 * - HTTP stub / soft emit: **partial**
 * - Stripe / Chargebee / ChatGPT billing: **not live** (declared product intent only)
 */
export {
  PlanIdSchema,
  UsageRecordSchema,
  CreditLedgerEntrySchema,
  EngineReceiptSchema,
  UsageStatusSchema,
  METERABLE_EVIDENCE_STATUSES,
} from "./types.js";

export {
  deriveCreditsFromReceipt,
  CREDIT_FORMULA,
  CREDIT_FORMULA_STATUS,
} from "./deriveCredits.js";

export { PLAN_CATALOG, monthlyCreditAllotment } from "./plans.js";
export { assertWithinPlanLimits } from "./planGate.js";
export { InMemoryLedger, JsonFileLedger } from "./ledger.js";
export { softEmitUsage, getDefaultSoftEmitLedger } from "./softEmit.js";
export { createMeteringStubServer } from "./httpStub.js";
