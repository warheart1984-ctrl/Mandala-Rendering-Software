import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildEvidenceRecordV20 } from "../../src/scene/EvidenceBuilderV20.js";
import { createUniversalMaterial, createWorldObject, type Engine3DWorldDocument } from "../../src/world/WorldObject.js";

function world(): Engine3DWorldDocument {
  const camera = createWorldObject({
    id: "cam",
    kind: "camera",
    geometry: null,
    material: null,
    camera: { type: "portrait", target: [0, 1, 0] },
  });
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

describe("EvidenceBuilderV20", () => {
  it("includes deterministic morphHash from deformation state", () => {
    const a = buildEvidenceRecordV20({
      world: world(),
      scene: { camera: {}, lights: [] },
      frameIndex: 1,
      seed: 2,
      deformationState: { morphWeights: { smile: 1 } },
    });
    const b = buildEvidenceRecordV20({
      world: world(),
      scene: { camera: {}, lights: [] },
      frameIndex: 1,
      seed: 2,
      deformationState: { morphWeights: { smile: 1 } },
    });
    const c = buildEvidenceRecordV20({
      world: world(),
      scene: { camera: {}, lights: [] },
      frameIndex: 1,
      seed: 2,
      deformationState: { morphWeights: { smile: 0.5 } },
    });
    assert.equal(a.morphHash, b.morphHash);
    assert.notEqual(a.morphHash, c.morphHash);
  });
});
