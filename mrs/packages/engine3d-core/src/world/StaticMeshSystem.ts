import type { StaticMeshAsset, Transform, Vec3Tuple } from "./WorldObject.js";
import { hashCanonical } from "../scene/hash.js";
import { multiplyMat4, normalize3, transformPoint as mat4TransformPoint, transformVector } from "../human/mat4.js";
import type { Mat4Tuple } from "../human/HumanRigTypes.js";

export interface StaticMeshValidationIssue {
  readonly code: string;
  readonly message: string;
  readonly path?: string;
}

export interface StaticMeshValidationResult {
  readonly ok: boolean;
  readonly issues: readonly StaticMeshValidationIssue[];
}

function issue(code: string, message: string, path?: string): StaticMeshValidationIssue {
  return { code, message, path };
}

export function validateStaticMeshes(meshes: readonly StaticMeshAsset[] = []): StaticMeshValidationResult {
  const issues: StaticMeshValidationIssue[] = [];
  const ids = new Set<string>();
  for (const [index, mesh] of meshes.entries()) {
    const path = `meshes.${index}`;
    if (!mesh.id) issues.push(issue("missing-mesh-id", "StaticMeshAsset requires id.", `${path}.id`));
    if (ids.has(mesh.id)) issues.push(issue("duplicate-mesh-id", `Duplicate mesh id ${mesh.id}.`, `${path}.id`));
    ids.add(mesh.id);
    const vertexCount = mesh.vertices.length / 3;
    if (!Number.isInteger(vertexCount) || vertexCount <= 0) issues.push(issue("invalid-mesh-vertices", "vertices must be xyz triples.", `${path}.vertices`));
    if (mesh.normals && mesh.normals.length !== mesh.vertices.length) issues.push(issue("invalid-mesh-normals", "normals length must match vertices length.", `${path}.normals`));
    if (mesh.uvs && mesh.uvs.length !== vertexCount * 2) issues.push(issue("invalid-mesh-uvs", "uvs must contain two values per vertex.", `${path}.uvs`));
    if (mesh.indices.length < 3 || mesh.indices.length % 3 !== 0) issues.push(issue("invalid-mesh-indices", "indices must be triangle lists.", `${path}.indices`));
    for (const indexValue of mesh.indices) {
      if (!Number.isInteger(indexValue) || indexValue < 0 || indexValue >= vertexCount) {
        issues.push(issue("mesh-index-out-of-range", `Index ${indexValue} is outside vertex range.`, `${path}.indices`));
        break;
      }
    }
    if (!mesh.materialId) issues.push(issue("missing-mesh-material", "StaticMeshAsset requires materialId.", `${path}.materialId`));
  }
  return { ok: issues.length === 0, issues };
}

function translationMatrix([x, y, z]: Vec3Tuple): Mat4Tuple {
  return [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, x, y, z, 1];
}

function scaleMatrix([x, y, z]: Vec3Tuple): Mat4Tuple {
  return [x, 0, 0, 0, 0, y, 0, 0, 0, 0, z, 0, 0, 0, 0, 1];
}

