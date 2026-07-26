import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { loadHumanRigFromGlb } from "../../src/human/HumanRigLoader.js";

const enc = new TextEncoder();

function align4(n: number): number {
  return (n + 3) & ~3;
}

function concatBytes(chunks: Uint8Array[]): Uint8Array {
  const total = chunks.reduce((sum, chunk) => sum + chunk.byteLength, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return out;
}

function u32(value: number): Uint8Array {
  const out = new Uint8Array(4);
  new DataView(out.buffer).setUint32(0, value, true);
  return out;
}

function f32(values: readonly number[]): Uint8Array {
  const out = new Uint8Array(values.length * 4);
  const view = new DataView(out.buffer);
  values.forEach((value, i) => view.setFloat32(i * 4, value, true));
  return out;
}

function u16(values: readonly number[]): Uint8Array {
  const out = new Uint8Array(values.length * 2);
  const view = new DataView(out.buffer);
  values.forEach((value, i) => view.setUint16(i * 2, value, true));
  return out;
}

function pad(bytes: Uint8Array, padByte = 0): Uint8Array {
  const out = new Uint8Array(align4(bytes.byteLength));
  out.fill(padByte);
  out.set(bytes);
  return out;
}

function makeHumanRigGlb(options: { omitWeights?: boolean; withMorph?: boolean; withFacialCurves?: boolean } = {}): Uint8Array {
  const bufferViews: { byteOffset: number; byteLength: number }[] = [];
  const accessors: { bufferView: number; componentType: number; count: number; type: string }[] = [];
  const binChunks: Uint8Array[] = [];
  let byteOffset = 0;

  function addAccessor(bytes: Uint8Array, componentType: number, count: number, type: string): number {
    const padded = pad(bytes);
    const bufferView = bufferViews.length;
    bufferViews.push({ byteOffset, byteLength: bytes.byteLength });
    binChunks.push(padded);
    byteOffset += padded.byteLength;
    const accessor = accessors.length;
    accessors.push({ bufferView, componentType, count, type });
    return accessor;
  }

  const position = addAccessor(f32([0, 0, 0, 1, 0, 0, 0, 1, 0]), 5126, 3, "VEC3");
  const normal = addAccessor(f32([0, 0, 1, 0, 0, 1, 0, 0, 1]), 5126, 3, "VEC3");
  const joints = addAccessor(u16([0, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0]), 5123, 3, "VEC4");
  const weights = addAccessor(f32([1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0]), 5126, 3, "VEC4");
  const indices = addAccessor(u16([0, 1, 2]), 5123, 3, "SCALAR");
  const inverseBind = addAccessor(f32([
    1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1,
    1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1,
  ]), 5126, 2, "MAT4");
  const smileDelta = options.withMorph
    ? addAccessor(f32([0.2, 0, 0, 0.2, 0, 0, 0.2, 0, 0]), 5126, 3, "VEC3")
    : null;

  const attributes: Record<string, number> = { POSITION: position, NORMAL: normal, JOINTS_0: joints };
  if (!options.omitWeights) attributes["WEIGHTS_0"] = weights;

  const gltf = {
    asset: { version: "2.0", generator: "engine3d-core-test" },
    buffers: [{ byteLength: byteOffset }],
    bufferViews,
    accessors,
    nodes: [
      {
        name: "root",
        matrix: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1],
        children: [1],
        extras: {
          humanRigBone: true,
          ...(options.withMorph ? { humanRigCapabilities: { morphTargets: true, multiSkin: true } } : {}),
          ...(options.withFacialCurves
            ? {
                humanRigFacialCurves: [{
                  id: "smile-curve",
                  targets: ["smile"],
                  keyframes: [
                    { time: 0, weights: { smile: 0 } },
                    { time: 1, weights: { smile: 1 } },
                  ],
                }],
              }
            : {}),
        },
      },
      { name: "head", matrix: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1], extras: { humanRigBone: true } },
      { name: "body", mesh: 0, skin: 0, extras: { humanRigMeshRole: options.withMorph ? "face" : "body", humanRigMeshSkinId: "face-skin" } },
    ],
    skins: [{ joints: [0, 1], inverseBindMatrices: inverseBind }],
    meshes: [{
      name: "bodyMesh",
      primitives: [{
        attributes,
        indices,
        material: 0,
        ...(smileDelta != null
          ? { targets: [{ POSITION: smileDelta, extras: { humanRigMorphId: "smile" } }] }
          : {}),
      }],
    }],
    materials: [{ name: "skinMat", extras: { humanRigMaterialType: "skin" } }],
    animations: [{
      name: "neutral",
      extras: {
        humanRigPoseId: "neutral",
        ...(options.withMorph ? { humanRigMorphCurveIds: ["smile"] } : {}),
      },
    }],
  };

  const json = pad(enc.encode(JSON.stringify(gltf)), 0x20);
  const bin = concatBytes(binChunks);
  const totalLength = 12 + 8 + json.byteLength + 8 + bin.byteLength;
  return concatBytes([
    u32(0x46546c67),
    u32(2),
    u32(totalLength),
    u32(json.byteLength),
    u32(0x4e4f534a),
    json,
    u32(bin.byteLength),
    u32(0x004e4942),
    bin,
  ]);
}

