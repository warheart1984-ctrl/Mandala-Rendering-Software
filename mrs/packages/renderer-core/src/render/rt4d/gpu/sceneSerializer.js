/**
 * Scene4D → GPU buffer serializer for RT4D WebGPU pipeline.
 * Produces flat typed arrays matching bvh4d.wgsl struct layouts.
 */
import { packBVH4D, flattenBVH4DNodes } from "../accel/gpu/bvh4dPacked.js";
import { BVH4D } from "../accel/BVH4D.js";
import { vec4 } from "../math/vec4.js";

export const PRIM_TYPE_SPHERE = 0;
export const PRIM_TYPE_PLANE = 1;
export const PRIM_TYPE_MESH_TRI = 2;

export function serializeScene(scene, device, camera) {
  const primitives = scene.primitives ?? [];
  const lights = scene.lights ?? [];

  const spheres = [];
  const planes = [];
  const meshTris = [];
  const primTypes = [];
  const primOffsets = [];

  for (let i = 0; i < primitives.length; i++) {
    const p = primitives[i];
    const matId = materialIndex(scene, p.materialId);

    if (p.center && p.radius != null && !p.normal) {
      spheres.push(packSphere(p, matId));
      primTypes.push(PRIM_TYPE_SPHERE);
      primOffsets.push(spheres.length - 1);
    } else if (p.normal && p.offset != null) {
      planes.push(packPlane(p, matId));
      primTypes.push(PRIM_TYPE_PLANE);
      primOffsets.push(planes.length - 1);
    } else if (p.faces || p.v0 != null) {
      const tris = packMeshTris(p, matId);
      for (const tri of tris) {
        meshTris.push(tri);
        primTypes.push(PRIM_TYPE_MESH_TRI);
        primOffsets.push(meshTris.length - 1);
      }
    }
  }

  const bvh = new BVH4D(primitives);
  const packedNodes = packBVH4D(bvh);
  const nodeFloats = flattenBVH4DNodes(packedNodes);

  const lightData = packLights(lights, scene);
  const matData = packMaterials(scene);
  const camData = packCamera(camera);

  const buffers = {
    nodes: createStorageBuf(device, nodeFloats),
    spheres: createStorageBuf(device, packSpheres(spheres)),
    planes: createStorageBuf(device, packPlanes(planes)),
    meshTris: createStorageBuf(device, packMeshTriArray(meshTris)),
    primType: createStorageBuf(device, new Int32Array(primTypes)),
    primOffset: createStorageBuf(device, new Int32Array(primOffsets)),
    lights: createStorageBuf(device, lightData),
    materials: createStorageBuf(device, matData),
    camera: createUniformBuf(device, camData),
  };

  return {
    buffers,
    counts: {
      spheres: spheres.length,
      planes: planes.length,
      meshTris: meshTris.length,
      primitives: primitives.length,
      lights: lights.length,
    },
  };
}

function materialIndex(scene, id) {
  const ids = scene.materials?.listIds?.() ?? [];
  const idx = ids.indexOf(id);
  return idx >= 0 ? idx : 0;
}

function packSphere(p, matId) {
  const c = p.center;
  return {
    center: [c.x, c.y, c.z, c.w],
    radius: p.radius,
    materialId: matId,
  };
}

function packPlane(p, matId) {
  const n = p.normal;
  return {
    normal: [n.x, n.y, n.z, n.w],
    offset: p.offset,
    materialId: matId,
  };
}

function packMeshTris(p, matId) {
  const tris = [];
  const faces = p.faces ?? [];
  const verts = p.vertices ?? [];
  for (const face of faces) {
    if (face.length < 3) continue;
    const v0 = verts[face[0]];
    const v1 = verts[face[1]];
    const v2 = verts[face[2]];
    if (!v0 || !v1 || !v2) continue;
    const e1x = v1.x - v0.x, e1y = v1.y - v0.y, e1z = v1.z - v0.z, e1w = v1.w - v0.w;
    const e2x = v2.x - v0.x, e2y = v2.y - v0.y, e2z = v2.z - v0.z, e2w = v2.w - v0.w;
    const n = normalize4(
      e1y * e2z - e1z * e2y,
      e1z * e2w - e1w * e2z,
      e1w * e2x - e1x * e2w,
      e1x * e2y - e1y * e2x,
    );
    tris.push({
      v0: [v0.x, v0.y, v0.z, v0.w],
      v1: [v1.x, v1.y, v1.z, v1.w],
      v2: [v2.x, v2.y, v2.z, v2.w],
      n0: n, n1: n, n2: n,
      materialId: matId,
    });
  }
  return tris;
}

function normalize4(x, y, z, w) {
  const len = Math.sqrt(x * x + y * y + z * z + w * w);
  if (len < 1e-12) return [0, 0, 0, 0];
  return [x / len, y / len, z / len, w / len];
}

function packSpheres(arr) {
  const f = new Float32Array(arr.length * 8);
  for (let i = 0; i < arr.length; i++) {
    const o = i * 8;
    f[o + 0] = arr[i].center[0];
    f[o + 1] = arr[i].center[1];
    f[o + 2] = arr[i].center[2];
    f[o + 3] = arr[i].center[3];
    f[o + 4] = arr[i].radius;
    f[o + 5] = arr[i].materialId;
    f[o + 6] = 0;
    f[o + 7] = 0;
  }
  return f;
}

function packPlanes(arr) {
  const f = new Float32Array(arr.length * 8);
  for (let i = 0; i < arr.length; i++) {
    const o = i * 8;
    f[o + 0] = arr[i].normal[0];
    f[o + 1] = arr[i].normal[1];
    f[o + 2] = arr[i].normal[2];
    f[o + 3] = arr[i].normal[3];
    f[o + 4] = arr[i].offset;
    f[o + 5] = arr[i].materialId;
    f[o + 6] = 0;
    f[o + 7] = 0;
  }
  return f;
}

