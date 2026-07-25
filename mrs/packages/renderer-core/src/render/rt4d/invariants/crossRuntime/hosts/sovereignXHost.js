/**
 * Sovereign X host for cross-runtime conformance.
 *
 * Emits native `sovereignx.physical-invariant.evidence.v1` records.
 * Speaks PI-* only (registration surface); EI-* → no capability → unevaluated.
 */

import {
  evaluatePhysicalInvariantEvidence,
  listRegisteredPhysicalInvariants,
  SOVEREIGNX_PHYSICAL_INVARIANT_EVIDENCE_SCHEMA,
} from "../../../../../gpu/SovereignXPhysicalInvariants.js";
import { REQUIRED_INVARIANT_IDS } from "../contract.js";

export const SOVEREIGNX_HOST_RUNTIME_ID = "sovereignx";

/**
 * Known-good PI-* measurements matching SovereignXPhysicalInvariants.test.js.
 */
export const SOVEREIGNX_HOST_GOOD_MEASUREMENTS = Object.freeze({
  "PI-GEO-LENGTH": { v: { x: 3, y: 4 }, vRot: { x: 3, y: 4 } },
  "PI-CALC-ENERGY": { eBefore: 1, eAfter: 1 },
  "PI-TRIG-RADIAL": { x: 1, y: 0, xp: 0, yp: 1 },
});

/**
 * @returns {string[]}
 */
export function sovereignXHostCapabilities() {
  return listRegisteredPhysicalInvariants().map((d) => d.id);
}

/**
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
 * Create a Sovereign X runtime host.
 *
 * @param {{runtimeId?:string, defaultMeasurements?:Record<string, object>}} [opts]
 * @returns {object}
 */
export function createSovereignXHost(opts = {}) {
  const runtimeId = opts.runtimeId || SOVEREIGNX_HOST_RUNTIME_ID;
  const defaultMeasurements = opts.defaultMeasurements || SOVEREIGNX_HOST_GOOD_MEASUREMENTS;
  const capabilities = Object.freeze(sovereignXHostCapabilities());
  const capabilitySet = new Set(capabilities);

  for (const id of REQUIRED_INVARIANT_IDS) {
    if (!capabilitySet.has(id)) {
      throw new Error(`Sovereign X registration missing required invariant ${id}`);
    }
  }

  return {
    runtimeId,
    capabilities,
    sourceSchemaHint: SOVEREIGNX_PHYSICAL_INVARIANT_EVIDENCE_SCHEMA,

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

      const measurement = resolveMeasurement(
        invariantId,
        measurements,
        defaultMeasurements,
      );
      const records = evaluatePhysicalInvariantEvidence({
        [invariantId]: measurement,
      });
      return records.find((r) => r.invariantId === invariantId) || null;
    },
  };
}
