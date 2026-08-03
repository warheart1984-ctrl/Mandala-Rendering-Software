/**
 * Audit chain assembly for commercial ledger decisions.
 * Status: **partial**
 */
import { AuditChainSchema } from "./types.js";

/**
 * @typedef {import("zod").infer<typeof AuditChainSchema>} AuditChain
 */

/**
 * Build a validated audit chain object from ledger pieces.
 *
 * @param {{
 *   renderId: string;
 *   tenantId?: string;
 *   usage?: unknown;
 *   decisions?: unknown[];
 *   ledgerEntries?: unknown[];
 *   receiptRef?: unknown;
 * }} parts
 * @returns {AuditChain}
 */
export function buildAuditChain(parts) {
  return AuditChainSchema.parse({
    renderId: parts.renderId,
    tenantId: parts.tenantId,
    receiptRef: parts.receiptRef,
    usage: parts.usage,
    decisions: parts.decisions ?? [],
    ledgerEntries: parts.ledgerEntries ?? [],
  });
}
