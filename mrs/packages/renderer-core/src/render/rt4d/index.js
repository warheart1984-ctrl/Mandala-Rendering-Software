export { vec4, add, sub, scale, dot, len2, length, normalize, lerp, abs, min, max, neg, cross4D, toArray, fromArray, ZERO, ONE, UNIT_X, UNIT_Y, UNIT_Z, UNIT_W } from "./math/vec4.js";
export { uniformSampleS3, uniformPDF_S3, cosineWeightedSampleS3, powerHeuristic, sphericalTo4D, sampleGGX_S3, ggxNDF, S3_AREA } from "./math/s3.js";
export { Transform4D } from "./math/transform.js";
export {
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
} from "./math/physicalInvariants.js";

export {
  FOUNDATIONAL_INVARIANTS,
  ENGINE_INVARIANTS,
  MEASUREMENTS,
  EVIDENCE_SCHEMA,
  createEvidenceRecord,
  validateEvidenceRecord,
  createDefaultAdapter,
  runInvariantConformanceSuite,
  validateConformanceResult,
  listInvariantCatalog,
  runPredicate,
  projectionFidelityHolds,
  radiometricLambertianHolds,
  getFoundationalInvariant,
  getEngineInvariant,
} from "./invariants/index.js";

export { Camera4D } from "./camera/Camera4D.js";
export { CharacterCamera, DEFAULT_CHARACTER_CAMERA, normalizeCharacterCameraConfig } from "./camera/CharacterCamera.js";

export { Hypersphere, Hyperplane, ImplicitHypersurface } from "./geometry/hypersurface.js";
export { Volume4D, ExponentialFog } from "./geometry/volume.js";
export { Mesh4D, HyperTriangle } from "./geometry/mesh4d.js";
export { SdfPrimitiveIntersector, wrapPrimitiveIntersector } from "./geometry/PrimitiveIntersectors.js";

export { BSDF4D, Lambertian4D } from "./material/bsdf4d.js";
export { GGX4D } from "./material/ggx4d.js";
export { PhaseFunction4D, Isotropic4D, HenyeyGreenstein4D } from "./material/phase4d.js";
export { MaterialSystem } from "./material/MaterialSystem.js";
export { MaterialRegistry, MATERIAL_KINDS, normalizeMaterialEntry, rt4dMaterialToLegacyParams } from "./material/MaterialRegistry.js";
export { SkinnedMeshIntersector, buildDynamicBvh, intersectAabb, traverseDynamicBvh, generateTriangleNormal } from "./intersection/index.js";
export { createPortraitLightingRig, DEFAULT_PORTRAIT_LIGHTING_RIG, normalizePortraitLightingRig } from "./lighting/index.js";
export { environmentToEmission, normalizeRt4dLight, sampleRt4dLight } from "./lighting/Rt4dLightAdapter.js";
export { CharacterEvidenceBuilder, UniversalEvidenceBuilder, canonicalRt4dJson, sha256Hex } from "./evidence/index.js";

export { PathTracer4D, SampleAccumulator } from "./integrator/PathTracer4D.js";

export { HyperBox } from "./accel/HyperBox.js";
export { BVH4D } from "./accel/BVH4D.js";
export {
  packBVH4D,
  intersectAABB4D,
  traverseBVH4DPacked,
  BVH4D_CUDA_KERNEL_SOURCE,
  BVH4D_WGSL_KERNEL_SKETCH,
} from "./accel/gpu/index.js";

export { Projector4D, AOVCollector } from "./output/projector.js";

export {
  createProjectionState,
  toProjectorOptions,
  ProjectionKernel,
  evaluateContinuousP,
  projectPointContinuous,
  projectPointContinuousSafe,
  effectiveW,
  wProjFactor,
  applyViewOrientation,
  d4WithKappa,
  classic4Dto3D,
  PCC_INVARIANTS,
  pccFidelityZeroHolds,
  pccContinuityHolds,
  pccDifferentiabilityHolds,
  pccExtremeGracefulHolds,
  listPccInvariants,
  OBSERVATION_MODE_PRESETS,
  resolveObservationPreset,
  listObservationPresets,
  createApertureFrame3D,
  apertureSampleDirection,
  APERTURE_SOT_BANNER,
  HYPER_CAUSTIC_VERIFIER_STATUS,
  verifyHyperCausticLensFactory,
  verifyHyperCausticLensNorthStar,
  verifyHyperCausticLensProjectionHook,
  verifyHyperCausticLensEnergySweep,
  verifyHyperCausticLensCausticSweep,
  verifyHyperCausticLensTemporalSweep,
  runHyperCausticLensVerifierSuite,
  PATH_TRACER_PROJECTION_HOOK_STATUS,
  createPathTracerProjectionHooks,
  bindPathTracerProjection,
  describePathTracerProjectionIntegration,
  evaluateProjectionGovernance,
  PROJECTION_GOVERNANCE_STATUS,
  PROJECTION_KERNEL_SOT_BANNER,
} from "./projection/index.js";

export { Scene4D } from "./scene/Scene4D.js";
export { createHyperCausticLens } from "./scene/TestHyperCausticLens.js";

export { renderRT4DFrame, renderRT4DFrameGPU, renderRT4DFrameWavefront } from "./RT4DRenderer.js";
export { RT4DGPURenderer } from "./gpu/RT4DGPURenderer.js";
export {
  createRt4dWavefrontPipeline,
  GpuWavefrontQueue,
  WAVEFRONT_QUALITY_DEFAULTS,
  DefaultWavefrontScheduler,
  StubWavefrontKernels,
} from "./gpu/wavefront/index.js";
export { renderWavefrontFrame } from "./pipeline/WavefrontPipelineAdapter.js";
export { selectWavefrontConfig } from "./pipeline/WavefrontConfigSelector.js";
export { selectQualityProfile } from "./pipeline/QualitySelector.js";
export { selectConformanceProfile } from "./pipeline/ConformanceSelector.js";
export { runCPUConformanceGate, buildTinyReferenceFrame, hashBytes } from "./pipeline/CPUConformanceGate.js";
export { createWavefrontCssvWriter } from "./pipeline/WavefrontCssvWriter.js";
export { createRhi, WebGpuRhi, VulkanRhi, Dx12Rhi, MultiGpuArbitrator, RHI_BACKENDS } from "../rhi/RhiFactory.js";
export {
  CurvatureField,
  ForceField,
  WaveField,
  fromWorldWaveConfig,
  stepWaveField,
} from "./physics/index.js";
export { HdrCanvas } from "./gallery/index.js";
export { prepareWorld, bindWorld, validateWorldDocumentV2, PlpValidator } from "./WorldOrchestrator.js";
export { FrameLoop } from "./FrameLoop.js";
