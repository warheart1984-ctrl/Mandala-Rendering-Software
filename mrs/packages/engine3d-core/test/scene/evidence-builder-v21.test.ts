import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildEvidenceRecordV21 } from "../../src/scene/EvidenceBuilderV21.js";
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

describe("EvidenceBuilderV21", () => {
  it("records curveHash and multiSkinHash", () => {
    const a = buildEvidenceRecordV21({
      world: world(),
      scene: { camera: {}, lights: [] },
      frameIndex: 1,
      seed: 2,
      deformationState: {
        facialCurves: { curves: [{ id: "smile" }] },
        multiSkinRouting: { face: "face-skin" },
      },
    });
    const b = buildEvidenceRecordV21({
      world: world(),
      scene: { camera: {}, lights: [] },
      frameIndex: 1,
      seed: 2,
      deformationState: {
        facialCurves: { curves: [{ id: "smile" }] },
        multiSkinRouting: { face: "face-skin" },
      },
    });
    assert.equal(a.curveHash, b.curveHash);
    assert.equal(a.multiSkinHash, b.multiSkinHash);
  });
});
