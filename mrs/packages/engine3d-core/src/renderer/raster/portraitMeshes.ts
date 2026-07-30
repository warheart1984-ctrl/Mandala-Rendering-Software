/**
 * Portrait / demo mesh builders for HeadlessStillRenderer.
 *
 * Drive-G-1: these are structure meshes (triangles), not photoreal faces.
 * Optional HumanRig / GLB path is prepared when assets exist.
 */

import { readFileSync } from "node:fs";
import { IDENTITY_MAT4 } from "../../human/mat4.js";
import type { Mat4Tuple } from "../../human/HumanRigTypes.js";
import { loadHumanRigFromGlb } from "../../human/HumanRigLoader.js";
import { deformHumanRig } from "../../human/HumanRigDeformer.js";
import type { WorldMesh } from "../../world/WorldMesh.js";
import type { RasterMesh, Vec3 } from "./HeadlessStillRenderer.js";

/** Axis-aligned box centered at origin. */
export function buildBoxMesh(
  id: string,
  size: Vec3 = [1, 1, 1],
  baseColor: Vec3 = [0.85, 0.72, 0.62],
  modelMatrix: Mat4Tuple = IDENTITY_MAT4,
): RasterMesh {
  const [sx, sy, sz] = [size[0] / 2, size[1] / 2, size[2] / 2];
  const corners = [
    [-sx, -sy, -sz],
    [sx, -sy, -sz],
    [sx, sy, -sz],
    [-sx, sy, -sz],
    [-sx, -sy, sz],
    [sx, -sy, sz],
    [sx, sy, sz],
    [-sx, sy, sz],
  ] as const;
  const faces: Array<{ idx: number[]; n: Vec3 }> = [
    { idx: [0, 1, 2, 3], n: [0, 0, -1] },
    { idx: [5, 4, 7, 6], n: [0, 0, 1] },
    { idx: [4, 0, 3, 7], n: [-1, 0, 0] },
    { idx: [1, 5, 6, 2], n: [1, 0, 0] },
    { idx: [3, 2, 6, 7], n: [0, 1, 0] },
    { idx: [4, 5, 1, 0], n: [0, -1, 0] },
  ];
  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  let vi = 0;
  // Per-face quad UVs (0,0)-(1,0)-(1,1)-(0,1)
  const faceUv: Array<[number, number]> = [
    [0, 0],
    [1, 0],
    [1, 1],
    [0, 1],
  ];
  for (const f of faces) {
    const base = vi;
    let ui = 0;
    for (const ci of f.idx) {
      const c = corners[ci]!;
      positions.push(c[0], c[1], c[2]);
      normals.push(f.n[0], f.n[1], f.n[2]);
      const uv = faceUv[ui++]!;
      uvs.push(uv[0], uv[1]);
      vi += 1;
    }
    indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }
  return {
    id,
    positions: new Float32Array(positions),
    normals: new Float32Array(normals),
    indices: new Uint32Array(indices),
    modelMatrix,
    baseColor,
    uvs: new Float32Array(uvs),
  };
}

/** UV sphere for demo "head" structure. */
export function buildUvSphereMesh(
  id: string,
  radius = 0.55,
  segments = 24,
  rings = 16,
  baseColor: Vec3 = [0.9, 0.75, 0.65],
  modelMatrix: Mat4Tuple = IDENTITY_MAT4,
): RasterMesh {
  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  for (let y = 0; y <= rings; y++) {
    const v = y / rings;
    const phi = v * Math.PI;
    const sy = Math.cos(phi);
    const sr = Math.sin(phi);
    for (let x = 0; x <= segments; x++) {
      const u = x / segments;
      const theta = u * Math.PI * 2;
      const nx = Math.cos(theta) * sr;
      const ny = sy;
      const nz = Math.sin(theta) * sr;
      positions.push(nx * radius, ny * radius, nz * radius);
      normals.push(nx, ny, nz);
      uvs.push(u, v);
    }
  }
  const stride = segments + 1;
  for (let y = 0; y < rings; y++) {
    for (let x = 0; x < segments; x++) {
      const a = y * stride + x;
      const b = a + stride;
      indices.push(a, b, a + 1, a + 1, b, b + 1);
    }
  }
  return {
    id,
    positions: new Float32Array(positions),
    normals: new Float32Array(normals),
    indices: new Uint32Array(indices),
    modelMatrix,
    baseColor,
    uvs: new Float32Array(uvs),
  };
}

/** Convert a WorldMesh (single mesh) into one RasterMesh. */
export function worldMeshToRasterMesh(
  id: string,
  mesh: WorldMesh,
  baseColor: Vec3 = [0.75, 0.75, 0.8],
  modelMatrix: Mat4Tuple = IDENTITY_MAT4,
): RasterMesh {
  const nVerts = Math.floor(mesh.vertices.length / 3);
  let normals = mesh.normals;
  if (!normals || normals.length !== mesh.vertices.length) {
    normals = new Float32Array(nVerts * 3);
    for (let i = 0; i < nVerts; i++) normals[i * 3 + 1] = 1;
  }
  return {
    id,
    positions:
      mesh.vertices instanceof Float32Array
        ? mesh.vertices
        : new Float32Array(mesh.vertices),
    normals: normals instanceof Float32Array ? normals : new Float32Array(normals),
    indices:
      mesh.indices instanceof Uint32Array
        ? mesh.indices
        : new Uint32Array(mesh.indices),
    modelMatrix,
    baseColor,
  };
}

/**
 * Demo portrait structure: sphere "head" + box "shoulders".
 * Honest placeholder until a governed GLB asset is supplied.
 */
export function buildDemoPortraitMeshes(): RasterMesh[] {
  const head: Mat4Tuple = [
    1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0.55, 0, 1,
  ];
  const torso: Mat4Tuple = [
    1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, -0.35, 0, 1,
  ];
  return [
    buildUvSphereMesh("head", 0.48, 28, 18, [0.92, 0.74, 0.62], head),
    buildBoxMesh("torso", [1.1, 0.9, 0.55], [0.08, 0.08, 0.1], torso),
  ];
}

/**
 * HumanRig GLB → raster meshes when a path is provided.
 * Returns null on any load/deform failure (caller falls back to demo meshes).
 *
 * Status: **prepared**.
 */
export function buildPortraitRasterMeshesFromHumanRig(
  glbPath: string,
  poseId?: string,
): RasterMesh[] | null {
  try {
    const bytes = readFileSync(glbPath);
    const rig = loadHumanRigFromGlb(bytes);
    const deformed = deformHumanRig(rig, poseId);
    const meshes: RasterMesh[] = [];
    for (const mesh of deformed.meshes) {
      const role = String(mesh.role ?? mesh.id ?? "part");
      meshes.push({
        id: `human:${role}`,
        positions: mesh.vertices,
        normals:
          mesh.normals && mesh.normals.length === mesh.vertices.length
            ? mesh.normals
            : new Float32Array(mesh.vertices.length),
        indices:
          mesh.indices instanceof Uint32Array
            ? mesh.indices
            : new Uint32Array(mesh.indices),
        modelMatrix: IDENTITY_MAT4,
        baseColor: /skin|head|face/i.test(role)
          ? ([0.9, 0.74, 0.62] as Vec3)
          : ([0.15, 0.15, 0.18] as Vec3),
      });
    }
    return meshes.length > 0 ? meshes : null;
  } catch {
    return null;
  }
}
