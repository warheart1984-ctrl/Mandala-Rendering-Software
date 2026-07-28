/**
 * GLBMeshImporter4D — standalone GLB 2.0 parser for RT4D.
 *
 * Parses binary GLTF (.glb) files and produces TriangleMesh4D-compatible
 * output (vertices, indices, normals, UVs, materials). No external
 * dependencies — pure ArrayBuffer parsing.
 *
 * Status: **implemented**
 *   - GLB binary format parsing (magic, JSON chunk, BIN chunk)
 *   - Accessor reading (all standard component types)
 *   - Mesh/primitive extraction (POSITION, NORMAL, TEXCOORD_0, COLOR_0, TANGENT, indices)
 *   - PBR material extraction (baseColorFactor, roughness, metallic, emissive)
 *   - Texture reference extraction
 *   - Multiple meshes and primitives per file
 *   - Node hierarchy and transforms (scene graph flattening)
 *   - Multiple BIN buffers (graceful skip of external URIs)
 */

import { TriangleMesh4D } from "../render/rt4d/geometry/TriangleMesh4D.js";
import { decodeGlbTextureImage } from "./GLBTextureDecoder.js";

const GLB_MAGIC = 0x46546c67;
const JSON_CHUNK = 0x4e4f534a;
const BIN_CHUNK = 0x004e4942;

const COMPONENT_BYTE_SIZE = { 5120: 1, 5121: 1, 5122: 2, 5123: 2, 5125: 4, 5126: 4 };
const TYPE_COMPONENTS = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 };

function asBytes(input) {
  return input instanceof Uint8Array ? input : new Uint8Array(input);
}

function readU32(view, offset) {
  return view.getUint32(offset, true);
}

function readComponent(view, componentType, byteOffset) {
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

/**
 * Parse a GLB binary buffer into { gltf, bin, bins }.
 * `bins` is an array of all BIN chunks (usually just one).
 * @param {ArrayBuffer|Uint8Array} input
 * @returns {{ gltf: object, bin: Uint8Array, bins: Uint8Array[] }}
 */
export function parseGlb(input) {
  const bytes = asBytes(input);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (bytes.byteLength < 20 || readU32(view, 0) !== GLB_MAGIC) {
    throw new Error("Invalid GLB: missing magic header");
  }
  const version = readU32(view, 4);
  if (version !== 2) throw new Error(`Unsupported GLB version ${version}`);
  const totalLength = readU32(view, 8);
  let offset = 12;
  let gltf = null;
  const bins = [];
  const decoder = new TextDecoder();
  while (offset + 8 <= Math.min(totalLength, bytes.byteLength)) {
    const chunkLength = readU32(view, offset);
    const chunkType = readU32(view, offset + 4);
    offset += 8;
    const chunk = bytes.subarray(offset, offset + chunkLength);
    offset += chunkLength;
    if (chunkType === JSON_CHUNK) gltf = JSON.parse(decoder.decode(chunk).trim());
    if (chunkType === BIN_CHUNK) bins.push(chunk);
  }
  if (!gltf) throw new Error("Invalid GLB: missing JSON chunk");
  if (bins.length === 0) throw new Error("Invalid GLB: missing BIN chunk");
  return { gltf, bin: bins[0], bins };
}

/**
 * Read a glTF accessor into a flat number array.
 * @param {object} gltf
 * @param {Uint8Array} bin - Primary BIN chunk (buffer 0).
 * @param {number} accessorIndex
 * @param {Uint8Array[]} [bins] - All BIN chunks (fallback for buffer index > 0).
 * @returns {number[]}
 */
export function readAccessor(gltf, bin, accessorIndex, bins) {
  const accessor = gltf.accessors?.[accessorIndex];
  if (!accessor) throw new Error(`Missing accessor ${accessorIndex}`);
  if (accessor.bufferView == null) throw new Error(`Accessor ${accessorIndex} has no bufferView`);
  const bufferView = gltf.bufferViews?.[accessor.bufferView];
  if (!bufferView) throw new Error(`Missing bufferView ${accessor.bufferView}`);
  const bufferIndex = bufferView.buffer ?? 0;
  let binChunk;
  if (bufferIndex === 0) {
    binChunk = bin;
  } else if (bins && bins[bufferIndex]) {
    binChunk = bins[bufferIndex];
  } else {
    throw new Error(`Accessor ${accessorIndex} references buffer ${bufferIndex} which is not available in this GLB`);
  }
  const componentSize = COMPONENT_BYTE_SIZE[accessor.componentType];
  const components = TYPE_COMPONENTS[accessor.type];
  if (!componentSize || !components) throw new Error(`Unsupported accessor ${accessorIndex} layout`);
  const stride = bufferView.byteStride ?? componentSize * components;
  const base = (bufferView.byteOffset ?? 0) + (accessor.byteOffset ?? 0);
  const dv = new DataView(binChunk.buffer, binChunk.byteOffset, binChunk.byteLength);
  const out = [];
  for (let element = 0; element < accessor.count; element++) {
    for (let c = 0; c < components; c++) {
      out.push(readComponent(dv, accessor.componentType, base + element * stride + c * componentSize));
    }
  }
  return out;
}

/**
 * Compute axis-aligned bounding box from a flat xyz vertex array.
 * @param {Float32Array} vertices
 * @returns {{ min: [number,number,number], max: [number,number,number] }}
 */
function meshBounds(vertices) {
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i + 2 < vertices.length; i += 3) {
    min[0] = Math.min(min[0], vertices[i]);
    min[1] = Math.min(min[1], vertices[i + 1]);
    min[2] = Math.min(min[2], vertices[i + 2]);
    max[0] = Math.max(max[0], vertices[i]);
    max[1] = Math.max(max[1], vertices[i + 1]);
    max[2] = Math.max(max[2], vertices[i + 2]);
  }
  return { min, max };
}

