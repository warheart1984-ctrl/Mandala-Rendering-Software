import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { MuscleDeformer } from "../../src/human/MuscleDeformer.js";
import { MultiDeformationCompiler } from "../../src/human/MultiDeformationCompiler.js";
import type { HumanRig } from "../../src/human/HumanRigTypes.js";
import { IDENTITY_MAT4 } from "../../src/human/mat4.js";

function makeRig(): HumanRig {
  const bodyMesh = {
    id: "face",
    role: "face" as const,
    skinId: "face-skin",
    vertices: new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]),
    normals: new Float32Array([0, 0, 1, 0, 0, 1, 0, 0, 1]),
    indices: new Uint16Array([0, 1, 2]),
    skinWeights: new Float32Array([1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0]),
    skinIndices: new Uint16Array([0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]),
    materialId: "skin",
    morphChannels: [],
  };
  return {
    id: "rig-v3",
    schemaVersion: "human-rig/3.0",
    capabilities: { morphTargets: true, multiSkin: true, muscleRig: true },
    skeleton: {
      rootBoneId: "root",
      bones: [{ id: "root", parentId: null, localTransform: IDENTITY_MAT4, inverseBind: IDENTITY_MAT4 }],
    },
    meshes: { faceMesh: bodyMesh, hairMesh: null, clothingMeshes: [], accessoryMeshes: [], all: [bodyMesh] },
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

describe("MuscleDeformer", () => {
  it("applies deterministic directional displacement per soft-tissue region", () => {
    const result = new MuscleDeformer(makeRig().muscleRig!).apply(
      new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]),
      { zygomaticusMajor: 1 },
    );
    assert.deepEqual(Array.from(result.vertices).map((value) => Math.round(value * 1000) / 1000), [0.002, 0, 0, 1.002, 0, 0, 0, 1, 0]);
    assert.equal(typeof result.muscleHash, "string");
    assert.equal(typeof result.softTissueHash, "string");
  });
});

describe("MultiDeformationCompiler", () => {
  it("combines bone/morph deformation with muscle evidence hashes", () => {
    const compiled = new MultiDeformationCompiler(makeRig()).compile(0, {
      muscleActivation: { zygomaticusMajor: 1 },
    });
    assert.equal(typeof compiled.boneHash, "string");
    assert.equal(typeof compiled.meshDeformationHash, "string");
    assert.equal(typeof compiled.muscleHash, "string");
    assert.equal(typeof compiled.softTissueHash, "string");
    assert.deepEqual(Array.from(compiled.meshes[0]!.vertices).map((value) => Math.round(value * 1000) / 1000), [0.002, 0, 0, 1.002, 0, 0, 0, 1, 0]);
  });
});
