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

export {
  renderEngine3dStill,
  ENGINE3D_STRUCTURE_RECORD_SCHEMA,
  defaultFaceRiggedGlbPath,
  type Engine3dStillRequest,
  type Engine3dStillResult,
  type Engine3dStructureRecord,
  type FaceRigDetailEvidence,
  type FacePoseEvidence,
  type StructureSource,
} from "./renderEngine3dStill.js";

export {
  EvidenceBuilderV12,
  buildEvidenceRecordV12,
  type EvidenceRecordV12,
} from "./EvidenceBuilderV12.js";

export {
  EvidenceBuilderV20,
  buildEvidenceRecordV20,
  type EvidenceRecordV20,
} from "./EvidenceBuilderV20.js";

export {
  EvidenceBuilderV21,
  buildEvidenceRecordV21,
  type EvidenceRecordV21,
} from "./EvidenceBuilderV21.js";

export {
  EvidenceBuilderV3,
  buildEvidenceRecordV3,
  type EvidenceRecordV3,
} from "./EvidenceBuilderV3.js";

export {
  EvidenceBuilderV4,
  buildEvidenceRecordV4,
  type EvidenceRecordV4,
} from "./EvidenceBuilderV4.js";

export {
  EvidenceBuilderV5,
  buildEvidenceRecordV5,
  type EvidenceRecordV5,
} from "./EvidenceBuilderV5.js";

export {
  SceneBridgeV12,
  canActivateSceneBridgeV3,
  type Rt4dBridgePrimitive,
  type Rt4dBridgeSceneV12,
  type SceneBridgeV12Options,
  type SceneBridgeV12Result,
} from "./SceneBridgeV12.js";

export {
  validateFederatedWorldV4,
  type FederatedWorldEntryV4,
  type FederatedWorldV4,
  type FederationTimelineFrameV4,
  type FederationTimelineV4,
  type WorldLinkV4,
} from "./FederatedWorldV4.js";

export {
  FederatedSceneBridgeV4,
  type FederatedRt4dBridgePrimitiveV4,
  type FederatedRt4dBridgeSceneV4,
  type FederatedSceneBridgeV4Options,
  type FederatedSceneBridgeV4Result,
} from "./FederatedSceneBridgeV4.js";

export {
  validateFederatedRenderPlanV5,
  validateMultiCameraV5,
  validateMultiTimelineV5,
  type FederatedRenderPlanV5,
  type MultiCameraV5,
  type MultiTimelineV5,
  type TimelineBranchV5,
} from "./MultiTimelineV5.js";

export {
  FederatedSceneBridgeV5,
  type FederatedRt4dBridgeSceneV5,
  type FederatedSceneBridgeV5Options,
  type FederatedSceneBridgeV5Render,
  type FederatedSceneBridgeV5Result,
} from "./FederatedSceneBridgeV5.js";

export {
  bridgePrimitiveToRt4d,
  bridgeCameraToRt4d,
  bridgeSceneToRt4d,
  materialHintToRt4dId,
  assignRt4dMaterials,
  type Rt4dVertexTuple,
} from "./Rt4dAdapter.js";
