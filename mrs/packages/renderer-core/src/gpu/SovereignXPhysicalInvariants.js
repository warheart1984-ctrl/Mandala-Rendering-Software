/**
 * Sovereign X Router — physical invariant registration & evidence routing.
 *
 * Target: `SovereignXRenderAdapter.js` (documented as "Sovereign X Router").
 * Math SoT: `../render/rt4d/math/physicalInvariants.js` — formulas live there only.
 *
 * Status (Drive-G-1): **tested** — descriptors and evidence refs are wired for
 * routing/introspection; this is not a CKL/render deny gate (`enforced` requires
 * a real gate + tests).
 */

import {
  PHYSICAL_INVARIANTS,
  lengthPreserved,
  energyConserved,
  radialDistanceInvariant,
  invariantPredicateResult,
} from "../render/rt4d/math/physicalInvariants.js";

/** Capability id exposed on Sovereign X route results. */
export const SOVEREIGNX_PHYSICAL_INVARIANT_CAPABILITY =
  "sovereignx.physical-invariants.v1";

/** Prefix for decision.evidenceRefs entries. */
export const PHYSICAL_INVARIANT_EVIDENCE_REF_PREFIX = "physical-invariant:";

/** Transport evidence envelope schema (router-side; distinct from 4drs.invariant.evidence.v1). */
export const SOVEREIGNX_PHYSICAL_INVARIANT_EVIDENCE_SCHEMA =
  "sovereignx.physical-invariant.evidence.v1";

/**
 * Transport-safe descriptors referencing canonical PI-* IDs.
 * Does not embed formulas — only metadata + evidenceRef strings.
 *
 * @returns {readonly object[]}
 */
export function listRegisteredPhysicalInvariants() {
  return Object.freeze(
    PHYSICAL_INVARIANTS.map((inv) =>
      Object.freeze({
        id: inv.id,
        branch: inv.branch,
        statement: inv.statement,
        predicate: inv.predicate,
        status: inv.status,
        evidenceRef: `${PHYSICAL_INVARIANT_EVIDENCE_REF_PREFIX}${inv.id}`,
        sourceModule: "render/rt4d/math/physicalInvariants.js",
      }),
    ),
  );
}

/**
 * Capability registration payload for Sovereign X Router consumers.
 * @returns {Readonly<{capability:string,status:string,note:string,invariants:readonly object[]}>}
 */
export function getSovereignXPhysicalInvariantRegistration() {
  return Object.freeze({
    capability: SOVEREIGNX_PHYSICAL_INVARIANT_CAPABILITY,
    status: "tested",
    note:
      "Physical invariants are registered for evidence routing and introspection. " +
      "Catalog status is 'tested' — not a production CKL / render deny gate.",
    invariants: listRegisteredPhysicalInvariants(),
  });
}

/**
 * @param {string[]|undefined} invariantIds
 * @returns {string[]}
 */
export function physicalInvariantEvidenceRefs(invariantIds) {
  const wanted = invariantIds ? new Set(invariantIds) : null;
  return listRegisteredPhysicalInvariants()
    .filter((d) => !wanted || wanted.has(d.id))
    .map((d) => d.evidenceRef);
}

/**
 * Merge physical-invariant evidence refs onto a routing decision.
 * Does not change action/backend and does not deny routing.
 *
 * @param {object} decision
 * @param {{invariantIds?: string[]}} [opts]
 * @returns {object}
 */
export function attachPhysicalInvariantEvidence(decision, opts = {}) {
  const refs = physicalInvariantEvidenceRefs(opts.invariantIds);
  const existing = Array.isArray(decision?.evidenceRefs) ? decision.evidenceRefs : [];
  const evidenceRefs = [...new Set([...existing, ...refs])];
  return {
    ...decision,
    evidenceRefs,
    physicalInvariantStatus: "tested",
  };
}

/**
 * Evaluate optional measurements into router evidence envelopes.
 * Uses math-engine predicates; does not invent physics.
 *
 * Measurement shapes (by id):
 *   PI-GEO-LENGTH  — { v, vRot, tol? } or { ok: boolean }
 *   PI-CALC-ENERGY — { eBefore, eAfter, tol? } or { ok: boolean }
 *   PI-TRIG-RADIAL — { x, y, xp, yp, tol? } or { ok: boolean }
 *
 * @param {Record<string, object>} [measurementsById]
 * @returns {readonly object[]}
 */
export function evaluatePhysicalInvariantEvidence(measurementsById = {}) {
  return Object.freeze(
    PHYSICAL_INVARIANTS.map((inv) => {
      const measurement = measurementsById[inv.id];
      let ok = null;
      if (measurement && typeof measurement === "object") {
        if (typeof measurement.ok === "boolean") {
          ok = measurement.ok;
        } else if (inv.id === "PI-GEO-LENGTH" && measurement.v != null && measurement.vRot != null) {
          ok = lengthPreserved(measurement.v, measurement.vRot, measurement.tol);
        } else if (
          inv.id === "PI-CALC-ENERGY" &&
          measurement.eBefore != null &&
          measurement.eAfter != null
        ) {
          ok = energyConserved(measurement.eBefore, measurement.eAfter, measurement.tol);
        } else if (
          inv.id === "PI-TRIG-RADIAL" &&
          measurement.x != null &&
          measurement.y != null &&
          measurement.xp != null &&
          measurement.yp != null
        ) {
          ok = radialDistanceInvariant(
            measurement.x,
            measurement.y,
            measurement.xp,
            measurement.yp,
            measurement.tol,
          );
        }
      }

      const predicateResult =
        ok === null
          ? Object.freeze({ id: inv.id, ok: null, evidence: Object.freeze({ unevaluated: true }) })
          : Object.freeze(invariantPredicateResult(inv.id, ok, measurement));

      return Object.freeze({
        schema: SOVEREIGNX_PHYSICAL_INVARIANT_EVIDENCE_SCHEMA,
        invariantId: inv.id,
        evidenceRef: `${PHYSICAL_INVARIANT_EVIDENCE_REF_PREFIX}${inv.id}`,
        catalogStatus: inv.status,
        predicateResult,
        routed: true,
        gate: false,
      });
    }),
  );
}
