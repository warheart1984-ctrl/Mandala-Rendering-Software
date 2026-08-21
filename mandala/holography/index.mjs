/**
 * Mandala holography — synthetic holographic dual (Claim A).
 * Status: **partial** — not AdS/CFT; reconstruct is partial/toy.
 */

export {
  HOLOGRAPHY_STATUS,
  CLAIM,
  FACE_IDS,
  UV_IR,
  encodeBoundary,
  reconstructBulkPreview,
  hashBoundary,
  midSliceZ,
  boundaryToEntanglementBitmap,
  boundaryInfoDensityBitmap,
  scalarPlaneToRgb,
} from "./boundary.mjs";

export {
  c as PROJECTOR_C,
  g_munu,
  makeGmunu,
  makeGmunuInv,
  P_NAIVE,
  PROJECTOR_IDS,
  gInner,
  lowerIndex,
  assertNormalUnit,
  staticObserverNormal,
  projectNaive,
  projectWithNormal,
  projectStaticObserver,
  projectVector,
  inducedMetricHij,
  flatInducedDelta,
  projectionTensorH,
  projectionTensorHmixed,
  spatialDistanceH,
  spacetimeIntervalSquared,
  projectorDescriptor,
} from "./projector.mjs";

export {
  MINKOWSKI_ETA,
  MINKOWSKI_C,
  METRIC_INDEX,
  INDUCED_METRIC_IDS,
  minkowskiIntervalSquared,
  inducedMetric3,
  inducedMetricOnSlice,
  naiveProjectDropTime,
  nullConstraintOk,
} from "./metric.mjs";

export {
  TRANSLATION_STATUS,
  TRANSLATION_CLAIM,
  DEFAULT_CAUSAL_DT,
  DEFAULT_INWARD_DEPTH,
  bulkToBoundaryInformation,
  translateBulkToBoundary,
} from "./translate.mjs";

export {
  projectBulkFromBoundary,
  projectCertifiedHolography,
  computeBoundaryScreen,
} from "./project.mjs";

export {
  EGT_STATUS,
  EGT_CLAIM,
  DEFAULT_ALPHA,
  DEFAULT_BETA,
  buildEGT,
  updateEGT,
  evolveEGTSequence,
  hashEGT,
  recomputeCurvature,
  entropyProxyS,
  entropyProxyS_w2,
  patchEntropyAround,
} from "./egt.mjs";

export {
  EFR_STATUS,
  EFR_MODES,
  COMPOSITE_STATUS,
  REALISTIC_MESH_STATUS,
  renderEGTHeatmap,
  renderEGTCausal,
  renderEGTEmergentGeometry,
  renderEGTCombined,
  renderEGTComposite,
  shadeHolographicFromBuffers,
  renderEFR,
  renderBoundary,
} from "./efr.mjs";

export {
  BulkSpacetimeEngine,
  createBulkSpacetimeEngine,
  BULK_ENGINE_STATUS,
} from "./bulk-spacetime-engine.mjs";

export {
  BoundaryProjection,
  createBoundaryProjection,
  BOUNDARY_PROJECTION_STATUS,
} from "./boundary-projection.mjs";

export {
  HolographicEncoder,
  createHolographicEncoder,
  HOLOGRAPHIC_ENCODER_STATUS,
} from "./holographic-encoder.mjs";

export {
  EntanglementRenderer,
  createEntanglementRenderer,
  HOLOGRAPHIC_SHADER_STATUS,
  HOLOGRAPHIC_BUFFER_STATUS,
  HOLOGRAPHIC_STREAMING_STATUS,
  HOLOGRAPHIC_GPU_RASTER_STATUS,
  HOLOGRAPHIC_SHADER_SOT,
  HOLOGRAPHIC_ATTRIBUTE_NAMES,
  MYTHAR_BOUNDARY_COLOR,
  DEFAULT_MAX_HOLO_NODES,
  createHolographicMaterial,
  createHolographicUniforms,
  loadHolographicShaderSources,
} from "./entanglement-renderer.mjs";

export {
  TINY_SCENE_STATUS,
  BOUNDARY_PLANE_CONVENTION,
  Worldline,
  makeGridPlane,
  createPlaneEGT,
  nearestNodeId,
  depositTrail,
  stepTinySceneFrame,
  renderBulkWorldlineRgb,
  runTinyHolographicScene,
  sceneFingerprint,
} from "./tiny-scene.mjs";

export {
  RECONSTRUCT_STATUS,
  RECONSTRUCT_CLAIM,
  findRhoPeaks,
  findStrongEdgeClusters,
  liftPeakTo4D,
  reconstructBulkFromEGT,
  reconstructApproximateBulk,
  reconstruct,
  worldlinePositionError,
  reconstructFrameScore,
  defaultTinySceneTolerance,
  extractEGTFeatures,
  liftEGTToBulkGuess,
  reconstructWorldlineFromEGT,
  compareReconstruction,
  spatialDistance as reconstructSpatialDistance,
} from "./reconstruct.mjs";

export {
  CIEMS_HOLOGRAPHY_STATUS,
  CIEMS_LENS,
  checkBulkEgtCoupling,
  entanglementHealth,
  buildGovernanceAudit,
  runGovernedLabStep,
} from "./ciems-lab.mjs";

export {
  INTERFERENCE_STATUS,
  spatialDistance as interferenceSpatialDistance,
  depositInteractionSpike,
  runTwoWorldlineInterference,
  runInterferenceVsControl,
  writeInterferenceArtifacts,
} from "./scenes/two-worldline-interference.mjs";
