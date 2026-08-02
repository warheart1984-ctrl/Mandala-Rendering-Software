/**
 * @mrs/rt4d-metering types + Zod schemas
 * Status: partial (scaffold; Stripe/billing not live)
 */
import { z } from "zod";

/** @typedef {"free"|"creator"|"pro"|"studio"} PlanId */

export const PlanIdSchema = z.enum(["free", "creator", "pro", "studio"]);

export const UsageStatusSchema = z.enum(["completed", "failed", "denied"]);

export const RuntimeFingerprintSchema = z
  .object({
    node: z.string().optional(),
    zlib: z.string().optional(),
    platform: z.string().optional(),
    arch: z.string().optional(),
  })
  .passthrough();

/**
 * Minimum engine receipt fields required before metering may proceed.
 * Hash/evidence fields join to engine layered evidence (Priority #4).
 */
export const EngineReceiptSchema = z.object({
  renderId: z.string().min(1),
  pixelHash: z.string().min(1),
  pngHash: z.string().min(1),
  projectionHash: z.string().min(1),
  runtimeFingerprint: RuntimeFingerprintSchema,
  evidenceStatus: z.string().min(1),
  computeSeconds: z.number().nonnegative().optional(),
  storageBytes: z.number().int().nonnegative().optional(),
  width: z.number().int().positive().optional(),
  height: z.number().int().positive().optional(),
  samplesPerPixel: z.number().int().positive().optional(),
  maxDepth: z.number().int().positive().optional(),
});

export const UsageRecordSchema = z.object({
  userId: z.string().min(1),
  planId: PlanIdSchema,
  renderId: z.string().min(1),
  creditsUsed: z.number().int().nonnegative(),
  computeSeconds: z.number().nonnegative(),
  storageBytes: z.number().int().nonnegative(),
  status: UsageStatusSchema,
  pixelHash: z.string().optional(),
  pngHash: z.string().optional(),
  projectionHash: z.string().optional(),
  runtimeFingerprint: RuntimeFingerprintSchema.optional(),
  evidenceStatus: z.string().optional(),
  recordedAt: z.string().optional(),
});

export const CreditLedgerEntrySchema = z.object({
  entryId: z.string().min(1),
  userId: z.string().min(1),
  planId: PlanIdSchema,
  renderId: z.string().min(1),
  creditsDelta: z.number().int(),
  kind: z.enum(["usage", "grant", "refund", "adjustment"]),
  recordedAt: z.string().min(1),
  usageStatus: UsageStatusSchema.optional(),
  idempotentReplay: z.boolean().optional(),
});

/**
 * Evidence statuses accepted for metering join.
 * Fail-closed: incomplete / missing evidence cannot mint credits.
 */
export const METERABLE_EVIDENCE_STATUSES = Object.freeze([
  "substrate_verified",
]);
