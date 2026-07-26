import type { AssetProvenanceRecord, GovernedAssetManifest, StaticMeshAsset, TextureAsset, TextureRef, UniversalMaterial } from "./WorldObject.js";
import { hashCanonical } from "../scene/hash.js";
import { hashStaticMesh, validateStaticMeshes } from "./StaticMeshSystem.js";
import { createImportProvenanceRecord } from "./AssetProvenanceLedger.js";

type Gltf = {
  buffers?: { byteLength: number }[];
  bufferViews?: { buffer?: number; byteOffset?: number; byteLength: number; byteStride?: number }[];
  accessors?: { bufferView?: number; byteOffset?: number; componentType: number; count: number; type: string }[];
  meshes?: {
    name?: string;
    primitives: {
      attributes: Record<string, number>;
      indices?: number;
      material?: number;
      extras?: Record<string, unknown>;
    }[];
    extras?: Record<string, unknown>;
  }[];
  materials?: {
    name?: string;
    extras?: Record<string, unknown>;
    pbrMetallicRoughness?: {
      baseColorFactor?: number[];
      metallicFactor?: number;
      roughnessFactor?: number;
      baseColorTexture?: { index: number };
      metallicRoughnessTexture?: { index: number };
    };
    normalTexture?: { index: number };
    emissiveTexture?: { index: number };
    emissiveFactor?: number[];
  }[];
  images?: { uri?: string; bufferView?: number; mimeType?: string; name?: string }[];
  textures?: { source?: number; name?: string }[];
  samplers?: unknown[];
};

export interface StaticMeshImportIssue {
  readonly code: string;
  readonly message: string;
  readonly path?: string;
}

export interface StaticMeshImportResult {
  readonly meshes: readonly StaticMeshAsset[];
  readonly assets: readonly GovernedAssetManifest[];
  readonly materials: readonly UniversalMaterial[];
  readonly textures: readonly TextureAsset[];
  readonly provenance: readonly AssetProvenanceRecord[];
  readonly issues: readonly StaticMeshImportIssue[];
}

export interface StaticMeshImportOptions {
  readonly idPrefix?: string;
  readonly defaultMaterialId?: string;
  readonly mtlText?: string;
  readonly decodeTexturePixels?: (bytes: Uint8Array, mimeType?: string) => { width: number; height: number; pixels: Uint8Array } | null;
  readonly sourceUri?: string;
  readonly provenance?: GovernedAssetManifest["provenance"];
  readonly validate?: boolean;
}

const GLB_MAGIC = 0x46546c67;
const JSON_CHUNK = 0x4e4f534a;
const BIN_CHUNK = 0x004e4942;

const COMPONENT_BYTE_SIZE: Record<number, number> = { 5120: 1, 5121: 1, 5122: 2, 5123: 2, 5125: 4, 5126: 4 };
const TYPE_COMPONENTS: Record<string, number> = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 };

function issue(code: string, message: string, path?: string): StaticMeshImportIssue {
  return { code, message, path };
}

function asBytes(input: ArrayBuffer | Uint8Array): Uint8Array {
  return input instanceof Uint8Array ? input : new Uint8Array(input);
}

function sourceHash(input: ArrayBuffer | Uint8Array | string): string {
  if (typeof input === "string") return hashCanonical({ text: input });
  return hashCanonical({ bytes: Array.from(asBytes(input)) });
}

function meshBounds(vertices: Float32Array): StaticMeshAsset["bounds"] {
  const min: [number, number, number] = [Infinity, Infinity, Infinity];
  const max: [number, number, number] = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i + 2 < vertices.length; i += 3) {
    min[0] = Math.min(min[0], vertices[i]!);
    min[1] = Math.min(min[1], vertices[i + 1]!);
    min[2] = Math.min(min[2], vertices[i + 2]!);
    max[0] = Math.max(max[0], vertices[i]!);
    max[1] = Math.max(max[1], vertices[i + 1]!);
    max[2] = Math.max(max[2], vertices[i + 2]!);
  }
  return { min, max };
}

