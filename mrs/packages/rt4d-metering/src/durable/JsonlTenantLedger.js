/**
 * JSONL durable ledger sharded by tenantId (offline/dev).
 * Status: **partial** — append-only files; process-local mutex for exactly-once.
 *
 * Layout:
 *   {baseDir}/{tenantId}/usage.jsonl
 *   {baseDir}/{tenantId}/ledger.jsonl
 *   {baseDir}/{tenantId}/decisions.jsonl
 */
import {
  mkdirSync,
  appendFileSync,
  existsSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { createHash } from "node:crypto";
import {
  UsageRecordSchema,
  CreditLedgerEntrySchema,
  EntitlementDecisionSchema,
  EngineReceiptSchema,
  PlanIdSchema,
} from "../types.js";
import { deriveCreditsFromReceipt } from "../deriveCredits.js";
import { decideEntitlement } from "../entitlement.js";
import { buildAuditChain } from "../audit.js";
import { AsyncMutex } from "../mutex.js";
import { DurableLedger } from "./DurableLedger.js";

/**
 * @typedef {import("zod").infer<typeof UsageRecordSchema>} UsageRecord
 * @typedef {import("zod").infer<typeof CreditLedgerEntrySchema>} CreditLedgerEntry
 * @typedef {import("zod").infer<typeof EntitlementDecisionSchema>} EntitlementDecision
 */

export class JsonlTenantLedger extends DurableLedger {
  /**
   * @param {string} baseDir
   */
  constructor(baseDir) {
    super();
    this.baseDir = baseDir;
    /** @type {Map<string, UsageRecord>} key = tenantId::renderId */
    this.usageIndex = new Map();
    /** @type {Map<string, EntitlementDecision[]>} */
    this.decisionsIndex = new Map();
    /** @type {Map<string, CreditLedgerEntry[]>} */
    this.entriesIndex = new Map();
    this.mutex = new AsyncMutex();
    this.#loadAll();
  }

  /**
   * @param {string} tenantId
   * @param {string} renderId
   */
  #key(tenantId, renderId) {
    return `${tenantId}::${renderId}`;
  }

  /**
   * @param {string} tenantId
   */
  #tenantDir(tenantId) {
    const safe = tenantId.replace(/[^a-zA-Z0-9._-]/g, "_");
    return join(this.baseDir, safe);
  }

  #loadAll() {
    if (!existsSync(this.baseDir)) return;
    // Lazy: indexes rebuild when tenant files are read on demand via #ensureTenantLoaded
  }

  /**
   * @param {string} tenantId
   */
  #ensureTenantLoaded(tenantId) {
    const dir = this.#tenantDir(tenantId);
    const marker = join(dir, ".loaded");
    if (existsSync(marker) && this._loaded?.has(tenantId)) return;
    if (!this._loaded) this._loaded = new Set();
    if (this._loaded.has(tenantId)) return;

    if (!existsSync(dir)) {
      this._loaded.add(tenantId);
      return;
    }

    for (const line of readJsonl(join(dir, "usage.jsonl"))) {
      const u = UsageRecordSchema.parse(line);
      this.usageIndex.set(this.#key(tenantId, u.renderId), u);
    }
    for (const line of readJsonl(join(dir, "ledger.jsonl"))) {
      const e = CreditLedgerEntrySchema.parse(line);
      const k = this.#key(tenantId, e.renderId);
      const arr = this.entriesIndex.get(k) ?? [];
      arr.push(e);
      this.entriesIndex.set(k, arr);
    }
    for (const line of readJsonl(join(dir, "decisions.jsonl"))) {
      const d = EntitlementDecisionSchema.parse(line);
      const k = this.#key(tenantId, d.renderId);
      const arr = this.decisionsIndex.get(k) ?? [];
      arr.push(d);
      this.decisionsIndex.set(k, arr);
    }
    this._loaded.add(tenantId);
  }

  /**
   * @param {string} userId
   * @param {string} tenantId
   */
  creditsUsedByUser(userId, tenantId) {
    this.#ensureTenantLoaded(tenantId);
    let total = 0;
    for (const [key, rec] of this.usageIndex) {
      if (!key.startsWith(`${tenantId}::`)) continue;
      if (rec.userId === userId && rec.status === "completed") {
        total += rec.creditsUsed;
      }
    }
    return total;
  }

  /**
   * @param {string} renderId
   * @param {string} [tenantId="default"]
   */
  async getUsage(renderId, tenantId = "default") {
    return this.mutex.runExclusive(() => {
      this.#ensureTenantLoaded(tenantId);
      return this.usageIndex.get(this.#key(tenantId, renderId));
    });
  }

  /**
   * @param {string} renderId
   * @param {string} [tenantId="default"]
   */
  async getAuditChain(renderId, tenantId = "default") {
    return this.mutex.runExclusive(() => {
      this.#ensureTenantLoaded(tenantId);
      const k = this.#key(tenantId, renderId);
      const usage = this.usageIndex.get(k);
      return buildAuditChain({
        renderId,
        tenantId,
        usage,
        decisions: this.decisionsIndex.get(k) ?? [],
        ledgerEntries: this.entriesIndex.get(k) ?? [],
        receiptRef: usage
          ? {
              renderId: usage.renderId,
              pixelHash: usage.pixelHash,
              pngHash: usage.pngHash,
              projectionHash: usage.projectionHash,
              runtimeFingerprint: usage.runtimeFingerprint,
              evidenceStatus: usage.evidenceStatus,
            }
          : { renderId },
      });
    });
  }

  /**
   * @param {{
   *   userId: string;
   *   tenantId?: string;
   *   planId: string;
   *   engineReceipt: unknown;
   *   recordedAt?: string;
   * }} input
   */
  async recordUsageFromReceipt(input) {
    return this.mutex.runExclusive(() => this.#recordUnlocked(input));
  }

  /**
   * @param {{
   *   userId: string;
   *   tenantId?: string;
   *   planId: string;
   *   engineReceipt: unknown;
   *   recordedAt?: string;
   * }} input
   */
  #recordUnlocked(input) {
    const tenantId =
      typeof input.tenantId === "string" && input.tenantId.length > 0
        ? input.tenantId
        : "default";
    const planId = PlanIdSchema.parse(input.planId);
    const receipt = EngineReceiptSchema.parse(input.engineReceipt);
    this.#ensureTenantLoaded(tenantId);

    const k = this.#key(tenantId, receipt.renderId);
    const existing = this.usageIndex.get(k);
    const recordedAt = input.recordedAt ?? new Date().toISOString();

    if (existing) {
      const decision = decideEntitlement({
        userId: input.userId,
        tenantId,
        planId,
        renderId: receipt.renderId,
        proposedCredits: 0,
        alreadyUsed: this.creditsUsedByUser(input.userId, tenantId),
        at: recordedAt,
      });
      // Idempotent replay: still append a decision noting duplicate (audit), zero charge
      const replayDecision = EntitlementDecisionSchema.parse({
        ...decision,
        allowed: true,
        reason: "idempotent_replay",
        creditsUsed: 0,
      });
      this.#appendDecision(tenantId, replayDecision);
      const ledgerEntry = CreditLedgerEntrySchema.parse({
        entryId: `idempotent:${receipt.renderId}`,
        userId: existing.userId,
        tenantId,
        planId: existing.planId,
        renderId: existing.renderId,
        creditsDelta: 0,
        kind: "usage",
        recordedAt: existing.recordedAt ?? recordedAt,
        usageStatus: existing.status,
        idempotentReplay: true,
        scheduleVersion: existing.scheduleVersion,
      });
      return {
        usage: existing,
        ledgerEntry,
        decision: replayDecision,
        duplicate: true,
      };
    }

    const derived = deriveCreditsFromReceipt(receipt);
    const decision = decideEntitlement({
      userId: input.userId,
      tenantId,
      planId,
      renderId: receipt.renderId,
      proposedCredits: derived.creditsUsed,
      alreadyUsed: this.creditsUsedByUser(input.userId, tenantId),
      at: recordedAt,
    });
    this.#appendDecision(tenantId, decision);

    if (!decision.allowed) {
      const deniedUsage = UsageRecordSchema.parse({
        userId: input.userId,
        tenantId,
        planId,
        renderId: receipt.renderId,
        creditsUsed: 0,
        computeSeconds: derived.computeSeconds,
        storageBytes: derived.storageBytes,
        status: "denied",
        scheduleVersion: derived.scheduleVersion,
        pixelHash: receipt.pixelHash,
        pngHash: receipt.pngHash,
        projectionHash: receipt.projectionHash,
        runtimeFingerprint: receipt.runtimeFingerprint,
        evidenceStatus: receipt.evidenceStatus,
        recordedAt,
      });
      // Do not index denied as completed usage (no charge); still audit
      const ledgerEntry = CreditLedgerEntrySchema.parse({
        entryId: createHash("sha256")
          .update(`deny:${receipt.renderId}:${input.userId}`)
          .digest("hex")
          .slice(0, 24),
        userId: input.userId,
        tenantId,
        planId,
        renderId: receipt.renderId,
        creditsDelta: 0,
        kind: "usage",
        recordedAt,
        usageStatus: "denied",
        idempotentReplay: false,
        scheduleVersion: derived.scheduleVersion,
      });
      this.#appendEntry(tenantId, ledgerEntry);
      return {
        usage: null,
        ledgerEntry,
        decision,
        duplicate: false,
      };
    }

    const usage = UsageRecordSchema.parse({
      userId: input.userId,
      tenantId,
      planId,
      renderId: receipt.renderId,
      creditsUsed: derived.creditsUsed,
      computeSeconds: derived.computeSeconds,
      storageBytes: derived.storageBytes,
      status: "completed",
      scheduleVersion: derived.scheduleVersion,
      pixelHash: receipt.pixelHash,
      pngHash: receipt.pngHash,
      projectionHash: receipt.projectionHash,
      runtimeFingerprint: receipt.runtimeFingerprint,
      evidenceStatus: receipt.evidenceStatus,
      recordedAt,
    });

    const entryId = createHash("sha256")
      .update(`usage:${usage.renderId}:${usage.userId}:${tenantId}`)
      .digest("hex")
      .slice(0, 24);

    const ledgerEntry = CreditLedgerEntrySchema.parse({
      entryId,
      userId: usage.userId,
      tenantId,
      planId: usage.planId,
      renderId: usage.renderId,
      creditsDelta: -usage.creditsUsed,
      kind: "usage",
      recordedAt,
      usageStatus: "completed",
      idempotentReplay: false,
      scheduleVersion: usage.scheduleVersion,
    });

    this.usageIndex.set(k, usage);
    this.#appendUsage(tenantId, usage);
    this.#appendEntry(tenantId, ledgerEntry);

    return { usage, ledgerEntry, decision, duplicate: false };
  }

  /**
   * @param {string} tenantId
   * @param {UsageRecord} usage
   */
  #appendUsage(tenantId, usage) {
    const dir = this.#tenantDir(tenantId);
    mkdirSync(dir, { recursive: true });
    appendFileSync(join(dir, "usage.jsonl"), `${JSON.stringify(usage)}\n`, "utf8");
  }

  /**
   * @param {string} tenantId
   * @param {CreditLedgerEntry} entry
   */
  #appendEntry(tenantId, entry) {
    const dir = this.#tenantDir(tenantId);
    mkdirSync(dir, { recursive: true });
    appendFileSync(join(dir, "ledger.jsonl"), `${JSON.stringify(entry)}\n`, "utf8");
    const k = this.#key(tenantId, entry.renderId);
    const arr = this.entriesIndex.get(k) ?? [];
    arr.push(entry);
    this.entriesIndex.set(k, arr);
  }

  /**
   * @param {string} tenantId
   * @param {EntitlementDecision} decision
   */
  #appendDecision(tenantId, decision) {
    const dir = this.#tenantDir(tenantId);
    mkdirSync(dir, { recursive: true });
    appendFileSync(
      join(dir, "decisions.jsonl"),
      `${JSON.stringify(decision)}\n`,
      "utf8",
    );
    const k = this.#key(tenantId, decision.renderId);
    const arr = this.decisionsIndex.get(k) ?? [];
    arr.push(decision);
    this.decisionsIndex.set(k, arr);
  }
}

/**
 * @param {string} path
 * @returns {unknown[]}
 */
function readJsonl(path) {
  if (!existsSync(path)) return [];
  const raw = readFileSync(path, "utf8");
  return raw
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => JSON.parse(l));
}

// silence unused import if tree-shaken oddly
void writeFileSync;
