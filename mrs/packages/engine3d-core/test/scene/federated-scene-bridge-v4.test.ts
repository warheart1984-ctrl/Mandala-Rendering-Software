import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { HumanRig } from "../../src/human/HumanRigTypes.js";
import { IDENTITY_MAT4 } from "../../src/human/mat4.js";
import { FederatedSceneBridgeV4 } from "../../src/scene/FederatedSceneBridgeV4.js";
import { validateFederatedWorldV4, type FederatedWorldV4 } from "../../src/scene/FederatedWorldV4.js";
import { createUniversalMaterial, createWorldObject, type Engine3DWorldDocument } from "../../src/world/WorldObject.js";

function makeRig(): HumanRig {
  const mesh = {
    id: "face",
    role: "face" as const,
    vertices: new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]),
    normals: new Float32Array([0, 0, 1, 0, 0, 1, 0, 0, 1]),
    indices: new Uint16Array([0, 1, 2]),
    skinWeights: new Float32Array([1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0]),
    skinIndices: new Uint16Array([0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]),
    materialId: "skin",
    morphChannels: [],
  };
  return {
    id: "rig-alpha",
    schemaVersion: "human-rig/3.0",
    capabilities: { morphTargets: false, multiSkin: false, muscleRig: true },
    skeleton: {
      rootBoneId: "root",
      bones: [{ id: "root", parentId: null, localTransform: IDENTITY_MAT4, inverseBind: IDENTITY_MAT4 }],
    },
    meshes: { faceMesh: mesh, hairMesh: null, clothingMeshes: [], accessoryMeshes: [], all: [mesh] },
    materials: { skin: { materialId: "skin" }, clothing: [], accessories: [], all: [{ materialId: "skin", type: "skin" }] },
    poses: { poses: [] },
    facialRig: { curves: [{ id: "smile-curve", targets: ["smile"], keyframes: [{ time: 0, weights: { smile: 0 } }, { time: 1, weights: { smile: 1 } }] }] },
    muscleRig: {
      muscles: [{
        id: "zygomaticusMajor",
        originBoneId: "root",
        insertionBoneId: "root",
        activationCurveId: "smile-curve",
        influenceRegionId: "cheek",
        direction: [1, 0, 0],
      }],
      regions: [{ id: "cheek", vertexIndices: [0, 1], stiffness: 2, damping: 0 }],
    },
  };
}

function makeWorld(id: string, rig = false): Engine3DWorldDocument {
  return {
    schemaVersion: "engine3d-world/1.0",
    id,
    objects: [
      rig
        ? createWorldObject({ id: "character", kind: "rig", geometry: { rigId: "rig-alpha" }, material: { materialId: "skin" } })
        : createWorldObject({ id: "prop", kind: "primitive", geometry: { primitiveType: "box" }, material: { materialId: "skin" } }),
    ],
    materials: [createUniversalMaterial({ id: "skin", type: "skin" })],
    lights: [],
    cameras: [],
    activeCameraId: "",
  };
}

function makeFederation(): FederatedWorldV4 {
  return {
    id: "federation-001",
    schemaVersion: "federated-world/4.0",
    capabilities: { sceneBridgeFederation: true },
    worlds: [
      { id: "worldA", world: makeWorld("worldA", true) },
      { id: "worldB", world: makeWorld("worldB", false) },
    ],
    links: [{
      fromWorldId: "worldA",
      toWorldId: "worldB",
      transform: Array.from(IDENTITY_MAT4),
      visibilityMask: ["rigs", "lights"],
    }],
    timeline: { type: "linear", startFrame: 0, endFrame: 10 },
  };
}

describe("FederatedSceneBridgeV4", () => {
  it("composes per-world SceneBridge v3 scenes and emits v4 evidence", () => {
    const result = new FederatedSceneBridgeV4({
      rigsByWorldId: { worldA: { "rig-alpha": makeRig() } },
      muscleActivationByWorldAndRigId: { worldA: { "rig-alpha": { zygomaticusMajor: 1 } } },
    }).build(makeFederation(), 2, 99, 0);

    assert.equal(result.scene.schemaVersion, "rt4d-bridge-scene/4.0");
    assert.equal(result.scene.worldScenes.length, 2);
    assert.equal(result.scene.primitives.length, 2);
    assert.equal(result.scene.primitives[0]!.federation.worldId, "worldA");
    assert.equal(typeof result.evidence.federationHash, "string");
    assert.equal(typeof result.evidence.worldLinkHash, "string");
    assert.equal(typeof result.evidence.timelineHash, "string");
    assert.equal(typeof result.evidence.regionHash, "string");
    assert.equal(typeof result.evidence.muscleHash, "string");
  });

  it("requires explicit federation capability", () => {
    const federation = {
      ...makeFederation(),
      capabilities: { sceneBridgeFederation: false },
    } as unknown as FederatedWorldV4;
    assert.deepEqual(validateFederatedWorldV4(federation), ["missing-sceneBridgeFederation-capability"]);
    assert.throws(() => new FederatedSceneBridgeV4().build(federation, 0, 1), /Invalid FederatedWorld v4/);
  });
});
