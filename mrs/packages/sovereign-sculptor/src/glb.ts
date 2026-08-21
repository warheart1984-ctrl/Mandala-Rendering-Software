import type { CharacterRigSchema, SculptDocument } from "./types.js";
import { assertFiniteDeep, canonicalJson, sha256Canonical, sha256Hex } from "./canonical.js";

const GLB_MAGIC = 0x46546c67;
const GLB_VERSION = 2;
const JSON_CHUNK = 0x4e4f534a;
const BIN_CHUNK = 0x004e4942;
const COMPONENT_BYTES: Readonly<Record<number, number>> = {
  5120: 1, 5121: 1, 5122: 2, 5123: 2, 5125: 4, 5126: 4,
};
const TYPE_COMPONENTS: Readonly<Record<string, number>> = {
  SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT2: 4, MAT3: 9, MAT4: 16,
};
const UNSIGNED_COMPONENTS = new Set([5121, 5123, 5125]);

export type CharacterGlbProfile = "human" | "fox" | "anthro";

export interface GlbIntegrityDigests {
  readonly glbSha256: string;
  readonly meshSha256: string;
  readonly topologySha256: string;
  readonly vertexOrderSha256: string;
  readonly uvSha256: string;
  readonly armatureSha256: string;
  readonly blendshapeSha256: string;
  readonly materialSha256: string;
  readonly accessorSha256: Readonly<Record<string, string>>;
}

export interface GlbValidationIssue {
  readonly code: string;
  readonly message: string;
  readonly path?: string;
}

export interface GlbPrimitiveInspection {
  readonly id: string;
  readonly meshIndex: number;
  readonly primitiveIndex: number;
  readonly vertexCount: number;
  readonly indexCount: number;
  readonly vertexIds: readonly string[];
  readonly morphIds: readonly string[];
  readonly materialId: string;
  readonly positionSha256: string;
  readonly indexSha256: string;
  readonly uvSha256: string;
}

export interface GlbInspection {
  readonly ok: boolean;
  readonly species: CharacterGlbProfile | null;
  readonly status: string | null;
  readonly issues: readonly GlbValidationIssue[];
  readonly primitives: readonly GlbPrimitiveInspection[];
  readonly boneIds: readonly string[];
  readonly materialIds: readonly string[];
  readonly digests: GlbIntegrityDigests;
  readonly json: Readonly<Record<string, unknown>>;
}

export interface GlbValidationOptions {
  readonly profile?: CharacterGlbProfile;
  readonly expectedDigests?: Partial<GlbIntegrityDigests>;
}

export interface GlbValidationResult {
  readonly ok: boolean;
  readonly issues: readonly GlbValidationIssue[];
  readonly inspection?: GlbInspection;
}

export interface SculptGlbFixture {
  readonly status: "core-enforced-fixture-not-production-glb";
  readonly document: SculptDocument;
  readonly rig: CharacterRigSchema;
  readonly documentSha256: string;
  readonly rigSha256: string;
  readonly sourceSha256: string;
}

export interface SculptGlbBundle {
  readonly fixture: SculptGlbFixture;
  readonly glb: Uint8Array;
  readonly inspection: GlbInspection;
}

type JsonRecord = Record<string, any>;

interface ParsedGlb {
  readonly gltf: JsonRecord;
  readonly bin: Uint8Array;
}

interface AccessorData {
  readonly values: readonly number[];
  readonly tightBytes: Uint8Array;
  readonly count: number;
  readonly type: string;
  readonly componentType: number;
  readonly components: number;
}

function issue(code: string, message: string, path?: string): GlbValidationIssue {
  return path ? { code, message, path } : { code, message };
}

function align4(value: number): number {
  return (value + 3) & ~3;
}

function concatBytes(parts: readonly Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((sum, part) => sum + part.byteLength, 0));
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.byteLength;
  }
  return out;
}

function u32(value: number): Uint8Array {
  const out = new Uint8Array(4);
  new DataView(out.buffer).setUint32(0, value, true);
  return out;
}

function encodeF32(values: readonly number[]): Uint8Array {
  const out = new Uint8Array(values.length * 4);
  const view = new DataView(out.buffer);
  values.forEach((value, index) => view.setFloat32(index * 4, value, true));
  return out;
}

function encodeU16(values: readonly number[]): Uint8Array {
  const out = new Uint8Array(values.length * 2);
  const view = new DataView(out.buffer);
  values.forEach((value, index) => view.setUint16(index * 2, value, true));
  return out;
}

function encodeU32(values: readonly number[]): Uint8Array {
  const out = new Uint8Array(values.length * 4);
  const view = new DataView(out.buffer);
  values.forEach((value, index) => view.setUint32(index * 4, value, true));
  return out;
}

function pad(bytes: Uint8Array, fill = 0): Uint8Array {
  const out = new Uint8Array(align4(bytes.byteLength));
  out.fill(fill);
  out.set(bytes);
  return out;
}

