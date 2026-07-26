import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { FederatedSceneBridgeV5 } from "../../src/scene/FederatedSceneBridgeV5.js";
import { validateFederatedRenderPlanV5, type FederatedRenderPlanV5 } from "../../src/scene/MultiTimelineV5.js";
import { createUniversalMaterial, createWorldObject, type Engine3DWorldDocument } from "../../src/world/WorldObject.js";

function makeWorld(id: string): Engine3DWorldDocument {
  return {
    schemaVersion: "engine3d-world/1.0",
    id,
    objects: [createWorldObject({ id: "prop", kind: "primitive", geometry: { primitiveType: "sphere" }, material: { materialId: "mat" } })],
    materials: [createUniversalMaterial({ id: "mat", type: "basic" })],
    lights: [],
    cameras: [
      createWorldObject({ id: "camA", kind: "camera", geometry: null, material: null }),
      createWorldObject({ id: "camB", kind: "camera", geometry: null, material: null }),
    ],
    activeCameraId: "camA",
  };
}

function makePlan(): FederatedRenderPlanV5 {
  const world = makeWorld("worldA");
  return {
    id: "plan-v5",
    schemaVersion: "federated-render-plan/5.0",
    federation: {
      id: "fed",
      schemaVersion: "federated-world/4.0",
      capabilities: { sceneBridgeFederation: true },
      worlds: [{ id: "worldA", world }],
      links: [],
      timeline: { type: "linear", startFrame: 0, endFrame: 20 },
    },
    timeline: {
      schemaVersion: "multi-timeline/5.0",
      capabilities: { multiTimelineRendering: true },
      branches: [
        { id: "main", frameStart: 0, frameEnd: 20 },
        { id: "alt", parentBranchId: "main", frameStart: 10, frameEnd: 20, seedOffset: 7 },
      ],
    },
    cameras: {
      schemaVersion: "multi-camera/5.1",
      capabilities: { multiCameraRendering: true },
      cameraIds: ["camA", "camB"],
    },
  };
}

describe("FederatedSceneBridgeV5", () => {
  it("renders every active branch/camera pair through v4 and emits v5 evidence", () => {
    const result = new FederatedSceneBridgeV5().build(makePlan(), 10, 100, 0);
    assert.equal(result.scene.schemaVersion, "rt4d-bridge-scene/5.0");
    assert.equal(result.scene.renders.length, 4);
    assert.deepEqual(result.scene.renders.map((render) => `${render.branchId}:${render.cameraId}:${render.seed}`), [
      "main:camA:100",
      "main:camB:100",
      "alt:camA:107",
      "alt:camB:107",
    ]);
    assert.equal(typeof result.evidence.timelineBranchHash, "string");
    assert.equal(typeof result.evidence.multiCameraHash, "string");
    assert.equal(typeof result.evidence.renderPlanHash, "string");
    assert.equal(typeof result.evidence.worldEvidenceHash, "string");
  });

  it("requires explicit v5 timeline and camera capabilities", () => {
    const plan = {
      ...makePlan(),
      cameras: { schemaVersion: "multi-camera/5.1", capabilities: { multiCameraRendering: false }, cameraIds: ["camA"] },
    } as unknown as FederatedRenderPlanV5;
    assert.deepEqual(validateFederatedRenderPlanV5(plan), ["missing-multiCameraRendering-capability"]);
    assert.throws(() => new FederatedSceneBridgeV5().build(plan, 0, 1), /Invalid FederatedRenderPlan v5/);
  });

  it("rejects unknown camera ids", () => {
    const plan = {
      ...makePlan(),
      cameras: { schemaVersion: "multi-camera/5.1", capabilities: { multiCameraRendering: true }, cameraIds: ["missing"] },
    } as FederatedRenderPlanV5;
    assert.deepEqual(validateFederatedRenderPlanV5(plan), ["cameraIds.0.unknown-camera"]);
  });
});
