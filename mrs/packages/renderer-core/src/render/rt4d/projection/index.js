/**
 * ProjCC / intentional 4D projection continuity package.
 *
 * SoT: Projector4D (`../output/projector.js`) — mathematical / print projection.
 * This package is a governed continuity + observation aperture layer on top.
 * Aperture ≠ print. Never route aperture into Digital Printer / print pipelines.
 *
 * BANNER: Governed observation aperture — assist/preview only; CPU RT4D print
 * remains SoT.
 */

export {
  createProjectionState,
  toProjectorOptions,
} from "./ProjectionState.js";

export {
  ProjectionKernel,
  evaluateContinuousP,
  projectPointContinuous,
  PROJECTION_KERNEL_SOT_BANNER,
} from "./ProjectionKernel.js";

export {
  effectiveW,
  wProjFactor,
  applyViewOrientation,
  d4WithKappa,
  classic4Dto3D,
  projectPointContinuousSafe,
  clampExtremeParams,
  EXTREME_PARAM_LIMITS,
} from "./continuityMath.js";

export {
  PCC_INVARIANTS,
  pccFidelityZeroHolds,
  pccContinuityHolds,
  pccDifferentiabilityHolds,
  pccExtremeGracefulHolds,
  listPccInvariants,
} from "./pccInvariants.js";

export {
  OBSERVATION_MODE_PRESETS,
  resolveObservationPreset,
  listObservationPresets,
  OBSERVATION_MODE_IDS,
  PROJECTION_POLICY_IDS,
  OBSERVATION_PRESET_BANNER,
} from "./ObservationModePresets.js";

export {
  createApertureFrame3D,
  apertureSampleDirection,
  APERTURE_SOT_BANNER,
} from "./ApertureFrame3D.js";

export {
  HYPER_CAUSTIC_VERIFIER_STATUS,
  HYPER_CAUSTIC_SOT_BANNER,
  verifyHyperCausticLensFactory,
  verifyHyperCausticLensNorthStar,
  verifyHyperCausticLensProjectionHook,
  verifyHyperCausticLensEnergySweep,
  verifyHyperCausticLensCausticSweep,
  verifyHyperCausticLensTemporalSweep,
  runHyperCausticLensVerifierSuite,
} from "./HyperCausticLensVerifier.js";

export {
  PATH_TRACER_PROJECTION_HOOK_STATUS,
  PATH_TRACER_PROJECTION_SOT_BANNER,
  createPathTracerProjectionHooks,
  bindPathTracerProjection,
  describePathTracerProjectionIntegration,
} from "./pathTracerHooks.js";

export {
  PROJECTION_GOVERNANCE_STATUS,
  PROJECTION_GOVERNANCE_BANNER,
  POLICY_PROJECTION_REQUIRES_PCC,
  POLICY_PROJECTION_ATTACH_PROVENANCE,
  isProjectionIntent,
  hasPccMetadata,
  evaluateProjectionGovernance,
} from "./projectionGovernance.js";
