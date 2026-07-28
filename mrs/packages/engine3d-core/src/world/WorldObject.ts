export type WorldObjectKind = "primitive" | "mesh" | "rig" | "light" | "camera" | "group";
export type PrimitiveType = "sphere" | "box" | "plane" | "cylinder" | "torus" | "capsule" | "cone" | "pyramid" | "icosphere" | "superquadric";
export type MaterialType =
  | "basic"
  | "metal"
  | "glass"
  | "emissive"
  | "skin"
  | "hair"
  | "cloth"
  | "plastic"
  | "wood"
  | "stone"
  | "neon-grid"
  | "mandala-core"
  | "tesseract-surface"
  | "sovereign-glyph"
  | "energy-lattice";

export type TextureRole = "color" | "roughness" | "normal" | "emissive" | "metallic" | "ao";
export type TextureFormat = "rgba8" | "rgb8" | "linear-r8" | "linear-rg8" | "normal-rgb8" | "hdr-rgba16f";
export type TextureColorSpace = "srgb" | "linear";
export type LightType = "directional" | "point" | "spot" | "area" | "environment";
export type CameraType = "perspective" | "orthographic" | "portrait" | "wide" | "macro";
export type EnvironmentPreset = "studio" | "void" | "mandala" | "cosmic" | "city" | "star";
export type GovernedAssetKind = "rig" | "mesh" | "texture" | "material" | "world" | "environment";

export type Vec3Tuple = readonly [number, number, number];
export type QuatTuple = readonly [number, number, number, number];

export interface Transform {
  readonly position: Vec3Tuple;
  readonly rotation: Vec3Tuple | QuatTuple;
  readonly scale: Vec3Tuple;
}

export interface GeometryRef {
  readonly primitiveType?: PrimitiveType;
  readonly meshId?: string;
  readonly rigId?: string;
  readonly sdfId?: string;
  readonly sdfParams?: Readonly<Record<string, number>>;
  readonly instanceOf?: string;
}

export interface MaterialRef {
  readonly materialId: string;
}

export interface TextureRef {
  readonly id: string;
  readonly role: TextureRole;
}

export interface TextureAsset {
  readonly id: string;
  readonly uri?: string;
  readonly embeddedBytes?: Uint8Array;
  readonly decodedPixels?: Uint8Array;
  readonly role?: TextureRole;
  readonly width: number;
  readonly height: number;
  readonly format: TextureFormat;
  readonly colorSpace: TextureColorSpace;
  readonly checksum: string;
  readonly sampler?: {
    readonly wrapS?: "repeat" | "clamp-to-edge" | "mirror-repeat";
    readonly wrapT?: "repeat" | "clamp-to-edge" | "mirror-repeat";
    readonly minFilter?: "nearest" | "linear" | "mipmap-linear";
    readonly magFilter?: "nearest" | "linear";
  };
}

export interface UniversalMaterial {
  readonly id: string;
  readonly type: MaterialType;
  readonly baseColor: Vec3Tuple;
  readonly roughness: number;
  readonly metallic: number;
  readonly emissive: Vec3Tuple;
  readonly textureRefs: readonly TextureRef[];
}

export interface StaticMeshAsset {
  readonly id: string;
  readonly vertices: Float32Array;
  readonly normals?: Float32Array;
  readonly uvs?: Float32Array;
  readonly indices: Uint16Array | Uint32Array;
  readonly materialId: string;
  readonly bounds?: {
    readonly min: Vec3Tuple;
    readonly max: Vec3Tuple;
  };
}

export interface LightParams {
  readonly type: LightType;
  readonly color: Vec3Tuple;
  readonly intensity: number;
  readonly direction?: Vec3Tuple;
  readonly range?: number;
  readonly coneAngle?: number;
  readonly radius?: number;
  readonly width?: number;
  readonly height?: number;
  readonly softness?: number;
  readonly shadowBias?: number;
}

