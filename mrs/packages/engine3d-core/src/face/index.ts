export type {
  FaceRigConfig,
} from "./FaceRigConfig.js";
export {
  DEFAULT_FACE_BONES,
  DEFAULT_FACE_BLENDSHAPES,
  defaultFaceRigConfig,
} from "./FaceRigConfig.js";
export type { FaceExpression, FacePoseFrame } from "./FacePoseFrame.js";
export { emptyFacePose } from "./FacePoseFrame.js";
export {
  loadFaceRig,
  applyFacePose,
  validateFaceRig,
  neutralFacePose,
  type LoadedFaceRig,
} from "./FaceRig.js";
export { facePoseFromTimeline } from "./facePoseFromTimeline.js";
export {
  resolveHumanFacePath,
  resolveFixtureHumanFacePath,
  getOperatorAssetsRoot,
  resolveOperatorAssetsBaseDir,
  detectFaceAssetKind,
  normalizeHumanFaceName,
  defaultFaceRiggedGlbPath,
  defaultFaceNeutralGlbPath,
  listFixtureHumanGlbCandidates,
  type FaceAssetKind,
  type ResolvedHumanFacePath,
} from "./resolveHumanFacePath.js";
export {
  computeMeshAabb,
  validateAabb,
  hashFileSha256,
  registerFixtureFace,
  auditDefaultFaceFixtures,
  CONSTITUTIONAL_SIGNATURE_MEANING,
  type MeshAabb,
  type FixtureFaceEntry,
  type FixtureRegistryReport,
} from "./FixtureFaceRegistry.js";
export {
  loadBiometricCatalog,
  getBiometricProfile,
  resolveBiometricCatalogPath,
  metricsFromAabb,
  validateAgainstProfile,
  validateAabbAgainstProfile,
  inRange,
  type ScaleClass,
  type BiometricRange,
  type BiometricProfile,
  type BiometricCatalog,
  type BiometricValidationResult,
  type AabbProportionMetrics,
} from "./BiometricProfile.js";
export {
  inheritMetricsFromContext,
  scaleTripleFromInheritance,
  requireScaleContext,
  HALT_MISSING_SCALE,
  type MetricContext,
  type InheritedMetrics,
  type ScaleContextResult,
} from "./MetricInheritance.js";
export {
  loadBiogeometricCatalog,
  getWorldProfile,
  resolveBiogeometricCatalogPath,
  inheritEcologicalScale,
  HALT_MISSING_WORLD_CONTEXT,
  type BiogeometricDomain,
  type WorldProfile,
  type BiogeometricCatalog,
  type EcologicalScaleResult,
  type EcologicalInheritArgs,
} from "./EcologicalInheritance.js";
export {
  applyAmendmentVIIToMeshes,
  applyAmendmentVIIFromRenderContext,
  applyControlledOrganicAsymmetry,
  type AmendmentVIIApplyMode,
  type AmendmentVIIApplyRequest,
  type AmendmentVIIApplyResult,
} from "./AmendmentVIIRenderApply.js";
export {
  CKL_AMENDMENT_VII_POLICY_IDS,
  CKL_WORLD_PROFILE_POLICY_IDS,
  CKL_WORLD_PROFILE_APPLY_REMAINING,
  evaluateCklAmendmentVIIGate,
  evaluateCklAmendmentVIIOrdered,
  evaluateCklWorldProfileGate,
  evaluateCklWorldProfileOrdered,
  getCklAmendmentVII,
  loadAmendmentVIIPolicyManifest,
  loadPolicyOrder,
  loadWorldProfile,
  enablePolicy,
  CklAmendmentVIIBridge,
  registerAmendmentVIIBridge,
  type CklAmendmentVIIPolicyId,
  type CklWorldProfilePolicyId,
  type CklGateResult,
  type CklPolicyManifest,
  type RenderFixtureForCkl,
  type WorldEntityForCkl,
  type WorldProfileLoadResult,
} from "./CklAmendmentVIIBridge.js";
export {
  worldPolicyForObjectType,
  renderContextToWorldEntity,
  type Engine3DObjectContext,
  type Engine3DWorldContext,
  type Engine3DObjectType,
  type RenderContext,
} from "./Engine3DContext.js";
