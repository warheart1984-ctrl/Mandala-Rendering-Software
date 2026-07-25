/**
 * 4DRS invariant conformance suite runner.
 *
 * Given a runtime adapter (or default in-process harness), evaluates
 * foundational + engine invariants and emits EvidenceRecords.
 *
 * Verdicts are pass / fail / partial / unevaluated.
 * Catalog status remains independent (tested ≠ enforced).
 *
 * This suite is NOT a production CKL gate.
 */

import { FOUNDATIONAL_INVARIANTS } from "./foundational.js";
import { ENGINE_INVARIANTS } from "./engineInvariants.js";
import { MEASUREMENTS, measurementsForInvariant } from "./measurements.js";
import { runPredicate } from "./predicates.js";
import { createEvidenceRecord, validateEvidenceRecord, EVIDENCE_SCHEMA } from "./evidence.js";

/**
 * @typedef {object} RuntimeAdapter
 * @property {string} id
 * @property {(invariantId: string) => object} [provideMeasurement]
 */

/**
 * Default in-process adapter: empty measurements; predicates use built-in defaults.
 * @returns {RuntimeAdapter}
 */
export function createDefaultAdapter() {
  return {
    id: "rt4d-inprocess-default",
    provideMeasurement: () => ({}),
  };
}

/**
 * @typedef {object} ConformanceResult
 * @property {string} schema
 * @property {string} runtimeId
 * @property {import("./evidence.js").EvidenceRecord[]} records
 * @property {{pass:number,fail:number,partial:number,unevaluated:number}} summary
 * @property {boolean} allFoundationalPassed
 * @property {string} note
 */

/**
 * Run the invariant suite for a runtime adapter.
 *
 * @param {RuntimeAdapter} [adapter]
 * @param {{includeEngine?:boolean, includeFoundational?:boolean, invariantIds?:string[]}} [opts]
 * @returns {ConformanceResult}
 */
export function runInvariantConformanceSuite(adapter = createDefaultAdapter(), opts = {}) {
  const includeFoundational = opts.includeFoundational !== false;
  const includeEngine = opts.includeEngine !== false;
  const filterIds = opts.invariantIds ? new Set(opts.invariantIds) : null;

  /** @type {import("./evidence.js").EvidenceRecord[]} */
  const records = [];

  const catalogs = [];
  if (includeFoundational) catalogs.push(...FOUNDATIONAL_INVARIANTS);
  if (includeEngine) catalogs.push(...ENGINE_INVARIANTS);

  for (const inv of catalogs) {
    if (filterIds && !filterIds.has(inv.id)) continue;

    const measurement =
      typeof adapter.provideMeasurement === "function"
        ? adapter.provideMeasurement(inv.id) || {}
        : {};
    const predicateResult = runPredicate(inv.id, measurement);
    const ms = measurementsForInvariant(inv.id).map((m) => m.id);

    const record = createEvidenceRecord({
      invariantId: inv.id,
      layer: inv.layer,
      catalogStatus: inv.status,
      predicateResult,
      measurementIds: ms,
      evidenceAnchors: inv.evidence || [],
      runtimeId: adapter.id,
      note:
        inv.status === "enforced"
          ? undefined
          : `Catalog status is '${inv.status}' — suite pass does not imply runtime enforcement.`,
    });
    records.push(record);
  }

  const summary = { pass: 0, fail: 0, partial: 0, unevaluated: 0 };
  for (const r of records) {
    summary[r.verdict] += 1;
  }

  const foundational = records.filter((r) => r.layer === "foundational");
  const allFoundationalPassed =
    foundational.length > 0 && foundational.every((r) => r.verdict === "pass");

  return {
    schema: "4drs.invariant.conformance.v1",
    runtimeId: adapter.id,
    records,
    summary,
    allFoundationalPassed,
    note:
      "This suite produces evidence records. It is not a production CKL / render gate. " +
      "CROS CI-001..006 are a separate lineage — do not merge compliance claims.",
  };
}

/**
 * Validate every evidence record in a suite result.
 * @param {ConformanceResult} result
 * @returns {{ok:boolean, errors:string[]}}
 */
export function validateConformanceResult(result) {
  const errors = [];
  if (!result || result.schema !== "4drs.invariant.conformance.v1") {
    errors.push("invalid conformance result schema");
  }
  if (!Array.isArray(result?.records)) {
    errors.push("records missing");
    return { ok: false, errors };
  }
  for (const rec of result.records) {
    const v = validateEvidenceRecord(rec);
    if (!v.ok) errors.push(`${rec.invariantId}: ${v.errors.join("; ")}`);
  }
  return { ok: errors.length === 0, errors };
}

/**
 * Flat catalog table rows for docs / introspection.
 * @returns {object[]}
 */
export function listInvariantCatalog() {
  return [
    ...FOUNDATIONAL_INVARIANTS.map((inv) => ({
      id: inv.id,
      layer: inv.layer,
      derived_from: inv.derived_from || [],
      status: inv.status,
      evidence: inv.evidence,
      statement: inv.statement,
    })),
    ...ENGINE_INVARIANTS.map((inv) => ({
      id: inv.id,
      layer: inv.layer,
      derived_from: inv.derived_from,
      status: inv.status,
      evidence: inv.evidence,
      statement: inv.statement,
    })),
  ];
}

export { FOUNDATIONAL_INVARIANTS, ENGINE_INVARIANTS, MEASUREMENTS, EVIDENCE_SCHEMA };