function assetManifest(mesh: StaticMeshAsset, kindHash: string, options: StaticMeshImportOptions): GovernedAssetManifest {
  return {
    id: `asset:${mesh.id}`,
    kind: "mesh",
    version: "static-mesh/1.0",
    contentHash: `sha256:${hashCanonical({ source: kindHash, mesh: hashStaticMesh(mesh) })}`,
    ...(options.sourceUri ? { uri: options.sourceUri } : {}),
    ...(options.provenance ? { provenance: options.provenance } : {}),
    tags: ["static-mesh", mesh.materialId],
  };
}

function normalizeImport(meshes: StaticMeshAsset[], options: StaticMeshImportOptions, source: ArrayBuffer | Uint8Array | string): StaticMeshImportResult {
  const issues: StaticMeshImportIssue[] = [];
  if (options.validate !== false) {
    for (const item of validateStaticMeshes(meshes).issues) issues.push(item);
  }
  const kindHash = sourceHash(source);
  return {
    meshes,
    assets: meshes.map((mesh) => assetManifest(mesh, kindHash, options)),
    materials: [],
    textures: [],
    provenance: meshes.map((mesh) => createImportProvenanceRecord({
      assetId: `asset:${mesh.id}`,
      kind: "mesh",
      uri: options.sourceUri,
      originalHash: `sha256:${kindHash}`,
      details: { meshId: mesh.id, materialId: mesh.materialId, vertexCount: mesh.vertices.length / 3, indexCount: mesh.indices.length },
    })),
    issues,
  };
}

function provenanceForImportedTables(args: {
  readonly materials: readonly UniversalMaterial[];
  readonly textures: readonly TextureAsset[];
  readonly sourceHashValue: string;
  readonly sourceUri?: string;
}): AssetProvenanceRecord[] {
  return [
    ...args.materials.map((material) => createImportProvenanceRecord({
      assetId: `asset:material:${material.id}`,
      kind: "material",
      uri: args.sourceUri,
      originalHash: `sha256:${args.sourceHashValue}`,
      details: { materialId: material.id, type: material.type, textureRefs: material.textureRefs },
    })),
    ...args.textures.map((texture) => createImportProvenanceRecord({
      assetId: `asset:texture:${texture.id}`,
      kind: "texture",
      uri: texture.uri ?? args.sourceUri,
      originalHash: texture.checksum,
      details: { textureId: texture.id, width: texture.width, height: texture.height, decoded: Boolean(texture.decodedPixels) },
    })),
  ];
}

