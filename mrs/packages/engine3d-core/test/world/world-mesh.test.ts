import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { DefaultWorldMesh } from "../../src/world/WorldMesh.js";

describe("world-mesh", () => {
  it("stores Float32 vertices/normals and Uint32 indices", () => {
    const mesh = new DefaultWorldMesh(
      new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]),
      new Float32Array([0, 0, 1, 0, 0, 1, 0, 0, 1]),
      new Uint32Array([0, 1, 2]),
    );
    assert.equal(mesh.vertices.length, 9);
    assert.equal(mesh.normals.length, 9);
    assert.equal(mesh.indices.length, 3);
    assert.ok(mesh.vertices instanceof Float32Array);
    assert.ok(mesh.indices instanceof Uint32Array);
  });
});
