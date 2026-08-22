/**
 * Character holography — skin boundary / rig bulk (Claim A adaptation).
 * Imports EGT curvature + EFR from mandala/holography — no second theory.
 * Status: **partial**
 */

export {
  SKIN_EGT_STATUS,
  SKIN_EGT_CLAIM,
  boneInfluenceVector,
  boneSimilarity,
  stressProxyRho,
  meshAdjacency,
  buildSkinEGT,
  hashSkinEGT,
  entropyProxyS,
  recomputeCurvature,
  DEFAULT_ALPHA,
  DEFAULT_BETA,
} from "./skin-egt.mjs";

export {
  ACTIVATE_STATUS,
  selectActivationSeeds,
  activateRegion,
  assertActivationEffect,
} from "./activate.mjs";

export {
  MUSCLE_STATUS,
  BIOMECHANICS_STATUS,
  createMuscleRegion,
  inferFiberDirection,
  buildMuscleRegionFromEgt,
  activationSignal,
  activateMuscle,
  deformMuscle,
  fireMuscle,
  fireNamedMuscle,
  assertMuscleFire,
} from "./muscle.mjs";

export {
  BULK_TOY_STATUS,
  ANATOMY_RT4D_STATUS,
  reconstructBonesToy,
  reconstructMuscleBandsToy,
  reconstructBulkFromSkin,
} from "./bulk-toy.mjs";

export {
  FACE_EGT_STATUS,
  FACE_RETOPO_STATUS,
  EXPRESSION_INFLUENCE,
  buildFacePatch,
  buildFaceEGT,
  hashFaceEGT,
  applyExpression,
  applySmile,
  readRigControls,
  deformFace,
  expressionFingerprint,
  assertSmileDiffers,
} from "./face-egt.mjs";

export {
  FULL_BODY_STATUS,
  GOVERNED_BODY_STATUS,
  REALISTIC_DEFAULT_STATUS,
  annotateBodyLayers,
  buildBodyEGT,
  inferBulkToy,
  evolveBreathing,
  evolveWalkWave,
  assertBreathingChanges,
  bodyFingerprint,
} from "./full-body.mjs";

export {
  CHAR_EFR_STATUS,
  renderSkinRhoHeatmap,
  renderSkinWarpedPreview,
  renderSkinCombined,
  renderActivationCompare,
  renderFieldHeatmap,
} from "./render.mjs";

export {
  RIG_NODE_STATUS,
  RIG_NODE_CLAIM,
  mat3Zero,
  mat3Identity,
  mat3AddOuter,
  mat3Frobenius,
  mat3SymmetryResidual,
  mat3IsPsdIsh,
  mat3PrincipalDirection,
  computeEntanglementTensors,
  defaultGovernanceCoord,
  buildRigNodes,
  enrichSkinEgtWithRigNodes,
  hashRigNodes,
} from "./rig-node.mjs";

export {
  CURVATURE_ACTIVATION_STATUS,
  activationSigmoid,
  meanCurvatureOverRegion,
  regionActivationFromCurvature,
  densityFromCurvatureActivation,
  activateMuscleFromCurvature,
  maybeCurvatureActivate,
  assertActivationRisesWithK,
} from "./curvature-activation.mjs";

export {
  RIG_CIEMS_STATUS,
  RIG_CIEMS_CLAIM,
  CIEMS_HOLOGRAPHY_STATUS,
  CIEMS_LENS,
  scoreGovernanceCoord,
  attachGovernanceCoords,
  aggregateGovernance,
  buildRigGovernanceReceipt,
  enrichWithRigCiems,
} from "./rig-ciems.mjs";

export {
  ANATOMY_SYNTHESIS_STATUS,
  LIVING_ANATOMY_STATUS,
  scoreMuscleCandidates,
  inferMuscleClusters,
  inferBonePaths,
  inferSoftTissue,
  synthesizeAnatomyFromBoundary,
  anatomyLabelProxyEgt,
} from "./anatomy-synthesis.mjs";

export {
  CREATURE_TEMPLATE_STATUS,
  LIVING_SPECIES_SYSTEM_STATUS,
  MYTHAR_HUMANOID_TEMPLATE,
  listTemplates,
  getTemplate,
  applyBoundarySignature,
  instantiateTemplate,
} from "./creature-template.mjs";

export {
  CONSTITUTIONAL_MOTION_STATUS,
  selectFlowVerts,
  constitutionalFrameStep,
  runConstitutionalLoop,
  assertBreatheUpdatesRho,
} from "./constitutional-motion.mjs";

export {
  HOLO_RIG_STATUS,
  HOLO_RIG_BUFFERS_STATUS,
  CharacterHolographicRig,
  createCharacterHolographicRig,
  packHolographicAttributeBuffers,
} from "./holo-rig.mjs";

export {
  BOUNDARY_APPEARANCE_STATUS,
  JOINT_FLIP_DEG,
  JOINT_ALIGN_COS,
  K_LOCK,
  MUSCLE_BULGE,
  detectEntanglementJoints,
  applyBoundaryAppearance,
  projectRigNodesH,
} from "./boundary-appearance.mjs";

export {
  TAXONOMY_STATUS,
  FULL_SPECIES_SYSTEM_STATUS,
  BIPEDAL_ENVELOPES,
  GENUS_BIPEDAL,
  SPECIES_MYTHAR_HUMANOID,
  createIndividual,
  getTaxonomyTree,
  checkEnvelope,
} from "./taxonomy.mjs";

export {
  SPAWN_STATUS,
  GOVERNED_BIO_UNIVERSE_STATUS,
  CREATURE_CONTRACT,
  normalizeSignature,
  spawn,
  spawnMythar,
} from "./spawn.mjs";
