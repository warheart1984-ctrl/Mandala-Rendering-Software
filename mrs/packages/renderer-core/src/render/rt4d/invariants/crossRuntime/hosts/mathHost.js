/**
 * Math / 4DRS host for cross-runtime conformance.
 *
 * Emits native `4drs.invariant.evidence.v1` records via the existing
 * predicate + evidence stack. Does not speak Sovereign X schemas.
 */

import { getFoundationalInvariant } from "../../foundational.js";
import { getEngineInvariant } from "../../engineInvariants.js";
import { measurementsForInvariant } from "../../measurements.js";
import { runPredicate } from "../../predicates.js";
import { createEvidenceRecord } from "../../evidence.js";
import { REQUIRED_INVARIANT_IDS, OPTIONAL_ENGINE_INVARIANT_IDS } from "../contract.js";

export const MATH_HOST_RUNTIME_ID = "rt4d-math";

/**
 * Known-good default measurements for PI-* (empty → predicate built-in defaults).
 */
export const MATH_HOST_GOOD_MEASUREMENTS = Object.freeze({
  "PI-GEO-LENGTH": {},
  "PI-CALC-ENERGY": { eBefore: 1, eAfter: 1 },
  "PI-TRIG-RADIAL": {},
});

/**
 * @returns {string[]}
 */
export function mathHostCapabilities() {
  return [...REQUIRED_INVARIANT_IDS, ...OPTIONAL_ENGINE_INVARIANT_IDS];
}

/**
 * Resolve measurement for one invariant from suite bag or flat object.
 * @param {string} invariantId
 * @param {object|undefined} measurements
 * @param {Record<string, object>} defaults
 * @returns {object}
 */
function resolveMeasurement(invariantId, measurements, defaults) {
  if (!measurements || typeof measurements !== "object") {
    return defaults[invariantId] || {};
  }
  if (measurements[invariantId] != null && typeof measurements[invariantId] === "object") {
    return measurements[invariantId];
  }
  // Flat single-invariant payload (v / eBefore / x / ok)
  if (
    measurements.v != null ||
    measurements.eBefore != null ||
    measurements.x != null ||
    typeof measurements.ok === "boolean"
  ) {
    return measurements;
  }
  return defaults[invariantId] || {};
}

/**
 * Create a math/4DRS runtime host.
 *
 * Protocol:
 *   { runtimeId, capabilities, supports(id), provideEvidence(id, measurements?) }
 *
 * @param {{runtimeId?:string, defaultMeasurements?:Record<string, object>}} [opts]
 * @returns {object}
 */
export function createMathHost(opts = {}) {
  const runtimeId = opts.runtimeId || MATH_HOST_RUNTIME_ID;
  const defaultMeasurements = opts.defaultMeasurements || MATH_HOST_GOOD_MEASUREMENTS;
  const capabilities = Object.freeze(mathHostCapabilities());
  const capabilitySet = new Set(capabilities);

  return {
    runtimeId,
    capabilities,
    sourceSchemaHint: "4drs.invariant.evidence.v1",

    /**
     * @param {string} invariantId
     * @returns {boolean}
     */
    supports(invariantId) {
      return capabilitySet.has(invariantId);
    },

    /**
     * @param {string} invariantId
     * @param {object} [measurements]
     * @returns {object|null}
     */
    provideEvidence(invariantId, measurements) {
      if (!capabilitySet.has(invariantId)) return null;

      const inv =
        getFoundationalInvariant(invariantId) || getEngineInvariant(invariantId);
      if (!inv) return null;

      const measurement = resolveMeasurement(
        invariantId,
        measurements,
        defaultMeasurements,
      );
      const predicateResult = runPredicate(invariantId, measurement);
      const ms = measurementsForInvariant(invariantId).map((m) => m.id);

      return createEvidenceRecord({
        invariantId: inv.id,
        layer: inv.layer,
        catalogStatus: inv.status,
        predicateResult,
        measurementIds: ms,
        evidenceAnchors: inv.evidence || [],
        runtimeId,
        note:
          inv.status === "enforced"
            ? undefined
            : `Catalog status is '${inv.status}' — suite pass does not imply runtime enforcement.`,
      });
    },
  };
}