function parseMtl(text: string | undefined): { materials: UniversalMaterial[]; textures: TextureAsset[] } {
  if (!text) return { materials: [], textures: [] };
  const materials: UniversalMaterial[] = [];
  const textures: TextureAsset[] = [];
  let current: {
    id: string;
    baseColor: [number, number, number];
    roughness: number;
    metallic: number;
    emissive: [number, number, number];
    textureRefs: TextureRef[];
    dissolve: number;
    ior: number;
    specular: [number, number, number];
  } | null = null;
  const flush = () => {
    if (!current) return;
    materials.push({
      id: current.id,
      type: current.dissolve < 0.999 ? "glass" : current.metallic > 0.5 ? "metal" : current.emissive.some((value) => value > 0) ? "emissive" : "basic",
      baseColor: current.baseColor,
      roughness: current.roughness,
      metallic: current.metallic,
      emissive: current.emissive,
      textureRefs: current.textureRefs,
    });
  };
  const addTexture = (role: TextureRef["role"], uri: string) => {
    if (!current) return;
    const id = `${current.id}:${role}`;
    textures.push({
      id,
      uri,
      role,
      width: 1,
      height: 1,
      format: role === "normal" ? "normal-rgb8" : role === "roughness" || role === "metallic" ? "linear-r8" : "rgba8",
      colorSpace: role === "color" || role === "emissive" ? "srgb" : "linear",
      checksum: `sha256:${hashCanonical({ id, uri, role })}`,
    });
    current.textureRefs.push({ id, role });
  };
  for (const line of text.split(/\r?\n/)) {
    const clean = line.trim();
    if (!clean || clean.startsWith("#")) continue;
    const [head, ...rest] = clean.split(/\s+/);
    if (head === "newmtl") {
      flush();
      current = { id: rest[0] ?? "material", baseColor: [0.8, 0.8, 0.8], roughness: 0.7, metallic: 0, emissive: [0, 0, 0], textureRefs: [], dissolve: 1, ior: 1.5, specular: [0.04, 0.04, 0.04] };
    } else if (current && head === "Kd") {
      current.baseColor = [Number(rest[0] ?? 0.8), Number(rest[1] ?? 0.8), Number(rest[2] ?? 0.8)];
    } else if (current && head === "Ke") {
      current.emissive = [Number(rest[0] ?? 0), Number(rest[1] ?? 0), Number(rest[2] ?? 0)];
    } else if (current && head === "Ks") {
      current.specular = [Number(rest[0] ?? 0.04), Number(rest[1] ?? 0.04), Number(rest[2] ?? 0.04)];
      current.metallic = Math.max(current.metallic, Math.min(1, Math.max(...current.specular)));
    } else if (current && (head === "d" || head === "Tr")) {
      const value = Math.max(0, Math.min(1, Number(rest[0] ?? 1)));
      current.dissolve = head === "Tr" ? 1 - value : value;
    } else if (current && head === "Ni") {
      current.ior = Math.max(1, Math.min(3, Number(rest[0] ?? 1.5)));
    } else if (current && head === "Ns") {
      const shininess = Math.max(0, Math.min(1000, Number(rest[0] ?? 300)));
      current.roughness = Math.max(0.02, Math.min(1, 1 - Math.sqrt(shininess / 1000)));
    } else if (current && (head === "Pm" || head === "metallic")) {
      current.metallic = Math.max(0, Math.min(1, Number(rest[0] ?? 0)));
    } else if (current && head === "map_Kd") {
      addTexture("color", rest.at(-1) ?? "");
    } else if (current && (head === "map_Bump" || head === "bump" || head === "norm")) {
      addTexture("normal", rest.at(-1) ?? "");
    } else if (current && (head === "map_Pr" || head === "map_Ns")) {
      addTexture("roughness", rest.at(-1) ?? "");
    } else if (current && head === "map_Ke") {
      addTexture("emissive", rest.at(-1) ?? "");
    } else if (current && head === "map_Pm") {
      addTexture("metallic", rest.at(-1) ?? "");
    }
  }
  flush();
  return { materials, textures };
}