function materialIdForGltf(gltf, materialIndex, defaultMaterialId) {
  const material = materialIndex != null ? gltf.materials?.[materialIndex] : undefined;
  const tagged = material?.extras?.["engine3dMaterialId"];
  return typeof tagged === "string" ? tagged : material?.name ?? defaultMaterialId ?? "default";
}

/**
 * @typedef {{
 *   id: string,
 *   vertices: Float32Array,
 *   normals?: Float32Array,
 *   uvs?: Float32Array,
 *   colors?: Float32Array,
 *   tangents?: Float32Array,
 *   indices: Uint16Array|Uint32Array,
 *   materialId: string,
 *   bounds: { min: [number,number,number], max: [number,number,number] }
 * }} GlbMeshPrimitive
 */

/**
 * @typedef {{
 *   id: string,
 *   type: string,
 *   baseColor: [number,number,number],
 *   roughness: number,
 *   metallic: number,
 *   emissive: [number,number,number],
 *   textureRefs: Array<{ id: string, role: string }>
 * }} GlbMaterial
 */

/**
 * @typedef {{
 *   meshes: GlbMeshPrimitive[],
 *   materials: GlbMaterial[],
 *   issues: Array<{ code: string, message: string, path?: string }>
 * }} GlbImportResult
 */

// ---------------------------------------------------------------------------
// Node hierarchy + transforms
// ---------------------------------------------------------------------------

/**
 * Resolve the world-space 4×4 transform for each node by walking the
 * glTF node hierarchy and multiplying parent × child.
 *
 * @param {object} gltf - Parsed glTF JSON.
 * @returns {Float64Array[]} Array of 16-element column-major matrices, indexed by node index.
 */
