/**
 * 4DRS invariant stack — public exports.
 *
 * Hierarchy:
 *   Mathematical Theory
 *     → PI-* Constitutional Contracts
 *       → Runtime Guarantees
 *         → Native Evidence → Normalized Claims → ConformanceReport
 *           → CKL Acceptance (soft | opt-in enforce)
 *
 * Distinct from CROS CI-001..006 (mrs/packages/cros). Cross-reference only.
 */

export {
  FOUNDATIONAL_INVARIANTS,
  getFoundationalInvariant,
  PHYSICAL_INVARIANT_TOL,
  PHYSICAL_INVARIANTS,
  lengthPreserved,
  lengthPreserved4,
  energyConserved,
  radialDistanceInvariant,
  rotate2d,
  pythagoreanIdentityHolds,
  lengthPreservedUnder2dRotation,
  invariantPredicateResult,
} from "./foundational.js";

export {
  ENGINE_INVARIANTS,
  getEngineInvariant,
  engineInvariantsDerivedFrom,
} from "./engineInvariants.js";

export {
  MEASUREMENTS,
  getMeasurement,
  measurementsForInvariant,
} from "./measurements.js";

export {
  LAMBERTIAN_BRDF_FACTOR,
  PREDICATE_RUNNERS,
  runPredicate,
  projectionFidelityHolds,
  radiometricLambertianHolds,
  whiteFurnaceLambertianHolds,
  cpuReferenceHashDeterministic,
  orthogonalLengthPreserved,
  topologyPreservationHolds,
} from "./predicates.js";

export {
  EVIDENCE_SCHEMA,
  createEvidenceRecord,
  validateEvidenceRecord,
} from "./evidence.js";

export {
  createDefaultAdapter,
  runInvariantConformanceSuite,
  validateConformanceResult,
  listInvariantCatalog,
} from "./conformance.js";

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
  CONFORMANCE_CLAIM_SCHEMA,
  CROSS_RUNTIME_REPORT_SCHEMA,
  normalizeEvidence,
  createUnevaluatedClaim,
  validateConformanceClaim,
  runCrossRuntimeConformance,
  validateCrossRuntimeReport,
  PI_ACCEPTANCE_EVIDENCE_ID,
  PI_ACCEPTANCE_INTENT_TYPE,
  PI_CONFORMANCE_POLICIES,
  summarizeRequiredPiClaims,
  acceptConformanceReport,
  attachAcceptanceToDecision,
  resolvePiConformanceDecision,
  createMathHost,
  createSovereignXHost,
  MATH_HOST_RUNTIME_ID,
  SOVEREIGNX_HOST_RUNTIME_ID,
} from "./crossRuntime/index.js";
