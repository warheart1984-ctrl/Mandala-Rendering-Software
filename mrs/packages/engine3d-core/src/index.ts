export type { Clock } from "./engine/Clock.js";
export { FixedStepClock } from "./engine/Clock.js";
export { InputGatherer } from "./engine/InputGatherer.js";
export type {
  EngineHost,
  DefaultEngineHostOptions,
  EngineTickPhase,
} from "./engine/EngineHost.js";
export { DefaultEngineHost } from "./engine/EngineHost.js";

export type { Vec3 } from "./world/Vec3.js";
export { vec3, cloneVec3 } from "./world/Vec3.js";
export type { Body } from "./world/Body.js";
export { DefaultBody, isForceAccumBody } from "./world/Body.js";
export type { WorldMesh } from "./world/WorldMesh.js";
export { DefaultWorldMesh } from "./world/WorldMesh.js";
export type {
  CameraParams,
  CameraType,
  Engine3DWorldDocument,
  EnvironmentParams,
  EnvironmentPreset,
  GeometryRef,
  GovernedAssetKind,
  GovernedAssetManifest,
  AssetProvenanceRecord,
  LightParams,
  LightType,
  MaterialRef,
  MaterialType,
  PrimitiveType,
  QuatTuple,
  StaticMeshAsset,
  TextureRef,
  TextureAsset,
  TextureColorSpace,
  TextureFormat,
  TextureRole,
  Transform,
  UniversalMaterial,
  Vec3Tuple,
  WorldObject,
  WorldObjectKind,
  WorldGeneratorParams,
} from "./world/WorldObject.js";
export {
  DEFAULT_TRANSFORM,
  createUniversalMaterial,
  createWorldObject,
} from "./world/WorldObject.js";
export {
  UNIVERSAL_MATERIAL_TYPES,
  buildRt4dMaterialTable,
  hashMaterialTable,
  materialToRt4dEntry,
  normalizeUniversalMaterial,
  validateUniversalMaterials,
  type MaterialValidationIssue,
  type MaterialValidationResult,
  type Rt4dMaterialEntry,
} from "./world/MaterialSystem.js";
export {
  buildRt4dTextureTable,
  hashTextureTable,
  textureToRt4dEntry,
  validateTextureAssets,
  validateTextureRefs,
  type Rt4dTextureEntry,
  type TextureValidationIssue,
  type TextureValidationResult,
} from "./world/TextureSystem.js";
export {
  buildRt4dLightTable,
  createLightingPreset,
  hashLightingRig,
  lightObjectToRt4dEntry,
  type LightingPreset,
  type Rt4dLightEntry,
} from "./world/LightingSystem.js";
export {
  buildRt4dCameraTable,
  cameraObjectToRt4dEntry,
  hashCameraMotion,
  type Rt4dCameraEntry,
} from "./world/CameraSystem.js";
export {
  createEnvironmentPreset,
  environmentToRt4dEntry,
  hashEnvironment,
  type Rt4dEnvironmentEntry,
} from "./world/EnvironmentSystem.js";
export {
  AssetRegistry,
  hashAssetManifests,
  validateAssetManifests,
  type AssetValidationIssue,
  type AssetValidationResult,
} from "./world/AssetRegistry.js";
export {
  AssetProvenanceLedger,
  createImportProvenanceRecord,
  hashAssetProvenance,
} from "./world/AssetProvenanceLedger.js";
export {
  bridgePrimitiveToRt4d,
  bridgeCameraToRt4d,
  bridgeSceneToRt4d,
  materialHintToRt4dId,
  assignRt4dMaterials,
  type Rt4dVertexTuple,
} from "./scene/Rt4dAdapter.js";
export {
  hashStaticMesh,
  hashStaticMeshTable,
  instantiateStaticMesh,
  invertMat4,
  transformToMat4,
  validateStaticMeshes,
  type InstancedStaticMeshPrimitive,
  type StaticMeshValidationIssue,
  type StaticMeshValidationResult,
} from "./world/StaticMeshSystem.js";
export {
  importStaticMeshesFromGlb,
  importStaticMeshesFromObj,
  type StaticMeshImportIssue,
  type StaticMeshImportOptions,
  type StaticMeshImportResult,
} from "./world/StaticMeshImporter.js";
export type {
  DeformedHumanRigFrame,
  DeformedMesh,
  HumanBone,
  HumanMaterials,
  HumanMeshRef,
  HumanMeshes,
  HumanRig,
  HumanRigMaterialType,
  HumanRigMeshRole,
  HumanRigCapabilities,
  HumanRigValidationIssue,
  HumanRigValidationResult,
  HumanSkeleton,
  Mat4Tuple,
  MorphChannel,
  FacialCurve,
  FacialKeyframe,
  FacialRig,
  Muscle,
  MuscleRig,
  SoftTissueRegion,
  Pose,
  PoseLibrary,
} from "./human/HumanRigTypes.js";
export { FacialCurvePlayer } from "./human/FacialCurvePlayer.js";
export { MuscleDeformer, type MuscleDeformationResult } from "./human/MuscleDeformer.js";
export { MultiDeformationCompiler, type MultiDeformationState } from "./human/MultiDeformationCompiler.js";
export {
  HumanRigLoader,
  loadHumanRigFromGlb,
  type HumanRigLoadOptions,
} from "./human/HumanRigLoader.js";
export {
  HumanRigDeformer,
  computeGlobalBones,
  deformHumanMesh,
  deformHumanRig,
} from "./human/HumanRigDeformer.js";
export {
  MorphTargetDeformer,
  applyMorphTargets,
  type MorphedMeshData,
} from "./human/MorphTargetDeformer.js";
export { validateHumanRig } from "./human/HumanRigValidator.js";
export {
  IDENTITY_MAT4,
  mat4,
  multiplyMat4,
  normalize3,
  transformPoint,
  transformVector,
} from "./human/mat4.js";
export type { BodyRegistry } from "./world/BodyRegistry.js";
export { DefaultBodyRegistry } from "./world/BodyRegistry.js";
export type { World3D } from "./world/World3D.js";
export { DefaultWorld3D } from "./world/World3D.js";
export { World3DFace } from "./world/World3DFace.js";
export {
  skinMaterial,
  eyeMaterial,
  mouthMaterial,
  DEFAULT_FACE_MATERIALS,
  bindDefaultFaceMaterials,
} from "./materials/FaceMaterials.js";

