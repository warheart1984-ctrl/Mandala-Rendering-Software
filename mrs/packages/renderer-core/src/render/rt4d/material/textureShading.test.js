import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { MaterialSystem } from "./MaterialSystem.js";
import { TextureRegistry } from "./TextureRegistry.js";
import { resolveTexturedMaterial } from "./TextureShading.js";
import { vec4 } from "../math/vec4.js";

describe("resolveTexturedMaterial", () => {
  it("modulates lambertian albedo from bound color texture at hit uv", () => {
    const materials = new MaterialSystem();
    const mat = materials.createMaterial("mat", "lambertian", {
      albedo: vec4(0.5, 0.5, 0.5, 1),
      textureRefs: [{ id: "albedo", role: "color" }],
    });
    const textures = new TextureRegistry([{
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
    }]);

    const shaded = resolveTexturedMaterial(mat, { uv: [0.75, 0] }, textures);
    assert.equal(shaded.params.albedo.x, 0);
    assert.equal(shaded.params.albedo.y, 0.5);
    assert.equal(shaded.params.albedo.z, 0);
  });

  it("samples roughness and emissive maps deterministically", () => {
    const materials = new MaterialSystem();
    const mat = materials.createMaterial("mat", "ggx", {
      albedo: vec4(1, 1, 1, 1),
      roughness: 0.8,
      f0: vec4(0.04, 0.04, 0.04, 1),
      textureRefs: [{ id: "rough", role: "roughness" }, { id: "emit", role: "emissive" }],
    });
    const textures = new TextureRegistry([
      { id: "rough", width: 1, height: 1, format: "linear-r8", colorSpace: "linear", checksum: "sha256:rough123", data: new Uint8Array([64, 64, 64, 255]) },
      { id: "emit", width: 1, height: 1, format: "rgba8", colorSpace: "srgb", checksum: "sha256:emit1234", data: new Uint8Array([0, 128, 255, 255]) },
    ]);

    const shaded = resolveTexturedMaterial(mat, { uv: [0, 0] }, textures);
    assert.ok(Math.abs(shaded.params.roughness - 64 / 255) < 1e-6);
    assert.equal(shaded.emission.x, 0);
    assert.equal(shaded.emission.z, 1);
  });
});
