import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildEvidenceRecordV5 } from "../../src/scene/EvidenceBuilderV5.js";
import type { FederatedRenderPlanV5 } from "../../src/scene/MultiTimelineV5.js";
import { createWorldObject, type Engine3DWorldDocument } from "../../src/world/WorldObject.js";

function world(): Engine3DWorldDocument {
  return {
    schemaVersion: "engine3d-world/1.0",
    id: "worldA",
    objects: [],
    materials: [],
    lights: [],
    cameras: [createWorldObject({ id: "camA", kind: "camera", geometry: null, material: null, camera: { type: "portrait", shutterSeconds: 1 / 48, motionBlur: true, motionPathId: "rail-a" } })],
    activeCameraId: "camA",
  };
}

function plan(): FederatedRenderPlanV5 {
  const w = world();
  return {
    id: "plan-v5",
    schemaVersion: "federated-render-plan/5.0",
    federation: {
      id: "fed",
      schemaVersion: "federated-world/4.0",
      capabilities: { sceneBridgeFederation: true },
      worlds: [{ id: "worldA", world: w }],
      links: [],
      timeline: { type: "linear", startFrame: 0, endFrame: 10 },
    },
    timeline: {
      schemaVersion: "multi-timeline/5.0",
      capabilities: { multiTimelineRendering: true },
      branches: [{ id: "main", frameStart: 0, frameEnd: 10 }],
    },
    cameras: {
      schemaVersion: "multi-camera/5.1",
      capabilities: { multiCameraRendering: true },
      cameraIds: ["camA"],
    },
  };
}

describe("EvidenceBuilderV5", () => {
  it("adds render plan, timeline branch, and multi-camera hashes", () => {
    const p = plan();
    const evidence = buildEvidenceRecordV5({
      world: world(),
      scene: { renders: [] },
      frameIndex: 1,
      seed: 2,
      federation: p.federation,
      timeline: p.timeline,
      cameras: p.cameras,
      renderPlan: p,
    });
    assert.equal(typeof evidence.timelineBranchHash, "string");
    assert.equal(typeof evidence.multiCameraHash, "string");
    assert.equal(typeof evidence.cameraMotionHash, "string");
    assert.equal(typeof evidence.renderPlanHash, "string");
    assert.equal(typeof evidence.federationHash, "string");
  });
});