export type { PhysicsEngine } from "./physics/PhysicsEngine.js";
export { SimplePhysicsEngine } from "./physics/PhysicsEngine.js";

export type { EngineInputs } from "./bridge/EngineInputs.js";
export type { BridgeV1 } from "./bridge/BridgeV1.js";
export { DefaultBridgeV1 } from "./bridge/BridgeV1.js";

export type { LiftedState4D } from "./substrate/LiftedState.js";
export type { VisualMod } from "./substrate/VisualMod.js";
export type { Glyph4D } from "./substrate/Glyph4D.js";
export type { GlyphEngine4D } from "./substrate/GlyphEngine4D.js";
export { DefaultGlyphEngine4D } from "./substrate/GlyphEngine4D.js";
export type { Substrate4D } from "./substrate/Substrate4D.js";
export { DefaultSubstrate4D, GlyphSubstrate4D } from "./substrate/Substrate4D.js";

export type { RendererCore } from "./renderer/RendererCore.js";
export { DefaultRendererCore, NullHeadlessRenderer } from "./renderer/RendererCore.js";
export type { SceneBuilder, BuiltScene } from "./renderer/SceneBuilder.js";
export { DefaultSceneBuilder } from "./renderer/SceneBuilder.js";
export type { ShaderPrograms } from "./renderer/ShaderPrograms.js";
export { DefaultShaderPrograms } from "./renderer/ShaderPrograms.js";
export type { ShaderSource } from "./renderer/shaders/ShaderSource.js";
export { DEFAULT_SHADER_SOURCE } from "./renderer/shaders/ShaderSource.js";
export type { PipelineConfig, CullFace } from "./renderer/shaders/PipelineConfig.js";
export { DEFAULT_PIPELINE } from "./renderer/shaders/PipelineConfig.js";
export type { Material } from "./renderer/shaders/Material.js";
export { createDefaultMaterial } from "./renderer/shaders/Material.js";
export type { WebGPUDevice } from "./renderer/backend/WebGPUDevice.js";
export { createWebGPUDevice } from "./renderer/backend/WebGPUDevice.js";
export { WebGPURenderer } from "./renderer/backend/WebGPURenderer.js";
export { WebGPUSceneBuilder } from "./renderer/backend/WebGPUSceneBuilder.js";
export { WebGPUShaderPrograms } from "./renderer/backend/WebGPUShaderPrograms.js";