function eulerRotationMatrix([rx, ry, rz]: Vec3Tuple): Mat4Tuple {
  const cx = Math.cos(rx), sx = Math.sin(rx);
  const cy = Math.cos(ry), sy = Math.sin(ry);
  const cz = Math.cos(rz), sz = Math.sin(rz);
  const x: Mat4Tuple = [1, 0, 0, 0, 0, cx, sx, 0, 0, -sx, cx, 0, 0, 0, 0, 1];
  const y: Mat4Tuple = [cy, 0, -sy, 0, 0, 1, 0, 0, sy, 0, cy, 0, 0, 0, 0, 1];
  const z: Mat4Tuple = [cz, sz, 0, 0, -sz, cz, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
  return multiplyMat4(z, multiplyMat4(y, x));
}

function quaternionRotationMatrix(q: readonly [number, number, number, number]): Mat4Tuple {
  const [x, y, z, w] = q;
  const len = Math.hypot(x, y, z, w) || 1;
  const nx = x / len, ny = y / len, nz = z / len, nw = w / len;
  const xx = nx * nx, yy = ny * ny, zz = nz * nz;
  const xy = nx * ny, xz = nx * nz, yz = ny * nz;
  const wx = nw * nx, wy = nw * ny, wz = nw * nz;
  return [
    1 - 2 * (yy + zz), 2 * (xy + wz), 2 * (xz - wy), 0,
    2 * (xy - wz), 1 - 2 * (xx + zz), 2 * (yz + wx), 0,
    2 * (xz + wy), 2 * (yz - wx), 1 - 2 * (xx + yy), 0,
    0, 0, 0, 1,
  ];
}

export function transformToMat4(transform: Transform): Mat4Tuple {
  const t = translationMatrix(transform.position);
  const r = transform.rotation.length === 4
    ? quaternionRotationMatrix(transform.rotation as readonly [number, number, number, number])
    : eulerRotationMatrix(transform.rotation as Vec3Tuple);
  const s = scaleMatrix(transform.scale);
  return multiplyMat4(t, multiplyMat4(r, s));
}

export function invertMat4(m: Mat4Tuple): Mat4Tuple {
  const out = new Array<number>(16);
  const b00 = m[0] * m[5] - m[1] * m[4];
  const b01 = m[0] * m[6] - m[2] * m[4];
  const b02 = m[0] * m[7] - m[3] * m[4];
  const b03 = m[1] * m[6] - m[2] * m[5];
  const b04 = m[1] * m[7] - m[3] * m[5];
  const b05 = m[2] * m[7] - m[3] * m[6];
  const b06 = m[8] * m[13] - m[9] * m[12];
  const b07 = m[8] * m[14] - m[10] * m[12];
  const b08 = m[8] * m[15] - m[11] * m[12];
  const b09 = m[9] * m[14] - m[10] * m[13];
  const b10 = m[9] * m[15] - m[11] * m[13];
  const b11 = m[10] * m[15] - m[11] * m[14];
  let det = b00 * b11 - b01 * b10 + b02 * b09 + b03 * b08 - b04 * b07 + b05 * b06;
  if (Math.abs(det) < 1e-12) return IDENTITY_FALLBACK;
  det = 1 / det;
  out[0] = (m[5] * b11 - m[6] * b10 + m[7] * b09) * det;
  out[1] = (m[2] * b10 - m[1] * b11 - m[3] * b09) * det;
  out[2] = (m[13] * b05 - m[14] * b04 + m[15] * b03) * det;
  out[3] = (m[10] * b04 - m[9] * b05 - m[11] * b03) * det;
  out[4] = (m[6] * b08 - m[4] * b11 - m[7] * b07) * det;
  out[5] = (m[0] * b11 - m[2] * b08 + m[3] * b07) * det;
  out[6] = (m[14] * b02 - m[12] * b05 - m[15] * b01) * det;
  out[7] = (m[8] * b05 - m[10] * b02 + m[11] * b01) * det;
  out[8] = (m[4] * b10 - m[5] * b08 + m[7] * b06) * det;
  out[9] = (m[1] * b08 - m[0] * b10 - m[3] * b06) * det;
  out[10] = (m[12] * b04 - m[13] * b02 + m[15] * b00) * det;
  out[11] = (m[9] * b02 - m[8] * b04 - m[11] * b00) * det;
  out[12] = (m[5] * b07 - m[4] * b09 - m[6] * b06) * det;
  out[13] = (m[0] * b09 - m[1] * b07 + m[2] * b06) * det;
  out[14] = (m[13] * b01 - m[12] * b03 - m[14] * b00) * det;
  out[15] = (m[8] * b03 - m[9] * b01 + m[10] * b00) * det;
  return out as unknown as Mat4Tuple;
}

const IDENTITY_FALLBACK: Mat4Tuple = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];

