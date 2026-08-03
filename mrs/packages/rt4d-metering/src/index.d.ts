/**
 * Type declarations for @mrs/rt4d-metering (v0.1.0).
 *
 * Authored from the runtime JSDoc typedefs and zod schemas in src/ — the
 * public surface here is a faithful mirror of the runtime exports. Status
 * reflects the package: partial scaffold (credit formula declared, ledgers
 * partial, billing not live).
 */
import type { z } from "zod";
import type { Server } from "node:http";

// ── identity types ─────────────────────────────────────────────

export type PlanId = "free" | "creator" | "pro" | "studio";
export type UsageStatus = "completed" | "failed" | "denied";
export type CostSource = "fixture" | "declared_estimate" | "aws_cur";
export type LedgerEntryKind = "usage" | "grant" | "refund" | "adjustment";

export interface RuntimeFingerprint {
  node?: string;
  zlib?: string;
  platform?: string;
  arch?: string;
  [key: string]: unknown;
}

export interface EngineReceipt {
  renderId: string;
  pixelHash: string;
  pngHash: string;
  projectionHash: string;
  runtimeFingerprint: RuntimeFingerprint;
  evidenceStatus: string;
  computeSeconds?: number;
  storageBytes?: number;
  width?: number;
  height?: number;
  samplesPerPixel?: number;
  maxDepth?: number;
}

export interface UsageRecord {
  userId: string;
  tenantId?: string;
  planId: PlanId;
  renderId: string;
  creditsUsed: number;
  computeSeconds: number;
  storageBytes: number;
  status: UsageStatus;
  scheduleVersion?: string;
  pixelHash?: string;
  pngHash?: string;
  projectionHash?: string;
  runtimeFingerprint?: RuntimeFingerprint;
  evidenceStatus?: string;
  recordedAt?: string;
}

export interface CreditLedgerEntry {
  entryId: string;
  userId: string;
  tenantId?: string;
  planId: PlanId;
  renderId: string;
  creditsDelta: number;
  kind: LedgerEntryKind;
  recordedAt: string;
  usageStatus?: UsageStatus;
  idempotentReplay?: boolean;
  scheduleVersion?: string;
}

export interface CostSample {
  renderId: string;
  computeSeconds: number;
  storageBytes: number;
  awsCostUsd?: number;
  source: CostSource;
}

export interface EntitlementDecision {
  userId: string;
  tenantId: string;
  planId: PlanId;
  renderId: string;
  allowed: boolean;
  reason: string;
  creditsUsed: number;
  at: string;
}

export interface AuditChain {
  renderId: string;
  tenantId?: string;
  receiptRef?: {
    renderId: string;
    pixelHash?: string;
    pngHash?: string;
    projectionHash?: string;
    runtimeFingerprint?: RuntimeFingerprint;
    evidenceStatus?: string;
    [key: string]: unknown;
  };
  usage?: UsageRecord;
  decisions: EntitlementDecision[];
  ledgerEntries: CreditLedgerEntry[];
}

export interface CreditSchedule {
  version: string;
  status: "declared" | "partial" | "enforced";
  WORK_UNITS_PER_CREDIT: number;
  CREDITS_PER_COMPUTE_SECOND: number;
  BYTES_PER_CREDIT: number;
  USD_PER_CREDIT: number;
  DEFAULT_WIDTH: number;
  DEFAULT_HEIGHT: number;
  DEFAULT_SPP: number;
  DEFAULT_MAX_DEPTH: number;
  calibratedFrom?: string;
}

export interface CostObservation {
  renderId: string;
  computeSeconds: number;
  storageBytes: number;
  awsCostUsd: number | null;
  source: CostSource;
  observerId: string;
  status: "partial" | "declared" | "skeleton";
}

// ── zod schemas (types.js) ─────────────────────────────────────

export declare const PlanIdSchema: z.ZodEnum<["free", "creator", "pro", "studio"]>;
export declare const UsageStatusSchema: z.ZodEnum<
  ["completed", "failed", "denied"]
>;
export declare const EngineReceiptSchema: z.ZodType<EngineReceipt>;
export declare const UsageRecordSchema: z.ZodType<UsageRecord>;
export declare const CreditLedgerEntrySchema: z.ZodType<CreditLedgerEntry>;
export declare const CostSampleSchema: z.ZodType<CostSample>;
export declare const EntitlementDecisionSchema: z.ZodType<EntitlementDecision>;
export declare const AuditChainSchema: z.ZodType<AuditChain>;
export declare const METERABLE_EVIDENCE_STATUSES: ReadonlyArray<
  "substrate_verified"
>;

// ── deriveCredits.js ───────────────────────────────────────────

export declare const CREDIT_FORMULA_STATUS: "declared";
export declare const CREDIT_FORMULA: Readonly<{
  WORK_UNITS_PER_CREDIT: number;
  CREDITS_PER_COMPUTE_SECOND: number;
  BYTES_PER_CREDIT: number;
  DEFAULT_WIDTH: number;
  DEFAULT_HEIGHT: number;
  DEFAULT_SPP: number;
  DEFAULT_MAX_DEPTH: number;
}>;

export interface DerivedCredits {
  creditsUsed: number;
  computeSeconds: number;
  storageBytes: number;
  formulaStatus: string;
  scheduleVersion: string;
}

export declare function deriveCreditsFromReceipt(
  engineReceipt: unknown,
): DerivedCredits;

// ── creditSchedule.js ──────────────────────────────────────────

