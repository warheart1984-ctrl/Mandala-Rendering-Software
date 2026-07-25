/**
 * Constitutional contract surface for cross-runtime PI-*.
 *
 * Distinction (implementation-independent):
 *   PI-* Constitutional Contract  — shared IDs; hosts do not redefine them
 *   Runtime Guarantee             — how a host satisfies the contract
 *   Evidence Record               — host-native proof the guarantee was met
 *   Normalized Claim              — common envelope after normalize
 *   Conformance Report            — independent verification vs PI-* contracts
 *   Acceptance Decision           — CKL soft attach / opt-in enforce
 *
 * Chain:
 *   Mathematical Theory
 *     → PI-* Constitutional Contracts
 *       → Runtime Guarantees
 *         → Native Evidence
 *           → Normalized Claims
 *             → Cross-Runtime Conformance
 *               → CKL Acceptance (soft | enforce)
 *
 * Status (Drive-G-1): suite normalize path remains **tested**.
 * Soft acceptance attaches evidence (**accepted** when gate used).
 * Deny path is **enforced** only behind `enforcePhysicalInvariantConformance`.
 */

import { FOUNDATIONAL_INVARIANTS } from "../foundational.js";

/** Contract version for aggregate reports + acceptance. */
export const CROSS_RUNTIME_CONTRACT_VERSION = "4drs.cross-runtime.contract.v1";

/** Schema ids for formal layer objects. */
export const CONSTITUTIONAL_CONTRACT_SCHEMA = "4drs.constitutional.contract.v1";
export const RUNTIME_GUARANTEE_SCHEMA = "4drs.runtime.guarantee.v1";
export const ACCEPTANCE_DECISION_SCHEMA = "4drs.pi-conformance.acceptance.v1";

/**
 * Required foundational PI-* IDs — every participating host must cite these.
 * These IDs **are** the Constitutional Contract; hosts map evidence to them.
 * @type {readonly string[]}
 */
export const REQUIRED_INVARIANT_IDS = Object.freeze([
  "PI-GEO-LENGTH",
  "PI-CALC-ENERGY",
  "PI-TRIG-RADIAL",
]);

/**
 * Optional engine IDs — included only when a host advertises capability.
 * Not part of the required PI-* contractual acceptance set.
 * @type {readonly string[]}
 */
export const OPTIONAL_ENGINE_INVARIANT_IDS = Object.freeze([
  "EI-PROJ-FIDELITY",
  "EI-REPLAY-DETERMINISM",
  "EI-RADIOMETRIC",
  "EI-TOPOLOGY",
  "EI-LENGTH-PARENT",
]);

/**
 * @typedef {object} ConstitutionalContract
 * @property {string} schema
 * @property {string} id
 * @property {"ConstitutionalContract"} kind
 * @property {"PI"} family
 * @property {string} statement
 * @property {string} [branch]
 * @property {"implementation-independent"} binding
 * @property {string} statusNote
 */

/**
 * @typedef {object} RuntimeGuarantee
 * @property {string} schema
 * @property {string} contractId
 * @property {string} runtimeId
 * @property {string} howSatisfied
 * @property {string} [nativeEvidenceSchema]
 */

/**
 * @typedef {object} AcceptanceDecision
 * @property {string} schema
 * @property {"accept"|"deny"|"attach"} verdict
 * @property {boolean} ok
 * @property {boolean} enforce
 * @property {string[]} contractIds
 * @property {object} acceptanceEvidence
 * @property {object|null} [cklDecision]
 * @property {string} reason
 * @property {"accepted"|"enforced"|"tested"} status
 */

/**
 * Build the PI-* ConstitutionalContract catalog (implementation-independent).
 * Hosts must cite these IDs; they must not invent alternate PI-* meanings.
 * @returns {readonly ConstitutionalContract[]}
 */
export function listConstitutionalContracts() {
  return Object.freeze(
    REQUIRED_INVARIANT_IDS.map((id) => {
      const fi = FOUNDATIONAL_INVARIANTS.find((x) => x.id === id);
      return Object.freeze({
        schema: CONSTITUTIONAL_CONTRACT_SCHEMA,
        id,
        kind: /** @type {const} */ ("ConstitutionalContract"),
        family: /** @type {const} */ ("PI"),
        statement: fi?.statement || id,
        branch: fi?.branch,
        binding: /** @type {const} */ ("implementation-independent"),
        statusNote:
          "Contract ID is shared across runtimes. Satisfaction is proven via " +
          "RuntimeGuarantee → native EvidenceRecord → NormalizedClaim → ConformanceReport.",
      });
    }),
  );
}

/**
 * @param {string} id
 * @returns {ConstitutionalContract|undefined}
 */
export function getConstitutionalContract(id) {
  return listConstitutionalContracts().find((c) => c.id === id);
}

/**
 * Describe how a runtime intends to satisfy a PI-* contract (declarative).
 * @param {{contractId:string, runtimeId:string, howSatisfied:string, nativeEvidenceSchema?:string}} args
 * @returns {RuntimeGuarantee}
 */
export function createRuntimeGuarantee(args) {
  return Object.freeze({
    schema: RUNTIME_GUARANTEE_SCHEMA,
    contractId: args.contractId,
    runtimeId: args.runtimeId,
    howSatisfied: args.howSatisfied,
    nativeEvidenceSchema: args.nativeEvidenceSchema,
  });
}

/**
 * @returns {{
 *   version:string,
 *   required:readonly string[],
 *   optional:readonly string[],
 *   contracts:readonly ConstitutionalContract[],
 *   status:string,
 *   acceptance:{soft:string, enforce:string},
 *   note:string
 * }}
 */
export function getCrossRuntimeContract() {
  return Object.freeze({
    version: CROSS_RUNTIME_CONTRACT_VERSION,
    required: REQUIRED_INVARIANT_IDS,
    optional: OPTIONAL_ENGINE_INVARIANT_IDS,
    contracts: listConstitutionalContracts(),
    status: "tested",
    acceptance: Object.freeze({
      soft: "accepted",
      enforce: "enforced",
    }),
    note:
      "PI-* IDs are Constitutional Contracts (implementation-independent). " +
      "Hosts supply RuntimeGuarantees + native evidence; normalize → claims; " +
      "ConformanceReport verifies claims against contracts. " +
      "CKL soft acceptance attaches evidence; deny only when " +
      "enforcePhysicalInvariantConformance is true. EI-* not in required set.",
  });
}

/**
 * Resolve which IDs to evaluate for a run.
 * @param {{includeOptionalEngine?:boolean, invariantIds?:string[]}} [opts]
 * @returns {string[]}
 */
export function resolveContractInvariantIds(opts = {}) {
  if (Array.isArray(opts.invariantIds) && opts.invariantIds.length > 0) {
    return [...opts.invariantIds];
  }
  const ids = [...REQUIRED_INVARIANT_IDS];
  if (opts.includeOptionalEngine) {
    ids.push(...OPTIONAL_ENGINE_INVARIANT_IDS);
  }
  return ids;
}
