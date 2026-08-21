/** Core contracts for the deterministic Sovereign Sculptor substrate. */

export type Species = "human" | "fox" | "anthro";

export type Vec3 = readonly [number, number, number];

export type Mat4Tuple = readonly [
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
];

/**
 * Identity metadata is explicit and creator/user supplied. It is never inferred
 * from geometry, species, measurements, or a morphology profile.
 */
export interface GenderMetadata {
  readonly identity: string;
  readonly pronouns?: readonly string[];
  readonly attribution: "self-described" | "creator-authored";
}

export interface IdentityMetadata {
  readonly id: string;
  readonly displayName: string;
  readonly gender: GenderMetadata;
}

/**
 * Dimensionless morphology controls in [0, 1]. Gender is deliberately absent.
 */
export interface MorphologyProfile {
  readonly stature: number;
  readonly bodyMass: number;
  readonly limbLength: number;
  readonly torsoLength: number;
  readonly headScale: number;
  readonly muzzleLength: number;
  readonly earScale: number;
  readonly tailLength: number;
  readonly digitigradeBias: number;
}

export interface BoneConstraint {
  readonly rotationRadians: {
    readonly min: Vec3;
    readonly max: Vec3;
  };
  readonly translationLocked: boolean;
  readonly scaleLocked: boolean;
}

export interface BoneSpec {
  readonly id: string;
  readonly parentId: string | null;
  /** Column-major local bind transform. */
  readonly bindTransform: Mat4Tuple;
  readonly constraint: BoneConstraint;
}

export interface BlendshapeSpec {
  readonly id: string;
  readonly regionId: string;
  readonly minWeight: number;
  readonly maxWeight: number;
  readonly symmetricPartnerId?: string;
}

export interface RigCapabilities {
  readonly face: boolean;
  readonly body: boolean;
  readonly tail: boolean;
  readonly ears: boolean;
  readonly digitigrade: boolean;
  readonly hands: boolean;
  readonly paws: boolean;
}

export interface CharacterRigSchema {
  readonly schemaVersion: "character-rig/1.0";
  /** Honest status: deterministic fixture contract, not a production asset. */
  readonly status: "core-enforced-fixture-not-production-rig";
  readonly id: string;
  readonly species: Species;
  readonly bones: readonly BoneSpec[];
  readonly blendshapes: readonly BlendshapeSpec[];
  readonly capabilities: RigCapabilities;
}

export interface CharacterRigBinding {
  readonly characterId: string;
  readonly rigId: string;
  readonly sculptDocumentId: string;
}

/** Serializable registry shape; runtime implementations may index it as needed. */
export interface CharacterRigRegistry {
  readonly rigs: readonly CharacterRigSchema[];
  readonly bindings: readonly CharacterRigBinding[];
}

/** Lower-case SHA-256 hex digest. Runtime validation enforces its shape. */
export type Sha256Digest = string;

export interface SkinMaterialRegion {
  readonly id: string;
  readonly sculptRegionId: string;
  readonly materialId: string;
}

export interface SkinTextureReference {
  /** URI, content-address, or governed asset registry reference. */
  readonly assetRef: string;
  readonly digest: Sha256Digest;
  readonly mimeType: "image/png" | "image/jpeg" | "image/webp" | "image/ktx2";
  readonly colorSpace: "srgb" | "linear";
}

/**
 * Surface channels only. Height and displacement are deliberately not part of
 * this contract, so a skin cannot silently alter the governed anatomy.
 */
export interface SkinTextureChannels {
  readonly baseColor: SkinTextureReference;
  readonly celShade: SkinTextureReference;
  readonly normalDetail: SkinTextureReference;
  readonly roughness: SkinTextureReference;
  readonly fur?: SkinTextureReference;
  readonly marking?: SkinTextureReference;
  readonly opacity?: SkinTextureReference;
}

export interface SkinGenerationProvenance {
  readonly method: "operator-authored" | "governed-model" | "procedural-bake";
  readonly generatorId: string;
  readonly generatorVersion: string;
  readonly authorityRef: string;
  readonly rightsRef: string;
  readonly inputDigests: readonly Sha256Digest[];
  readonly promptDigest?: Sha256Digest;
}

