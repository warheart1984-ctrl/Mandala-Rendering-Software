import type {
  HumanBone,
  HumanMaterials,
  HumanMeshRef,
  HumanMeshes,
  HumanRig,
  HumanRigMaterialType,
  HumanRigMeshRole,
  Mat4Tuple,
  Muscle,
  MuscleRig,
  Pose,
  PoseLibrary,
  SoftTissueRegion,
  MorphChannel,
  FacialRig,
  FacialCurve,
} from "./HumanRigTypes.js";
import { IDENTITY_MAT4, mat4 } from "./mat4.js";
import { validateHumanRig } from "./HumanRigValidator.js";

type Gltf = {
  asset?: unknown;
  buffers?: { byteLength: number }[];
  bufferViews?: { buffer?: number; byteOffset?: number; byteLength: number; byteStride?: number }[];
  accessors?: { bufferView?: number; byteOffset?: number; componentType: number; count: number; type: string }[];
  nodes?: { name?: string; children?: number[]; matrix?: number[]; mesh?: number; skin?: number; extras?: Record<string, unknown> }[];
  skins?: { joints: number[]; inverseBindMatrices?: number; skeleton?: number }[];
  meshes?: {
    name?: string;
    primitives: {
      attributes: Record<string, number>;
      indices?: number;
      material?: number;
      targets?: (Record<string, number> & { extras?: Record<string, unknown> })[];
      extras?: Record<string, unknown>;
    }[];
    extras?: Record<string, unknown>;
  }[];
  materials?: { name?: string; extras?: Record<string, unknown>; pbrMetallicRoughness?: { baseColorFactor?: number[]; roughnessFactor?: number; metallicFactor?: number }; emissiveFactor?: number[] }[];
  animations?: { name?: string; extras?: Record<string, unknown> }[];
};

const GLB_MAGIC = 0x46546c67;
const JSON_CHUNK = 0x4e4f534a;
const BIN_CHUNK = 0x004e4942;

const COMPONENT_BYTE_SIZE: Record<number, number> = {
  5120: 1,
  5121: 1,
  5122: 2,
  5123: 2,
  5125: 4,
  5126: 4,
};

const TYPE_COMPONENTS: Record<string, number> = {
  SCALAR: 1,
  VEC2: 2,
  VEC3: 3,
  VEC4: 4,
  MAT4: 16,
};

export interface HumanRigLoadOptions {
  readonly id?: string;
  readonly validate?: boolean;
}

function asBytes(input: ArrayBuffer | Uint8Array): Uint8Array {
  return input instanceof Uint8Array ? input : new Uint8Array(input);
}

function readU32(view: DataView, offset: number): number {
  return view.getUint32(offset, true);
}

function parseGlb(input: ArrayBuffer | Uint8Array): { gltf: Gltf; bin: Uint8Array } {
  const bytes = asBytes(input);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (bytes.byteLength < 20 || readU32(view, 0) !== GLB_MAGIC) throw new Error("Invalid GLB: missing magic header");
  const version = readU32(view, 4);
  if (version !== 2) throw new Error(`Unsupported GLB version ${version}`);
  const totalLength = readU32(view, 8);
  if (totalLength > bytes.byteLength) throw new Error("Invalid GLB: declared length exceeds input length");

  let offset = 12;
  let json: Gltf | null = null;
  let bin: Uint8Array | null = null;
  const decoder = new TextDecoder();

  while (offset + 8 <= totalLength) {
    const chunkLength = readU32(view, offset);
    const chunkType = readU32(view, offset + 4);
    offset += 8;
    const chunk = bytes.subarray(offset, offset + chunkLength);
    offset += chunkLength;
    if (chunkType === JSON_CHUNK) json = JSON.parse(decoder.decode(chunk).trim()) as Gltf;
    if (chunkType === BIN_CHUNK) bin = chunk;
  }

  if (!json) throw new Error("Invalid GLB: missing JSON chunk");
  if (!bin) throw new Error("Invalid GLB: missing BIN chunk");
  return { gltf: json, bin };
}

function componentReader(view: DataView, componentType: number, byteOffset: number): number {
  switch (componentType) {
    case 5120: return view.getInt8(byteOffset);
    case 5121: return view.getUint8(byteOffset);
    case 5122: return view.getInt16(byteOffset, true);
    case 5123: return view.getUint16(byteOffset, true);
    case 5125: return view.getUint32(byteOffset, true);
    case 5126: return view.getFloat32(byteOffset, true);
    default: throw new Error(`Unsupported accessor componentType ${componentType}`);
  }
}

