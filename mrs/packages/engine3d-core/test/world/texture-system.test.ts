import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildRt4dTextureTable,
  hashTextureTable,
  validateTextureAssets,
  validateTextureRefs,
} from "../../src/world/TextureSystem.js";
import type { TextureAsset } from "../../src/world/WorldObject.js";

function texture(id: string): TextureAsset {
  return {
    id,
    role: "color",
    uri: `textures/${id}.png`,
    width: 4,
    height: 4,
    format: "rgba8",
    colorSpace: "srgb",
    checksum: `sha256:${id}abcdef`,
  };
}

describe("TextureSystem", () => {
  it("validates texture assets and builds deterministic RT4D texture tables", () => {
    const a = texture("a");
    const b = texture("b");
    assert.equal(validateTextureAssets([a, b]).ok, true);
    assert.deepEqual(buildRt4dTextureTable([b, a]).map((entry) => entry.id), ["a", "b"]);
    assert.equal(hashTextureTable([a, b]), hashTextureTable([b, a]));
  });

  it("rejects duplicate texture ids and invalid dimensions/checksums", () => {
    const bad = { ...texture("bad"), width: 0, height: -1, checksum: "x" };
    const result = validateTextureAssets([bad, bad]);
    assert.equal(result.ok, false);
    assert.deepEqual(result.issues.map((issue) => issue.code), [
      "invalid-texture-width",
      "invalid-texture-height",
      "invalid-texture-checksum",
      "duplicate-texture-id",
      "invalid-texture-width",
      "invalid-texture-height",
      "invalid-texture-checksum",
    ]);
  });

  it("validates material texture references against assets", () => {
    const result = validateTextureRefs([
      { id: "albedo", role: "color" },
      { id: "missing", role: "normal" },
      { id: "albedo", role: "color" },
    ], [texture("albedo")]);
    assert.equal(result.ok, false);
    assert.deepEqual(result.issues.map((issue) => issue.code), ["unknown-texture-ref", "duplicate-texture-ref"]);
  });
});
