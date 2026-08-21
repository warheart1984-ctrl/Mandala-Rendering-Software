import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { handleCreateRt4dScene } from "./create-rt4d-scene.ts";
import { handleExportRt4dAsset } from "./skeleton-tools.ts";

describe("export_rt4d_asset GLB fixture", () => {
  it("returns glbBase64 for the same sceneId (hull, not anatomical fox)", () => {
    const created = handleCreateRt4dScene({
      prompt: "fixture hull export",
      mode: "add_rt4d_powers",
    });
    const glb = handleExportRt4dAsset({
      sceneId: created.sceneId,
      format: "glb",
    });
    assert.equal(glb.statusTag, "partial");
    assert.equal(glb.implemented, true);
    assert.equal(glb.sceneId, created.sceneId);
    assert.equal(typeof glb.glbBase64, "string");
    const bytes = Buffer.from(glb.glbBase64, "base64");
    assert.equal(bytes.readUInt32LE(0), 0x46546c67);
    assert.ok(bytes.length > 64);
    assert.match(String(glb.note), /not an anatomical fox/i);

    const unity = handleExportRt4dAsset({
      sceneId: created.sceneId,
      format: "unity",
    });
    assert.equal(unity.statusTag, "declared");
    assert.equal(unity.implemented, false);
  });
});
