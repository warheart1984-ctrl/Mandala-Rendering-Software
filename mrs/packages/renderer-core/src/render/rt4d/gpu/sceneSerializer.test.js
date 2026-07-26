import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { serializeScene, PRIM_TYPE_SPHERE, PRIM_TYPE_PLANE, PRIM_TYPE_MESH_TRI } from "./sceneSerializer.js";

globalThis.GPUBufferUsage ??= {
  MAP_READ: 1, COPY_DST: 4, COPY_SRC: 2, STORAGE: 8,
  VERTEX: 16, INDEX: 32, UNIFORM: 64, INDIRECT: 256,
};

function mockDevice() {
  const buffers = [];
  return {
    _buffers: buffers,
    createBuffer({ size, usage }) {
      const ab = new ArrayBuffer(size);
      const buf = {
        _arrayBuffer: ab,
        _mapped: false,
        size,
        usage,
        getMappedRange() {
          this._mapped = true;
          return ab;
        },
        unmap() {
          this._mapped = false;
        },
        destroy() {},
      };
      buffers.push(buf);
      return buf;
    },
  };
}

function countMapped(buf) {
  return buf._mapped ? 1 : 0;
}

const mockCamera = {
  position: { x: 0, y: 0, z: 0, w: 0 },
  basis: {
    forward: { x: 0, y: 0, z: 1, w: 0 },
    right: { x: 1, y: 0, z: 0, w: 0 },
    up: { x: 0, y: 1, z: 0, w: 0 },
    thru: { x: 0, y: 0, z: 0, w: 1 },
  },
  fovX: 60, fovY: 45, fovZ: 45, fovW: 30,
  width: 1920, height: 1080,
  lensRadius: 0, focalDistance: 1,
};

function mockMaterials(scene) {
  const matMap = new Map();
  const matList = [];
  let idCounter = 0;
  const api = {
    add(m) {
      const id = `mat_${++idCounter}`;
      matMap.set(id, m);
      matList.push(id);
      return id;
    },
    listIds() { return [...matList]; },
    get(id) { return matMap.get(id); },
  };
  scene.materials = api;
  return api;
}

