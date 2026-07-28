/**
 * Procedural primitive meshes for Engine3DWorldDocument → soft-raster.
 * Status: **enforced** for builders used by worldDocumentToRasterMeshes.
 * All builders emit UV0 for multi-map texture sampling.
 */

import { IDENTITY_MAT4 } from "../../human/mat4.js";
import type { Mat4Tuple } from "../../human/HumanRigTypes.js";
import type { PrimitiveType } from "../../world/WorldObject.js";
import type { RasterMaterial } from "./RasterMaterial.js";
import { rasterMaterialFromBaseColor } from "./RasterMaterial.js";
import type { RasterMesh, Vec3 } from "./HeadlessStillRenderer.js";
import { buildBoxMesh, buildUvSphereMesh } from "./portraitMeshes.js";

function withMaterial(
  mesh: RasterMesh,
  material: RasterMaterial,
): RasterMesh {
  return {
    ...mesh,
    baseColor: material.baseColor,
    material,
  };
}

/** Unit capsule along +Y (height 2, radius 0.5) — scale via model matrix. */
export function buildCapsuleMesh(
  id: string,
  segments = 16,
  rings = 8,
  material: RasterMaterial = rasterMaterialFromBaseColor([0.15, 0.45, 1]),
  modelMatrix: Mat4Tuple = IDENTITY_MAT4,
): RasterMesh {
  const radius = 0.5;
  const half = 0.5;
  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];

  function pushVertex(
    x: number,
    y: number,
    z: number,
    nx: number,
    ny: number,
    nz: number,
    u: number,
    v: number,
  ) {
    positions.push(x, y, z);
    normals.push(nx, ny, nz);
    uvs.push(u, v);
  }

  const yMin = -half - radius;
  const yMax = half + radius;
  const totalRings = rings * 2 + 2;
  for (let yi = 0; yi <= totalRings; yi++) {
    const t = yi / totalRings;
    const y = yMin + (yMax - yMin) * t;
    let ny = 0;
    let rr = radius;
    if (y < -half) {
      const dy = y + half;
      const phi = Math.asin(Math.max(-1, Math.min(1, dy / radius)));
      ny = Math.sin(phi);
      rr = Math.cos(phi) * radius;
    } else if (y > half) {
      const dy = y - half;
      const phi = Math.asin(Math.max(-1, Math.min(1, dy / radius)));
      ny = Math.sin(phi);
      rr = Math.cos(phi) * radius;
    }
    for (let i = 0; i <= segments; i++) {
      const a = (i / segments) * Math.PI * 2;
      const nx = Math.cos(a);
      const nz = Math.sin(a);
      const px = nx * rr;
      const pz = nz * rr;
      const len = Math.hypot(nx * (rr > 1e-8 ? 1 : 0), ny, nz * (rr > 1e-8 ? 1 : 0)) || 1;
      pushVertex(
        px,
        y,
        pz,
        (nx * (rr > 1e-8 ? 1 : 0)) / len,
        ny / len,
        (nz * (rr > 1e-8 ? 1 : 0)) / len,
        i / segments,
        t,
      );
    }
  }
  const s = segments + 1;
  for (let yi = 0; yi < totalRings; yi++) {
    for (let i = 0; i < segments; i++) {
      const a = yi * s + i;
      const b = a + s;
      indices.push(a, b, a + 1, a + 1, b, b + 1);
    }
  }

  return withMaterial(
    {
      id,
      positions: new Float32Array(positions),
      normals: new Float32Array(normals),
      uvs: new Float32Array(uvs),
      indices: new Uint32Array(indices),
      modelMatrix,
      baseColor: material.baseColor,
    },
    material,
  );
}

export function buildCylinderMesh(
  id: string,
  segments = 20,
  material: RasterMaterial = rasterMaterialFromBaseColor([0.7, 0.7, 0.75]),
  modelMatrix: Mat4Tuple = IDENTITY_MAT4,
): RasterMesh {
  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  const r = 0.5;
  const h = 0.5;
  for (let y = 0; y <= 1; y++) {
    const py = y === 0 ? -h : h;
    for (let i = 0; i <= segments; i++) {
      const a = (i / segments) * Math.PI * 2;
      const nx = Math.cos(a);
      const nz = Math.sin(a);
      positions.push(nx * r, py, nz * r);
      normals.push(nx, 0, nz);
      uvs.push(i / segments, y);
    }
  }
  const stride = segments + 1;
  for (let i = 0; i < segments; i++) {
    indices.push(i, i + stride, i + 1, i + 1, i + stride, i + 1 + stride);
  }
  // Caps
  const topCenter = positions.length / 3;
  positions.push(0, h, 0);
  normals.push(0, 1, 0);
  uvs.push(0.5, 0.5);
  const botCenter = positions.length / 3;
  positions.push(0, -h, 0);
  normals.push(0, -1, 0);
  uvs.push(0.5, 0.5);
  for (let i = 0; i < segments; i++) {
    indices.push(topCenter, stride + i, stride + i + 1);
    indices.push(botCenter, i + 1, i);
  }
  return withMaterial(
    {
      id,
      positions: new Float32Array(positions),
      normals: new Float32Array(normals),
      uvs: new Float32Array(uvs),
      indices: new Uint32Array(indices),
      modelMatrix,
      baseColor: material.baseColor,
    },
    material,
  );
}

