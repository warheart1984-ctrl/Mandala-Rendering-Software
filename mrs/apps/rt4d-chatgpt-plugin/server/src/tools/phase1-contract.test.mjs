import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { handleCreateRt4dScene } from "./create-rt4d-scene.ts";
import { handleRenderRt4dPreview } from "./render-rt4d-preview.ts";
import { handleInspectRt4dProvenance } from "./inspect-rt4d-provenance.ts";
import { handleExportRt4dAsset } from "./skeleton-tools.ts";

describe("rt4d-chatgpt-plugin phase1", () => {
  it("create_rt4d_scene emits continuity + shot evidence", () => {
    const result = handleCreateRt4dScene({
      prompt: "golden 4D dragon XW YW dimensional awakening",
      mode: "add_rt4d_powers",
      rotationPlanes: [
        { plane: "XW", speed: 0.82 },
        { plane: "YW", speed: 0.31 },
      ],
      continuityState: {
        characterState: { name: "golden-dragon", persistent: false },
        continuityVersion: 1,
      },
    });
    assert.equal(result.statusTag, "partial");
    assert.ok(result.sceneId.startsWith("rt4d-scene-"));
    assert.equal(result.provenance.productLane, "anime_scene");
    assert.ok(result.provenance.intentId);
    assert.ok(result.provenance.timelineId);
    assert.ok(result.provenance.worldId);
    assert.equal(result.continuityState.continuityVersion, 1);
    assert.equal(result.shotEvidence.schemaVersion, "ShotEvidenceEnvelope.v1");
    assert.ok(result.shotEvidence.rt4dTransformHash);
    assert.ok(result.shotEvidence.shotId);
  });

  it("render_rt4d_preview returns placeholder without engine", async () => {
    const created = handleCreateRt4dScene({
      prompt: "temple mage tesseract XW",
      mode: "create_anime_scene",
    });
    const prev = process.env.RT4D_ENGINE_URL;
    delete process.env.RT4D_ENGINE_URL;
    try {
      const preview = await handleRenderRt4dPreview({
        sceneId: created.sceneId,
        width: 64,
        height: 64,
      });
      assert.equal(preview.source, "placeholder");
      assert.ok(preview.previewUrl.startsWith("data:image/png"));
      assert.ok(preview.sha256);
      assert.equal(preview.shotEvidence.outputHash, preview.sha256);
    } finally {
      if (prev !== undefined) process.env.RT4D_ENGINE_URL = prev;
    }
  });

  it("inspect returns envelope; export is declared stub", () => {
    const created = handleCreateRt4dScene({
      prompt: "manga panel fold",
      mode: "render_manga_panel",
    });
    const inspected = handleInspectRt4dProvenance({ sceneId: created.sceneId });
    assert.equal(inspected.shotEvidence.productLane, "manga");
    const exported = handleExportRt4dAsset({
      sceneId: created.sceneId,
      format: "unity",
    });
    assert.equal(exported.statusTag, "declared");
    assert.equal(exported.implemented, false);
  });
});