export function resolveNodeTransforms(gltf) {
  const nodes = gltf.nodes ?? [];
  const result = new Array(nodes.length);
  const visited = new Uint8Array(nodes.length);

  function identity() {
    return new Float64Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
  }

  function mat4FromNode(node) {
    if (node.matrix) {
      return new Float64Array(node.matrix);
    }
    const m = identity();
    const t = node.translation ?? [0, 0, 0];
    const r = node.rotation ?? [0, 0, 0, 1]; // quaternion [x,y,z,w]
    const s = node.scale ?? [1, 1, 1];
    // Build TRS matrix: T * R * S
    const qx = r[0], qy = r[1], qz = r[2], qw = r[3];
    const sx = s[0], sy = s[1], sz = s[2];
    // Rotation matrix from quaternion (column-major)
    const r00 = 1 - 2 * (qy * qy + qz * qz);
    const r01 = 2 * (qx * qy - qz * qw);
    const r02 = 2 * (qx * qz + qy * qw);
    const r10 = 2 * (qx * qy + qz * qw);
    const r11 = 1 - 2 * (qx * qx + qz * qz);
    const r12 = 2 * (qy * qz - qx * qw);
    const r20 = 2 * (qx * qz - qy * qw);
    const r21 = 2 * (qy * qz + qx * qw);
    const r22 = 1 - 2 * (qx * qx + qy * qy);
    // Column-major with scale and translation
    m[0] = r00 * sx; m[1] = r10 * sx; m[2] = r20 * sx; m[3] = 0;
    m[4] = r01 * sy; m[5] = r11 * sy; m[6] = r21 * sy; m[7] = 0;
    m[8] = r02 * sz; m[9] = r12 * sz; m[10] = r22 * sz; m[11] = 0;
    m[12] = t[0]; m[13] = t[1]; m[14] = t[2]; m[15] = 1;
    return m;
  }

  function resolve(nodeIndex, parentMatrix) {
    if (nodeIndex < 0 || nodeIndex >= nodes.length) return;
    if (visited[nodeIndex]) return;
    visited[nodeIndex] = 1;
    const node = nodes[nodeIndex];
    const local = mat4FromNode(node);
    // world = parent * local
    const world = matMul(parentMatrix, local);
    result[nodeIndex] = world;
    for (const child of (node.children ?? [])) {
      resolve(child, world);
    }
  }

  // Walk all scenes, starting from root nodes with identity parent.
  const scenes = gltf.scenes ?? [gltf.scene != null ? { nodes: [gltf.scene] } : { nodes: [] }];
  for (const scene of scenes) {
    for (const rootNode of (scene.nodes ?? [])) {
      resolve(rootNode, identity());
    }
  }
  // Any nodes not reached by scenes are orphaned — treat as root nodes.
  const childSet = new Set();
  for (const node of nodes) {
    for (const c of (node.children ?? [])) childSet.add(c);
  }
  for (let i = 0; i < nodes.length; i++) {
    if (!visited[i] && !childSet.has(i)) {
      resolve(i, identity());
    }
  }
  // Fill any remaining unvisited nodes with identity.
  for (let i = 0; i < nodes.length; i++) {
    if (!result[i]) result[i] = identity();
  }
  return result;
}

/** Multiply two 4×4 column-major matrices: out = a * b. */
function matMul(a, b) {
  const out = new Float64Array(16);
  for (let col = 0; col < 4; col++) {
    for (let row = 0; row < 4; row++) {
      let sum = 0;
      for (let k = 0; k < 4; k++) {
        sum += a[k * 4 + row] * b[col * 4 + k];
      }
      out[col * 4 + row] = sum;
    }
  }
  return out;
}

/**
 * Apply a 4×4 column-major transform to mesh vertex positions and normals.
 * Modifies meshData in place: vertices and normals are transformed.
 *
 * @param {object} meshData - Mesh data with vertices (Float32Array, xyz).
 * @param {Float64Array} m - 4×4 column-major matrix.
 */