export function buildTorusMesh(
  id: string,
  major = 0.7,
  minor = 0.18,
  segments = 24,
  tubes = 12,
  material: RasterMaterial = rasterMaterialFromBaseColor([0.15, 0.45, 1]),
  modelMatrix: Mat4Tuple = IDENTITY_MAT4,
): RasterMesh {
  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  for (let i = 0; i <= segments; i++) {
    const u = (i / segments) * Math.PI * 2;
    const cu = Math.cos(u);
    const su = Math.sin(u);
    for (let j = 0; j <= tubes; j++) {
      const v = (j / tubes) * Math.PI * 2;
      const cv = Math.cos(v);
      const sv = Math.sin(v);
      const x = (major + minor * cv) * cu;
      const y = minor * sv;
      const z = (major + minor * cv) * su;
      const nx = cv * cu;
      const ny = sv;
      const nz = cv * su;
      positions.push(x, y, z);
      normals.push(nx, ny, nz);
      uvs.push(i / segments, j / tubes);
    }
  }
  const stride = tubes + 1;
  for (let i = 0; i < segments; i++) {
    for (let j = 0; j < tubes; j++) {
      const a = i * stride + j;
      const b = a + stride;
      indices.push(a, b, a + 1, a + 1, b, b + 1);
    }
  }
  return withMaterial(
    {
      id,
      positions: new Float32Array(positions),
      normals: new Float32Array(normals),
      uvs: new Float32Array(uvs),
      indices: new Uint32Array(indices),
      modelMatrix,
      baseColor: material.baseColor,
    },
    material,
  );
}

export function buildConeMesh(
  id: string,
  segments = 20,
  material: RasterMaterial = rasterMaterialFromBaseColor([0.8, 0.5, 0.2]),
  modelMatrix: Mat4Tuple = IDENTITY_MAT4,
): RasterMesh {
  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  const apex = 0;
  positions.push(0, 0.5, 0);
  normals.push(0, 1, 0);
  uvs.push(0.5, 0);
  for (let i = 0; i <= segments; i++) {
    const a = (i / segments) * Math.PI * 2;
    const x = Math.cos(a) * 0.5;
    const z = Math.sin(a) * 0.5;
    positions.push(x, -0.5, z);
    const nx = x;
    const ny = 0.5;
    const nz = z;
    const len = Math.hypot(nx, ny, nz) || 1;
    normals.push(nx / len, ny / len, nz / len);
    uvs.push(i / segments, 1);
  }
  for (let i = 1; i <= segments; i++) {
    indices.push(apex, i, i + 1);
  }
  const baseCenter = positions.length / 3;
  positions.push(0, -0.5, 0);
  normals.push(0, -1, 0);
  uvs.push(0.5, 0.5);
  for (let i = 1; i <= segments; i++) {
    indices.push(baseCenter, i + 1, i);
  }
  return withMaterial(
    {
      id,
      positions: new Float32Array(positions),
      normals: new Float32Array(normals),
      uvs: new Float32Array(uvs),
      indices: new Uint32Array(indices),
      modelMatrix,
      baseColor: material.baseColor,
    },
    material,
  );
}

export function buildPlaneMesh(
  id: string,
  material: RasterMaterial = rasterMaterialFromBaseColor([0.4, 0.42, 0.45]),
  modelMatrix: Mat4Tuple = IDENTITY_MAT4,
): RasterMesh {
  return withMaterial(
    {
      id,
      positions: new Float32Array([-1, 0, -1, 1, 0, -1, 1, 0, 1, -1, 0, 1]),
      normals: new Float32Array([0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0]),
      uvs: new Float32Array([0, 0, 1, 0, 1, 1, 0, 1]),
      indices: new Uint32Array([0, 1, 2, 0, 2, 3]),
      modelMatrix,
      baseColor: material.baseColor,
    },
    material,
  );
}