function calculateNormals(document: SculptDocument): number[] {
  const normals = new Array(document.vertices.length * 3).fill(0);
  for (const triangle of document.triangles) {
    const [ai, bi, ci] = triangle.vertexIndices;
    const a = document.vertices[ai]?.position;
    const b = document.vertices[bi]?.position;
    const c = document.vertices[ci]?.position;
    if (!a || !b || !c) throw new Error(`triangle ${triangle.id} references an unknown vertex`);
    const ab = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
    const ac = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
    const n = [
      ab[1] * ac[2] - ab[2] * ac[1],
      ab[2] * ac[0] - ab[0] * ac[2],
      ab[0] * ac[1] - ab[1] * ac[0],
    ];
    for (const vertexIndex of triangle.vertexIndices) {
      normals[vertexIndex * 3] += n[0];
      normals[vertexIndex * 3 + 1] += n[1];
      normals[vertexIndex * 3 + 2] += n[2];
    }
  }
  for (let index = 0; index < document.vertices.length; index++) {
    const offset = index * 3;
    const length = Math.hypot(normals[offset], normals[offset + 1], normals[offset + 2]);
    if (length > 1e-12) {
      normals[offset] /= length;
      normals[offset + 1] /= length;
      normals[offset + 2] /= length;
    } else {
      normals[offset + 1] = 1;
    }
  }
  return normals;
}

function calculateUvs(document: SculptDocument): number[] {
  const xs = document.vertices.map((vertex) => vertex.position[0]);
  const ys = document.vertices.map((vertex) => vertex.position[1]);
  const minX = Math.min(...xs), maxX = Math.max(...xs);
  const minY = Math.min(...ys), maxY = Math.max(...ys);
  const width = maxX - minX;
  const height = maxY - minY;
  return document.vertices.flatMap((vertex) => [
    width > 1e-12 ? (vertex.position[0] - minX) / width : 0.5,
    height > 1e-12 ? (vertex.position[1] - minY) / height : 0.5,
  ]);
}

function multiplyMat4(a: readonly number[], b: readonly number[]): number[] {
  const out = new Array(16).fill(0);
  for (let column = 0; column < 4; column++) {
    for (let row = 0; row < 4; row++) {
      for (let k = 0; k < 4; k++) out[column * 4 + row] += a[k * 4 + row] * b[column * 4 + k];
    }
  }
  return out;
}

function invertMat4(a: readonly number[]): number[] {
  const out = new Array(16).fill(0);
  const a00=a[0],a01=a[1],a02=a[2],a03=a[3],a10=a[4],a11=a[5],a12=a[6],a13=a[7];
  const a20=a[8],a21=a[9],a22=a[10],a23=a[11],a30=a[12],a31=a[13],a32=a[14],a33=a[15];
  const b00=a00*a11-a01*a10,b01=a00*a12-a02*a10,b02=a00*a13-a03*a10,b03=a01*a12-a02*a11;
  const b04=a01*a13-a03*a11,b05=a02*a13-a03*a12,b06=a20*a31-a21*a30,b07=a20*a32-a22*a30;
  const b08=a20*a33-a23*a30,b09=a21*a32-a22*a31,b10=a21*a33-a23*a31,b11=a22*a33-a23*a32;
  const determinant=b00*b11-b01*b10+b02*b09+b03*b08-b04*b07+b05*b06;
  if (!Number.isFinite(determinant) || Math.abs(determinant) < 1e-12) throw new Error("bone bind transform is not invertible");
  const d=1/determinant;
  out[0]=(a11*b11-a12*b10+a13*b09)*d; out[1]=(a02*b10-a01*b11-a03*b09)*d;
  out[2]=(a31*b05-a32*b04+a33*b03)*d; out[3]=(a22*b04-a21*b05-a23*b03)*d;
  out[4]=(a12*b08-a10*b11-a13*b07)*d; out[5]=(a00*b11-a02*b08+a03*b07)*d;
  out[6]=(a32*b02-a30*b05-a33*b01)*d; out[7]=(a20*b05-a22*b02+a23*b01)*d;
  out[8]=(a10*b10-a11*b08+a13*b06)*d; out[9]=(a01*b08-a00*b10-a03*b06)*d;
  out[10]=(a30*b04-a31*b02+a33*b00)*d; out[11]=(a21*b02-a20*b04-a23*b00)*d;
  out[12]=(a11*b07-a10*b09-a12*b06)*d; out[13]=(a00*b09-a01*b07+a02*b06)*d;
  out[14]=(a31*b01-a30*b03-a32*b00)*d; out[15]=(a20*b03-a21*b01+a22*b00)*d;
  return out;
}

function inverseBindMatrices(rig: CharacterRigSchema): number[] {
  const byId = new Map(rig.bones.map((bone) => [bone.id, bone]));
  const global = new Map<string, number[]>();
  const visiting = new Set<string>();
  const resolve = (id: string): number[] => {
    const cached = global.get(id);
    if (cached) return cached;
    const bone = byId.get(id);
    if (!bone) throw new Error(`unknown parent bone ${id}`);
    if (visiting.has(id)) throw new Error(`bone hierarchy cycle at ${id}`);
    visiting.add(id);
    const value = bone.parentId ? multiplyMat4(resolve(bone.parentId), bone.bindTransform) : Array.from(bone.bindTransform);
    visiting.delete(id);
    global.set(id, value);
    return value;
  };
  return rig.bones.flatMap((bone) => invertMat4(resolve(bone.id)));
}

