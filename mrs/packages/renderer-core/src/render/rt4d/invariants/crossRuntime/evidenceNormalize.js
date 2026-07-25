/**
 * Normalize per-runtime evidence into a common ConformanceClaim envelope.
 *
 * Does NOT force Sovereign X to emit 4drs.invariant.evidence.v1.
 * Maps known schemas → shared verdict fields while preserving sourceEvidence.
 */

import { EVIDENCE_SCHEMA } from "../evidence.js";
import { SOVEREIGNX_PHYSICAL_INVARIANT_EVIDENCE_SCHEMA } from "../../../../gpu/SovereignXPhysicalInvariants.js";

/** Common claim envelope schema. */
export const CONFORMANCE_CLAIM_SCHEMA = "4drs.cross-runtime.claim.v1";

/** @typedef {"pass"|"fail"|"partial"|"unevaluated"} ClaimVerdict */

/**
 * @typedef {object} ConformanceClaim
 * @property {string} schema
 * @property {string} invariantId
 * @property {string} runtimeId
 * @property {ClaimVerdict} verdict
 * @property {"enforced"|"tested"|"declared"|"skeleton"|string} catalogStatus
 * @property {string} sourceSchema
 * @property {object|null} sourceEvidence
 * @property {boolean} gate
 * @property {string} [note]
 */

/**
 * Map a predicate-style ok flag to a claim verdict.
 * @param {boolean|null|undefined} ok
 * @param {object} [predicateResult]
 * @returns {ClaimVerdict}
 */
export function verdictFromPredicateOk(ok, predicateResult) {
  if (ok === true) return "pass";
  if (ok === false) return "fail";
  if (
    predicateResult &&
    predicateResult.supporting &&
    typeof predicateResult.supporting === "object" &&
    predicateResult.supporting.ok === true
  ) {
    return "partial";
  }
  return "unevaluated";
}

/**
 * Normalize a 4DRS EvidenceRecord.
 * @param {object} record
 * @param {string} [runtimeId]
 * @returns {ConformanceClaim}
 */
export function normalize4drsEvidence(record, runtimeId) {
  return Object.freeze({
    schema: CONFORMANCE_CLAIM_SCHEMA,
    invariantId: record.invariantId,
    runtimeId: runtimeId || record.runtimeId || "unknown",
    verdict: /** @type {ClaimVerdict} */ (record.verdict),
    catalogStatus: record.catalogStatus,
    sourceSchema: EVIDENCE_SCHEMA,
    sourceEvidence: record,
    gate: false,
    note:
      record.note ||
      "Mapped from 4drs.invariant.evidence.v1 — not a production gate.",
  });
}

/**
 * Normalize a Sovereign X physical-invariant evidence envelope.
 * Sovereign X uses predicateResult.ok and does not emit a top-level verdict.
 * @param {object} record
 * @param {string} [runtimeId]
 * @returns {ConformanceClaim}
 */
export function normalizeSovereignXEvidence(record, runtimeId) {
  const predicateResult = record.predicateResult || {};
  const verdict = verdictFromPredicateOk(predicateResult.ok, predicateResult);
  return Object.freeze({
    schema: CONFORMANCE_CLAIM_SCHEMA,
    invariantId: record.invariantId,
    runtimeId: runtimeId || "sovereignx",
    verdict,
    catalogStatus: record.catalogStatus || "tested",
    sourceSchema: SOVEREIGNX_PHYSICAL_INVARIANT_EVIDENCE_SCHEMA,
    sourceEvidence: record,
    gate: record.gate === true,
    note:
      "Mapped from sovereignx.physical-invariant.evidence.v1 — gate remains false unless explicitly set.",
  });
}

/**
 * Build an honest unevaluated claim when a host cannot speak an ID.
 * @param {{invariantId:string, runtimeId:string, reason?:string}} args
 * @returns {ConformanceClaim}
 */
export function createUnevaluatedClaim(args) {
  return Object.freeze({
    schema: CONFORMANCE_CLAIM_SCHEMA,
    invariantId: args.invariantId,
    runtimeId: args.runtimeId,
    verdict: /** @type {const} */ ("unevaluated"),
    catalogStatus: "tested",
    sourceSchema: "none",
    sourceEvidence: null,
    gate: false,
    note: args.reason || `Host '${args.runtimeId}' has no capability for ${args.invariantId}`,
  });
}

/**
 * Dispatch normalize by source schema (or host hint).
 * @param {object|null|undefined} evidence
 * @param {{runtimeId:string, sourceHint?:string}} ctx
 * @returns {ConformanceClaim}
 */
export function normalizeEvidence(evidence, ctx) {
  if (!evidence || typeof evidence !== "object") {
    return createUnevaluatedClaim({
      invariantId: "unknown",
      runtimeId: ctx.runtimeId,
      reason: "Host returned no evidence",
    });
  }

  const schema = evidence.schema || ctx.sourceHint;
  if (schema === EVIDENCE_SCHEMA || evidence.verdict != null) {
    return normalize4drsEvidence(evidence, ctx.runtimeId);
  }
  if (
    schema === SOVEREIGNX_PHYSICAL_INVARIANT_EVIDENCE_SCHEMA ||
    evidence.evidenceRef != null ||
    evidence.gate === false ||
    evidence.gate === true
  ) {
    return normalizeSovereignXEvidence(evidence, ctx.runtimeId);
  }

  // Unknown schema: best-effort from predicateResult.ok if present
  const predicateResult = evidence.predicateResult;
  const ok = predicateResult && typeof predicateResult === "object" ? predicateResult.ok : null;
  return Object.freeze({
    schema: CONFORMANCE_CLAIM_SCHEMA,
    invariantId: evidence.invariantId || "unknown",
    runtimeId: ctx.runtimeId,
    verdict: verdictFromPredicateOk(ok, predicateResult || undefined),
    catalogStatus: evidence.catalogStatus || "declared",
    sourceSchema: schema || "unknown",
    sourceEvidence: evidence,
    gate: false,
    note: "Best-effort normalize of unrecognized evidence schema",
  });
}

/**
 * Soft-validate a ConformanceClaim.
 * @param {unknown} claim
 * @returns {{ok:boolean, errors:string[]}}
 */
export function validateConformanceClaim(claim) {
  const errors = [];
  if (!claim || typeof claim !== "object") {
    return { ok: false, errors: ["claim must be an object"] };
  }
  const c = /** @type {Record<string, unknown>} */ (claim);
  if (c.schema !== CONFORMANCE_CLAIM_SCHEMA) {
    errors.push(`schema must be ${CONFORMANCE_CLAIM_SCHEMA}`);
  }
  if (typeof c.invariantId !== "string" || !c.invariantId) errors.push("invariantId required");
  if (typeof c.runtimeId !== "string" || !c.runtimeId) errors.push("runtimeId required");
  const verdicts = ["pass", "fail", "partial", "unevaluated"];
  if (!verdicts.includes(/** @type {string} */ (c.verdict))) {
    errors.push(`verdict must be one of ${verdicts.join("|")}`);
  }
  if (typeof c.sourceSchema !== "string") errors.push("sourceSchema required");
  if (typeof c.gate !== "boolean") errors.push("gate must be boolean");
  return { ok: errors.length === 0, errors };
}