describe("loadHumanRigFromGlb", () => {
  it("extracts bones, mesh buffers, material tags, and poses from GLB", () => {
    const rig = loadHumanRigFromGlb(makeHumanRigGlb(), { id: "fixture" });
    assert.equal(rig.id, "fixture");
    assert.equal(rig.skeleton.bones.length, 2);
    assert.equal(rig.skeleton.bones[1]?.parentId, "root");
    assert.equal(rig.meshes.all.length, 1);
    assert.equal(rig.meshes.bodyMesh?.materialId, "skinMat");
    assert.equal(rig.meshes.bodyMesh?.skinWeights.length, 12);
    assert.equal(rig.meshes.bodyMesh?.morphChannels.length, 0);
    assert.equal(rig.materials.skin?.materialId, "skinMat");
    assert.equal(rig.poses.poses[0]?.id, "neutral");
  });

  it("extracts v2 morph targets, capabilities, skin ids, face role, and morph curve ids", () => {
    const rig = loadHumanRigFromGlb(makeHumanRigGlb({ withMorph: true }), { id: "fixture-v2" });
    assert.equal(rig.schemaVersion, "human-rig/2.0");
    assert.deepEqual(rig.capabilities, { morphTargets: true, multiSkin: true });
    assert.equal(rig.meshes.faceMesh?.skinId, "face-skin");
    assert.equal(rig.meshes.faceMesh?.morphChannels[0]?.id, "smile");
    assert.deepEqual(
      Array.from(rig.meshes.faceMesh!.morphChannels[0]!.positionDeltas).map((value) => Math.round(value * 10) / 10),
      [0.2, 0, 0, 0.2, 0, 0, 0.2, 0, 0],
    );
    assert.deepEqual(rig.poses.poses[0]?.morphCurveIds, ["smile"]);
  });

  it("extracts v2.1 facial curves from root extras", () => {
    const rig = loadHumanRigFromGlb(makeHumanRigGlb({ withMorph: true, withFacialCurves: true }), { id: "fixture-v21" });
    assert.equal(rig.schemaVersion, "human-rig/2.1");
    assert.equal(rig.facialRig?.curves[0]?.id, "smile-curve");
    assert.deepEqual(rig.facialRig?.curves[0]?.keyframes[1]?.weights, { smile: 1 });
  });

  it("rejects missing WEIGHTS_0", () => {
    assert.throws(
      () => loadHumanRigFromGlb(makeHumanRigGlb({ omitWeights: true })),
      /missing WEIGHTS_0/,
    );
  });
});