function validateExportInputs(document: SculptDocument, rig: CharacterRigSchema): void {
  assertFiniteDeep(document);
  assertFiniteDeep(rig);
  if (document.topologyState !== "locked") {
    throw new Error("GLB export requires a topology-locked sculpt document");
  }
  if (document.species !== rig.species) throw new Error("document and rig species differ");
  if (!document.vertices.length) throw new Error("sculpt document has no vertices");
  if (!document.triangles.length) throw new Error("sculpt document has no triangles");
  if (!rig.bones.length) throw new Error("character rig has no bones");
  const vertexIds = new Set<string>();
  document.vertices.forEach((vertex, index) => {
    if (!vertex.id || vertexIds.has(vertex.id)) throw new Error(`invalid or duplicate vertex id at ${index}`);
    vertexIds.add(vertex.id);
  });
  const boneIds = new Set<string>();
  rig.bones.forEach((bone, index) => {
    if (!bone.id || boneIds.has(bone.id)) throw new Error(`invalid or duplicate bone id at ${index}`);
    boneIds.add(bone.id);
  });
  for (const bone of rig.bones) if (bone.parentId && !boneIds.has(bone.parentId)) throw new Error(`unknown parent bone ${bone.parentId}`);
  inverseBindMatrices(rig);
}

/** Deterministic GLB 2.0 exporter. Its generated geometry is explicitly a fixture, not a production sculpt. */
export function exportSculptDocumentToGlb(document: SculptDocument, rig: CharacterRigSchema): Uint8Array {
  validateExportInputs(document, rig);
  const positions = document.vertices.flatMap((vertex) => [...vertex.position]);
  const normals = calculateNormals(document);
  const uvs = calculateUvs(document);
  const indices = document.triangles.flatMap((triangle) => [...triangle.vertexIndices]);
  const joints = document.vertices.flatMap(() => [0, 0, 0, 0]);
  const weights = document.vertices.flatMap(() => [1, 0, 0, 0]);
  const morphDeltas = rig.blendshapes.map(() => new Array(document.vertices.length * 3).fill(0));
  const inverseBinds = inverseBindMatrices(rig);

  const bufferViews: JsonRecord[] = [];
  const accessors: JsonRecord[] = [];
  const binaryParts: Uint8Array[] = [];
  let byteOffset = 0;
  const addAccessor = (bytes: Uint8Array, componentType: number, count: number, type: string, target?: number): number => {
    const padded = pad(bytes);
    const bufferView = bufferViews.length;
    const view: JsonRecord = { buffer: 0, byteOffset, byteLength: bytes.byteLength };
    if (target != null) view.target = target;
    bufferViews.push(view);
    binaryParts.push(padded);
    byteOffset += padded.byteLength;
    accessors.push({ bufferView, byteOffset: 0, componentType, count, type });
    return accessors.length - 1;
  };

  const positionAccessor = addAccessor(encodeF32(positions), 5126, document.vertices.length, "VEC3", 34962);
  const normalAccessor = addAccessor(encodeF32(normals), 5126, document.vertices.length, "VEC3", 34962);
  const uvAccessor = addAccessor(encodeF32(uvs), 5126, document.vertices.length, "VEC2", 34962);
  const jointsAccessor = addAccessor(encodeU16(joints), 5123, document.vertices.length, "VEC4", 34962);
  const weightsAccessor = addAccessor(encodeF32(weights), 5126, document.vertices.length, "VEC4", 34962);
  const indexAccessor = addAccessor(encodeU32(indices), 5125, indices.length, "SCALAR", 34963);
  const inverseBindAccessor = addAccessor(encodeF32(inverseBinds), 5126, rig.bones.length, "MAT4");
  const morphAccessors = morphDeltas.map((delta) => addAccessor(encodeF32(delta), 5126, document.vertices.length, "VEC3", 34962));

  const boneNodeOffset = 1;
  const meshNodeIndex = boneNodeOffset + rig.bones.length;
  const boneIndex = new Map(rig.bones.map((bone, index) => [bone.id, boneNodeOffset + index]));
  const rootBoneNodes = rig.bones.filter((bone) => bone.parentId == null).map((bone) => boneIndex.get(bone.id)!);
  if (rootBoneNodes.length !== 1) throw new Error("character rig must have exactly one root bone");
  const nodes: JsonRecord[] = [{
    name: "Armature",
    children: rootBoneNodes,
    extras: {
      sovereignRigId: rig.id,
      sovereignSpecies: rig.species,
      sovereignFixtureStatus: rig.status,
      sovereignRigCapabilities: rig.capabilities,
    },
  }];
  for (const bone of rig.bones) {
    const children = rig.bones.filter((candidate) => candidate.parentId === bone.id).map((candidate) => boneIndex.get(candidate.id)!);
    nodes.push({
      name: bone.id,
      matrix: Array.from(bone.bindTransform),
      ...(children.length ? { children } : {}),
      extras: { sovereignBone: true, sovereignConstraint: bone.constraint },
    });
  }
  nodes.push({
    name: document.id,
    mesh: 0,
    skin: 0,
    extras: { sovereignMeshRole: "whole-body", sovereignDocumentId: document.id },
  });

  const sourceSha256 = sha256Canonical({ document, rig });
  const gltf: JsonRecord = {
    asset: {
      version: "2.0",
      generator: "MRS Sovereign Sculptor deterministic fixture exporter",
      extras: {
        sovereignFixtureStatus: "core-enforced-fixture-not-production-glb",
        sovereignSpecies: document.species,
        sovereignDocumentId: document.id,
        sovereignRigId: rig.id,
        sovereignSourceSha256: sourceSha256,
        sovereignIdentity: document.identity,
      },
    },
    scene: 0,
    scenes: [{ nodes: [0, meshNodeIndex] }],
    nodes,
    skins: [{
      name: rig.id,
      skeleton: rootBoneNodes[0],
      joints: rig.bones.map((bone) => boneIndex.get(bone.id)!),
      inverseBindMatrices: inverseBindAccessor,
      extras: { sovereignRigSchemaVersion: rig.schemaVersion },
    }],
    meshes: [{
      name: document.id,
      primitives: [{
        mode: 4,
        attributes: {
          POSITION: positionAccessor,
          NORMAL: normalAccessor,
          TEXCOORD_0: uvAccessor,
          JOINTS_0: jointsAccessor,
          WEIGHTS_0: weightsAccessor,
        },
        indices: indexAccessor,
        material: 0,
        targets: morphAccessors.map((accessor) => ({ POSITION: accessor })),
        extras: {
          sovereignPrimitiveId: `${document.id}:whole-body:0`,
          sovereignVertexIds: document.vertices.map((vertex) => vertex.id),
          sovereignTriangleIds: document.triangles.map((triangle) => triangle.id),
          sovereignRegionIds: document.triangles.map((triangle) => triangle.regionId),
          sovereignMorphIds: rig.blendshapes.map((blendshape) => blendshape.id),
          sovereignFixtureZeroDeltas: true,
        },
      }],
      extras: { sovereignMeshId: document.id, sovereignSpecies: document.species },
    }],
    materials: [{
      name: `material:${document.species}:fixture`,
      pbrMetallicRoughness: {
        baseColorFactor: document.species === "fox" ? [0.82, 0.31, 0.08, 1] : [0.58, 0.44, 0.36, 1],
        metallicFactor: 0,
        roughnessFactor: 0.72,
      },
      extras: {
        sovereignMaterialId: `material:${document.species}:fixture`,
        sovereignMaterialRole: "whole-body-skin",
        diffusionAnatomyAllowed: false,
      },
    }],
    buffers: [{ byteLength: byteOffset }],
    bufferViews,
    accessors,
  };
  const jsonBytes = pad(new TextEncoder().encode(canonicalJson(gltf)), 0x20);
  const binBytes = concatBytes(binaryParts);
  const totalLength = 12 + 8 + jsonBytes.byteLength + 8 + binBytes.byteLength;
  return concatBytes([
    u32(GLB_MAGIC), u32(GLB_VERSION), u32(totalLength),
    u32(jsonBytes.byteLength), u32(JSON_CHUNK), jsonBytes,
    u32(binBytes.byteLength), u32(BIN_CHUNK), binBytes,
  ]);
}