export type { Engine3DInvariant } from "./invariants/Engine3DInvariants.js";
export {
  Engine3DInvariants,
  TickInvariantState,
  createEngine3DInvariants,
  createStructuralInvariants,
  createReplayEvidenceInvariant,
} from "./invariants/Engine3DInvariants.js";

export type {
  ReplayRecord,
  ReplayRecordDraft,
  ReplayRecordInputs,
  ReplayBodySnapshot,
  ReplayBodyLike,
} from "./replay/ReplayRecord.js";
export type { ReplayTimeline } from "./replay/ReplayTimeline.js";
export {
  InMemoryReplayTimeline,
  freezeReplayRecord,
} from "./replay/ReplayTimeline.js";

export type {
  GovernanceSignal,
  GovernanceSeverity,
  CIEMSOverlay,
} from "./governance/CIEMSOverlay.js";
export { DefaultCIEMSOverlay } from "./governance/CIEMSOverlay.js";

export type {
  GovernanceRule,
  GovernanceRuleContext,
  CiemsTextualDslStatus,
} from "./governance/dsl/Rule.js";
export { Engine3DRules } from "./governance/dsl/Engine3DRules.js";
export { createDefaultEngine3DRules } from "./governance/rules/defaultRules.js";

export type {
  MandalaNode,
  MandalaLattice,
  MandalaMapping,
} from "./mandala/MandalaMapping.js";
export { DefaultMandalaMapping } from "./mandala/MandalaMapping.js";

export type {
  BridgePrimitiveKind,
  BridgePrimitiveSource,
  Vec4Tuple,
  BridgePrimitive,
  BridgeCameraDescriptor,
  BridgeLatticeDescriptor,
  BridgeMappingNotes,
  Engine3DBridgeScene,
  SceneBridgeEvidence,
  SceneBridgeCaptureResult,
  SceneBridgeCaptureOptions,
  SceneBridgeCaptureInput,
  Engine3DFrameRenderRequest,
  Engine3DFrameRenderReceipt,
  Engine3dStillRequest,
  Engine3dStillResult,
  Engine3dStructureRecord,
  FaceRigDetailEvidence,
  FacePoseEvidence,
  StructureSource,
  EvidenceRecordV12,
  EvidenceRecordV20,
  EvidenceRecordV21,
  EvidenceRecordV3,
  EvidenceRecordV4,
  EvidenceRecordV5,
  FederatedRenderPlanV5,
  FederatedRt4dBridgePrimitiveV4,
  FederatedRt4dBridgeSceneV4,
  FederatedRt4dBridgeSceneV5,
  FederatedSceneBridgeV4Options,
  FederatedSceneBridgeV4Result,
  FederatedSceneBridgeV5Options,
  FederatedSceneBridgeV5Render,
  FederatedSceneBridgeV5Result,
  FederatedWorldEntryV4,
  FederatedWorldV4,
  FederationTimelineFrameV4,
  FederationTimelineV4,
  MultiCameraV5,
  MultiTimelineV5,
  Rt4dBridgePrimitive,
  Rt4dBridgeSceneV12,
  SceneBridgeV12Options,
  SceneBridgeV12Result,
  TimelineBranchV5,
  WorldLinkV4,
} from "./scene/index.js";
export {
  ENGINE3D_BRIDGE_SCENE_SCHEMA,
  Engine3DSceneBridge,
  captureEngine3DScene,
  snapshotWorldForHash,
  DEFAULT_BRIDGE_CAMERA,
  canonicalStringify,
  fnv1a32Hex,
  hashCanonical,
  renderEngine3dFrame,
  renderEngine3dStill,
  defaultFaceRiggedGlbPath,
  ENGINE3D_FRAME_RECEIPT_MODE,
  ENGINE3D_STRUCTURE_RECORD_SCHEMA,
  EvidenceBuilderV12,
  EvidenceBuilderV20,
  EvidenceBuilderV21,
  EvidenceBuilderV3,
  EvidenceBuilderV4,
  EvidenceBuilderV5,
  FederatedSceneBridgeV4,
  FederatedSceneBridgeV5,
  SceneBridgeV12,
  canActivateSceneBridgeV3,
  buildEvidenceRecordV12,
  buildEvidenceRecordV20,
  buildEvidenceRecordV21,
  buildEvidenceRecordV3,
  buildEvidenceRecordV4,
  buildEvidenceRecordV5,
  validateFederatedRenderPlanV5,
  validateFederatedWorldV4,
  validateMultiCameraV5,
  validateMultiTimelineV5,
} from "./scene/index.js";

