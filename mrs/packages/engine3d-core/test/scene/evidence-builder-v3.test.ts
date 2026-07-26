import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildEvidenceRecordV3 } from "../../src/scene/EvidenceBuilderV3.js";
import { createUniversalMaterial, createWorldObject, type Engine3DWorldDocument } from "../../src/world/WorldObject.js";

function world(): Engine3DWorldDocument {
  const camera = createWorldObject({ id: "cam", kind: "camera", geometry: null, material: null });
  return {
    schemaVersion: "engine3d-world/1.0",
    id: "world",
    objects: [],
    materials: [createUniversalMaterial({ id: "skin", type: "skin" })],
    lights: [],
    cameras: [camera],
    activeCameraId: "cam",
  };
}

describe("EvidenceBuilderV3", () => {
  it("records muscle, soft-tissue, volume, and temporal hashes", () => {
    const record = buildEvidenceRecordV3({
      world: world(),
      scene: { camera: {}, lights: [] },
      frameIndex: 1,
      seed: 2,
      deformationState: {
        muscleActivation: { zygomaticusMajor: 1 },
        softTissueRegions: [{ id: "cheek" }],
      },
      simState: {
        volumes: { fog: 0.2 },
        temporal: { accumulationFrames: 8 },
      },
    });
    assert.equal(typeof record.muscleHash, "string");
    assert.equal(typeof record.softTissueHash, "string");
    assert.equal(typeof record.volumeHash, "string");
    assert.equal(typeof record.temporalHash, "string");
  });
});
