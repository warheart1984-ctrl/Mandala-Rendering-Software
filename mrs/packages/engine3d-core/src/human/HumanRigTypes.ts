import type { MaterialRef, MaterialType } from "../world/WorldObject.js";

export type Mat4Tuple = readonly [
  number, number, number, number,
  number, number, number, number,
  number, number, number, number,
  number, number, number, number,
];

export type HumanRigMeshRole = "head" | "body" | "hair" | "clothing" | "accessory" | "face";
export type HumanRigMaterialType = Extract<MaterialType, "skin" | "hair" | "cloth" | "metal" | "glass"> | "eyes";

export interface HumanRigCapabilities {
  readonly morphTargets: boolean;
  readonly multiSkin: boolean;
  readonly muscleRig?: boolean;
  readonly skinSliding?: boolean;
  readonly microMotion?: boolean;
  readonly softTissueSimulation?: boolean;
  readonly sceneBridgeFederation?: boolean;
}

export interface MorphChannel {
  readonly id: string;
  readonly positionDeltas: Float32Array;
  readonly normalDeltas?: Float32Array;
}

export interface FacialKeyframe {
  readonly time: number;
  readonly weights: Readonly<Record<string, number>>;
}

export interface FacialCurve {
  readonly id: string;
  readonly targets: readonly string[];
  readonly keyframes: readonly FacialKeyframe[];
}

export interface FacialRig {
  readonly curves: readonly FacialCurve[];
}

export interface Muscle {
  readonly id: string;
  readonly originBoneId: string;
  readonly insertionBoneId: string;
  readonly activationCurveId: string;
  readonly influenceRegionId: string;
  readonly direction?: readonly [number, number, number];
}

export interface SoftTissueRegion {
  readonly id: string;
  readonly vertexIndices: readonly number[];
  readonly stiffness: number;
  readonly damping: number;
}

export interface MuscleRig {
  readonly muscles: readonly Muscle[];
  readonly regions: readonly SoftTissueRegion[];
}

export interface HumanBone {
  readonly id: string;
  readonly parentId: string | null;
  readonly localTransform: Mat4Tuple;
  readonly inverseBind: Mat4Tuple;
}

export interface HumanSkeleton {
  readonly bones: readonly HumanBone[];
  readonly rootBoneId: string;
}

export interface HumanMeshRef {
  readonly id: string;
  readonly role: HumanRigMeshRole;
  readonly skinId?: string;
  readonly vertices: Float32Array;
  readonly normals?: Float32Array;
  readonly indices: Uint16Array | Uint32Array;
  readonly skinWeights: Float32Array;
  readonly skinIndices: Uint16Array | Uint32Array;
  readonly materialId: string;
  readonly morphChannels: readonly MorphChannel[];
}

export interface HumanMeshes {
  readonly headMesh?: HumanMeshRef;
  readonly bodyMesh?: HumanMeshRef;
  readonly faceMesh?: HumanMeshRef | null;
  readonly hairMesh?: HumanMeshRef | null;
  readonly clothingMeshes: readonly HumanMeshRef[];
  readonly accessoryMeshes: readonly HumanMeshRef[];
  readonly all: readonly HumanMeshRef[];
}

export interface HumanMaterials {
  readonly skin?: MaterialRef;
  readonly hair?: MaterialRef;
  readonly eyes?: MaterialRef;
  readonly clothing: readonly MaterialRef[];
  readonly accessories: readonly MaterialRef[];
  readonly all: readonly (MaterialRef & { type: HumanRigMaterialType })[];
}

export interface Pose {
  readonly id: string;
  readonly boneTransforms: Readonly<Record<string, Mat4Tuple>>;
  readonly expressionParams: Readonly<Record<string, number>>;
  readonly morphWeights?: Readonly<Record<string, number>>;
  readonly morphCurveIds?: readonly string[];
}

export interface PoseLibrary {
  readonly poses: readonly Pose[];
}

export interface HumanRig {
  readonly id: string;
  readonly schemaVersion: "human-rig/1.0" | "human-rig/2.0" | "human-rig/2.1" | "human-rig/3.0" | "human-rig/4.0" | "human-rig/5.0";
  readonly capabilities: HumanRigCapabilities;
  readonly skeleton: HumanSkeleton;
  readonly meshes: HumanMeshes;
  readonly materials: HumanMaterials;
  readonly poses: PoseLibrary;
  readonly facialRig?: FacialRig;
  readonly muscleRig?: MuscleRig;
}

export interface HumanRigValidationIssue {
  readonly code: string;
  readonly message: string;
  readonly path?: string;
}

export interface HumanRigValidationResult {
  readonly ok: boolean;
  readonly issues: readonly HumanRigValidationIssue[];
}

export interface DeformedMesh {
  readonly id: string;
  readonly role: HumanRigMeshRole;
  readonly vertices: Float32Array;
  readonly normals?: Float32Array;
  readonly indices: Uint16Array | Uint32Array;
  readonly materialId: string;
  readonly appliedMorphs?: Readonly<Record<string, number>>;
}

export interface DeformedHumanRigFrame {
  readonly rigId: string;
  readonly poseId?: string;
  readonly globalBones: Readonly<Record<string, Mat4Tuple>>;
  readonly meshes: readonly DeformedMesh[];
  readonly boneHash: string;
  readonly meshDeformationHash: string;
  readonly morphHash?: string;
  readonly curveHash?: string;
  readonly multiSkinHash?: string;
  readonly muscleHash?: string;
  readonly softTissueHash?: string;
}