export function buildPyramidMesh(
  id: string,
  material: RasterMaterial = rasterMaterialFromBaseColor([0.7, 0.55, 0.3]),
  modelMatrix: Mat4Tuple = IDENTITY_MAT4,
): RasterMesh {
  const positions = [
    0, 0.5, 0,
    -0.5, -0.5, -0.5,
    0.5, -0.5, -0.5,
    0.5, -0.5, 0.5,
    -0.5, -0.5, 0.5,
  ];
  const faces = [
    [0, 1, 2],
    [0, 2, 3],
    [0, 3, 4],
    [0, 4, 1],
    [1, 4, 3],
    [1, 3, 2],
  ];
  const outP: number[] = [];
  const outN: number[] = [];
  const outU: number[] = [];
  const outI: number[] = [];
  let vi = 0;
  for (const f of faces) {
    const a = f[0]! * 3;
    const b = f[1]! * 3;
    const c = f[2]! * 3;
    const ax = positions[a]!, ay = positions[a + 1]!, az = positions[a + 2]!;
    const bx = positions[b]!, by = positions[b + 1]!, bz = positions[b + 2]!;
    const cx = positions[c]!, cy = positions[c + 1]!, cz = positions[c + 2]!;
    const ux = bx - ax, uy = by - ay, uz = bz - az;
    const vx = cx - ax, vy = cy - ay, vz = cz - az;
    let nx = uy * vz - uz * vy;
    let ny = uz * vx - ux * vz;
    let nz = ux * vy - uy * vx;
    const len = Math.hypot(nx, ny, nz) || 1;
    nx /= len; ny /= len; nz /= len;
    const faceUvs = [
      [0.5, 0],
      [0, 1],
      [1, 1],
    ] as const;
    f.forEach((idx, k) => {
      const o = idx * 3;
      outP.push(positions[o]!, positions[o + 1]!, positions[o + 2]!);
      outN.push(nx, ny, nz);
      const uv = faceUvs[k]!;
      outU.push(uv[0], uv[1]);
    });
    outI.push(vi, vi + 1, vi + 2);
    vi += 3;
  }
  return withMaterial(
    {
      id,
      positions: new Float32Array(outP),
      normals: new Float32Array(outN),
      uvs: new Float32Array(outU),
      indices: new Uint32Array(outI),
      modelMatrix,
      baseColor: material.baseColor,
    },
    material,
  );
}

export function buildIcosphereMesh(
  id: string,
  material: RasterMaterial = rasterMaterialFromBaseColor([0.6, 0.7, 0.9]),
  modelMatrix: Mat4Tuple = IDENTITY_MAT4,
): RasterMesh {
  // Reuse UV sphere as a dense stand-in (honest: not true icosphere topology).
  return withMaterial(
    buildUvSphereMesh(id, 0.5, 20, 14, material.baseColor, modelMatrix),
    material,
  );
}

export function buildSuperquadricMesh(
  id: string,
  material: RasterMaterial = rasterMaterialFromBaseColor([0.55, 0.35, 0.75]),
  modelMatrix: Mat4Tuple = IDENTITY_MAT4,
): RasterMesh {
  // Soft box-sphere hybrid via UV sphere squashed — distinct from plain sphere.
  const mesh = buildUvSphereMesh(id, 0.5, 18, 12, material.baseColor, modelMatrix);
  const p = mesh.positions;
  for (let i = 0; i < p.length; i += 3) {
    p[i]! *= 1.15;
    p[i + 1]! *= 0.85;
    p[i + 2]! *= 1.05;
  }
  return withMaterial(mesh, material);
}

export function buildPrimitiveRasterMesh(
  id: string,
  primitiveType: PrimitiveType | undefined,
  material: RasterMaterial,
  modelMatrix: Mat4Tuple,
): RasterMesh {
  switch (primitiveType) {
    case "box":
      return withMaterial(buildBoxMesh(id, [1, 1, 1], material.baseColor, modelMatrix), material);
    case "sphere":
      return withMaterial(buildUvSphereMesh(id, 0.5, 20, 14, material.baseColor, modelMatrix), material);
    case "plane":
      return buildPlaneMesh(id, material, modelMatrix);
    case "cylinder":
      return buildCylinderMesh(id, 20, material, modelMatrix);
    case "torus":
      return buildTorusMesh(id, 0.7, 0.18, 24, 12, material, modelMatrix);
    case "capsule":
      return buildCapsuleMesh(id, 16, 8, material, modelMatrix);
    case "cone":
      return buildConeMesh(id, 20, material, modelMatrix);
    case "pyramid":
      return buildPyramidMesh(id, material, modelMatrix);
    case "icosphere":
      return buildIcosphereMesh(id, material, modelMatrix);
    case "superquadric":
      return buildSuperquadricMesh(id, material, modelMatrix);
    default:
      return withMaterial(buildUvSphereMesh(id, 0.5, 16, 12, material.baseColor, modelMatrix), material);
  }
}
