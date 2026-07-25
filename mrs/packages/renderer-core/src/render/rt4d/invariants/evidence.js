/**
 * EvidenceRecord shape for 4DRS invariant conformance claims.
 *
 * Distinct from CROS RenderEvidence / CI-004. This record proves or
 * partially proves a single PI-* / EI-* invariant for a named runtime adapter.
 */

/**
 * @typedef {"pass"|"fail"|"partial"|"unevaluated"} EvidenceVerdict
 */

/**
 * @typedef {object} EvidenceRecord
 * @property {string} schema
 * @property {string} invariantId
 * @property {"foundational"|"engine"} layer
 * @property {EvidenceVerdict} verdict
 * @property {"enforced"|"tested"|"declared"|"skeleton"} catalogStatus
 * @property {string} [runtimeId]
 * @property {string[]} measurementIds
 * @property {object} predicateResult
 * @property {string[]} evidenceAnchors
 * @property {string} [note]
 */

export const EVIDENCE_SCHEMA = "4drs.invariant.evidence.v1";

/**
 * Build an EvidenceRecord from catalog metadata + predicate result.
 *
 * Mapping:
 *   ok === true  → pass
 *   ok === false → fail
 *   ok === null  → unevaluated (or partial if supporting evidence present)
 *
 * @param {object} args
 * @param {string} args.invariantId
 * @param {"foundational"|"engine"} args.layer
 * @param {"enforced"|"tested"|"declared"|"skeleton"} args.catalogStatus
 * @param {{ok:boolean|null, [k:string]:unknown}} args.predicateResult
 * @param {string[]} [args.measurementIds]
 * @param {string[]} [args.evidenceAnchors]
 * @param {string} [args.runtimeId]
 * @param {string} [args.note]
 * @returns {EvidenceRecord}
 */
export function createEvidenceRecord(args) {
  const {
    invariantId,
    layer,
    catalogStatus,
    predicateResult,
    measurementIds = [],
    evidenceAnchors = [],
    runtimeId,
    note,
  } = args;

  /** @type {EvidenceVerdict} */
  let verdict;
  if (predicateResult.ok === true) {
    verdict = "pass";
  } else if (predicateResult.ok === false) {
    verdict = "fail";
  } else if (
    predicateResult.supporting &&
    typeof predicateResult.supporting === "object" &&
    predicateResult.supporting.ok === true
  ) {
    verdict = "partial";
  } else {
    verdict = "unevaluated";
  }

  /** @type {EvidenceRecord} */
  const record = {
    schema: EVIDENCE_SCHEMA,
    invariantId,
    layer,
    verdict,
    catalogStatus,
    measurementIds: [...measurementIds],
    predicateResult: { ...predicateResult },
    evidenceAnchors: [...evidenceAnchors],
  };
  if (runtimeId) record.runtimeId = runtimeId;
  if (note) record.note = note;
  return Object.freeze(record);
}

/**
 * Soft validation of an EvidenceRecord shape (no AJV dependency).
 * @param {unknown} record
 * @returns {{ok:boolean, errors:string[]}}
 */
export function validateEvidenceRecord(record) {
  const errors = [];
  if (!record || typeof record !== "object") {
    return { ok: false, errors: ["record must be an object"] };
  }
  const r = /** @type {Record<string, unknown>} */ (record);
  if (r.schema !== EVIDENCE_SCHEMA) errors.push(`schema must be ${EVIDENCE_SCHEMA}`);
  if (typeof r.invariantId !== "string" || !r.invariantId) errors.push("invariantId required");
  if (r.layer !== "foundational" && r.layer !== "engine") errors.push("layer must be foundational|engine");
  const verdicts = ["pass", "fail", "partial", "unevaluated"];
  if (!verdicts.includes(/** @type {string} */ (r.verdict))) {
    errors.push(`verdict must be one of ${verdicts.join("|")}`);
  }
  const statuses = ["enforced", "tested", "declared", "skeleton"];
  if (!statuses.includes(/** @type {string} */ (r.catalogStatus))) {
    errors.push(`catalogStatus must be one of ${statuses.join("|")}`);
  }
  if (!Array.isArray(r.measurementIds)) errors.push("measurementIds must be an array");
  if (!r.predicateResult || typeof r.predicateResult !== "object") {
    errors.push("predicateResult required");
  }
  if (!Array.isArray(r.evidenceAnchors)) errors.push("evidenceAnchors must be an array");
  return { ok: errors.length === 0, errors };
}