function packMeshTriArray(arr) {
  const f = new Float32Array(arr.length * 26);
  for (let i = 0; i < arr.length; i++) {
    const o = i * 26;
    const t = arr[i];
    f[o + 0]  = t.v0[0]; f[o + 1]  = t.v0[1]; f[o + 2]  = t.v0[2]; f[o + 3]  = t.v0[3];
    f[o + 4]  = t.v1[0]; f[o + 5]  = t.v1[1]; f[o + 6]  = t.v1[2]; f[o + 7]  = t.v1[3];
    f[o + 8]  = t.v2[0]; f[o + 9]  = t.v2[1]; f[o + 10] = t.v2[2]; f[o + 11] = t.v2[3];
    f[o + 12] = t.n0[0]; f[o + 13] = t.n0[1]; f[o + 14] = t.n0[2]; f[o + 15] = t.n0[3];
    f[o + 16] = t.n1[0]; f[o + 17] = t.n1[1]; f[o + 18] = t.n1[2]; f[o + 19] = t.n1[3];
    f[o + 20] = t.n2[0]; f[o + 21] = t.n2[1]; f[o + 22] = t.n2[2]; f[o + 23] = t.n2[3];
    f[o + 24] = t.materialId;
    f[o + 25] = 0;
  }
  return f;
}

function packLights(lights, scene) {
  const arr = new Float32Array(Math.max(1, lights.length) * 12);
  for (let i = 0; i < lights.length; i++) {
    const l = lights[i];
    const c = l.center;
    const o = i * 12;
    arr[o + 0] = c.x; arr[o + 1] = c.y; arr[o + 2] = c.z; arr[o + 3] = c.w;
    arr[o + 4] = l.radius;
    arr[o + 5] = materialIndex(scene, l.materialId);
    arr[o + 6] = 0; arr[o + 7] = 0;
    const mat = scene.materials?.get?.(l.materialId);
    const em = mat?.emission ?? vec4(0, 0, 0, 0);
    arr[o + 8] = em.x; arr[o + 9] = em.y; arr[o + 10] = em.z; arr[o + 11] = em.w;
  }
  return arr;
}

function packMaterials(scene) {
  const ids = scene.materials?.listIds?.() ?? [];
  const arr = new Float32Array(Math.max(1, ids.length) * 16);
  for (let i = 0; i < ids.length; i++) {
    const m = scene.materials.get(ids[i]);
    const o = i * 16;
    const albedo = m.params?.albedo ?? vec4(0.8, 0.8, 0.8, 1);
    arr[o + 0] = albedo.x; arr[o + 1] = albedo.y; arr[o + 2] = albedo.z; arr[o + 3] = albedo.w;
    const em = m.emission ?? vec4(0, 0, 0, 0);
    arr[o + 4] = em.x; arr[o + 5] = em.y; arr[o + 6] = em.z; arr[o + 7] = em.w;
    const typeCode = m.type === "ggx" ? 1 : m.type === "light" ? 2 : m.type === "volume" ? 3 : 0;
    arr[o + 8] = typeCode;
    arr[o + 9] = m.params?.roughness ?? 0;
    arr[o + 10] = m.params?.f0?.x ?? 1.5;
    arr[o + 11] = m.sigmaT ?? 0;
    arr[o + 12] = m.sigmaS ?? 0;
    arr[o + 13] = m.params?.asymmetry ?? 0;
    arr[o + 14] = m.isLight ? 1 : 0;
    arr[o + 15] = m.isVolume ? 1 : 0;
  }
  return arr;
}

function packCamera(cam) {
  if (!cam) return new Float32Array(64);
  const arr = new Float32Array(64);
  const p = cam.position;
  arr[0] = p.x; arr[1] = p.y; arr[2] = p.z; arr[3] = p.w;
  const b = cam.basis ?? {};
  const fwd = b.forward ?? { x: 0, y: 0, z: 1, w: 0 };
  const right = b.right ?? { x: 1, y: 0, z: 0, w: 0 };
  const up = b.up ?? { x: 0, y: 1, z: 0, w: 0 };
  const thru = b.thru ?? { x: 0, y: 0, z: 0, w: 1 };
  arr[4] = fwd.x; arr[5] = fwd.y; arr[6] = fwd.z; arr[7] = fwd.w;
  arr[8] = right.x; arr[9] = right.y; arr[10] = right.z; arr[11] = right.w;
  arr[12] = up.x; arr[13] = up.y; arr[14] = up.z; arr[15] = up.w;
  arr[16] = thru.x; arr[17] = thru.y; arr[18] = thru.z; arr[19] = thru.w;
  arr[20] = cam.fovX ?? 60; arr[21] = cam.fovY ?? 45;
  arr[22] = cam.fovZ ?? 45; arr[23] = cam.fovW ?? 30;
  arr[24] = cam.width ?? 1920; arr[25] = cam.height ?? 1080;
  arr[26] = cam.lensRadius ?? 0; arr[27] = cam.focalDistance ?? 1;
  return arr;
}

function createStorageBuf(device, data) {
  const buf = device.createBuffer({
    size: Math.max(4, data.byteLength),
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    mappedAtCreation: true,
  });
  new Float32Array(buf.getMappedRange()).set(
    data instanceof Float32Array ? data : new Float32Array(data)
  );
  buf.unmap();
  return buf;
}

function createUniformBuf(device, data) {
  const size = Math.max(256, Math.ceil(data.byteLength / 16) * 16);
  const buf = device.createBuffer({
    size,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    mappedAtCreation: true,
  });
  new Float32Array(buf.getMappedRange()).set(data);
  buf.unmap();
  return buf;
}