/** Strict GLB 2 parser: exact length, aligned bounded chunks, exactly one JSON and BIN chunk. */
export function parseGlbStrict(input: ArrayBuffer | Uint8Array): ParsedGlb {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  if (bytes.byteLength < 28) throw new Error("GLB is too short");
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (view.getUint32(0, true) !== GLB_MAGIC) throw new Error("GLB magic mismatch");
  if (view.getUint32(4, true) !== GLB_VERSION) throw new Error("unsupported GLB version");
  const declaredLength = view.getUint32(8, true);
  if (declaredLength !== bytes.byteLength) throw new Error(`GLB length mismatch: ${declaredLength} != ${bytes.byteLength}`);
  let offset = 12;
  let gltf: JsonRecord | null = null;
  let bin: Uint8Array | null = null;
  let chunkIndex = 0;
  while (offset < declaredLength) {
    if (offset + 8 > declaredLength) throw new Error("truncated GLB chunk header");
    const length = view.getUint32(offset, true);
    const type = view.getUint32(offset + 4, true);
    if (length % 4 !== 0) throw new Error(`GLB chunk ${chunkIndex} is not four-byte aligned`);
    const start = offset + 8;
    const end = start + length;
    if (end > declaredLength) throw new Error(`GLB chunk ${chunkIndex} exceeds file bounds`);
    const chunk = bytes.subarray(start, end);
    if (type === JSON_CHUNK) {
      if (gltf) throw new Error("duplicate GLB JSON chunk");
      if (chunkIndex !== 0) throw new Error("GLB JSON chunk must be first");
      gltf = JSON.parse(new TextDecoder().decode(chunk).trimEnd()) as JsonRecord;
    } else if (type === BIN_CHUNK) {
      if (bin) throw new Error("duplicate GLB BIN chunk");
      bin = chunk;
    } else {
      throw new Error(`unsupported GLB chunk type 0x${type.toString(16)}`);
    }
    offset = end;
    chunkIndex++;
  }
  if (!gltf) throw new Error("GLB JSON chunk missing");
  if (!bin) throw new Error("GLB BIN chunk missing");
  if (gltf.asset?.version !== "2.0") throw new Error("glTF asset.version must be 2.0");
  const declaredBin = gltf.buffers?.[0]?.byteLength;
  if (!Number.isInteger(declaredBin) || declaredBin < 0 || declaredBin > bin.byteLength) throw new Error("glTF buffer byteLength exceeds BIN chunk");
  if ((gltf.buffers?.length ?? 0) !== 1 || gltf.buffers?.[0]?.uri != null) throw new Error("strict GLB supports one embedded buffer");
  return { gltf, bin };
}

