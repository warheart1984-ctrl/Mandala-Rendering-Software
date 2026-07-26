export {
  ENGINE3D_BRIDGE_SCENE_SCHEMA,
  type BridgePrimitiveKind,
  type BridgePrimitiveSource,
  type Vec4Tuple,
  type BridgePrimitive,
  type BridgeCameraDescriptor,
  type BridgeLatticeDescriptor,
  type BridgeMappingNotes,
  type Engine3DBridgeScene,
  type SceneBridgeEvidence,
  type SceneBridgeCaptureResult,
  type SceneBridgeCaptureOptions,
} from "./types.js";

export {
  canonicalStringify,
  fnv1a32Hex,
  hashCanonical,
} from "./hash.js";

export {
  Engine3DSceneBridge,
  captureEngine3DScene,
  snapshotWorldForHash,
  DEFAULT_BRIDGE_CAMERA,
  type SceneBridgeCaptureInput,
} from "./Engine3DSceneBridge.js";

export {
  renderEngine3dFrame,
  ENGINE3D_FRAME_RECEIPT_MODE,
  type Engine3DFrameRenderRequest,
  type Engine3DFrameRenderReceipt,
} from "./renderEngine3dFrame.js";
