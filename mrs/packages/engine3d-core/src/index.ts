export type { Clock } from "./engine/Clock.js";
export { FixedStepClock } from "./engine/Clock.js";
export { InputGatherer } from "./engine/InputGatherer.js";
export type { EngineHost, DefaultEngineHostOptions } from "./engine/EngineHost.js";
export { DefaultEngineHost } from "./engine/EngineHost.js";

export type { Vec3 } from "./world/Vec3.js";
export { vec3, cloneVec3 } from "./world/Vec3.js";
export type { Body } from "./world/Body.js";
export { DefaultBody, isForceAccumBody } from "./world/Body.js";
export type { WorldMesh } from "./world/WorldMesh.js";
export { DefaultWorldMesh } from "./world/WorldMesh.js";
export type { BodyRegistry } from "./world/BodyRegistry.js";
export { DefaultBodyRegistry } from "./world/BodyRegistry.js";
export type { World3D } from "./world/World3D.js";
export { DefaultWorld3D } from "./world/World3D.js";

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

export type { ReplayRecord } from "./replay/ReplayRecord.js";
export type { ReplayTimeline } from "./replay/ReplayTimeline.js";
export { InMemoryReplayTimeline } from "./replay/ReplayTimeline.js";

export type {
  GovernanceSignal,
  GovernanceSeverity,
  CIEMSOverlay,
} from "./governance/CIEMSOverlay.js";
export { DefaultCIEMSOverlay } from "./governance/CIEMSOverlay.js";

export type {
  MandalaNode,
  MandalaLattice,
  MandalaMapping,
} from "./mandala/MandalaMapping.js";
export { DefaultMandalaMapping } from "./mandala/MandalaMapping.js";