export interface CameraParams {
  readonly type: CameraType;
  readonly fovY?: number;
  readonly orthographicHeight?: number;
  readonly focalLengthMm?: number;
  readonly apertureF?: number;
  readonly focusDistance?: number;
  readonly target?: Vec3Tuple;
  readonly exposure?: number;
  readonly shutterSeconds?: number;
  readonly motionBlur?: boolean;
  readonly bokehBlades?: number;
  readonly chromaticAberration?: number;
  readonly motionPathId?: string;
}

export interface EnvironmentParams {
  readonly preset: EnvironmentPreset;
  readonly intensity: number;
  readonly color: Vec3Tuple;
  readonly rotation?: number;
  readonly hdriTextureId?: string;
  readonly proceduralSeed?: number;
  readonly horizonBlend?: number;
}

export interface GovernedAssetManifest {
  readonly id: string;
  readonly kind: GovernedAssetKind;
  readonly version: string;
  readonly contentHash: string;
  readonly uri?: string;
  readonly provenance?: {
    readonly author?: string;
    readonly createdAt?: string;
    readonly modifiedAt?: string;
    readonly source?: string;
    readonly algorithmId?: string;
    readonly integrityHash?: string;
    readonly catalogVersion?: string;
  };
  readonly tags?: readonly string[];
}

export interface AssetProvenanceRecord {
  readonly assetId: string;
  readonly kind: GovernedAssetKind;
  readonly source: {
    readonly type: "file" | "generated" | "imported";
    readonly uri?: string;
    readonly originalHash?: string;
  };
  readonly transforms: readonly {
    readonly type: string;
    readonly timestamp: string;
    readonly details: Readonly<Record<string, unknown>>;
  }[];
  readonly usage: readonly {
    readonly worldId: string;
    readonly sceneId?: string;
    readonly frameRange?: readonly [number, number];
  }[];
}

export interface WorldGeneratorParams {
  readonly id: string;
  readonly type: EnvironmentPreset;
  readonly seed: number;
  readonly params: Readonly<Record<string, number>>;
}

export interface WorldObject {
  readonly id: string;
  readonly kind: WorldObjectKind;
  readonly transform: Transform;
  readonly geometry: GeometryRef | null;
  readonly material: MaterialRef | null;
  readonly children: readonly WorldObject[];
  readonly light?: LightParams;
  readonly camera?: CameraParams;
}

export interface Engine3DWorldDocument {
  readonly schemaVersion: "engine3d-world/1.0";
  readonly id: string;
  readonly objects: readonly WorldObject[];
  readonly materials: readonly UniversalMaterial[];
  readonly textures?: readonly TextureAsset[];
  readonly meshes?: readonly StaticMeshAsset[];
  readonly environment?: EnvironmentParams;
  readonly assets?: readonly GovernedAssetManifest[];
  readonly assetProvenance?: readonly AssetProvenanceRecord[];
  readonly generator?: WorldGeneratorParams;
  readonly lights: readonly WorldObject[];
  readonly cameras: readonly WorldObject[];
  readonly activeCameraId: string;
}

export const DEFAULT_TRANSFORM: Transform = Object.freeze({
  position: [0, 0, 0] as const,
  rotation: [0, 0, 0] as const,
  scale: [1, 1, 1] as const,
});

export function createWorldObject(args: Omit<WorldObject, "transform" | "children"> & Partial<Pick<WorldObject, "transform" | "children">>): WorldObject {
  return {
    ...args,
    transform: args.transform ?? DEFAULT_TRANSFORM,
    children: args.children ?? [],
  };
}

export function createUniversalMaterial(args: Partial<UniversalMaterial> & Pick<UniversalMaterial, "id" | "type">): UniversalMaterial {
  return {
    id: args.id,
    type: args.type,
    baseColor: args.baseColor ?? [0.8, 0.8, 0.8],
    roughness: args.roughness ?? 0.7,
    metallic: args.metallic ?? 0,
    emissive: args.emissive ?? [0, 0, 0],
    textureRefs: args.textureRefs ?? [],
  };
}
