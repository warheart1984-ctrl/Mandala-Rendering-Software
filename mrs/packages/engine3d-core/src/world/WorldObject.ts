export type WorldObjectKind = "primitive" | "mesh" | "rig" | "light" | "camera" | "group";

/**
 * Constitutional object type for world-profile → CKL (partial).
 * Maps to policy IDs world.terrain | world.architecture | world.water |
 * world.plant | world.synthetic | world.biogeometric.
 */
export type WorldObjectType =
  | "human"
  | "terrain"
  | "architecture"
  | "water"
  | "plant"
  | "synthetic"
  | "biogeometric"
  | "prop"
  | "material"
  | "unknown";

export interface WorldEntityParentContext {
  readonly objectId?: string;
  readonly scaleClass?: string;
  readonly objectType?: WorldObjectType | string;
}

export interface WorldEntityWorldContext {
  readonly worldId?: string;
  readonly worldProfileId?: string;
  readonly worldScaleClass?: string;
  readonly biomeTag?: string;
}

export interface WorldEntityTerrainContext {
  readonly profileId?: string;
  readonly worldScaleClass?: string;
  readonly landmarkMeters?: number;
}

export interface WorldEntityArchitecturalContext {
  readonly profileId?: string;
  readonly worldScaleClass?: string;
  readonly moduleScale?: number;
}

export interface WorldEntityMaterialContext {
  readonly materialId?: string;
  readonly profileId?: string;
  readonly worldScaleClass?: string;
  readonly roughnessProxy?: number;
}

/**
 * Enough context for Amendment VII/VIII Apply / CKL world-profile gates.
 * Status: **partial**
 */
export interface WorldEntityContext {
  /** Preferred: object type for world.* policy mapping */
  readonly objectType?: WorldObjectType | string;
  /** Alias: object.type */
  readonly type?: WorldObjectType | string;
  readonly worldProfileId?: string;
  readonly scaleClass?: string;
  readonly worldContext?: WorldEntityWorldContext;
  readonly parentContext?: WorldEntityParentContext;
  readonly terrainContext?: WorldEntityTerrainContext;
  readonly architecturalContext?: WorldEntityArchitecturalContext;
  readonly architectureContext?: WorldEntityArchitecturalContext;
  readonly materialContext?: WorldEntityMaterialContext;
}

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
  /** World-profile → CKL context (object type, parent/world/terrain/arch). Status: partial. */
  readonly entityContext?: WorldEntityContext;
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
  /** Document-level world-profile context for ecological inheritance / CKL. Status: partial. */
  readonly worldContext?: WorldEntityWorldContext;
}

/** Map entityContext.objectType → CKL world.* policy id. */
export function worldProfileIdForObjectType(
  objectType: WorldObjectType | string | undefined | null,
): string | null {
  const t = String(objectType ?? "")
    .trim()
    .toLowerCase();
  const map: Record<string, string> = {
    biogeometric: "world.biogeometric",
    terrain: "world.terrain",
    geological: "world.terrain",
    architecture: "world.architecture",
    architectural: "world.architecture",
    building: "world.architecture",
    water: "world.water",
    fluid: "world.water",
    plant: "world.plant",
    flora: "world.plant",
    biological: "world.plant",
    tree: "world.plant",
    synthetic: "world.synthetic",
    prop: "world.synthetic",
    material: "world.material",
  };
  return map[t] ?? null;
}

/** Flatten a WorldObject (+ optional parent/doc) into CKL world-entity evidence shape. */
export function toWorldEntityForCkl(
  obj: WorldObject,
  args?: {
    readonly parent?: WorldObject | null;
    readonly worldDoc?: Engine3DWorldDocument | null;
  },
): {
  id: string;
  objectType?: string;
  type?: string;
  worldProfileId?: string | null;
  scaleClass?: string | null;
  worldContext?: WorldEntityWorldContext;
  parentContext?: WorldEntityParentContext;
  terrainContext?: WorldEntityTerrainContext;
  architecturalContext?: WorldEntityArchitecturalContext;
  architectureContext?: WorldEntityArchitecturalContext;
  materialContext?: WorldEntityMaterialContext;
} {
  const ec = obj.entityContext;
  const parentEc = args?.parent?.entityContext;
  const docCtx = args?.worldDoc?.worldContext;
  const objectType = ec?.objectType ?? ec?.type;
  const worldProfileId =
    ec?.worldProfileId ??
    worldProfileIdForObjectType(objectType) ??
    docCtx?.worldProfileId ??
    null;
  const arch = ec?.architectureContext ?? ec?.architecturalContext;
  return {
    id: obj.id,
    objectType: objectType ? String(objectType) : undefined,
    type: objectType ? String(objectType) : undefined,
    worldProfileId,
    scaleClass: ec?.scaleClass ?? null,
    worldContext: ec?.worldContext ?? docCtx,
    parentContext:
      ec?.parentContext ??
      (parentEc
        ? {
            objectId: args?.parent?.id,
            scaleClass: parentEc.scaleClass,
            objectType: parentEc.objectType ?? parentEc.type,
          }
        : undefined),
    terrainContext: ec?.terrainContext,
    architecturalContext: arch,
    architectureContext: arch,
    materialContext: ec?.materialContext,
  };
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