export function importStaticMeshesFromObj(text: string, options: StaticMeshImportOptions = {}): StaticMeshImportResult {
  const positions: number[][] = [];
  const normals: number[][] = [];
  const uvs: number[][] = [];
  const meshes: StaticMeshAsset[] = [];
  let objectName = options.idPrefix ?? "obj-mesh";
  let activeMaterial = options.defaultMaterialId ?? "default";
  let outPositions: number[] = [];
  let outNormals: number[] = [];
  let outUvs: number[] = [];
  let outIndices: number[] = [];
  let vertexMap = new Map<string, number>();

  function resolveIndex(raw: string | undefined, length: number): number | null {
    if (!raw) return null;
    const value = Number.parseInt(raw, 10);
    if (!Number.isFinite(value) || value === 0) return null;
    return value > 0 ? value - 1 : length + value;
  }

  function vertexFor(token: string): number {
    const cached = vertexMap.get(token);
    if (cached != null) return cached;
    const [vRaw, vtRaw, vnRaw] = token.split("/");
    const pi = resolveIndex(vRaw, positions.length);
    if (pi == null || !positions[pi]) throw new Error(`OBJ face references invalid vertex ${token}`);
    const ti = resolveIndex(vtRaw, uvs.length);
    const ni = resolveIndex(vnRaw, normals.length);
    const p = positions[pi]!;
    const n = ni != null ? normals[ni] : undefined;
    const uv = ti != null ? uvs[ti] : undefined;
    outPositions.push(p[0] ?? 0, p[1] ?? 0, p[2] ?? 0);
    if (n) outNormals.push(n[0] ?? 0, n[1] ?? 0, n[2] ?? 1);
    if (uv) outUvs.push(uv[0] ?? 0, uv[1] ?? 0);
    const index = outPositions.length / 3 - 1;
    vertexMap.set(token, index);
    return index;
  }

  function flushMesh(): void {
    if (!outIndices.length) return;
    const vertices = new Float32Array(outPositions);
    const suffix = meshes.length === 0 ? "" : `:${meshes.length}`;
    meshes.push({
      id: `${objectName}${suffix}`,
      vertices,
      ...(outNormals.length === outPositions.length ? { normals: new Float32Array(outNormals) } : {}),
      ...(outUvs.length === (outPositions.length / 3) * 2 ? { uvs: new Float32Array(outUvs) } : {}),
      indices: Math.max(0, ...outIndices) > 65535 ? new Uint32Array(outIndices) : new Uint16Array(outIndices),
      materialId: activeMaterial,
      bounds: meshBounds(vertices),
    });
    outPositions = [];
    outNormals = [];
    outUvs = [];
    outIndices = [];
    vertexMap = new Map<string, number>();
  }

  const issues: StaticMeshImportIssue[] = [];
  for (const [lineIndex, line] of text.split(/\r?\n/).entries()) {
    const clean = line.trim();
    if (!clean || clean.startsWith("#")) continue;
    const [head, ...rest] = clean.split(/\s+/);
    try {
      if (head === "v") positions.push(rest.slice(0, 3).map(Number));
      if (head === "vn") normals.push(rest.slice(0, 3).map(Number));
      if (head === "vt") uvs.push(rest.slice(0, 2).map(Number));
      if (head === "o" || head === "g") {
        flushMesh();
        objectName = `${options.idPrefix ?? "obj-mesh"}:${rest.join("_") || meshes.length}`;
      }
      if (head === "usemtl") {
        flushMesh();
        activeMaterial = rest[0] ?? options.defaultMaterialId ?? "default";
      }
      if (head === "f") {
        const face = rest.map(vertexFor);
        for (let i = 1; i + 1 < face.length; i++) outIndices.push(face[0]!, face[i]!, face[i + 1]!);
      }
    } catch (error) {
      issues.push(issue("obj-parse-error", error instanceof Error ? error.message : String(error), `line:${lineIndex + 1}`));
    }
  }
  flushMesh();

  const result = normalizeImport(meshes, options, text);
  const mtl = parseMtl(options.mtlText);
  return {
    ...result,
    materials: mtl.materials,
    textures: mtl.textures,
    provenance: [
      ...result.provenance,
      ...provenanceForImportedTables({ materials: mtl.materials, textures: mtl.textures, sourceHashValue: sourceHash(text), sourceUri: options.sourceUri }),
    ],
    issues: [...issues, ...result.issues],
  };
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
  let offset = 12;
  let gltf: Gltf | null = null;
  let bin: Uint8Array | null = null;
  const decoder = new TextDecoder();
  while (offset + 8 <= Math.min(totalLength, bytes.byteLength)) {
    const chunkLength = readU32(view, offset);
    const chunkType = readU32(view, offset + 4);
    offset += 8;
    const chunk = bytes.subarray(offset, offset + chunkLength);
    offset += chunkLength;
    if (chunkType === JSON_CHUNK) gltf = JSON.parse(decoder.decode(chunk).trim()) as Gltf;
    if (chunkType === BIN_CHUNK) bin = chunk;
  }
  if (!gltf) throw new Error("Invalid GLB: missing JSON chunk");
  if (!bin) throw new Error("Invalid GLB: missing BIN chunk");
  return { gltf, bin };
}

