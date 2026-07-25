/**
 * Cross-runtime conformance — public exports.
 *
 * PI-* = Constitutional Contract (implementation-independent).
 * RuntimeGuarantee → native Evidence → NormalizedClaim → ConformanceReport
 * → CKL Acceptance (soft attach | opt-in enforce).
 */

export {
  CROSS_RUNTIME_CONTRACT_VERSION,
  CONSTITUTIONAL_CONTRACT_SCHEMA,
  RUNTIME_GUARANTEE_SCHEMA,
  ACCEPTANCE_DECISION_SCHEMA,
  REQUIRED_INVARIANT_IDS,
  OPTIONAL_ENGINE_INVARIANT_IDS,
  getCrossRuntimeContract,
  listConstitutionalContracts,
  getConstitutionalContract,
  createRuntimeGuarantee,
  resolveContractInvariantIds,
} from "./contract.js";

export {
  CONFORMANCE_CLAIM_SCHEMA,
  normalizeEvidence,
  normalize4drsEvidence,
  normalizeSovereignXEvidence,
  createUnevaluatedClaim,
  verdictFromPredicateOk,
  validateConformanceClaim,
} from "./evidenceNormalize.js";

export {
  CROSS_RUNTIME_REPORT_SCHEMA,
  runCrossRuntimeConformance,
  validateCrossRuntimeReport,
} from "./suite.js";

export {
  PI_ACCEPTANCE_EVIDENCE_ID,
  PI_ACCEPTANCE_INTENT_TYPE,
  summarizeRequiredPiClaims,
  buildAcceptanceEvidence,
  resolvePiConformanceDecision,
  acceptConformanceReport,
  attachAcceptanceToDecision,
} from "./acceptance.js";

export { PI_CONFORMANCE_POLICIES } from "./policies/piConformancePolicies.js";

export {
  MATH_HOST_RUNTIME_ID,
  MATH_HOST_GOOD_MEASUREMENTS,
  mathHostCapabilities,
  createMathHost,
} from "./hosts/mathHost.js";

export {
  SOVEREIGNX_HOST_RUNTIME_ID,
  SOVEREIGNX_HOST_GOOD_MEASUREMENTS,
  sovereignXHostCapabilities,
  createSovereignXHost,
} from "./hosts/sovereignXHost.js";