function transformPoint(x: number, y: number, z: number, matrix: Mat4Tuple): Vec3Tuple {
  return mat4TransformPoint(matrix, x, y, z);
}

function transformNormal(x: number, y: number, z: number, matrix: Mat4Tuple): Vec3Tuple {
  return normalize3(...transformVector(matrix, x, y, z));
}

export interface InstancedStaticMeshPrimitive {
  readonly kind: "poly";
  readonly id: string;
  readonly meshId: string;
  readonly instanceOf?: string;
  readonly vertices: Float32Array;
  readonly normals?: Float32Array;
  readonly uvs?: Float32Array;
  readonly indices: Uint16Array | Uint32Array;
  readonly materialId: string;
  readonly transform: Transform;
  readonly localVertices: Float32Array;
  readonly localNormals?: Float32Array;
  readonly localIndices: Uint16Array | Uint32Array;
  readonly localBvhKey: string;
  readonly instanceMatrix: Mat4Tuple;
  readonly inverseInstanceMatrix: Mat4Tuple;
  readonly evidence: {
    readonly meshAssetHash: string;
    readonly instanceHash: string;
    readonly bakedGeometryHash: string;
  };
}

export function instantiateStaticMesh(mesh: StaticMeshAsset, transform: Transform, id: string, instanceOf?: string): InstancedStaticMeshPrimitive {
  const matrix = transformToMat4(transform);
  const inverseMatrix = invertMat4(matrix);
  const vertices = new Float32Array(mesh.vertices.length);
  for (let i = 0; i + 2 < mesh.vertices.length; i += 3) {
    const p = transformPoint(mesh.vertices[i]!, mesh.vertices[i + 1]!, mesh.vertices[i + 2]!, matrix);
    vertices[i] = p[0];
    vertices[i + 1] = p[1];
    vertices[i + 2] = p[2];
  }
  let normals = mesh.normals;
  if (mesh.normals) {
    normals = new Float32Array(mesh.normals.length);
    for (let i = 0; i + 2 < mesh.normals.length; i += 3) {
      const n = transformNormal(mesh.normals[i]!, mesh.normals[i + 1]!, mesh.normals[i + 2]!, matrix);
      normals[i] = n[0];
      normals[i + 1] = n[1];
      normals[i + 2] = n[2];
    }
  }
  const bakedGeometryHash = hashCanonical({
    vertices: Array.from(vertices),
    normals: normals ? Array.from(normals) : [],
    indices: Array.from(mesh.indices),
  });
  return {
    kind: "poly",
    id,
    meshId: mesh.id,
    ...(instanceOf ? { instanceOf } : {}),
    vertices,
    normals,
    uvs: mesh.uvs,
    indices: mesh.indices,
    materialId: mesh.materialId,
    transform,
    localVertices: mesh.vertices,
    localNormals: mesh.normals,
    localIndices: mesh.indices,
    localBvhKey: hashStaticMesh(mesh),
    instanceMatrix: matrix,
    inverseInstanceMatrix: inverseMatrix,
    evidence: {
      meshAssetHash: hashStaticMesh(mesh),
      instanceHash: hashCanonical({ id, meshId: mesh.id, instanceOf, transform, matrix: Array.from(matrix) }),
      bakedGeometryHash,
    },
  };
}

export function hashStaticMesh(mesh: StaticMeshAsset): string {
  return hashCanonical({
    id: mesh.id,
    vertices: Array.from(mesh.vertices),
    normals: mesh.normals ? Array.from(mesh.normals) : [],
    uvs: mesh.uvs ? Array.from(mesh.uvs) : [],
    indices: Array.from(mesh.indices),
    materialId: mesh.materialId,
    bounds: mesh.bounds,
  });
}

export function hashStaticMeshTable(meshes: readonly StaticMeshAsset[] = []): string | undefined {
  return meshes.length ? hashCanonical([...meshes].map((mesh) => ({ id: mesh.id, hash: hashStaticMesh(mesh) })).sort((a, b) => a.id.localeCompare(b.id))) : undefined;
}