function readAccessor(gltf: Gltf, bin: Uint8Array, accessorIndex: number): number[] {
  const accessor = gltf.accessors?.[accessorIndex];
  if (!accessor) throw new Error(`Missing accessor ${accessorIndex}`);
  const componentSize = COMPONENT_BYTE_SIZE[accessor.componentType];
  const components = TYPE_COMPONENTS[accessor.type];
  if (!componentSize || !components) throw new Error(`Unsupported accessor ${accessorIndex} layout`);
  if (accessor.bufferView == null) throw new Error(`Accessor ${accessorIndex} has no bufferView`);
  const bufferView = gltf.bufferViews?.[accessor.bufferView];
  if (!bufferView) throw new Error(`Missing bufferView ${accessor.bufferView}`);
  if ((bufferView.buffer ?? 0) !== 0) throw new Error("HumanRig GLB v1 supports one BIN buffer only");
  const stride = bufferView.byteStride ?? componentSize * components;
  const base = (bufferView.byteOffset ?? 0) + (accessor.byteOffset ?? 0);
  const dataView = new DataView(bin.buffer, bin.byteOffset, bin.byteLength);
  const out: number[] = [];
  for (let element = 0; element < accessor.count; element++) {
    const elementOffset = base + element * stride;
    for (let c = 0; c < components; c++) {
      out.push(componentReader(dataView, accessor.componentType, elementOffset + c * componentSize));
    }
  }
  return out;
}

function nodeParentMap(nodes: NonNullable<Gltf["nodes"]>): Map<number, number> {
  const parents = new Map<number, number>();
  for (const [parentIndex, node] of nodes.entries()) {
    for (const child of node.children ?? []) parents.set(child, parentIndex);
  }
  return parents;
}

function materialType(material: NonNullable<Gltf["materials"]>[number] | undefined): HumanRigMaterialType | null {
  const value = material?.extras?.["humanRigMaterialType"];
  return typeof value === "string" ? value as HumanRigMaterialType : null;
}

function meshRole(mesh: NonNullable<Gltf["meshes"]>[number], node?: NonNullable<Gltf["nodes"]>[number]): HumanRigMeshRole | null {
  const value = node?.extras?.["humanRigMeshRole"] ?? mesh.extras?.["humanRigMeshRole"];
  return typeof value === "string" ? value as HumanRigMeshRole : null;
}

function meshSkinId(mesh: NonNullable<Gltf["meshes"]>[number], node?: NonNullable<Gltf["nodes"]>[number]): string | undefined {
  const value = node?.extras?.["humanRigMeshSkinId"] ?? mesh.extras?.["humanRigMeshSkinId"];
  return typeof value === "string" ? value : undefined;
}

function extractCapabilities(gltf: Gltf): HumanRig["capabilities"] {
  const caps = (gltf.nodes ?? [])
    .map((node) => node.extras?.["humanRigCapabilities"])
    .find((value): value is Record<string, unknown> => Boolean(value) && typeof value === "object" && !Array.isArray(value));
  return {
    morphTargets: caps?.["morphTargets"] === true,
    multiSkin: caps?.["multiSkin"] === true || (gltf.skins?.length ?? 0) > 1,
    ...(caps?.["muscleRig"] === true ? { muscleRig: true } : {}),
    ...(caps?.["skinSliding"] === true ? { skinSliding: true } : {}),
    ...(caps?.["microMotion"] === true ? { microMotion: true } : {}),
    ...(caps?.["softTissueSimulation"] === true ? { softTissueSimulation: true } : {}),
    ...(caps?.["sceneBridgeFederation"] === true ? { sceneBridgeFederation: true } : {}),
  };
}

function firstNodeExtraArray(gltf: Gltf, key: string): unknown[] {
  const raw = (gltf.nodes ?? [])
    .map((node) => node.extras?.[key])
    .find((value) => Array.isArray(value));
  return Array.isArray(raw) ? raw : [];
}

function finiteNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function extractMuscleRig(gltf: Gltf): MuscleRig | undefined {
  const rawMuscles = firstNodeExtraArray(gltf, "humanRigMuscles");
  const rawRegions = firstNodeExtraArray(gltf, "humanRigSoftTissue");
  if (!rawMuscles.length && !rawRegions.length) return undefined;

  const muscles: Muscle[] = [];
  for (const item of rawMuscles) {
    if (!item || typeof item !== "object" || Array.isArray(item)) continue;
    const obj = item as Record<string, unknown>;
    const id = typeof obj["id"] === "string" ? obj["id"] : undefined;
    const originBoneId = typeof obj["originBoneId"] === "string" ? obj["originBoneId"] : undefined;
    const insertionBoneId = typeof obj["insertionBoneId"] === "string" ? obj["insertionBoneId"] : undefined;
    const activationCurveId = typeof obj["activationCurveId"] === "string" ? obj["activationCurveId"] : undefined;
    const influenceRegionId = typeof obj["influenceRegionId"] === "string" ? obj["influenceRegionId"] : undefined;
    const rawDirection = Array.isArray(obj["direction"]) && obj["direction"].length === 3
      ? obj["direction"].map(finiteNumber) as [number | undefined, number | undefined, number | undefined]
      : undefined;
    let direction: readonly [number, number, number] | undefined;
    if (rawDirection != null) {
      const [dx, dy, dz] = rawDirection;
      if (dx != null && dy != null && dz != null) direction = [dx, dy, dz];
    }
    if (!id || !originBoneId || !insertionBoneId || !activationCurveId || !influenceRegionId) continue;
    muscles.push({
      id,
      originBoneId,
      insertionBoneId,
      activationCurveId,
      influenceRegionId,
      ...(direction ? { direction } : {}),
    });
  }

  const regions: SoftTissueRegion[] = [];
  for (const item of rawRegions) {
    if (!item || typeof item !== "object" || Array.isArray(item)) continue;
    const obj = item as Record<string, unknown>;
    const id = typeof obj["id"] === "string" ? obj["id"] : undefined;
    const vertexIndices = Array.isArray(obj["vertexIndices"])
      ? obj["vertexIndices"].filter((value): value is number => Number.isInteger(value) && value >= 0)
      : [];
    const stiffness = finiteNumber(obj["stiffness"]);
    const damping = finiteNumber(obj["damping"]);
    if (!id || !vertexIndices.length || stiffness == null || damping == null) continue;
    regions.push({ id, vertexIndices, stiffness, damping });
  }

  return muscles.length || regions.length ? { muscles, regions } : undefined;
}

function extractFacialRig(gltf: Gltf): FacialRig | undefined {
  const raw = (gltf.nodes ?? [])
    .map((node) => node.extras?.["humanRigFacialCurves"])
    .find((value) => Array.isArray(value));
  if (!Array.isArray(raw)) return undefined;
  const curves: FacialCurve[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object" || Array.isArray(item)) continue;
    const obj = item as Record<string, unknown>;
    const id = typeof obj["id"] === "string" ? obj["id"] : undefined;
    const targets = Array.isArray(obj["targets"]) ? obj["targets"].filter((value): value is string => typeof value === "string") : [];
    const keyframes = Array.isArray(obj["keyframes"])
      ? obj["keyframes"].flatMap((keyframe) => {
          if (!keyframe || typeof keyframe !== "object" || Array.isArray(keyframe)) return [];
          const k = keyframe as Record<string, unknown>;
          const time = typeof k["time"] === "number" ? k["time"] : undefined;
          const weights = k["weights"];
          if (time == null || !weights || typeof weights !== "object" || Array.isArray(weights)) return [];
          const cleanWeights: Record<string, number> = {};
          for (const [morphId, weight] of Object.entries(weights as Record<string, unknown>)) {
            if (typeof weight === "number" && Number.isFinite(weight)) cleanWeights[morphId] = weight;
          }
          return [{ time, weights: cleanWeights }];
        })
      : [];
    if (id && keyframes.length) curves.push({ id, targets, keyframes });
  }
  return curves.length ? { curves } : undefined;
}