describe("serializeScene", () => {
  it("produces buffers and counts for an empty scene", () => {
    const device = mockDevice();
    const scene = { primitives: [], lights: [] };
    const result = serializeScene(scene, device, mockCamera);
    assert.ok(result.buffers);
    assert.equal(result.counts.primitives, 0);
    assert.equal(result.counts.spheres, 0);
    assert.equal(result.counts.planes, 0);
    assert.equal(result.counts.lights, 0);
    // nodes, spheres, planes, meshTris, primType, primOffset, lights, materials, camera = 9
    assert.equal(device._buffers.length, 9);
  });

  it("serializes a single sphere primitive", () => {
    const device = mockDevice();
    const scene = { primitives: [{
      center: { x: 1, y: 2, z: 3, w: 4 },
      radius: 2.5,
      materialId: "mat_default",
    }], lights: [] };
    mockMaterials(scene).add({ params: { albedo: { x: 1, y: 0, z: 0, w: 1 } } });
    const result = serializeScene(scene, device, mockCamera);
    assert.equal(result.counts.primitives, 1);
    assert.equal(result.counts.spheres, 1);
  });

  it("serializes a single plane primitive", () => {
    const device = mockDevice();
    const scene = { primitives: [{
      normal: { x: 0, y: 1, z: 0, w: 0 },
      offset: 3,
      materialId: "mat_plane",
    }], lights: [] };
    mockMaterials(scene).add({ params: { albedo: { x: 0, y: 1, z: 0, w: 1 } } });
    const result = serializeScene(scene, device, mockCamera);
    assert.equal(result.counts.primitives, 1);
    assert.equal(result.counts.planes, 1);
  });

  it("serializes a mesh primitive with faces", () => {
    const device = mockDevice();
    const scene = { primitives: [{
      vertices: [
        { x: 0, y: 0, z: 0, w: 0 },
        { x: 1, y: 0, z: 0, w: 0 },
        { x: 0, y: 1, z: 0, w: 0 },
      ],
      faces: [[0, 1, 2]],
      materialId: "mat_mesh",
    }], lights: [] };
    mockMaterials(scene).add({ params: { albedo: { x: 0, y: 0, z: 1, w: 1 } } });
    const result = serializeScene(scene, device, mockCamera);
    assert.equal(result.counts.primitives, 1);
    assert.equal(result.counts.meshTris, 1);
  });

  it("serializes typed static poly mesh instances for GPU upload", () => {
    const device = mockDevice();
    const scene = { primitives: [{
      kind: "poly",
      id: "tri-instance",
      meshId: "tri",
      vertices: new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]),
      normals: new Float32Array([0, 0, 1, 0, 0, 1, 0, 0, 1]),
      indices: new Uint16Array([0, 1, 2]),
      materialId: "mat_mesh",
      evidence: { instanceHash: "inst", bakedGeometryHash: "baked" },
    }], lights: [] };
    mockMaterials(scene).add({ params: { albedo: { x: 0, y: 0, z: 1, w: 1 } } });
    const result = serializeScene(scene, device, mockCamera);
    assert.equal(result.counts.primitives, 1);
    assert.equal(result.counts.meshTris, 1);
  });

  it("warms persistent mesh buffers while serializing typed mesh primitives", () => {
    const device = mockDevice();
    const cached = [];
    const meshBufferCache = {
      getOrCreate(key, mesh) {
        cached.push({ key, mesh });
        return { key, vertexCount: mesh.vertices.length / 3, indexCount: mesh.indices.length };
      },
    };
    const scene = { primitives: [{
      kind: "poly",
      id: "tri-instance",
      meshId: "tri",
      localVertices: new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]),
      localIndices: new Uint16Array([0, 1, 2]),
      vertices: new Float32Array([10, 0, 0, 11, 0, 0, 10, 1, 0]),
      indices: new Uint16Array([0, 1, 2]),
      localBvhKey: "mesh:tri",
      materialId: "mat_mesh",
    }], lights: [] };
    mockMaterials(scene).add({ params: { albedo: { x: 0, y: 0, z: 1, w: 1 } } });
    serializeScene(scene, device, mockCamera, { meshBufferCache });
    assert.equal(cached.length, 1);
    assert.equal(cached[0].key, "mesh:tri");
    assert.equal(cached[0].mesh.vertices, scene.primitives[0].localVertices);
  });

  it("serializes light sources", () => {
    const device = mockDevice();
    const scene = { primitives: [], lights: [{
      center: { x: 10, y: 10, z: 10, w: 0 },
      radius: 1,
      materialId: "mat_light",
    }] };
    const mats = mockMaterials(scene);
    mats.add({ emission: { x: 10, y: 10, z: 10, w: 1 }, type: "light", isLight: true });
    const result = serializeScene(scene, device, mockCamera);
    assert.equal(result.counts.lights, 1);
  });

  it("handles mixed spheres, planes, and meshes", () => {
    const device = mockDevice();
    const scene = {
      primitives: [
        { center: { x: 0, y: 0, z: 0, w: 0 }, radius: 1, materialId: "m1" },
        { normal: { x: 0, y: 0, z: 1, w: 0 }, offset: 5, materialId: "m2" },
        { vertices: [{ x: 0, y: 0, z: 0, w: 0 }, { x: 1, y: 0, z: 0, w: 0 }, { x: 0, y: 1, z: 0, w: 0 }], faces: [[0, 1, 2]], materialId: "m3" },
      ],
      lights: [],
    };
    const mats = mockMaterials(scene);
    mats.add({ params: { albedo: { x: 1, y: 0, z: 0, w: 1 } } });
    mats.add({ params: { albedo: { x: 0, y: 1, z: 0, w: 1 } } });
    mats.add({ params: { albedo: { x: 0, y: 0, z: 1, w: 1 } } });
    const result = serializeScene(scene, device, mockCamera);
    assert.equal(result.counts.spheres, 1);
    assert.equal(result.counts.planes, 1);
    assert.equal(result.counts.meshTris, 1);
    assert.equal(result.counts.primitives, 3);
  });

  it("skips primitives with insufficient data", () => {
    const device = mockDevice();
    // Missing both center/radius and normal/offset and faces/vertices
    const scene = { primitives: [{ materialId: "m1" }], lights: [] };
    mockMaterials(scene).add({});
    const result = serializeScene(scene, device, mockCamera);
    assert.equal(result.counts.primitives, 1);
    assert.equal(result.counts.spheres, 0);
    assert.equal(result.counts.planes, 0);
    assert.equal(result.counts.meshTris, 0);
  });

  it("creates a BVH with packed nodes", () => {
    const device = mockDevice();
    const scene = { primitives: [
      { center: { x: -5, y: 0, z: 0, w: 0 }, radius: 0.5, materialId: "m" },
      { center: { x: 5, y: 0, z: 0, w: 0 }, radius: 0.5, materialId: "m" },
    ], lights: [] };
    mockMaterials(scene).add({ params: { albedo: { x: 0.8, y: 0.8, z: 0.8, w: 1 } } });
    const result = serializeScene(scene, device, mockCamera);
    assert.ok(result.buffers.nodes.size >= 48);
    assert.equal(result.counts.primitives, 2);
  });

  it("serializeScene returns correct camera buffer layout", () => {
    const device = mockDevice();
    const scene = { primitives: [], lights: [] };
    const result = serializeScene(scene, device, mockCamera);
    const camBuf = device._buffers.find(b => b.size >= 256);
    assert.ok(camBuf);
    const view = new Float32Array(camBuf._arrayBuffer);
    assert.equal(view[0], 0); // position x
    assert.equal(view[4], 0); // forward x
    assert.equal(view[24], 1920); // width
    assert.equal(view[25], 1080); // height
  });
});
