/**
 * Append-only usage / credit ledger.
 * Status: **partial** (in-memory + JSON-file adapters; not distributed billing).
 *
 * Idempotency: usage keyed by renderId — same renderId never double-charges.
 */
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname } from "node:path";
import { createHash } from "node:crypto";
import {
  UsageRecordSchema,
  CreditLedgerEntrySchema,
  PlanIdSchema,
  EngineReceiptSchema,
} from "./types.js";
import { deriveCreditsFromReceipt } from "./deriveCredits.js";
import { assertWithinPlanLimits } from "./planGate.js";

/**
 * @typedef {import("zod").infer<typeof UsageRecordSchema>} UsageRecord
 * @typedef {import("zod").infer<typeof CreditLedgerEntrySchema>} CreditLedgerEntry
 */

export class InMemoryLedger {
  constructor() {
    /** @type {Map<string, UsageRecord>} */
    this.usageByRenderId = new Map();
    /** @type {CreditLedgerEntry[]} */
    this.entries = [];
  }

  /**
   * @param {string} userId
   * @returns {number}
   */
  creditsUsedByUser(userId) {
    let total = 0;
    for (const rec of this.usageByRenderId.values()) {
      if (rec.userId === userId && rec.status === "completed") {
        total += rec.creditsUsed;
      }
    }
    return total;
  }

  /**
   * @param {string} renderId
   * @returns {UsageRecord | undefined}
   */
  getUsage(renderId) {
    return this.usageByRenderId.get(renderId);
  }

  /**
   * Record usage from a verified engine receipt. Idempotent on renderId.
   *
   * @param {{
   *   userId: string;
   *   planId: string;
   *   engineReceipt: unknown;
   *   recordedAt?: string;
   * }} input
   * @returns {{ usage: UsageRecord; ledgerEntry: CreditLedgerEntry; duplicate: boolean }}
   */
  recordUsageFromReceipt(input) {
    const planId = PlanIdSchema.parse(input.planId);
    const receipt = EngineReceiptSchema.parse(input.engineReceipt);
    const existing = this.usageByRenderId.get(receipt.renderId);
    if (existing) {
      return {
        usage: existing,
        ledgerEntry: {
          entryId: `idempotent:${receipt.renderId}`,
          userId: existing.userId,
          planId: existing.planId,
          renderId: existing.renderId,
          creditsDelta: 0,
          kind: "usage",
          recordedAt: existing.recordedAt ?? new Date(0).toISOString(),
          usageStatus: existing.status,
          idempotentReplay: true,
        },
        duplicate: true,
      };
    }

    const derived = deriveCreditsFromReceipt(receipt);
    assertWithinPlanLimits(
      input.userId,
      planId,
      derived.creditsUsed,
      this.creditsUsedByUser(input.userId),
    );

    const recordedAt = input.recordedAt ?? new Date().toISOString();
    const usage = UsageRecordSchema.parse({
      userId: input.userId,
      planId,
      renderId: receipt.renderId,
      creditsUsed: derived.creditsUsed,
      computeSeconds: derived.computeSeconds,
      storageBytes: derived.storageBytes,
      status: "completed",
      pixelHash: receipt.pixelHash,
      pngHash: receipt.pngHash,
      projectionHash: receipt.projectionHash,
      runtimeFingerprint: receipt.runtimeFingerprint,
      evidenceStatus: receipt.evidenceStatus,
      recordedAt,
    });

    const entryId = createHash("sha256")
      .update(`usage:${usage.renderId}:${usage.userId}`)
      .digest("hex")
      .slice(0, 24);

    const ledgerEntry = CreditLedgerEntrySchema.parse({
      entryId,
      userId: usage.userId,
      planId: usage.planId,
      renderId: usage.renderId,
      creditsDelta: -usage.creditsUsed,
      kind: "usage",
      recordedAt,
      usageStatus: "completed",
      idempotentReplay: false,
    });

    this.usageByRenderId.set(usage.renderId, usage);
    this.entries.push(ledgerEntry);
    return { usage, ledgerEntry, duplicate: false };
  }

  /** @returns {{ usage: UsageRecord[]; entries: CreditLedgerEntry[] }} */
  snapshot() {
    return {
      usage: [...this.usageByRenderId.values()],
      entries: [...this.entries],
    };
  }

  /**
   * @param {{ usage: UsageRecord[]; entries: CreditLedgerEntry[] }} data
   */
  loadSnapshot(data) {
    this.usageByRenderId.clear();
    this.entries = [];
    for (const u of data.usage ?? []) {
      const parsed = UsageRecordSchema.parse(u);
      this.usageByRenderId.set(parsed.renderId, parsed);
    }
    for (const e of data.entries ?? []) {
      this.entries.push(CreditLedgerEntrySchema.parse(e));
    }
  }
}

/**
 * JSON-file backed ledger (append-only semantics via rewrite of snapshot).
 * Suitable for local/dev; not a production billing store.
 */
export class JsonFileLedger extends InMemoryLedger {
  /**
   * @param {string} filePath
   */
  constructor(filePath) {
    super();
    this.filePath = filePath;
    this.#load();
  }

  #load() {
    if (!existsSync(this.filePath)) return;
    const raw = readFileSync(this.filePath, "utf8");
    if (!raw.trim()) return;
    this.loadSnapshot(JSON.parse(raw));
  }

  #persist() {
    mkdirSync(dirname(this.filePath), { recursive: true });
    writeFileSync(this.filePath, JSON.stringify(this.snapshot(), null, 2), "utf8");
  }

  /** @param {Parameters<InMemoryLedger["recordUsageFromReceipt"]>[0]} input */
  recordUsageFromReceipt(input) {
    const result = super.recordUsageFromReceipt(input);
    if (!result.duplicate) this.#persist();
    return result;
  }
}