function buildSkeleton(gltf: Gltf, bin: Uint8Array): { skeleton: HumanRig["skeleton"]; skin: NonNullable<Gltf["skins"]>[number] } {
  const nodes = gltf.nodes ?? [];
  const skin = gltf.skins?.[0];
  if (!skin) throw new Error("HumanRig GLB requires at least one skin");
  const inverseBindValues = skin.inverseBindMatrices != null
    ? readAccessor(gltf, bin, skin.inverseBindMatrices)
    : skin.joints.flatMap(() => Array.from(IDENTITY_MAT4));
  const parents = nodeParentMap(nodes);
  const jointSet = new Set(skin.joints);
  const bones: HumanBone[] = skin.joints.map((jointIndex, i) => {
    const node = nodes[jointIndex];
    if (!node) throw new Error(`Skin joint ${jointIndex} does not reference a node`);
    if (node.extras?.["humanRigBone"] !== true) throw new Error(`Node ${node.name ?? jointIndex} missing extras.humanRigBone`);
    const parentIndex = parents.get(jointIndex);
    const parentNode = parentIndex != null && jointSet.has(parentIndex) ? nodes[parentIndex] : undefined;
    return {
      id: node.name ?? `bone_${jointIndex}`,
      parentId: parentNode ? parentNode.name ?? `bone_${parentIndex}` : null,
      localTransform: mat4(node.matrix ?? IDENTITY_MAT4),
      inverseBind: mat4(inverseBindValues.slice(i * 16, i * 16 + 16)),
    };
  });
  return { skeleton: { bones, rootBoneId: bones[0]?.id ?? "" }, skin };
}

function toMaterialRef(material: NonNullable<Gltf["materials"]>[number] | undefined): { materialId: string; type: HumanRigMaterialType } | null {
  const type = materialType(material);
  if (!material || !type) return null;
  return { materialId: material.name ?? type, type };
}

function extractMaterials(gltf: Gltf): HumanMaterials {
  const all = (gltf.materials ?? [])
    .map(toMaterialRef)
    .filter((value): value is { materialId: string; type: HumanRigMaterialType } => value !== null)
    .map((value) => ({ materialId: value.materialId, type: value.type }));
  return {
    skin: all.find((mat) => mat.type === "skin"),
    hair: all.find((mat) => mat.type === "hair"),
    eyes: all.find((mat) => mat.type === "eyes"),
    clothing: all.filter((mat) => mat.type === "cloth"),
    accessories: all.filter((mat) => mat.type === "metal" || mat.type === "glass"),
    all,
  };
}

function morphIdForTarget(primitive: NonNullable<Gltf["meshes"]>[number]["primitives"][number], target: Record<string, unknown>, index: number): string {
  const direct = target["extras"];
  if (direct && typeof direct === "object" && !Array.isArray(direct)) {
    const id = (direct as Record<string, unknown>)["humanRigMorphId"];
    if (typeof id === "string") return id;
  }
  const ids = primitive.extras?.["humanRigMorphIds"];
  if (Array.isArray(ids) && typeof ids[index] === "string") return ids[index];
  return `morph_${index}`;
}

function extractMorphChannels(gltf: Gltf, bin: Uint8Array, primitive: NonNullable<Gltf["meshes"]>[number]["primitives"][number]): MorphChannel[] {
  const channels: MorphChannel[] = [];
  for (const [index, target] of (primitive.targets ?? []).entries()) {
    const positionAccessor = target["POSITION"];
    if (typeof positionAccessor !== "number") continue;
    const normalAccessor = target["NORMAL"];
    channels.push({
      id: morphIdForTarget(primitive, target, index),
      positionDeltas: new Float32Array(readAccessor(gltf, bin, positionAccessor)),
      normalDeltas: typeof normalAccessor === "number" ? new Float32Array(readAccessor(gltf, bin, normalAccessor)) : undefined,
    });
  }
  return channels;
}

