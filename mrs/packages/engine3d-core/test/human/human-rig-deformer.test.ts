import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { computeGlobalBones, deformHumanRig } from "../../src/human/HumanRigDeformer.js";
import type { HumanRig, Mat4Tuple } from "../../src/human/HumanRigTypes.js";
import { IDENTITY_MAT4 } from "../../src/human/mat4.js";

const translateX: Mat4Tuple = [
  1, 0, 0, 0,
  0, 1, 0, 0,
  0, 0, 1, 0,
  2, 0, 0, 1,
];

function makeRig(childTransform: Mat4Tuple = IDENTITY_MAT4): HumanRig {
  const bodyMesh = {
    id: "body",
    role: "body" as const,
    vertices: new Float32Array([1, 0, 0, 0, 1, 0, 0, 0, 1]),
    normals: new Float32Array([0, 0, 1, 0, 0, 1, 0, 0, 1]),
    indices: new Uint16Array([0, 1, 2]),
    skinWeights: new Float32Array([1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0]),
    skinIndices: new Uint16Array([0, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0]),
    materialId: "skin",
    morphChannels: [{
      id: "smile",
      positionDeltas: new Float32Array([0.5, 0, 0, 0.5, 0, 0, 0.5, 0, 0]),
    }],
  };
  return {
    id: "rig",
    schemaVersion: "human-rig/2.0",
    capabilities: { morphTargets: true, multiSkin: false },
    skeleton: {
      rootBoneId: "root",
      bones: [
        { id: "root", parentId: null, localTransform: IDENTITY_MAT4, inverseBind: IDENTITY_MAT4 },
        { id: "child", parentId: "root", localTransform: childTransform, inverseBind: IDENTITY_MAT4 },
      ],
    },
    meshes: {
      bodyMesh,
      faceMesh: null,
      hairMesh: null,
      clothingMeshes: [],
      accessoryMeshes: [],
      all: [bodyMesh],
    },
    materials: { skin: { materialId: "skin" }, clothing: [], accessories: [], all: [{ materialId: "skin", type: "skin" }] },
    poses: { poses: [{ id: "smile", boneTransforms: {}, expressionParams: {}, morphWeights: { smile: 1 }, morphCurveIds: ["smile"] }] },
  };
}

describe("HumanRigDeformer", () => {
  it("identity bones preserve vertices", () => {
    const rig = makeRig();
    const frame = deformHumanRig(rig);
    assert.deepEqual(Array.from(frame.meshes[0]!.vertices), [1, 0, 0, 0, 1, 0, 0, 0, 1]);
    assert.equal(frame.boneHash, deformHumanRig(rig).boneHash);
  });

  it("global child transform deforms weighted vertices", () => {
    const rig = makeRig(translateX);
    const global = computeGlobalBones(rig.skeleton);
    assert.equal(global.child?.[12], 2);
    const frame = deformHumanRig(rig);
    assert.deepEqual(Array.from(frame.meshes[0]!.vertices), [1, 0, 0, 2, 1, 0, 2, 0, 1]);
  });

  it("changing bone transform changes evidence hashes", () => {
    const a = makeRig();
    const b = makeRig(translateX);
    assert.notEqual(deformHumanRig(a).boneHash, deformHumanRig(b).boneHash);
    assert.notEqual(deformHumanRig(a).meshDeformationHash, deformHumanRig(b).meshDeformationHash);
  });

  it("applies morph weights before skinning and records morphHash", () => {
    const rig = makeRig();
    const neutral = deformHumanRig(rig);
    const smile = deformHumanRig(rig, "smile");
    assert.deepEqual(Array.from(smile.meshes[0]!.vertices), [1.5, 0, 0, 0.5, 1, 0, 0.5, 0, 1]);
    assert.notEqual(neutral.meshDeformationHash, smile.meshDeformationHash);
    assert.equal(typeof smile.morphHash, "string");
    assert.deepEqual(smile.meshes[0]!.appliedMorphs, { smile: 1 });
  });
});