function readComponent(view: DataView, componentType: number, byteOffset: number): number {
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
  if (accessor.bufferView == null) throw new Error(`Accessor ${accessorIndex} has no bufferView`);
  const bufferView = gltf.bufferViews?.[accessor.bufferView];
  if (!bufferView) throw new Error(`Missing bufferView ${accessor.bufferView}`);
  if ((bufferView.buffer ?? 0) !== 0) throw new Error("Static mesh GLB importer supports one BIN buffer");
  const componentSize = COMPONENT_BYTE_SIZE[accessor.componentType];
  const components = TYPE_COMPONENTS[accessor.type];
  if (!componentSize || !components) throw new Error(`Unsupported accessor ${accessorIndex} layout`);
  const stride = bufferView.byteStride ?? componentSize * components;
  const base = (bufferView.byteOffset ?? 0) + (accessor.byteOffset ?? 0);
  const view = new DataView(bin.buffer, bin.byteOffset, bin.byteLength);
  const out: number[] = [];
  for (let element = 0; element < accessor.count; element++) {
    for (let c = 0; c < components; c++) out.push(readComponent(view, accessor.componentType, base + element * stride + c * componentSize));
  }
  return out;
}

function materialIdForGltf(gltf: Gltf, materialIndex: number | undefined, options: StaticMeshImportOptions): string {
  const material = materialIndex != null ? gltf.materials?.[materialIndex] : undefined;
  const tagged = material?.extras?.["engine3dMaterialId"];
  return typeof tagged === "string" ? tagged : material?.name ?? options.defaultMaterialId ?? "default";
}

function decodeImageDimensions(bytes: Uint8Array, mimeType?: string): { width: number; height: number } {
  if (bytes.length >= 24 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) {
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    return { width: view.getUint32(16, false), height: view.getUint32(20, false) };
  }
  if ((mimeType === "image/jpeg" || bytes[0] === 0xff) && bytes.length > 4) {
    let offset = 2;
    while (offset + 9 < bytes.length) {
      if (bytes[offset] !== 0xff) break;
      const marker = bytes[offset + 1]!;
      const length = (bytes[offset + 2]! << 8) | bytes[offset + 3]!;
      if (marker >= 0xc0 && marker <= 0xc3) {
        return {
          height: (bytes[offset + 5]! << 8) | bytes[offset + 6]!,
          width: (bytes[offset + 7]! << 8) | bytes[offset + 8]!,
        };
      }
      offset += 2 + length;
    }
  }
  return { width: 1, height: 1 };
}

function textureAssetsForGltf(gltf: Gltf, input: ArrayBuffer | Uint8Array, bin: Uint8Array, options: StaticMeshImportOptions): TextureAsset[] {
  return (gltf.textures ?? []).flatMap((texture, index) => {
    const image = texture.source != null ? gltf.images?.[texture.source] : undefined;
    if (!image) return [];
    const id = texture.name ?? image.name ?? `${options.idPrefix ?? "glb"}:texture:${index}`;
    const view = image.bufferView != null ? gltf.bufferViews?.[image.bufferView] : undefined;
    const embeddedBytes = view ? bin.slice(view.byteOffset ?? 0, (view.byteOffset ?? 0) + view.byteLength) : undefined;
    const decoded = embeddedBytes ? options.decodeTexturePixels?.(embeddedBytes, image.mimeType) ?? null : null;
    const dimensions = decoded ?? (embeddedBytes ? decodeImageDimensions(embeddedBytes, image.mimeType) : { width: 1, height: 1 });
    return [{
      id,
      uri: image.uri ?? (options.sourceUri ? `${options.sourceUri}#image:${texture.source}` : undefined),
      ...(embeddedBytes ? { embeddedBytes } : {}),
      ...(decoded ? { decodedPixels: decoded.pixels } : {}),
      width: dimensions.width,
      height: dimensions.height,
      format: image.mimeType === "image/jpeg" ? "rgb8" : "rgba8",
      colorSpace: "srgb",
      checksum: `sha256:${hashCanonical({ source: sourceHash(input), image, texture })}`,
    }];
  });
}

