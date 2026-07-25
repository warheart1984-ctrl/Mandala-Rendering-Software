/**
 * Additive CKL policies for PI-* Constitutional Contract acceptance.
 * Loaded by the package-local acceptance bridge — not merged into
 * engine/governance/policies/default.policies.json by default
 * (avoids overnight deny on every render).
 *
 * Soft: attach_acceptance when a ConformanceReport is present.
 * Enforce: deny only when intent/evidence sets enforcePhysicalInvariantConformance
 * and required PI-* claims are not all pass.
 */

/** @type {readonly object[]} */
export const PI_CONFORMANCE_POLICIES = Object.freeze([
  Object.freeze({
    id: "policy-physical-invariant-conformance",
    scope: "render",
    condition: "physical_invariant_conformance_report",
    rule: "deny_if_enforce_and_required_pi_fail",
    requiredContractIds: Object.freeze([
      "PI-GEO-LENGTH",
      "PI-CALC-ENERGY",
      "PI-TRIG-RADIAL",
    ]),
    severity: "high",
    message:
      "When enforcePhysicalInvariantConformance is set, required PI-* " +
      "Constitutional Contracts must all pass on the ConformanceReport.",
  }),
  Object.freeze({
    id: "policy-physical-invariant-acceptance-attach",
    scope: "render",
    condition: "physical_invariant_conformance_report",
    rule: "attach_acceptance",
    severity: "medium",
    message:
      "Attach PI-* acceptance evidence when a ConformanceReport is present (soft path).",
  }),
]);