function readComponent(view: DataView, type: number, offset: number): number {
  switch (type) {
    case 5120: return view.getInt8(offset);
    case 5121: return view.getUint8(offset);
    case 5122: return view.getInt16(offset, true);
    case 5123: return view.getUint16(offset, true);
    case 5125: return view.getUint32(offset, true);
    case 5126: return view.getFloat32(offset, true);
    default: throw new Error(`unsupported componentType ${type}`);
  }
}

function normalizedValue(value: number, type: number): number {
  switch (type) {
    case 5120: return Math.max(value / 127, -1);
    case 5121: return value / 255;
    case 5122: return Math.max(value / 32767, -1);
    case 5123: return value / 65535;
    case 5125: return value / 4294967295;
    default: return value;
  }
}

/** Read and hash only logical accessor component bytes; bufferView padding/stride bytes are excluded. */
export function readAccessorTight(gltf: JsonRecord, bin: Uint8Array, accessorIndex: number): AccessorData {
  if (!Number.isInteger(accessorIndex) || accessorIndex < 0) throw new Error(`invalid accessor index ${accessorIndex}`);
  const accessor = gltf.accessors?.[accessorIndex];
  if (!accessor) throw new Error(`missing accessor ${accessorIndex}`);
  if (accessor.sparse != null) throw new Error(`accessor ${accessorIndex} sparse layout is unsupported`);
  if (accessor.bufferView == null) throw new Error(`accessor ${accessorIndex} has no bufferView`);
  const bufferView = gltf.bufferViews?.[accessor.bufferView];
  if (!bufferView) throw new Error(`missing bufferView ${accessor.bufferView}`);
  if ((bufferView.buffer ?? 0) !== 0) throw new Error(`bufferView ${accessor.bufferView} references non-embedded buffer`);
  const componentBytes = COMPONENT_BYTES[accessor.componentType];
  const components = TYPE_COMPONENTS[accessor.type];
  if (!componentBytes || !components) throw new Error(`unsupported accessor ${accessorIndex} layout`);
  if (!Number.isInteger(accessor.count) || accessor.count < 0) throw new Error(`invalid accessor ${accessorIndex} count`);
  const elementBytes = componentBytes * components;
  const stride = bufferView.byteStride ?? elementBytes;
  if (!Number.isInteger(stride) || stride < elementBytes || stride % componentBytes !== 0) throw new Error(`invalid accessor ${accessorIndex} stride`);
  const viewStart = bufferView.byteOffset ?? 0;
  const viewLength = bufferView.byteLength;
  const accessorOffset = accessor.byteOffset ?? 0;
  if (![viewStart, viewLength, accessorOffset].every((value) => Number.isInteger(value) && value >= 0)) throw new Error(`invalid accessor ${accessorIndex} offsets`);
  if ((viewStart + accessorOffset) % componentBytes !== 0) throw new Error(`misaligned accessor ${accessorIndex}`);
  const required = accessor.count === 0 ? accessorOffset : accessorOffset + (accessor.count - 1) * stride + elementBytes;
  if (required > viewLength || viewStart + required > bin.byteLength) throw new Error(`accessor ${accessorIndex} exceeds bufferView bounds`);
  const tightBytes = new Uint8Array(accessor.count * elementBytes);
  const values: number[] = [];
  const dataView = new DataView(bin.buffer, bin.byteOffset, bin.byteLength);
  for (let element = 0; element < accessor.count; element++) {
    const source = viewStart + accessorOffset + element * stride;
    tightBytes.set(bin.subarray(source, source + elementBytes), element * elementBytes);
    for (let component = 0; component < components; component++) {
      const raw = readComponent(dataView, accessor.componentType, source + component * componentBytes);
      const value = accessor.normalized === true ? normalizedValue(raw, accessor.componentType) : raw;
      if (!Number.isFinite(value)) throw new Error(`accessor ${accessorIndex} contains non-finite value`);
      values.push(value);
    }
  }
  return { values, tightBytes, count: accessor.count, type: accessor.type, componentType: accessor.componentType, components };
}

function canonicalIndexBytes(values: readonly number[]): Uint8Array {
  return encodeU32(values);
}

function nodeParentMap(nodes: readonly JsonRecord[]): Map<number, number> {
  const parents = new Map<number, number>();
  nodes.forEach((node, parent) => {
    for (const child of node.children ?? []) {
      if (!Number.isInteger(child) || child < 0 || child >= nodes.length) throw new Error(`node ${parent} has invalid child ${child}`);
      if (parents.has(child)) throw new Error(`node ${child} has more than one parent`);
      parents.set(child, parent);
    }
  });
  return parents;
}

