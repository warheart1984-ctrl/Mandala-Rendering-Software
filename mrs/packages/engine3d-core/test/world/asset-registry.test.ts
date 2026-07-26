import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { AssetRegistry, hashAssetManifests, validateAssetManifests } from "../../src/world/AssetRegistry.js";

describe("AssetRegistry", () => {
  it("validates, sorts, and hashes governed asset manifests", () => {
    const assets = [
      { id: "texture-a", kind: "texture" as const, version: "1.0.0", contentHash: "sha256:textureabcdef", provenance: { source: "fixture" } },
      { id: "rig-a", kind: "rig" as const, version: "1.0.0", contentHash: "sha256:rigabcdef", tags: ["human"] },
    ];
    const registry = new AssetRegistry(assets);
    assert.deepEqual(registry.entries().map((asset) => asset.id), ["rig-a", "texture-a"]);
    assert.equal(validateAssetManifests(assets).ok, true);
    assert.equal(hashAssetManifests(assets), registry.hash());
  });

  it("rejects duplicate ids and invalid content hashes", () => {
    const result = validateAssetManifests([
      { id: "bad", kind: "mesh", version: "", contentHash: "x" },
      { id: "bad", kind: "mesh", version: "1", contentHash: "sha256:validhash" },
    ]);
    assert.equal(result.ok, false);
    assert.deepEqual(result.issues.map((issue) => issue.code), [
      "missing-asset-version",
      "invalid-asset-content-hash",
      "duplicate-asset-id",
    ]);
  });
});