function extractMeshes(gltf: Gltf, bin: Uint8Array): HumanMeshes {
  const nodes = gltf.nodes ?? [];
  const meshes: HumanMeshRef[] = [];
  for (const [nodeIndex, node] of nodes.entries()) {
    if (node.mesh == null) continue;
    const mesh = gltf.meshes?.[node.mesh];
    if (!mesh) continue;
    const role = meshRole(mesh, node);
    if (!role) continue;
    const skinId = meshSkinId(mesh, node);
    for (const [primIndex, primitive] of mesh.primitives.entries()) {
      const positionAccessor = primitive.attributes["POSITION"];
      const jointsAccessor = primitive.attributes["JOINTS_0"];
      const weightsAccessor = primitive.attributes["WEIGHTS_0"];
      if (positionAccessor == null) throw new Error(`HumanRig mesh ${mesh.name ?? nodeIndex} missing POSITION`);
      if (jointsAccessor == null) throw new Error(`HumanRig mesh ${mesh.name ?? nodeIndex} missing JOINTS_0`);
      if (weightsAccessor == null) throw new Error(`HumanRig mesh ${mesh.name ?? nodeIndex} missing WEIGHTS_0`);
      const material = gltf.materials?.[primitive.material ?? -1];
      const materialRef = toMaterialRef(material);
      if (!materialRef) throw new Error(`HumanRig mesh ${mesh.name ?? nodeIndex} primitive ${primIndex} missing tagged material`);
      const indices = primitive.indices != null ? readAccessor(gltf, bin, primitive.indices) : [];
      if (!indices.length) throw new Error(`HumanRig mesh ${mesh.name ?? nodeIndex} primitive ${primIndex} missing indices`);
      meshes.push({
        id: node.name ?? mesh.name ?? `mesh_${nodeIndex}_${primIndex}`,
        role,
        skinId,
        vertices: new Float32Array(readAccessor(gltf, bin, positionAccessor)),
        normals: primitive.attributes["NORMAL"] != null ? new Float32Array(readAccessor(gltf, bin, primitive.attributes["NORMAL"])) : undefined,
        indices: Math.max(...indices) > 65535 ? new Uint32Array(indices) : new Uint16Array(indices),
        skinWeights: new Float32Array(readAccessor(gltf, bin, weightsAccessor)),
        skinIndices: new Uint16Array(readAccessor(gltf, bin, jointsAccessor)),
        materialId: materialRef.materialId,
        morphChannels: extractMorphChannels(gltf, bin, primitive),
      });
    }
  }
  return {
    headMesh: meshes.find((mesh) => mesh.role === "head"),
    bodyMesh: meshes.find((mesh) => mesh.role === "body"),
    faceMesh: meshes.find((mesh) => mesh.role === "face") ?? null,
    hairMesh: meshes.find((mesh) => mesh.role === "hair") ?? null,
    clothingMeshes: meshes.filter((mesh) => mesh.role === "clothing"),
    accessoryMeshes: meshes.filter((mesh) => mesh.role === "accessory"),
    all: meshes,
  };
}

function extractPoses(gltf: Gltf): PoseLibrary {
  const poses: Pose[] = [];
  for (const clip of gltf.animations ?? []) {
    const poseId = clip.extras?.["humanRigPoseId"];
    poses.push({
      id: typeof poseId === "string" ? poseId : clip.name ?? `pose_${poses.length}`,
      boneTransforms: {},
      expressionParams: {},
      morphWeights: {},
      morphCurveIds: Array.isArray(clip.extras?.["humanRigMorphCurveIds"])
        ? (clip.extras["humanRigMorphCurveIds"] as unknown[]).filter((value): value is string => typeof value === "string")
        : [],
    });
  }
  return { poses };
}

export function loadHumanRigFromGlb(input: ArrayBuffer | Uint8Array, options: HumanRigLoadOptions = {}): HumanRig {
  const { gltf, bin } = parseGlb(input);
  const { skeleton } = buildSkeleton(gltf, bin);
  const capabilities = extractCapabilities(gltf);
  const facialRig = extractFacialRig(gltf);
  const muscleRig = extractMuscleRig(gltf);
  const rig: HumanRig = {
    id: options.id ?? "human-rig-glb",
    schemaVersion: capabilities.muscleRig ? "human-rig/3.0" : facialRig ? "human-rig/2.1" : capabilities.morphTargets || capabilities.multiSkin ? "human-rig/2.0" : "human-rig/1.0",
    capabilities,
    skeleton,
    meshes: extractMeshes(gltf, bin),
    materials: extractMaterials(gltf),
    poses: extractPoses(gltf),
    facialRig,
    muscleRig,
  };
  if (options.validate !== false) {
    const validation = validateHumanRig(rig);
    if (!validation.ok) {
      throw new Error(`Invalid HumanRig GLB: ${validation.issues.map((item) => item.code).join(", ")}`);
    }
  }
  return rig;
}

export class HumanRigLoader {
  loadFromGlb(input: ArrayBuffer | Uint8Array, options: HumanRigLoadOptions = {}): HumanRig {
    return loadHumanRigFromGlb(input, options);
  }
}