export {
  HeadlessGLStillRenderer,
  renderStillBuffers,
  writeStillPngs,
  encodePngRgba,
  sha256Hex,
  type RasterCamera,
  type RasterMesh,
  type RasterStillRequest,
  type RasterStillBuffers,
  type RasterStillFiles,
} from "./renderer/raster/HeadlessStillRenderer.js";

export {
  buildBoxMesh,
  buildUvSphereMesh,
  buildDemoPortraitMeshes,
  buildPortraitRasterMeshesFromHumanRig,
  worldMeshToRasterMesh,
} from "./renderer/raster/portraitMeshes.js";

export type {
  Timeline,
  AnimationTrack,
  Keyframe,
  KeyframeValue,
  InterpMode,
  TrackTarget,
} from "./timeline/index.js";
export {
  assertValidTimeline,
  frameCount,
  frameTime,
  evaluateTrack,
  evaluateProperty,
  evaluateCameraEye,
  defaultOrbitTimeline,
  defaultFaceSmileTimeline,
  faceTimelineExample,
  slerp,
} from "./timeline/index.js";

export type {
  FaceRigConfig,
  FaceExpression,
  FacePoseFrame,
  LoadedFaceRig,
  FaceAssetKind,
  ResolvedHumanFacePath,
} from "./face/index.js";
export {
  DEFAULT_FACE_BONES,
  DEFAULT_FACE_BLENDSHAPES,
  defaultFaceRigConfig,
  emptyFacePose,
  loadFaceRig,
  applyFacePose,
  validateFaceRig,
  neutralFacePose,
  facePoseFromTimeline,
  resolveHumanFacePath,
  resolveFixtureHumanFacePath,
  getOperatorAssetsRoot,
  resolveOperatorAssetsBaseDir,
  detectFaceAssetKind,
  normalizeHumanFaceName,
  defaultFaceNeutralGlbPath,
} from "./face/index.js";

export {
  Engine3DCinematicRuntime,
  ENGINE3D_SEQUENCE_RECORD_SCHEMA,
  type CinematicRuntimeConfig,
  type Engine3dSequenceRecord,
  type SequenceFramePaths,
} from "./runtime/Engine3DCinematicRuntime.js";
export { MemoryModel8k, type MemoryBudget } from "./runtime/MemoryModel8k.js";
export { TileRenderer3D, type TileConfig } from "./renderer/TileRenderer3D.js";
export {
  RenderFarmController,
  type RenderNodeInfo,
  type SequenceJob,
} from "./farm/RenderFarmController.js";
export {
  SequenceExporter,
  type SequenceExportConfig,
} from "./export/SequenceExporter.js";