function applyNodeTransform(meshData, m) {
  const verts = meshData.vertices;
  // Transform positions
  for (let i = 0; i + 2 < verts.length; i += 3) {
    const x = verts[i], y = verts[i + 1], z = verts[i + 2];
    const w = m[3] * x + m[7] * y + m[11] * z + m[15];
    const invW = Math.abs(w) > 1e-12 ? 1 / w : 1;
    verts[i] = (m[0] * x + m[4] * y + m[8] * z + m[12]) * invW;
    verts[i + 1] = (m[1] * x + m[5] * y + m[9] * z + m[13]) * invW;
    verts[i + 2] = (m[2] * x + m[6] * y + m[10] * z + m[14]) * invW;
  }
  // Transform normals (use inverse-transpose of upper-left 3×3)
  if (meshData.normals) {
    const n = meshData.normals;
    const invM = mat4Inverse3x3(m);
    for (let i = 0; i + 2 < n.length; i += 3) {
      const x = n[i], y = n[i + 1], z = n[i + 2];
      n[i] = invM[0] * x + invM[3] * y + invM[6] * z;
      n[i + 1] = invM[1] * x + invM[4] * y + invM[7] * z;
      n[i + 2] = invM[2] * x + invM[5] * y + invM[8] * z;
      const len = Math.hypot(n[i], n[i + 1], n[i + 2]) || 1;
      n[i] /= len; n[i + 1] /= len; n[i + 2] /= len;
    }
  }
  // Transform tangents (direction only, ignore w handedness)
  if (meshData.tangents) {
    const t = meshData.tangents;
    for (let i = 0; i + 3 < t.length; i += 4) {
      const x = t[i], y = t[i + 1], z = t[i + 2];
      const len3 = Math.hypot(
        m[0] * x + m[4] * y + m[8] * z,
        m[1] * x + m[5] * y + m[9] * z,
        m[2] * x + m[6] * y + m[10] * z,
      ) || 1;
      t[i] = (m[0] * x + m[4] * y + m[8] * z) / len3;
      t[i + 1] = (m[1] * x + m[5] * y + m[9] * z) / len3;
      t[i + 2] = (m[2] * x + m[6] * y + m[10] * z) / len3;
      // t[i+3] (handedness) preserved
    }
  }
}

/**
 * Compute the inverse-transpose of the upper-left 3×3 of a 4×4 matrix.
 * @returns {Float64Array} 9-element array (row-major 3×3).
 */
function mat4Inverse3x3(m) {
  const a = m[0], b = m[4], c = m[8];
  const d = m[1], e = m[5], f = m[9];
  const g = m[2], h = m[6], k = m[10];
  const det = a * (e * k - f * h) - b * (d * k - f * g) + c * (d * h - e * g);
  if (Math.abs(det) < 1e-12) return new Float64Array([1, 0, 0, 0, 1, 0, 0, 0, 1]);
  const invDet = 1 / det;
  // Inverse of 3x3, then transpose
  return new Float64Array([
    (e * k - f * h) * invDet, (c * h - b * k) * invDet, (b * f - c * e) * invDet,
    (f * g - d * k) * invDet, (a * k - c * g) * invDet, (c * d - a * f) * invDet,
    (d * h - e * g) * invDet, (b * g - a * h) * invDet, (a * e - b * d) * invDet,
  ]);
}

/**
 * Import meshes from a GLB binary buffer.
 *
 * @param {ArrayBuffer|Uint8Array} input - Raw GLB binary data.
 * @param {{ idPrefix?: string, defaultMaterialId?: string, applyTransforms?: boolean }} [opts]
 * @returns {GlbImportResult}
 */