export declare const DEFAULT_CREDIT_SCHEDULE: Readonly<CreditSchedule>;
export declare function getCreditSchedule(): Readonly<CreditSchedule>;
export declare function applyCreditSchedule(
  schedule: Partial<CreditSchedule> & { version: string },
): Readonly<CreditSchedule>;
export declare function resetCreditSchedule(): void;

// ── cost/CostObserver.js ───────────────────────────────────────

export declare class CostObserver {
  observe(sample: unknown): CostObservation;
}

export declare class FixtureCostObserver extends CostObserver {
  observe(sample: unknown): CostObservation;
}

export declare class DeclaredEstimateCostObserver extends CostObserver {
  observe(sample: unknown): CostObservation;
}

export declare class AwsCurCostObserver extends CostObserver {
  observe(sample: unknown): CostObservation;
}

export declare function observeCost(sample: unknown): CostObservation;

// ── cost/calibrate.js ──────────────────────────────────────────

export declare function creditsFromCostUsd(
  awsCostUsd: number,
  usdPerCredit: number,
): number;

export interface CalibrationResult {
  observation: CostObservation;
  recommendedCredits: number | null;
  proposedSchedule: Readonly<CreditSchedule>;
  applied: boolean;
  formulaStatus: string;
}

export declare function calibrateCredits(
  sample: unknown,
  opts?: { apply?: boolean; schedule?: Readonly<CreditSchedule> },
): CalibrationResult;

// ── entitlement.js ─────────────────────────────────────────────

export declare function decideEntitlement(input: {
  userId: string;
  tenantId?: string;
  planId: string;
  renderId: string;
  proposedCredits: number;
  alreadyUsed?: number;
  at?: string;
}): EntitlementDecision;

// ── audit.js ───────────────────────────────────────────────────

export declare function buildAuditChain(parts: {
  renderId: string;
  tenantId?: string;
  usage?: unknown;
  decisions?: unknown[];
  ledgerEntries?: unknown[];
  receiptRef?: unknown;
}): AuditChain;

// ── durable/DurableLedger.js ───────────────────────────────────

export interface RecordUsageResult {
  usage: UsageRecord | null;
  ledgerEntry: CreditLedgerEntry;
  decision: EntitlementDecision;
  duplicate: boolean;
}

export declare class DurableLedger {
  recordUsageFromReceipt(input: {
    userId: string;
    tenantId?: string;
    planId: string;
    engineReceipt: unknown;
    recordedAt?: string;
  }): Promise<RecordUsageResult>;
  getUsage(renderId: string, tenantId?: string): Promise<UsageRecord | undefined>;
  getAuditChain(renderId: string, tenantId?: string): Promise<AuditChain>;
}

// ── durable/JsonlTenantLedger.js ───────────────────────────────

export declare class JsonlTenantLedger extends DurableLedger {
  constructor(baseDir: string);
  baseDir: string;
  usageIndex: Map<string, UsageRecord>;
  decisionsIndex: Map<string, EntitlementDecision[]>;
  entriesIndex: Map<string, CreditLedgerEntry[]>;
  mutex: {
    runExclusive<T>(fn: () => T | Promise<T>): Promise<T>;
  };
  creditsUsedByUser(userId: string, tenantId: string): number;
}

// ── plans.js ───────────────────────────────────────────────────

export interface PlanDefinition {
  monthlyCredits: number;
  label: string;
  features: string[];
}

export declare const PLAN_CATALOG: Readonly<Record<PlanId, PlanDefinition>>;
export declare function monthlyCreditAllotment(planId: string): number;

// ── planGate.js ────────────────────────────────────────────────

export interface PlanGateDecision {
  ok: true;
  remaining: number;
  allotment: number;
  userId: string;
  planId: PlanId;
}

export declare function assertWithinPlanLimits(
  userId: string,
  planId: string,
  proposedCredits: number,
  alreadyUsed?: number,
): PlanGateDecision;

// ── ledger.js ──────────────────────────────────────────────────

export interface LedgerSnapshot {
  usage: UsageRecord[];
  entries: CreditLedgerEntry[];
}

export interface RecordUsageFromReceiptResult {
  usage: UsageRecord;
  ledgerEntry: CreditLedgerEntry;
  duplicate: boolean;
}

export declare class InMemoryLedger {
  usageByRenderId: Map<string, UsageRecord>;
  entries: CreditLedgerEntry[];
  creditsUsedByUser(userId: string): number;
  getUsage(renderId: string): UsageRecord | undefined;
  recordUsageFromReceipt(input: {
    userId: string;
    planId: string;
    engineReceipt: unknown;
    recordedAt?: string;
  }): RecordUsageFromReceiptResult;
  snapshot(): LedgerSnapshot;
  loadSnapshot(data: LedgerSnapshot): void;
}

export declare class JsonFileLedger extends InMemoryLedger {
  constructor(filePath: string);
  filePath: string;
  recordUsageFromReceipt(input: {
    userId: string;
    planId: string;
    engineReceipt: unknown;
    recordedAt?: string;
  }): RecordUsageFromReceiptResult;
}

// ── softEmit.js ────────────────────────────────────────────────

export declare function getDefaultSoftEmitLedger(): InMemoryLedger;

export interface SoftEmitResult {
  emitted: boolean;
  reason?: string;
  duplicate?: boolean;
  usage?: UsageRecord;
}

export declare function softEmitUsage(opts: {
  userId?: string;
  planId?: string;
  engineReceipt: unknown;
  ledger?: InMemoryLedger;
  env?: Record<string, string | undefined>;
}): SoftEmitResult;

// ── httpStub.js ────────────────────────────────────────────────

export declare function createMeteringStubServer(options?: {
  ledger?: InMemoryLedger;
}): Server;