/** Governed whole-body appearance bound to one immutable rig/sculpt topology. */
export interface SkinLayer {
  readonly schemaVersion: "sovereign-skin-layer/1.0";
  readonly id: string;
  readonly version: string;
  readonly bodyCoverage: "whole-body";
  readonly rigId: string;
  readonly sculptDocumentId: string;
  readonly topologyDigest: Sha256Digest;
  readonly uvDigest: Sha256Digest;
  readonly materialRegions: readonly SkinMaterialRegion[];
  readonly textureChannels: SkinTextureChannels;
  readonly generationProvenance: SkinGenerationProvenance;
  readonly surfaceOnly: true;
  readonly anatomyMutationAllowed: false;
}

export interface SkinValidationIssue {
  readonly code: string;
  readonly message: string;
  readonly path?: string;
}

export interface SkinValidationResult {
  readonly ok: boolean;
  readonly issues: readonly SkinValidationIssue[];
}

export interface SculptVertex {
  readonly id: string;
  readonly position: Vec3;
}

export interface SculptTriangle {
  readonly id: string;
  readonly vertexIndices: readonly [number, number, number];
  readonly regionId: string;
}

export interface SculptRegion {
  readonly id: string;
  readonly vertexIndices: readonly number[];
}

/** Weights are aligned with SculptDocument.vertices. */
export interface SculptMask {
  readonly id: string;
  readonly weights: readonly number[];
}

export interface SculptOperationRecord {
  readonly id: string;
  readonly kind: SculptOperation["kind"] | "lock-topology";
  readonly operationHash: string;
}

export interface SculptDocument {
  readonly schemaVersion: "sovereign-sculpt/1.0";
  /** Core math is enforced; the document is not a production sculpt fixture. */
  readonly status: "core-enforced-fixture-not-production-sculpt";
  readonly id: string;
  readonly species: Species;
  /** Retopology is permitted only during authoring; export/runtime requires locked. */
  readonly topologyState: "authoring" | "locked";
  readonly topologyRevision: number;
  /** Digest of the topology immediately before the most recent subdivision. */
  readonly parentTopologyDigest?: Sha256Digest;
  readonly identity: IdentityMetadata;
  readonly morphologyProfile: MorphologyProfile;
  readonly vertices: readonly SculptVertex[];
  readonly triangles: readonly SculptTriangle[];
  readonly regions: readonly SculptRegion[];
  readonly masks: readonly SculptMask[];
  readonly operationLog: readonly SculptOperationRecord[];
}

export type SculptSymmetry = "none" | "x";
export type SoftSelectionFalloff = "linear" | "smoothstep";

/** Selection filters combine multiplicatively. With no filters, all weights are 1. */
export interface SoftSelection {
  readonly vertexWeights?: readonly number[];
  readonly maskId?: string;
  readonly regionIds?: readonly string[];
  readonly center?: Vec3;
  readonly radius?: number;
  readonly falloff?: SoftSelectionFalloff;
  readonly strength?: number;
}

interface SculptOperationBase {
  readonly id: string;
  readonly selection?: SoftSelection;
  readonly symmetry?: SculptSymmetry;
}

export interface MoveOperation extends SculptOperationBase {
  readonly kind: "move";
  readonly delta: Vec3;
}

export interface ScaleOperation extends SculptOperationBase {
  readonly kind: "scale";
  readonly factors: Vec3;
  readonly pivot?: Vec3;
}

export interface RotateOperation extends SculptOperationBase {
  readonly kind: "rotate";
  /** Deterministic intrinsic XYZ Euler rotation in radians. */
  readonly radians: Vec3;
  readonly pivot?: Vec3;
}

export interface MaskOperation extends SculptOperationBase {
  readonly kind: "mask";
  readonly maskId: string;
  readonly mode: "set" | "add" | "subtract";
  readonly value: number;
}

export interface SubdivideOperation extends SculptOperationBase {
  readonly kind: "subdivide";
  /** A triangle is selected when its mean soft-selection weight meets this value. */
  readonly threshold?: number;
}

export type SculptOperation =
  | MoveOperation
  | ScaleOperation
  | RotateOperation
  | MaskOperation
  | SubdivideOperation;

export interface SculptValidationIssue {
  readonly code: string;
  readonly message: string;
  readonly path?: string;
}

export interface SculptValidationResult {
  readonly ok: boolean;
  readonly issues: readonly SculptValidationIssue[];
}

export interface RigValidationIssue {
  readonly code: string;
  readonly message: string;
  readonly path?: string;
}

export interface RigValidationResult {
  readonly ok: boolean;
  readonly issues: readonly RigValidationIssue[];
}

export type RigFactory = () => CharacterRigSchema;
