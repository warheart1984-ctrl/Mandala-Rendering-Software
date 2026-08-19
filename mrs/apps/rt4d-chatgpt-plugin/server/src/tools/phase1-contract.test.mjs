import assert from "node:assert/strict";
import { describe, it, before, after } from "node:test";
import { handleCreateRt4dScene } from "./create-rt4d-scene.ts";
import { handleRenderRt4dPreview } from "./render-rt4d-preview.ts";
import { handleInspectRt4dProvenance } from "./inspect-rt4d-provenance.ts";
import { handleUpdateRt4dScene } from "./update-rt4d-scene.ts";
import { handleExportRt4dAsset } from "./skeleton-tools.ts";
import { handleCreate4dScene } from "./create-4d-scene.ts";
import { handleBindCharacterRig } from "./bind-character-rig.ts";
import { handleRenderStage } from "./render-stage.ts";

describe("rt4d-chatgpt-plugin phase1+2", () => {
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
    const glb = handleExportRt4dAsset({
      sceneId: created.sceneId,
      format: "glb",
    });
    assert.equal(glb.statusTag, "partial");
    assert.equal(glb.implemented, true);
    assert.equal(glb.sceneId, created.sceneId);
    assert.equal(typeof glb.glbBase64, "string");
    assert.ok(glb.glbByteLength > 12);
    const bytes = Buffer.from(glb.glbBase64, "base64");
    assert.equal(bytes.readUInt32LE(0), 0x46546c67);
    assert.match(glb.note, /not an anatomical fox/i);
  });

  it("update_rt4d_scene patches rotations/projection and bumps continuity", async () => {
    const created = handleCreateRt4dScene({
      prompt: "interactive tesseract",
      mode: "add_rt4d_powers",
      rotationPlanes: [
        { plane: "XW", speed: 0.2 },
        { plane: "YW", speed: 0.2 },
      ],
      continuityState: { continuityVersion: 1 },
    });
    // Store mutates in place — snapshot hash before update.
    const priorSceneHash = created.provenance.hashes.sceneSha256;
    const updated = await handleUpdateRt4dScene({
      sceneId: created.sceneId,
      rotations: [
        { plane: "XW", speed: 0.9 },
        { plane: "YW", speed: 0.4 },
        { plane: "ZW", speed: 0.1 },
      ],
      projection: { distance4d: 5.5 },
      rePreview: false,
    });
    assert.equal(updated.statusTag, "partial");
    assert.equal(updated.implemented, true);
    assert.equal(updated.visualKind, "dimensional_preview");
    assert.equal(updated.projection.distance4d, 5.5);
    assert.equal(updated.rotations.length, 3);
    assert.equal(updated.continuityState.continuityVersion, 2);
    assert.ok(updated.provenance.hashes.sceneSha256);
    assert.notEqual(updated.provenance.hashes.sceneSha256, priorSceneHash);
  });

  it("render_rt4d_preview surfaces evidence=null on placeholder path", async () => {
    const created = handleCreateRt4dScene({
      prompt: "placeholder evidence check",
      mode: "create_anime_scene",
    });
    const prev = process.env.RT4D_ENGINE_URL;
    delete process.env.RT4D_ENGINE_URL;
    try {
      const preview = await handleRenderRt4dPreview({ sceneId: created.sceneId });
      assert.equal(preview.source, "placeholder");
      assert.equal(preview.evidence, null);
    } finally {
      if (prev !== undefined) process.env.RT4D_ENGINE_URL = prev;
    }
  });

  it("render_rt4d_preview surfaces the engine's evidence envelope on the success path", async () => {
    const created = handleCreateRt4dScene({
      prompt: "engine evidence wiring",
      mode: "create_anime_scene",
    });
    const FAKE_PNG = Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
      "base64",
    );
    const FAKE_EVIDENCE = {
      operation: "rt4d_dimensional_preview",
      source: "mrs-renderer-core/rt4d",
      engineVersion: "test",
      intentId: "intent-test",
      timelineId: "timeline-test",
      worldId: "world-test",
      sceneId: "rt4d-scene-fake",
      sceneSpecHash: "deadbeef",
      sceneSha256: "cafe",
      runId: "run-9",
      renderKey: "key-9",
      renderId: "rt4d-render-fake16",
      seed: 12345,
      projectionHash: "d".repeat(64),
      pixelHash: "e".repeat(64),
      pngHash: "f".repeat(64),
      pngSha256: "a".repeat(64),
      rendererVersion: "@mrs/renderer-core/rt4d@1.0.0",
      runtimeFingerprint: { node: "v24.18.0", zlib: "builtin", platform: "win32", arch: "x64" },
      parameters: { seed: 12345 },
      parametersHash: "b".repeat(64),
      replayToken: "c".repeat(64),
      at: "2026-08-02T00:00:00.000Z",
      evidenceStatus: "substrate_verified",
      promotionStatus: "not_promoted_to_ciems",
      verified: true,
    };
    const FAKE_RENDER_RESPONSE = {
      data: {
        renderReceipt: { 
          runId: "run-9", 
          sha256: FAKE_EVIDENCE.pngSha256, 
          renderKey: "key-9",
          renderId: FAKE_EVIDENCE.renderId,
          projectionHash: FAKE_EVIDENCE.projectionHash,
          pixelHash: FAKE_EVIDENCE.pixelHash,
          runtimeFingerprint: FAKE_EVIDENCE.runtimeFingerprint,
        },
        pngBase64: FAKE_PNG.toString("base64"),
        evidence: FAKE_EVIDENCE,
        renderId: FAKE_EVIDENCE.renderId,
        sceneSpecHash: FAKE_EVIDENCE.sceneSpecHash,
        projectionHash: FAKE_EVIDENCE.projectionHash,
        pixelHash: FAKE_EVIDENCE.pixelHash,
        pngHash: FAKE_EVIDENCE.pngHash,
        trajectoryRoot: "t".repeat(64),
        rendererVersion: FAKE_EVIDENCE.rendererVersion,
        runtimeFingerprint: FAKE_EVIDENCE.runtimeFingerprint,
        evidenceStatus: FAKE_EVIDENCE.evidenceStatus,
        promotionStatus: FAKE_EVIDENCE.promotionStatus,
      },
    };
    const originalFetch = globalThis.fetch;
    const originalUrl = process.env.RT4D_ENGINE_URL;
    process.env.RT4D_ENGINE_URL = "http://fake-engine.local";
    globalThis.fetch = (async (input, init) => {
      const url = String(input);
      if (url.endsWith("/v1/scenes") && init?.method === "POST") {
        return new Response(JSON.stringify({ data: { sceneId: "rt4d-scene-fake", sceneHash: "cafe" } }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }
      if (url.includes("/v1/scenes/") && url.endsWith("/render")) {
        return new Response(
          JSON.stringify(FAKE_RENDER_RESPONSE),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }
      return new Response(
        JSON.stringify({ ok: false, error: { code: "NO_ROUTE", message: "unexpected " + url } }),
        { status: 404, headers: { "content-type": "application/json" } },
      );
    });

    try {
      const preview = await handleRenderRt4dPreview({ sceneId: created.sceneId });
      assert.equal(preview.source, "engine");
      assert.ok(preview.evidence !== null, "engine path should attach evidence");
      assert.equal(preview.evidence?.replayToken, "c".repeat(64));
      assert.equal(preview.evidence?.seed, 12345);
      assert.equal(preview.evidence?.conformance?.ok, true);
      assert.ok(preview.text.includes("replayToken="));
    } finally {
      globalThis.fetch = originalFetch;
      if (originalUrl !== undefined) process.env.RT4D_ENGINE_URL = originalUrl;
      else delete process.env.RT4D_ENGINE_URL;
    }
  });
});