function materialsForGltf(gltf: Gltf, textures: readonly TextureAsset[]): UniversalMaterial[] {
  const textureRef = (index: number | undefined, role: TextureRef["role"]): TextureRef[] => {
    if (index == null || !textures[index]) return [];
    return [{ id: textures[index]!.id, role }];
  };
  return (gltf.materials ?? []).map((material, index) => {
    const tagged = material.extras?.["engine3dMaterialId"];
    const id = typeof tagged === "string" ? tagged : material.name ?? `material:${index}`;
    const pbr = material.pbrMetallicRoughness;
    const textureRefs = [
      ...textureRef(pbr?.baseColorTexture?.index, "color"),
      ...textureRef(pbr?.metallicRoughnessTexture?.index, "roughness"),
      ...textureRef(pbr?.metallicRoughnessTexture?.index, "metallic"),
      ...textureRef(material.normalTexture?.index, "normal"),
      ...textureRef(material.emissiveTexture?.index, "emissive"),
    ];
    const metallic = pbr?.metallicFactor ?? 0;
    const emissive = [
      material.emissiveFactor?.[0] ?? 0,
      material.emissiveFactor?.[1] ?? 0,
      material.emissiveFactor?.[2] ?? 0,
    ] as const;
    return {
      id,
      type: emissive.some((value) => value > 0) ? "emissive" : metallic > 0.5 ? "metal" : "basic",
      baseColor: [
        pbr?.baseColorFactor?.[0] ?? 0.8,
        pbr?.baseColorFactor?.[1] ?? 0.8,
        pbr?.baseColorFactor?.[2] ?? 0.8,
      ],
      roughness: pbr?.roughnessFactor ?? 0.7,
      metallic,
      emissive,
      textureRefs,
    };
  });
}

export function importStaticMeshesFromGlb(input: ArrayBuffer | Uint8Array, options: StaticMeshImportOptions = {}): StaticMeshImportResult {
  const { gltf, bin } = parseGlb(input);
  const meshes: StaticMeshAsset[] = [];
  const issues: StaticMeshImportIssue[] = [];
  const textures = textureAssetsForGltf(gltf, input, bin, options);
  const materials = materialsForGltf(gltf, textures);
  for (const [meshIndex, mesh] of (gltf.meshes ?? []).entries()) {
    for (const [primitiveIndex, primitive] of mesh.primitives.entries()) {
      try {
        const positionAccessor = primitive.attributes["POSITION"];
        if (positionAccessor == null) throw new Error("GLB primitive missing POSITION");
        const vertices = new Float32Array(readAccessor(gltf, bin, positionAccessor));
        const normalAccessor = primitive.attributes["NORMAL"];
        const uvAccessor = primitive.attributes["TEXCOORD_0"];
        const rawIndices = primitive.indices != null
          ? readAccessor(gltf, bin, primitive.indices)
          : Array.from({ length: vertices.length / 3 }, (_, index) => index);
        const id = typeof primitive.extras?.["engine3dMeshId"] === "string"
          ? primitive.extras["engine3dMeshId"] as string
          : `${options.idPrefix ?? mesh.name ?? "glb-mesh"}:${meshIndex}:${primitiveIndex}`;
        meshes.push({
          id,
          vertices,
          ...(normalAccessor != null ? { normals: new Float32Array(readAccessor(gltf, bin, normalAccessor)) } : {}),
          ...(uvAccessor != null ? { uvs: new Float32Array(readAccessor(gltf, bin, uvAccessor)) } : {}),
          indices: Math.max(0, ...rawIndices) > 65535 ? new Uint32Array(rawIndices) : new Uint16Array(rawIndices),
          materialId: materialIdForGltf(gltf, primitive.material, options),
          bounds: meshBounds(vertices),
        });
      } catch (error) {
        issues.push(issue("glb-parse-error", error instanceof Error ? error.message : String(error), `meshes.${meshIndex}.primitives.${primitiveIndex}`));
      }
    }
  }
  const result = normalizeImport(meshes, options, input);
  return {
    ...result,
    materials,
    textures,
    provenance: [
      ...result.provenance,
      ...provenanceForImportedTables({ materials, textures, sourceHashValue: sourceHash(input), sourceUri: options.sourceUri }),
    ],
    issues: [...issues, ...result.issues],
  };
}