export function importMeshesFromGlb(input, opts = {}) {
  const { gltf, bin, bins } = parseGlb(input);
  const meshes = [];
  const issues = [];
  const defaultMaterialId = opts.defaultMaterialId ?? "default";
  const applyTransforms = opts.applyTransforms !== false;

  const nodeTransforms = applyTransforms ? resolveNodeTransforms(gltf) : [];
  // Build a meshIndex → nodeTransform lookup. A node references a mesh via node.mesh.
  const meshNodeTransforms = new Map();
  if (applyTransforms) {
    for (const [ni, node] of (gltf.nodes ?? []).entries()) {
      if (node.mesh != null && nodeTransforms[ni]) {
        meshNodeTransforms.set(node.mesh, nodeTransforms[ni]);
      }
    }
  }

  for (const [meshIndex, mesh] of (gltf.meshes ?? []).entries()) {
    for (const [primIndex, primitive] of mesh.primitives.entries()) {
      try {
        const positionAccessor = primitive.attributes["POSITION"];
        if (positionAccessor == null) throw new Error("GLB primitive missing POSITION");
        const vertices = new Float32Array(readAccessor(gltf, bin, positionAccessor, bins));
        const normalAccessor = primitive.attributes["NORMAL"];
        const uvAccessor = primitive.attributes["TEXCOORD_0"];
        const colorAccessor = primitive.attributes["COLOR_0"];
        const tangentAccessor = primitive.attributes["TANGENT"];
        const rawIndices = primitive.indices != null
          ? readAccessor(gltf, bin, primitive.indices, bins)
          : Array.from({ length: vertices.length / 3 }, (_, i) => i);
        const id = typeof primitive.extras?.["engine3dMeshId"] === "string"
          ? primitive.extras["engine3dMeshId"]
          : `${opts.idPrefix ?? mesh.name ?? "glb-mesh"}:${meshIndex}:${primIndex}`;

        const meshData = {
          id,
          vertices,
          ...(normalAccessor != null ? { normals: new Float32Array(readAccessor(gltf, bin, normalAccessor, bins)) } : {}),
          ...(uvAccessor != null ? { uvs: new Float32Array(readAccessor(gltf, bin, uvAccessor, bins)) } : {}),
          ...(colorAccessor != null ? { colors: new Float32Array(readAccessor(gltf, bin, colorAccessor, bins)) } : {}),
          ...(tangentAccessor != null ? { tangents: new Float32Array(readAccessor(gltf, bin, tangentAccessor, bins)) } : {}),
          indices: Math.max(0, ...rawIndices) > 65535 ? new Uint32Array(rawIndices) : new Uint16Array(rawIndices),
          materialId: materialIdForGltf(gltf, primitive.material, defaultMaterialId),
          bounds: null,
        };

        if (applyTransforms) {
          const xform = meshNodeTransforms.get(meshIndex) ?? null;
          if (xform) applyNodeTransform(meshData, xform);
        }

        meshData.bounds = meshBounds(meshData.vertices);
        meshes.push(meshData);
      } catch (error) {
        issues.push({
          code: "glb-parse-error",
          message: error instanceof Error ? error.message : String(error),
          path: `meshes.${meshIndex}.primitives.${primIndex}`,
        });
      }
    }
  }

  const materials = (gltf.materials ?? []).map((material, index) => {
    const pbr = material.pbrMetallicRoughness;
    const tagged = material.extras?.["engine3dMaterialId"];
    const id = typeof tagged === "string" ? tagged : material.name ?? `material:${index}`;
    const emissive = [
      material.emissiveFactor?.[0] ?? 0,
      material.emissiveFactor?.[1] ?? 0,
      material.emissiveFactor?.[2] ?? 0,
    ];
    const metallic = pbr?.metallicFactor ?? 0;
    const textureRefs = [];
    if (pbr?.baseColorTexture?.index != null) {
      const tex = gltf.textures?.[pbr.baseColorTexture.index];
      if (tex) textureRefs.push({ id: tex.name ?? `texture:${pbr.baseColorTexture.index}`, role: "color" });
    }
    if (pbr?.metallicRoughnessTexture?.index != null) {
      const tex = gltf.textures?.[pbr.metallicRoughnessTexture.index];
      if (tex) textureRefs.push({ id: tex.name ?? `texture:${pbr.metallicRoughnessTexture.index}`, role: "roughness" });
    }
    if (material.normalTexture?.index != null) {
      const tex = gltf.textures?.[material.normalTexture.index];
      if (tex) textureRefs.push({ id: tex.name ?? `texture:${material.normalTexture.index}`, role: "normal" });
    }
    if (material.emissiveTexture?.index != null) {
      const tex = gltf.textures?.[material.emissiveTexture.index];
      if (tex) textureRefs.push({ id: tex.name ?? `texture:${material.emissiveTexture.index}`, role: "emissive" });
    }
    return {
      id,
      type: emissive.some((v) => v > 0) ? "emissive" : metallic > 0.5 ? "metal" : "basic",
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

  return { meshes, materials, issues };
}

/**
 * Import GLB and produce TriangleMesh4D instances.
 *
 * @param {ArrayBuffer|Uint8Array} input - Raw GLB binary data.
 * @param {{ idPrefix?: string, defaultMaterialId?: string }} [opts]
 * @returns {{ meshes: TriangleMesh4D[], materials: GlbMaterial[], issues: Array }}
 */
export function importTriangleMeshesFromGlb(input, opts = {}) {
  const result = importMeshesFromGlb(input, opts);
  return {
    meshes: result.meshes.map((m) => new TriangleMesh4D(m)),
    materials: result.materials,
    issues: result.issues,
  };
}

/**
 * Convert an InstancedStaticMeshPrimitive (from SceneBridgeV12) to
 * a TriangleMesh4D-compatible options object.
 *
 * @param {object} prim - An InstancedStaticMeshPrimitive with vertices, indices, normals, uvs, instanceMatrix, inverseInstanceMatrix, localBvhKey, materialId
 * @returns {object} Options suitable for `new TriangleMesh4D(...)`.
 */
export function instancedMeshToTriangleMeshOptions(prim) {
  return {
    vertices: prim.vertices,
    indices: prim.indices,
    normals: prim.normals ?? null,
    uvs: prim.uvs ?? null,
    colors: prim.colors ?? null,
    tangents: prim.tangents ?? null,
    materialId: prim.materialId ?? "default",
    instanceMatrix: prim.instanceMatrix ?? null,
    inverseInstanceMatrix: prim.inverseInstanceMatrix ?? null,
    localBvhKey: prim.localBvhKey ?? null,
  };
}

/**
 * Merge multiple GLB primitives from the same mesh into a single mesh
 * with per-triangle material slots. Useful when a GLB file has many
 * small primitives that would otherwise create many separate BVH nodes.
 *
 * @param {GlbMeshPrimitive[]} primitives - Primitives from one GLB mesh (same meshIndex).
 * @returns {GlbMeshPrimitive} A single merged primitive with materialSlots.
 */
export function mergeGlbPrimitives(primitives) {
  if (primitives.length === 0) throw new Error("mergeGlbPrimitives: empty primitives");
  if (primitives.length === 1) return primitives[0];

  const totalVerts = primitives.reduce((s, p) => s + p.vertices.length, 0);
  const totalTris = primitives.reduce((s, p) => s + p.indices.length / 3, 0);
  const mergedVerts = new Float32Array(totalVerts);
  const mergedNormals = new Float32Array(totalVerts);
  const mergedTangents = new Float32Array(totalVerts + primitives.length); // VEC4
  const mergedUvs = new Float32Array((totalVerts / 3) * 2);
  const mergedColors = new Float32Array(totalVerts);
  const mergedIndices = new Uint32Array(totalTris * 3);
  const materialSlots = new Array(totalTris);

  let vertOffset = 0;
  let triOffset = 0;
  let indexOffset = 0;

  for (const prim of primitives) {
    const vertCount = prim.vertices.length;
    const triCount = prim.indices.length / 3;
    const baseVert = vertOffset / 3;

    mergedVerts.set(prim.vertices, vertOffset);
    if (prim.normals) mergedNormals.set(prim.normals, vertOffset);
    if (prim.tangents) mergedTangents.set(prim.tangents, vertOffset);
    if (prim.uvs) {
      for (let i = 0; i < triCount * 3; i++) {
        const si = i * 2;
        mergedUvs[(vertOffset / 3) * 2 + si] = prim.uvs[si] ?? 0;
        mergedUvs[(vertOffset / 3) * 2 + si + 1] = prim.uvs[si + 1] ?? 0;
      }
    }
    if (prim.colors) mergedColors.set(prim.colors, vertOffset);

    for (let i = 0; i < prim.indices.length; i++) {
      mergedIndices[indexOffset + i] = prim.indices[i] + baseVert;
    }
    for (let t = 0; t < triCount; t++) {
      materialSlots[triOffset + t] = prim.materialId ?? "default";
    }

    vertOffset += vertCount;
    triOffset += triCount;
    indexOffset += prim.indices.length;
  }

  const bounds = meshBounds(mergedVerts);
  return {
    id: `${primitives[0].id}:merged`,
    vertices: mergedVerts,
    normals: mergedNormals.length > 0 ? mergedNormals : undefined,
    tangents: mergedTangents.length > 0 ? mergedTangents : undefined,
    uvs: mergedUvs.length > 0 ? mergedUvs : undefined,
    colors: mergedColors.length > 0 ? mergedColors : undefined,
    indices: mergedIndices,
    materialId: primitives[0].materialId ?? "default",
    materialSlots,
    bounds,
  };
}

/**
 * Decode and register all images embedded in a GLB as texture entries.
 * Returns an array of { texId, imageIndex, width, height } for wiring into materials.
 *
 * @param {object} gltf - Parsed glTF JSON.
 * @param {Uint8Array[]} bins - BIN chunks from the GLB.
 * @param {import("../render/rt4d/material/TextureRegistry.js").TextureRegistry} registry
 * @returns {Promise<Array<{ texId: string, imageIndex: number, width: number, height: number }>>}
 */
export async function importGLBTextures(gltf, bins, registry) {
  const results = [];
  const images = gltf.images ?? [];
  for (let i = 0; i < images.length; i++) {
    try {
      const decoded = await decodeGlbTextureImage(gltf, bins, i);
      const image = images[i];
      const texId = image.name ?? `glb-image:${i}`;
      registry.register({
        id: texId,
        width: decoded.width,
        height: decoded.height,
        data: decoded.data,
        role: "color",
      });
      results.push({ texId, imageIndex: i, width: decoded.width, height: decoded.height });
    } catch (err) {
      results.push({ texId: null, imageIndex: i, width: 0, height: 0, error: err.message });
    }
  }
  return results;
}

/**
 * Import meshes AND textures from a GLB binary buffer.
 * This is the async entry point that decodes embedded images and registers
 * them in the provided TextureRegistry (or a new one).
 *
 * @param {ArrayBuffer|Uint8Array} input - Raw GLB binary data.
 * @param {{ idPrefix?: string, defaultMaterialId?: string, applyTransforms?: boolean,
 *           textureRegistry?: import("../render/rt4d/material/TextureRegistry.js").TextureRegistry }} [opts]
 * @returns {Promise<GlbImportResult & { textures: Array, registry: import("../render/rt4d/material/TextureRegistry.js").TextureRegistry }>}
 */
export async function importGLBMeshes(input, opts = {}) {
  const { gltf, bin, bins } = parseGlb(input);
  const registry = opts.textureRegistry ?? null;
  const textures = registry ? await importGLBTextures(gltf, bins, registry) : [];

  const syncResult = importMeshesFromGlb(input, opts);

  const materialsWithTextures = syncResult.materials.map((mat) => {
    if (!registry || !mat.textureRefs?.length) return mat;
    const resolvedRefs = mat.textureRefs.map((ref) => {
      const texEntry = registry.entries().find((e) => e.id === ref.id);
      return texEntry ? { ...ref, id: texEntry.id } : ref;
    });
    return { ...mat, textureRefs: resolvedRefs };
  });

  return {
    ...syncResult,
    materials: materialsWithTextures,
    textures,
    registry,
  };
}