function validateNodeCycles(nodes: readonly JsonRecord[]): void {
  const state = new Uint8Array(nodes.length);
  const visit = (index: number): void => {
    if (state[index] === 1) throw new Error(`node hierarchy cycle at ${index}`);
    if (state[index] === 2) return;
    state[index] = 1;
    for (const child of nodes[index]?.children ?? []) visit(child);
    state[index] = 2;
  };
  nodes.forEach((_, index) => visit(index));
}

/** Inspect all strict invariants and compute order-sensitive SHA-256 integrity digests. */
export function inspectGlb(input: ArrayBuffer | Uint8Array): GlbInspection {
  const raw = input instanceof Uint8Array ? input : new Uint8Array(input);
  const { gltf, bin } = parseGlbStrict(raw);
  const issues: GlbValidationIssue[] = [];
  const primitiveInspections: GlbPrimitiveInspection[] = [];
  const accessorSha256: Record<string, string> = {};
  const topologyRecords: unknown[] = [];
  const vertexRecords: unknown[] = [];
  const uvRecords: unknown[] = [];
  const morphRecords: unknown[] = [];
  const materialBindings: unknown[] = [];
  const nodes: JsonRecord[] = gltf.nodes ?? [];
  try { validateNodeCycles(nodes); nodeParentMap(nodes); } catch (error) {
    issues.push(issue("invalid-node-hierarchy", error instanceof Error ? error.message : String(error), "nodes"));
  }

  const materialIds: string[] = [];
  const materialIdSet = new Set<string>();
  (gltf.materials ?? []).forEach((material: JsonRecord, index: number) => {
    const id = material.extras?.sovereignMaterialId ?? material.name;
    if (typeof id !== "string" || !id) issues.push(issue("missing-material-id", "material requires stable id", `materials.${index}`));
    else if (materialIdSet.has(id)) issues.push(issue("duplicate-material-id", `duplicate material id ${id}`, `materials.${index}`));
    else { materialIdSet.add(id); materialIds.push(id); }
    const pbr = material.pbrMetallicRoughness;
    const factors = [...(pbr?.baseColorFactor ?? []), pbr?.metallicFactor ?? 1, pbr?.roughnessFactor ?? 1];
    if (factors.some((value) => !Number.isFinite(value) || value < 0 || value > 1)) issues.push(issue("invalid-material-factor", "PBR factors must be finite in [0,1]", `materials.${index}`));
    if (material.extras?.diffusionAnatomyAllowed !== false) issues.push(issue("diffusion-anatomy-not-forbidden", "material must forbid diffusion anatomy mutation", `materials.${index}.extras`));
  });

  for (const [meshIndex, mesh] of (gltf.meshes ?? []).entries()) {
    for (const [primitiveIndex, primitive] of (mesh.primitives ?? []).entries()) {
      const path = `meshes.${meshIndex}.primitives.${primitiveIndex}`;
      try {
        if ((primitive.mode ?? 4) !== 4) throw new Error("only triangle primitives are accepted");
        const positionIndex = primitive.attributes?.POSITION;
        if (positionIndex == null) throw new Error("POSITION accessor missing");
        const position = readAccessorTight(gltf, bin, positionIndex);
        if (position.type !== "VEC3" || position.componentType !== 5126 || position.count <= 0) throw new Error("POSITION must be non-empty FLOAT VEC3");
        const indexIndex = primitive.indices;
        if (indexIndex == null) throw new Error("indices accessor missing");
        const indexData = readAccessorTight(gltf, bin, indexIndex);
        if (indexData.type !== "SCALAR" || !UNSIGNED_COMPONENTS.has(indexData.componentType) || indexData.count % 3 !== 0) throw new Error("indices must be unsigned triangle SCALAR data");
        for (const indexValue of indexData.values) if (!Number.isInteger(indexValue) || indexValue < 0 || indexValue >= position.count) throw new Error(`index ${indexValue} is outside vertex range`);

        const normalIndex = primitive.attributes?.NORMAL;
        if (normalIndex != null) {
          const normals = readAccessorTight(gltf, bin, normalIndex);
          if (normals.type !== "VEC3" || normals.componentType !== 5126 || normals.count !== position.count) throw new Error("NORMAL layout/count mismatch");
          accessorSha256[`${path}.NORMAL`] = sha256Hex(normals.tightBytes);
        }
        const uvIndex = primitive.attributes?.TEXCOORD_0;
        if (uvIndex == null) throw new Error("TEXCOORD_0 accessor missing");
        const uv = readAccessorTight(gltf, bin, uvIndex);
        if (uv.type !== "VEC2" || uv.componentType !== 5126 || uv.count !== position.count) throw new Error("TEXCOORD_0 layout/count mismatch");

        const skinNodes = nodes.filter((node) => node.mesh === meshIndex && node.skin != null);
        if (!skinNodes.length) throw new Error("mesh has no skinned node");
        const skinIndex = skinNodes[0].skin;
        const skin = gltf.skins?.[skinIndex];
        if (!skin || !Array.isArray(skin.joints) || !skin.joints.length) throw new Error("skin has no joints");
        if (skin.inverseBindMatrices == null) throw new Error("skin inverseBindMatrices accessor missing");
        const inverseBinds = readAccessorTight(gltf, bin, skin.inverseBindMatrices);
        if (inverseBinds.type !== "MAT4" || inverseBinds.componentType !== 5126 || inverseBinds.count !== skin.joints.length) throw new Error("inverse bind layout/count mismatch");
        const jointsIndex = primitive.attributes?.JOINTS_0;
        const weightsIndex = primitive.attributes?.WEIGHTS_0;
        if (jointsIndex == null || weightsIndex == null) throw new Error("JOINTS_0 and WEIGHTS_0 are required");
        const joints = readAccessorTight(gltf, bin, jointsIndex);
        const weights = readAccessorTight(gltf, bin, weightsIndex);
        if (joints.type !== "VEC4" || !UNSIGNED_COMPONENTS.has(joints.componentType) || joints.count !== position.count) throw new Error("JOINTS_0 layout/count mismatch");
        if (weights.type !== "VEC4" || weights.count !== position.count) throw new Error("WEIGHTS_0 layout/count mismatch");
        for (let vertex = 0; vertex < position.count; vertex++) {
          let sum = 0;
          for (let slot = 0; slot < 4; slot++) {
            const joint = joints.values[vertex * 4 + slot];
            const weight = weights.values[vertex * 4 + slot];
            if (!Number.isInteger(joint) || joint < 0 || joint >= skin.joints.length) throw new Error(`joint ${joint} outside skin range`);
            if (!Number.isFinite(weight) || weight < 0 || weight > 1) throw new Error(`invalid skin weight ${weight}`);
            sum += weight;
          }
          if (Math.abs(sum - 1) > 1e-4) throw new Error(`weights for vertex ${vertex} sum to ${sum}`);
        }

        const vertexIds = primitive.extras?.sovereignVertexIds;
        if (!Array.isArray(vertexIds) || vertexIds.length !== position.count || new Set(vertexIds).size !== vertexIds.length || vertexIds.some((id: unknown) => typeof id !== "string" || !id)) throw new Error("stable sovereignVertexIds must match POSITION count");
        const morphIds = primitive.extras?.sovereignMorphIds;
        const targets = primitive.targets ?? [];
        if (!Array.isArray(morphIds) || morphIds.length !== targets.length || new Set(morphIds).size !== morphIds.length || morphIds.some((id: unknown) => typeof id !== "string" || !id)) throw new Error("morph ids must be unique and aligned with targets");
        const perMorph = targets.map((target: JsonRecord, targetIndex: number) => {
          if (target.POSITION == null) throw new Error(`morph ${morphIds[targetIndex]} POSITION missing`);
          const delta = readAccessorTight(gltf, bin, target.POSITION);
          if (delta.type !== "VEC3" || delta.componentType !== 5126 || delta.count !== position.count) throw new Error(`morph ${morphIds[targetIndex]} delta layout/count mismatch`);
          accessorSha256[`${path}.morph.${morphIds[targetIndex]}`] = sha256Hex(delta.tightBytes);
          return { id: morphIds[targetIndex], sha256: sha256Hex(delta.tightBytes) };
        });

        if (!Number.isInteger(primitive.material) || !gltf.materials?.[primitive.material]) throw new Error("primitive material binding is invalid");
        const material = gltf.materials[primitive.material];
        const materialId = material.extras?.sovereignMaterialId ?? material.name;
        const id = primitive.extras?.sovereignPrimitiveId ?? `${mesh.name ?? "mesh"}:${meshIndex}:${primitiveIndex}`;
        const positionSha256 = sha256Hex(position.tightBytes);
        const indexSha256 = sha256Hex(canonicalIndexBytes(indexData.values));
        const uvSha256 = sha256Hex(uv.tightBytes);
        accessorSha256[`${path}.POSITION`] = positionSha256;
        accessorSha256[`${path}.indices`] = indexSha256;
        accessorSha256[`${path}.TEXCOORD_0`] = uvSha256;
        accessorSha256[`${path}.JOINTS_0`] = sha256Hex(joints.tightBytes);
        accessorSha256[`${path}.WEIGHTS_0`] = sha256Hex(weights.tightBytes);
        accessorSha256[`skins.${skinIndex}.inverseBindMatrices`] = sha256Hex(inverseBinds.tightBytes);
        topologyRecords.push({ id, indices: indexSha256, indexCount: indexData.count, triangleIds: primitive.extras?.sovereignTriangleIds ?? [] });
        vertexRecords.push({ id, vertexIds, positions: positionSha256 });
        uvRecords.push({ id, uvs: uvSha256 });
        morphRecords.push({ id, morphs: perMorph });
        materialBindings.push({ id, materialId, material });
        primitiveInspections.push({ id, meshIndex, primitiveIndex, vertexCount: position.count, indexCount: indexData.count, vertexIds, morphIds, materialId, positionSha256, indexSha256, uvSha256 });
      } catch (error) {
        issues.push(issue("invalid-primitive", error instanceof Error ? error.message : String(error), path));
      }
    }
  }
  if (!primitiveInspections.length) issues.push(issue("missing-primitives", "GLB has no valid mesh primitive", "meshes"));

  const boneRecords: unknown[] = [];
  const boneIds: string[] = [];
  try {
    const parents = nodeParentMap(nodes);
    for (const [skinIndex, skin] of (gltf.skins ?? []).entries()) {
      const seen = new Set<number>();
      const records = (skin.joints ?? []).map((joint: number) => {
        if (!Number.isInteger(joint) || joint < 0 || joint >= nodes.length || seen.has(joint)) throw new Error(`invalid or duplicate skin joint ${joint}`);
        seen.add(joint);
        const node = nodes[joint];
        const id = node.name;
        if (typeof id !== "string" || !id) throw new Error(`joint ${joint} has no stable name`);
        boneIds.push(id);
        const parentNode = parents.get(joint);
        const parentId = parentNode != null && (skin.joints ?? []).includes(parentNode) ? nodes[parentNode]?.name ?? null : null;
        const matrix = node.matrix ?? [1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1];
        if (!Array.isArray(matrix) || matrix.length !== 16 || matrix.some((value: unknown) => typeof value !== "number" || !Number.isFinite(value))) throw new Error(`bone ${id} has invalid matrix`);
        return { id, parentId, matrix, constraint: node.extras?.sovereignConstraint ?? null };
      });
      boneRecords.push({ skinIndex, records, skeleton: skin.skeleton ?? null, inverseBindSha256: accessorSha256[`skins.${skinIndex}.inverseBindMatrices`] ?? null });
    }
  } catch (error) {
    issues.push(issue("invalid-armature", error instanceof Error ? error.message : String(error), "skins"));
  }

  const species = gltf.asset?.extras?.sovereignSpecies;
  const status = gltf.asset?.extras?.sovereignFixtureStatus;
  const digests: GlbIntegrityDigests = {
    glbSha256: sha256Hex(raw),
    meshSha256: sha256Canonical({ topologyRecords, vertexRecords, uvRecords }),
    topologySha256: sha256Canonical(topologyRecords),
    vertexOrderSha256: sha256Canonical(vertexRecords),
    uvSha256: sha256Canonical(uvRecords),
    armatureSha256: sha256Canonical(boneRecords),
    blendshapeSha256: sha256Canonical(morphRecords),
    materialSha256: sha256Canonical(materialBindings),
    accessorSha256,
  };
  return {
    ok: issues.length === 0,
    species: species === "human" || species === "fox" || species === "anthro" ? species : null,
    status: typeof status === "string" ? status : null,
    issues,
    primitives: primitiveInspections,
    boneIds,
    materialIds,
    digests,
    json: gltf,
  };
}

