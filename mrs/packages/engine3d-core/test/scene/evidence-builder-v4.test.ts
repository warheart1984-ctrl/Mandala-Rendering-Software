import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildEvidenceRecordV4 } from "../../src/scene/EvidenceBuilderV4.js";
import type { FederatedWorldV4 } from "../../src/scene/FederatedWorldV4.js";
import { createUniversalMaterial, createWorldObject, type Engine3DWorldDocument } from "../../src/world/WorldObject.js";

function makeWorld(id: string): Engine3DWorldDocument {
  return {
    schemaVersion: "engine3d-world/1.0",
    id,
    objects: [createWorldObject({ id: `${id}-sphere`, kind: "primitive", geometry: { primitiveType: "sphere" }, material: { materialId: "mat" } })],
    materials: [createUniversalMaterial({ id: "mat", type: "basic" })],
    lights: [],
    cameras: [],
    activeCameraId: "",
  };
}

describe("EvidenceBuilderV4", () => {
  it("adds deterministic federation, region, and sim hashes on top of v3 evidence", () => {
    const worldA = makeWorld("worldA");
    const federation: FederatedWorldV4 = {
      id: "federation-001",
      schemaVersion: "federated-world/4.0",
      capabilities: { sceneBridgeFederation: true },
      worlds: [{ id: "worldA", world: worldA }],
      links: [],
      timeline: { type: "linear", startFrame: 0, endFrame: 10 },
    };

    const evidence = buildEvidenceRecordV4({
      world: worldA,
      scene: { primitives: [] },
      frameIndex: 1,
      seed: 42,
      federation,
      regionState: { softTissue: ["cheek"] },
      simState: { physics: { bodies: 1 }, particles: { count: 2 }, fluids: { waves: 3 }, weather: { wind: 4 } },
    });

    assert.equal(typeof evidence.federationHash, "string");
    assert.equal(typeof evidence.worldLinkHash, "string");
    assert.equal(typeof evidence.timelineHash, "string");
    assert.equal(typeof evidence.multiWorldMaterialHash, "string");
    assert.equal(typeof evidence.regionHash, "string");
    assert.equal(typeof evidence.simHash, "string");
  });
});
