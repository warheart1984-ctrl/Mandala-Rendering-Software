import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { TextureRegistry, normalizeTextureEntry } from "./TextureRegistry.js";

describe("TextureRegistry", () => {
  it("normalizes texture entries with deterministic sampler defaults", () => {
    const entry = normalizeTextureEntry({
      id: "albedo",
      role: "color",
      width: 8,
      height: 4,
      format: "rgba8",
      colorSpace: "srgb",
      checksum: "sha256:abc12345",
    });
    assert.equal(entry.id, "albedo");
    assert.deepEqual(entry.sampler, {
      wrapS: "repeat",
      wrapT: "repeat",
      minFilter: "linear",
      magFilter: "linear",
    });
  });

  it("sorts entries and resolves material texture bindings", () => {
    const registry = new TextureRegistry([
      { id: "normal", role: "normal", width: 4, height: 4, format: "normal-rgb8", colorSpace: "linear", checksum: "sha256:normal12" },
      { id: "albedo", role: "color", width: 4, height: 4, format: "rgba8", colorSpace: "srgb", checksum: "sha256:albedo12" },
    ]);
    assert.deepEqual(registry.entries().map((entry) => entry.id), ["albedo", "normal"]);
    const bindings = registry.resolveMaterialTextures({
      id: "mat",
      params: { textureRefs: [{ id: "albedo", role: "color" }, { id: "missing", role: "roughness" }] },
    });
    assert.equal(bindings.length, 1);
    assert.equal(bindings[0].role, "color");
    assert.equal(bindings[0].texture.id, "albedo");
  });

  it("samples inline texture pixels by uv", () => {
    const registry = new TextureRegistry([{
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
    assert.deepEqual(registry.sample("albedo", [0.25, 0]), [1, 0, 0, 1]);
    assert.deepEqual(registry.sample("albedo", [0.75, 0]), [0, 1, 0, 1]);
  });
});