describe("rt4d-chatgpt-plugin character pipeline (energy / clay / beauty)", () => {
  it("create_4d_scene emits a replay-stable 4D energy wire mesh", () => {
    const a = handleCreate4dScene({
      prompt: "anthro fox warrior energy field unique-a",
      species: "anthro",
    });
    const b = handleCreate4dScene({
      prompt: "anthro fox warrior energy field unique-a",
      species: "anthro",
    });
    assert.equal(a.statusTag, "partial");
    assert.equal(a.visualKind, "energy_wire_mesh");
    assert.ok(a.wireMesh.vertexCount >= 16);
    assert.ok(a.wireMesh.edgeCount >= 32);
    assert.equal(a.wireMesh.vertices[0].length, 4);
    assert.equal(a.meshSha256, b.meshSha256);
    assert.equal(a.wireMesh.includesRigPolylines, false);
    assert.match(a.meshSha256, /^[0-9a-f]{64}$/);
    assert.ok(a.pngBase64);
    assert.equal(Buffer.from(a.pngBase64, "base64").subarray(0, 8).toString("hex"), "89504e470d0a1a0a");
    assert.equal(a.pngSha256, b.pngSha256);
    assert.equal(a.width, 512);
  });

  it("bind_character_rig attaches anthro fixture hashes onto the same sceneId", () => {
    const created = handleCreate4dScene({
      prompt: "bind anthro fox unique-b",
      species: "anthro",
    });
    const bound = handleBindCharacterRig({
      sceneId: created.sceneId,
      species: "anthro",
    });
    assert.equal(bound.statusTag, "partial");
    assert.equal(bound.rigBinding.species, "anthro");
    assert.equal(bound.rigBinding.status, "core-enforced-fixture-not-production-rig");
    assert.equal(bound.rigBinding.rigId, "anthro-standard-v1");
    assert.ok(bound.rigBinding.boneCount > 10);
    assert.match(bound.rigBinding.rigSha256, /^[0-9a-f]{64}$/);
    assert.equal(bound.includesRigPolylines, true);
    assert.notEqual(bound.meshSha256, created.meshSha256);
    const inspected = handleInspectRt4dProvenance({ sceneId: created.sceneId });
    assert.equal(inspected.characterPipeline.rigSha256, bound.rigBinding.rigSha256);
    assert.equal(inspected.shotEvidence.characterModelHash, bound.characterModelHash);
  });

  it("render_stage clay_rig is denied until bind, then shares mesh/rig hashes", async () => {
    const created = handleCreate4dScene({
      prompt: "clay requires bind unique-c",
      species: "anthro",
    });
    const denied = await handleRenderStage({
      sceneId: created.sceneId,
      stage: "clay_rig",
    });
    assert.equal(denied.error, "RigNotBound");

    const bound = handleBindCharacterRig({
      sceneId: created.sceneId,
      species: "anthro",
    });
    const clay = await handleRenderStage({
      sceneId: created.sceneId,
      stage: "clay_rig",
    });
    assert.equal(clay.stage, "clay_rig");
    assert.equal(clay.statusTag, "partial");
    assert.equal(clay.meshSha256, bound.meshSha256);
    assert.equal(clay.rigSha256, bound.rigBinding.rigSha256);
    assert.equal(clay.clay.bones.length, bound.rigBinding.boneCount);
    assert.equal(clay.clay.vertices3d[0].length, 3);
    assert.ok(clay.pngBase64);
    assert.equal(Buffer.from(clay.pngBase64, "base64").subarray(0, 8).toString("hex"), "89504e470d0a1a0a");
  });

  it("render_stage beauty is partial_with_gaps and returns a PNG", async () => {
    const created = handleCreate4dScene({
      prompt: "beauty declared unique-d",
      species: "anthro",
    });
    const prevPolish = process.env.RT4D_BEAUTY_POLISH;
    process.env.RT4D_BEAUTY_POLISH = "0";
    try {
      const denied = await handleRenderStage({
        sceneId: created.sceneId,
        stage: "beauty",
      });
      assert.equal(denied.error, "RigNotBound");
      handleBindCharacterRig({ sceneId: created.sceneId, species: "anthro" });
      const beauty = await handleRenderStage({
        sceneId: created.sceneId,
        stage: "beauty",
        width: 64,
        height: 64,
      });
      assert.equal(beauty.stage, "beauty");
      assert.equal(beauty.statusTag, "partial");
      assert.equal(beauty.beautyFidelity, "partial_with_gaps");
      assert.equal(beauty.visualKind, "beauty_partial_with_gaps");
      assert.equal(beauty.previewSource, "clay_raster");
      assert.ok(beauty.pngBase64);
      assert.equal(Buffer.from(beauty.pngBase64, "base64").subarray(0, 8).toString("hex"), "89504e470d0a1a0a");
      assert.ok(Array.isArray(beauty.gaps) && beauty.gaps.includes("photoreal_fur_leather_not_guaranteed"));
      const energy = await handleRenderStage({
        sceneId: created.sceneId,
        stage: "energy",
        width: 64,
        height: 64,
      });
      assert.equal(energy.meshSha256, beauty.meshSha256);
      assert.ok(energy.pngBase64);
    } finally {
      if (prevPolish === undefined) delete process.env.RT4D_BEAUTY_POLISH;
      else process.env.RT4D_BEAUTY_POLISH = prevPolish;
    }
  });
});
