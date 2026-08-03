/**
 * Durable multi-tenant ledger adapter interface.
 * Status: **partial** (interface + JSONL impl); DynamoDB adapter **declared**.
 */

/**
 * @typedef {import("zod").infer<import("../types.js").UsageRecordSchema>} UsageRecord
 * @typedef {import("zod").infer<import("../types.js").CreditLedgerEntrySchema>} CreditLedgerEntry
 * @typedef {import("zod").infer<import("../types.js").EntitlementDecisionSchema>} EntitlementDecision
 * @typedef {import("zod").infer<import("../types.js").AuditChainSchema>} AuditChain
 */

/**
 * @interface
 */
export class DurableLedger {
  /**
   * @param {{
   *   userId: string;
   *   tenantId?: string;
   *   planId: string;
   *   engineReceipt: unknown;
   *   recordedAt?: string;
   * }} input
   * @returns {Promise<{
   *   usage: UsageRecord | null;
   *   ledgerEntry: CreditLedgerEntry;
   *   decision: EntitlementDecision;
   *   duplicate: boolean;
   * }>}
   */
  async recordUsageFromReceipt(input) {
    void input;
    throw new Error("DurableLedger.recordUsageFromReceipt must be implemented");
  }

  /**
   * @param {string} renderId
   * @param {string} [tenantId]
   * @returns {Promise<UsageRecord | undefined>}
   */
  async getUsage(renderId, tenantId) {
    void renderId;
    void tenantId;
    throw new Error("DurableLedger.getUsage must be implemented");
  }

  /**
   * @param {string} renderId
   * @param {string} [tenantId]
   * @returns {Promise<AuditChain>}
   */
  async getAuditChain(renderId, tenantId) {
    void renderId;
    void tenantId;
    throw new Error("DurableLedger.getAuditChain must be implemented");
  }
}
