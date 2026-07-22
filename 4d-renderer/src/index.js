/**
 * Package entry — browser-safe exports (no node-canvas / FFmpeg).
 * CLI movie pipeline stays in src/cli.js + src/pipeline/movie-pipeline.js.
 */
export { vec4, add, sub, scale, dot, length, normalize, lerp } from "./math/vec4.js";
export {
  composeRotations,
  cinematicRotation,
} from "./math/mat4.js";
export {
  project4Dto3D,
  project3Dto2D,
  project4Dto2D,
  projectEdge4Dto2D,
} from "./math/project.js";
export {
  surfaces,
  getSurface,
  listSurfaces,
  sampleSurface,
} from "./surfaces/index.js";
export { CanvasRenderer } from "./render/canvas-renderer.js";
export { drawWireframe, drawWireframeSegments, drawVertices } from "./render/wireframe.js";
export { drawSolid } from "./render/solid.js";
export { projectedBounds, fitTransform, applyFit, FramingController } from "./render/framing.js";
export { renderProfiles, getRenderProfile, resolveRenderOptions } from "./render/profiles.js";
export { latticePresets, densityQuantile, latticeDiagnostics, meshBounds4D, normalizeMesh4D, filterMeshComponents, weldMesh } from "./lattice/mesh-tools.js";
export { createLattice, getDensity, setDensity, fillLattice } from "./lattice/lattice4d.js";
export { marchingCubes4D } from "./lattice/marching-cubes-4d.js";
export { createScene } from "./pipeline/scene.js";
export { CameraControls, createCameraControls } from "./camera/CameraControls.js";
export { SlicingPlane, createSlicingPlane, hyperplanePresets } from "./camera/SlicingPlane.js";
export { ShadowMapper, createShadowMapper } from "./gpu/ShadowMapper.js";
export { PostProcessor, createPostProcessor } from "./gpu/PostProcessor.js";
export { EnvironmentMapper, createEnvironmentMapper } from "./gpu/EnvironmentMapper.js";
export { LODManager, AdaptiveLODManager, ProgressiveLODManager, ScreenSpaceLODManager, createLODManager, createAdaptiveLODManager, createProgressiveLODManager, createScreenSpaceLODManager } from "./surfaces/LODManager.js";
export { ExportManager, createExportManager, exportSurface } from "./pipeline/ExportManager.js";
export { Timeline, Keyframe, Interpolator, Track, TimelinePlayer, TimelineSerializer, TimelineEditor, createTimeline, createTimelineEditor, timelinePresets } from "./timeline/TimelineEditor.js";
export { CameraPathGenerator, KeyframeBaker, AudioKeyframes, Rotation4DChoreo, Scrubber } from "./timeline/utils/index.js";
export { AudioAnalyzer, AudioMapper, AudioVisualizer, createAudioAnalyzer, createAudioMapper, createAudioVisualizer } from "./audio/AudioVisualizer.js";
export { OcclusionCuller, BVHOcclusionCuller, DistanceOcclusionCuller, createOcclusionCuller, createBVHOcclusionCuller, createDistanceOcclusionCuller } from "./render/OcclusionCulling.js";
export { discoverBrowserRenderAdapters, routeSovereignXRenderer, createGovernedRenderer, createSovereignXNativeDispatch } from "./gpu/SovereignXRenderAdapter.js";
export { SHARED_FRAME_MAGIC, SHARED_FRAME_HEADER_BYTES, parseSharedFrame, SharedFramePreview } from "./gpu/SharedFramePreview.js";

export { TemporalAA, createTemporalAA } from "./render/taa.js";
export { SurfaceComposition, createComposition, OP_UNION, OP_INTERSECT, OP_SUBTRACT, OP_BLEND } from "./surfaces/composition.js";
export { PresetLibrary, createPresetLibrary } from "./pipeline/PresetLibrary.js";
export { ComputeMeshSampler, createComputeMeshSampler } from "./gpu/ComputeMeshSampler.js";
export { ProgressiveRefiner, createProgressiveRefiner, REFINE_BILINEAR, REFINE_BICUBIC, REFINE_NEW_SAMPLE } from "./render/ProgressiveRefiner.js";
export { SharedConfigBlock, SharedImageFormat, SharedResourceType, SharedGPUError, makeImageHandleName, makeSemaphoreHandleName, makeConfigHandleName, FLAG, ProducerStatus, ConsumerStatus, SHARED_GPU_IMAGE_MAGIC, SHARED_GPU_IMAGE_VERSION, gpuErrorToString } from "./gpu/SharedGPUImage.js";
export { GPUPreviewClient, PreviewState, createGPUPreviewClient } from "./gpu/GPUPreviewClient.js";
export { createSovereignXGPUPreviewDispatch } from "./gpu/SovereignXRenderAdapter.js";
export { GPUMeshRenderer, createGPUMeshRenderer, isMeshRendererSupported } from "./gpu/GPUMeshRenderer.js";
export { GPURenderPipeline, createGPURenderPipeline, PipelineState } from "./gpu/GPURenderPipeline.js";

export { SceneNode, SceneGraph, InstanceManager } from "./scene/index.js";
export { Material, MaterialLibrary, LightingSystem } from "./materials/index.js";
export { RenderDevice } from "./render/RenderDevice.js";
export { WebGPURenderDevice } from "./render/WebGPURenderDevice.js";
export { CanvasRenderDevice } from "./render/CanvasRenderDevice.js";
export { VulkanRenderDevice } from "./render/VulkanRenderDevice.js";
export { Renderer } from "./render/Renderer.js";
export { GPUVideoEncoder, NVENCEncoder } from "./encode/index.js";

export { RigidBody4D } from "./physics/RigidBody4D.js";
export { Collider4D, HyperplaneCollider, HypersphereCollider, AABBCollider4D, detectCollision } from "./physics/Collider4D.js";
export { PhysicsWorld4D } from "./physics/PhysicsWorld4D.js";

export { MorphTargetExporter } from "./asset-pipeline/MorphTargetExporter.js";
export { SequentialGLBExporter } from "./asset-pipeline/SequentialGLBExporter.js";

export { Ray4D } from "./picking/Ray4D.js";
export { MeshPicker4D } from "./picking/MeshPicker4D.js";
export { PickerController } from "./picking/PickerController.js";

export { ShaderNode, Port } from "./shader-graph/ShaderNode.js";
export { ShaderGraph } from "./shader-graph/ShaderGraph.js";
export { WGSLCompiler } from "./shader-graph/WGSLCompiler.js";
export { createBuiltinNode, NODE_DEFS } from "./shader-graph/BuiltinNodes.js";

export { LiveLinkServer } from "./live-link/LiveLinkServer.js";
export { MeshStreamer } from "./live-link/MeshStreamer.js";
export { UnityClientProtocol } from "./live-link/UnityClientProtocol.js";

export * as RT4D from "./render/rt4d/index.js";
