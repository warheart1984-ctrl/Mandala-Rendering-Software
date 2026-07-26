import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { Scene4D } from "./Scene4D.js";
import { vec4 } from "../math/vec4.js";

describe("Scene4D skinned mesh primitive hook", () => {
  it("consumes governed RT4D light rig and environment entries", () => {
    const scene = new Scene4D();
    scene.consumeBridgeLighting({
      lightRig: [{ id: "key", type: "directional", color: [1, 1, 1], intensity: 2, direction: [0, 0, -1] }],
      environment: { preset: "cosmic", color: [0.2, 0.3, 1], intensity: 1.5 },
    });
    assert.equal(scene.getRt4dLights().length, 1);
    assert.equal(scene.getRt4dLights()[0].id, "key");
    assert.equal(scene.getEnvironment({}).z, 1.5);
  });

  it("wraps raw skinned-mesh primitives with an intersector", () => {
    const scene = new Scene4D();
    const primitive = {
      kind: "skinned-mesh",
      vertices: new Float32Array([-1, -1, 4, 1, -1, 4, 0, 1, 4]),
      indices: new Uint32Array([0, 1, 2]),
    };
    scene.addPrimitive(primitive, "skin");
    const hit = scene.intersect({
      origin: vec4(0, 0, 0, 0),
      direction: vec4(0, 0, 1, 0),
      tMin: 0.001,
      tMax: 100,
    });
    assert.ok(hit);
    assert.equal(hit.materialId, "skin");
  });

  it("resolves hit-specific textured material from interpolated uv", () => {
    const scene = new Scene4D();
    scene.materials.createMaterial("skin", "lambertian", {
      albedo: vec4(0.5, 0.5, 0.5, 1),
      textureRefs: [{ id: "albedo", role: "color" }],
    });
    scene.textures.register({
      id: "albedo",
      width: 2,
      height: 1,
      format: "rgba8",
      colorSpace: "srgb",
      checksum: "sha256:albedo12",
      data: new Uint8Array([
        255, 0, 0, 255,
        0, 255, 0, 255,
      ]),
    });
    scene.addPrimitive({
      kind: "skinned-mesh",
      vertices: new Float32Array([0, 0, 4, 1, 0, 4, 0, 1, 4]),
      normals: new Float32Array([0, 0, -1, 0, 0, -1, 0, 0, -1]),
      indices: new Uint16Array([0, 1, 2]),
      uvs: new Float32Array([0, 0, 1, 0, 0, 1]),
    }, "skin");
    const hit = scene.intersect({
      origin: { x: 0.75, y: 0.01, z: 0, w: 0 },
      direction: { x: 0, y: 0, z: 1, w: 0 },
      tMin: 0.001,
      tMax: 100,
    });
    assert.ok(hit);
    const shaded = scene.getShadedMaterial("skin", hit);
    assert.equal(shaded.params.albedo.x, 0);
    assert.equal(shaded.params.albedo.y, 0.5);
  });

  it("wraps raw static poly mesh primitives with the mesh intersector", () => {
    const scene = new Scene4D();
    scene.addPrimitive({
      kind: "poly",
      vertices: new Float32Array([0, 0, 4, 1, 0, 4, 0, 1, 4]),
      normals: new Float32Array([0, 0, -1, 0, 0, -1, 0, 0, -1]),
      uvs: new Float32Array([0, 0, 1, 0, 0, 1]),
      indices: new Uint16Array([0, 1, 2]),
    }, "mesh-mat");
    const hit = scene.intersect({
      origin: vec4(0.25, 0.25, 0, 0),
      direction: vec4(0, 0, 1, 0),
      tMin: 0.001,
      tMax: 100,
    });
    assert.ok(hit);
    assert.equal(hit.materialId, "mesh-mat");
    assert.deepEqual(hit.uv.map((value) => Math.round(value * 100) / 100), [0.25, 0.25]);
  });
});
