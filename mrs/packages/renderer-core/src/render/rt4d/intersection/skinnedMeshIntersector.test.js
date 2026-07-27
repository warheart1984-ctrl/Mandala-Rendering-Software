import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { vec4 } from "../math/vec4.js";
import { clearSharedMeshBvhCache, sharedMeshBvhCacheSize, SkinnedMeshIntersector, createSharedBvhCache } from "./SkinnedMeshIntersector.js";

describe("SkinnedMeshIntersector", () => {
  it("returns closest triangle hit with interpolated attributes and material slot", () => {
    const primitive = {
      kind: "skinned-mesh",
      materialId: "skin-default",
      vertices: new Float32Array([
        -1, -1, 4,
        1, -1, 4,
        0, 1, 4,
      ]),
      normals: new Float32Array([
        0, 0, -1,
        0, 0, -1,
        0, 0, -1,
      ]),
      tangents: new Float32Array([
        1, 0, 0, 1,
        1, 0, 0, 1,
        1, 0, 0, 1,
      ]),
      uvs: new Float32Array([0, 0, 1, 0, 0.5, 1]),
      indices: new Uint32Array([0, 1, 2]),
      materialSlots: ["skin-face"],
    };
    const intersector = new SkinnedMeshIntersector(primitive);
    const hit = intersector.intersect({
      origin: vec4(0, 0, 0, 0),
      direction: vec4(0, 0, 1, 0),
      tMin: 0.001,
      tMax: 100,
    });

    assert.ok(hit);
    assert.equal(hit.triangleIndex, 0);
    assert.equal(hit.materialId, "skin-face");
    assert.ok(Math.abs(hit.t - 4) < 1e-6);
    assert.ok(Math.abs(hit.position.z - 4) < 1e-6);
    assert.deepEqual(hit.uv.map((n) => Math.round(n * 1000) / 1000), [0.5, 0.5]);
    assert.ok(Math.abs(hit.normal.z + 1) < 1e-6);
  });

  it("misses rays outside the dynamic BVH bounds", () => {
    const intersector = new SkinnedMeshIntersector({
      kind: "skinned-mesh",
      vertices: new Float32Array([-1, -1, 4, 1, -1, 4, 0, 1, 4]),
      indices: new Uint32Array([0, 1, 2]),
    });
    const hit = intersector.intersect({
      origin: vec4(4, 4, 0, 0),
      direction: vec4(0, 0, 1, 0),
      tMin: 0.001,
      tMax: 100,
    });
    assert.equal(hit, null);
  });

  it("reuses cached mesh BVHs when instances share a baked geometry hash", () => {
    clearSharedMeshBvhCache();
    const primitive = {
      kind: "poly",
      vertices: new Float32Array([-1, -1, 4, 1, -1, 4, 0, 1, 4]),
      indices: new Uint32Array([0, 1, 2]),
      evidence: { bakedGeometryHash: "same-baked-triangle" },
    };
    const a = new SkinnedMeshIntersector({ ...primitive, id: "a" });
    const b = new SkinnedMeshIntersector({ ...primitive, id: "b" });
    assert.equal(sharedMeshBvhCacheSize(), 1);
    assert.equal(a.bvh, b.bvh);
  });

  it("traverses source mesh BVH in local instance space", () => {
    clearSharedMeshBvhCache();
    const localToWorld = [
      1, 0, 0, 0,
      0, 1, 0, 0,
      0, 0, 1, 0,
      10, 0, 0, 1,
    ];
    const worldToLocal = [
      1, 0, 0, 0,
      0, 1, 0, 0,
      0, 0, 1, 0,
      -10, 0, 0, 1,
    ];
    const intersector = new SkinnedMeshIntersector({
      kind: "poly",
      id: "instance-a",
      localVertices: new Float32Array([-1, -1, 4, 1, -1, 4, 0, 1, 4]),
      localIndices: new Uint32Array([0, 1, 2]),
      localBvhKey: "source-triangle",
      instanceMatrix: localToWorld,
      inverseInstanceMatrix: worldToLocal,
    });
    const hit = intersector.intersect({
      origin: vec4(10, 0, 0, 0),
      direction: vec4(0, 0, 1, 0),
      tMin: 0.001,
      tMax: 100,
    });
    assert.ok(hit);
    assert.equal(hit.traversalSpace, "local-instance");
    assert.ok(Math.abs(hit.position.x - 10) < 1e-6);
    assert.ok(Math.abs(hit.position.z - 4) < 1e-6);
    assert.equal(sharedMeshBvhCacheSize(), 1);
  });

  it("uses instance-specific BVH cache when provided", () => {
    clearSharedMeshBvhCache();
    const customCache = createSharedBvhCache();
    const primitive = {
      kind: "poly",
      vertices: new Float32Array([-1, -1, 4, 1, -1, 4, 0, 1, 4]),
      indices: new Uint32Array([0, 1, 2]),
      evidence: { bakedGeometryHash: "custom-cache-test" },
    };
    const intersector = new SkinnedMeshIntersector(primitive, { bvhCache: customCache });
    assert.equal(customCache.size, 1);
    assert.equal(sharedMeshBvhCacheSize(), 0);
  });
});
