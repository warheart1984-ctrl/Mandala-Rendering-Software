import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { handleCreateRt4dScene } from "./create-rt4d-scene.ts";
import { handleExportRt4dAsset } from "./skeleton-tools.ts";

describe("export_rt4d_asset GLB fixture", () => {
  it("unity/unreal stay declared; glb returns magic bytes", () => {
    const created = handleCreateRt4dScene({
      prompt: "manga panel fold",
      mode: "render_manga_panel",
    });
    const unity = handleExportRt4dAsset({
      sceneId: created.sceneId,
      format: "unity",
    });
    assert.equal(unity.statusTag, "declared");
    assert.equal(unity.implemented, false);

    const glb = handleExportRt4dAsset({
      sceneId: created.sceneId,
      format: "glb",
    });
    assert.equal(glb.statusTag, "partial");
    assert.equal(glb.implemented, true);
    assert.equal(typeof glb.glbBase64, "string");
    assert.ok(glb.glbByteLength > 12);
    const bytes = Buffer.from(glb.glbBase64, "base64");
    assert.equal(bytes.readUInt32LE(0), 0x46546c67);
    assert.match(glb.note, /not an anatomical fox/i);
    assert.equal(glb.meshName, "body");
    assert.ok(glb.animationTargets.includes("spine"));
  });
});