export function validateGlb(input: ArrayBuffer | Uint8Array, options: GlbValidationOptions = {}): GlbValidationResult {
  try {
    const inspection = inspectGlb(input);
    const issues = [...inspection.issues];
    if (options.profile && inspection.species !== options.profile) issues.push(issue("profile-mismatch", `expected ${options.profile}, found ${inspection.species ?? "unknown"}`, "asset.extras.sovereignSpecies"));
    if (inspection.status !== "core-enforced-fixture-not-production-glb") issues.push(issue("dishonest-or-missing-status", "GLB must declare non-production fixture status", "asset.extras.sovereignFixtureStatus"));
    if (options.expectedDigests) {
      for (const [key, expected] of Object.entries(options.expectedDigests)) {
        if (expected == null) continue;
        const actual = inspection.digests[key as keyof GlbIntegrityDigests];
        if (canonicalJson(actual) !== canonicalJson(expected)) issues.push(issue("digest-mismatch", `${key} digest mismatch`, `digests.${key}`));
      }
    }
    return { ok: issues.length === 0, issues, inspection: { ...inspection, ok: issues.length === 0, issues } };
  } catch (error) {
    return { ok: false, issues: [issue("invalid-glb-container", error instanceof Error ? error.message : String(error))] };
  }
}

export function assertValidGlb(input: ArrayBuffer | Uint8Array, options: GlbValidationOptions = {}): GlbInspection {
  const result = validateGlb(input, options);
  if (!result.ok || !result.inspection) throw new Error(`invalid GLB: ${result.issues.map((item) => `${item.code}:${item.message}`).join("; ")}`);
  return result.inspection;
}

export function exportSculptGlbBundle(document: SculptDocument, rig: CharacterRigSchema): SculptGlbBundle {
  const glb = exportSculptDocumentToGlb(document, rig);
  const inspection = assertValidGlb(glb, { profile: document.species });
  const documentSha256 = sha256Canonical(document);
  const rigSha256 = sha256Canonical(rig);
  return {
    fixture: {
      status: "core-enforced-fixture-not-production-glb",
      document,
      rig,
      documentSha256,
      rigSha256,
      sourceSha256: sha256Canonical({ document, rig }),
    },
    glb,
    inspection,
  };
}

export const exportCharacterGlb = exportSculptDocumentToGlb;
export const exportCharacterGlbBundle = exportSculptGlbBundle;
