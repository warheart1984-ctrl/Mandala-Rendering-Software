import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { canActivateSceneBridgeV3, SceneBridgeV12 } from "../../src/scene/SceneBridgeV12.js";
import type { Rt4dBridgePrimitive } from "../../src/scene/SceneBridgeV12.js";
import { createUniversalMaterial, createWorldObject, type Engine3DWorldDocument } from "../../src/world/WorldObject.js";
import type { HumanRig } from "../../src/human/HumanRigTypes.js";
import { IDENTITY_MAT4 } from "../../src/human/mat4.js";

function makeRig(withFacialCurve = false, withMuscles = false): HumanRig {
  const bodyMesh = {
    id: "body",
    role: "body" as const,
    vertices: new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]),
    normals: new Float32Array([0, 0, 1, 0, 0, 1, 0, 0, 1]),
    indices: new Uint16Array([0, 1, 2]),
    skinWeights: new Float32Array([1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0]),
    skinIndices: new Uint16Array([0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]),
    materialId: "skin",
    morphChannels: withFacialCurve
      ? [{ id: "smile", positionDeltas: new Float32Array([1, 0, 0, 1, 0, 0, 1, 0, 0]) }]
      : [],
  };
  return {
    id: "rig-alpha",
    schemaVersion: withMuscles ? "human-rig/3.0" : withFacialCurve ? "human-rig/2.1" : "human-rig/1.0",
    capabilities: { morphTargets: withFacialCurve, multiSkin: withFacialCurve, muscleRig: withMuscles },
    skeleton: {
      rootBoneId: "root",
      bones: [{ id: "root", parentId: null, localTransform: IDENTITY_MAT4, inverseBind: IDENTITY_MAT4 }],
    },
    meshes: { bodyMesh, faceMesh: null, hairMesh: null, clothingMeshes: [], accessoryMeshes: [], all: [bodyMesh] },
    materials: { skin: { materialId: "skin" }, clothing: [], accessories: [], all: [{ materialId: "skin", type: "skin" }] },
    poses: { poses: [] },
    facialRig: withFacialCurve || withMuscles
      ? {
          curves: [{
            id: "smile-curve",
            targets: ["smile"],
            keyframes: [{ time: 0, weights: { smile: 0 } }, { time: 1, weights: { smile: 1 } }],
          }],
        }
      : undefined,
    muscleRig: withMuscles
      ? {
          muscles: [{
            id: "zygomaticusMajor",
            originBoneId: "root",
            insertionBoneId: "root",
            activationCurveId: "smile-curve",
            influenceRegionId: "cheek",
            direction: [1, 0, 0],
          }],
          regions: [{ id: "cheek", vertexIndices: [0, 1], stiffness: 2, damping: 0 }],
        }
      : undefined,
  };
}

describe("SceneBridgeV12", () => {
  it("maps extended primitive geometry kinds through the RT4D bridge", () => {
    const primitiveTypes = ["cylinder", "torus", "capsule", "cone", "superquadric"] as const;
    const objects = primitiveTypes.map((primitiveType) => createWorldObject({
      id: primitiveType,
      kind: "primitive",
      geometry: { primitiveType },
      material: { materialId: "mat" },
    }));
    const world: Engine3DWorldDocument = {
      schemaVersion: "engine3d-world/1.0",
      id: "world",
      objects,
      materials: [createUniversalMaterial({ id: "mat", type: "basic" })],
      lights: [],
      cameras: [],
      activeCameraId: "",
    };
    const result = new SceneBridgeV12().build(world, 0, 1);
    assert.deepEqual(result.scene.primitives.map((primitive) => primitive.kind), ["cylinder", "torus", "capsule", "cone", "superquadric"]);
  });

  it("maps static mesh assets and instances to RT4D poly primitives", () => {
    const mesh = {
      id: "tri",
      vertices: new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]),
      normals: new Float32Array([0, 0, 1, 0, 0, 1, 0, 0, 1]),
      uvs: new Float32Array([0, 0, 1, 0, 0, 1]),
      indices: new Uint16Array([0, 1, 2]),
      materialId: "mat",
    };
    const world: Engine3DWorldDocument = {
      schemaVersion: "engine3d-world/1.0",
      id: "world",
      objects: [
        createWorldObject({
          id: "tri-a",
          kind: "mesh",
          geometry: { meshId: "tri" },
          material: { materialId: "mat" },
          transform: { position: [2, 0, 0], rotation: [0, 0, 0], scale: [2, 2, 2] },
        }),
        createWorldObject({
          id: "tri-b",
          kind: "mesh",
          geometry: { instanceOf: "tri" },
          material: { materialId: "mat" },
          transform: { position: [4, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] },
        }),
      ],
      meshes: [mesh],
      assetProvenance: [{
        assetId: "asset:tri",
        kind: "mesh",
        source: { type: "imported", uri: "memory://tri.obj", originalHash: "sha256:tri" },
        transforms: [{ type: "import", timestamp: "1970-01-01T00:00:00.000Z", details: { meshId: "tri" } }],
        usage: [{ worldId: "world", frameRange: [0, 0] }],
      }],
      materials: [createUniversalMaterial({ id: "mat", type: "basic" })],
      lights: [],
      cameras: [],
      activeCameraId: "",
    };
    const result = new SceneBridgeV12().build(world, 0, 1);
    assert.equal(result.scene.primitives.length, 2);
    assert.deepEqual(result.scene.primitives.map((primitive) => primitive.kind), ["poly", "poly"]);
    const first = result.scene.primitives[0] as Extract<Rt4dBridgePrimitive, { kind: "poly" }>;
    assert.deepEqual(Array.from(first.vertices), [2, 0, 0, 4, 0, 0, 2, 2, 0]);
    assert.equal(typeof first.evidence.meshAssetHash, "string");
    assert.equal(typeof result.evidence.staticMeshHash, "string");
    assert.equal(typeof result.evidence.assetProvenanceHash, "string");
  });

  it("maps rig WorldObjects to RT4D skinned-mesh primitives with evidence hashes", () => {
    const rigObject = createWorldObject({
      id: "character",
      kind: "rig",
      geometry: { rigId: "rig-alpha" },
      material: { materialId: "skin" },
    });
    const camera = createWorldObject({
      id: "cam",
      kind: "camera",
      geometry: null,
      material: null,
      camera: { type: "portrait", focalLengthMm: 85, apertureF: 2.8, focusDistance: 3, target: [0, 1, 0], exposure: 1.1, shutterSeconds: 1 / 48, motionBlur: true },
    });
    const keyLight = createWorldObject({
      id: "key",
      kind: "light",
      geometry: null,
      material: null,
      light: { type: "area", color: [1, 0.95, 0.9], intensity: 3, width: 2, height: 2, softness: 0.7 },
    });
    const world: Engine3DWorldDocument = {
      schemaVersion: "engine3d-world/1.0",
      id: "world",
      objects: [rigObject],
      materials: [createUniversalMaterial({ id: "skin", type: "skin", textureRefs: [{ id: "skin-albedo", role: "color" }] })],
      textures: [{ id: "skin-albedo", role: "color", uri: "skin.png", width: 4, height: 4, format: "rgba8", colorSpace: "srgb", checksum: "sha256:skinalbedo" }],
      environment: { preset: "cosmic", intensity: 1.2, color: [0.2, 0.3, 1], proceduralSeed: 77 },
      lights: [keyLight],
      cameras: [camera],
      activeCameraId: "cam",
    };

    const result = new SceneBridgeV12({ rigs: { "rig-alpha": makeRig() } }).build(world, 4, 123);
    assert.equal(result.scene.primitives.length, 1);
    const primitive = result.scene.primitives[0]!;
    assert.equal(primitive.kind, "skinned-mesh");
    assert.equal(primitive.materialId, "skin");
    assert.equal(result.scene.materials[0]!.id, "skin");
    assert.equal(result.scene.materials[0]!.params.brdf, "skin");
    assert.equal(result.scene.textures[0]!.id, "skin-albedo");
    assert.equal(result.scene.lightRig[0]!.id, "key");
    assert.equal(result.scene.lightRig[0]!.softness, 0.7);
    assert.equal(result.scene.cameraRig[0]!.type, "portrait");
    assert.equal(result.scene.cameraRig[0]!.motionBlur, true);
    assert.equal(result.scene.environment.preset, "cosmic");
    assert.equal(typeof result.evidence.textureHash, "string");
    assert.equal(typeof result.evidence.lightingRigHash, "string");
    assert.equal(typeof result.evidence.cameraMotionHash, "string");
    assert.equal(typeof result.evidence.environmentHash, "string");
    assert.equal(typeof result.evidence.boneHash, "string");
    assert.equal(typeof result.evidence.meshDeformationHash, "string");
  });

  it("samples facial curves by time and emits curve/multi-skin evidence", () => {
    const rigObject = createWorldObject({
      id: "character",
      kind: "rig",
      geometry: { rigId: "rig-alpha" },
      material: { materialId: "skin" },
    });
    const camera = createWorldObject({ id: "cam", kind: "camera", geometry: null, material: null });
    const world: Engine3DWorldDocument = {
      schemaVersion: "engine3d-world/1.0",
      id: "world",
      objects: [rigObject],
      materials: [createUniversalMaterial({ id: "skin", type: "skin" })],
      lights: [],
      cameras: [camera],
      activeCameraId: "cam",
    };

    const result = new SceneBridgeV12({ rigs: { "rig-alpha": makeRig(true) } }).build(world, 4, 123, 0.5);
    const primitive = result.scene.primitives[0]!;
    assert.equal(primitive.kind, "skinned-mesh");
    const skinned = primitive as Extract<Rt4dBridgePrimitive, { kind: "skinned-mesh" }>;
    assert.deepEqual(Array.from(skinned.vertices).map((value) => Math.round(value * 10) / 10), [0.5, 0, 0, 1.5, 0, 0, 0.5, 1, 0]);
    assert.equal(typeof skinned.evidence.morphHash, "string");
    assert.equal(typeof skinned.evidence.curveHash, "string");
    assert.equal(typeof result.evidence.curveHash, "string");
  });

  it("uses v3 multi-deformation for muscle rigs and emits anatomical evidence", () => {
    const rigObject = createWorldObject({
      id: "character",
      kind: "rig",
      geometry: { rigId: "rig-alpha" },
      material: { materialId: "skin" },
    });
    const camera = createWorldObject({ id: "cam", kind: "camera", geometry: null, material: null });
    const world: Engine3DWorldDocument = {
      schemaVersion: "engine3d-world/1.0",
      id: "world",
      objects: [rigObject],
      materials: [createUniversalMaterial({ id: "skin", type: "skin" })],
      lights: [],
      cameras: [camera],
      activeCameraId: "cam",
    };

    const result = new SceneBridgeV12({
      rigs: { "rig-alpha": makeRig(false, true) },
      muscleActivationByRigId: { "rig-alpha": { zygomaticusMajor: 1 } },
    }).build(world, 4, 123, 0);
    const primitive = result.scene.primitives[0]!;
    assert.equal(primitive.kind, "skinned-mesh");
    const skinned = primitive as Extract<Rt4dBridgePrimitive, { kind: "skinned-mesh" }>;
    assert.deepEqual(Array.from(skinned.vertices).map((value) => Math.round(value * 1000) / 1000), [0.002, 0, 0, 1.002, 0, 0, 0, 1, 0]);
    assert.equal(typeof skinned.evidence.muscleHash, "string");
    assert.equal(typeof skinned.evidence.softTissueHash, "string");
    assert.equal(typeof result.evidence.muscleHash, "string");
    assert.equal(typeof result.evidence.softTissueHash, "string");
  });

  it("does not silently activate v3 when muscleRig exists without explicit capability", () => {
    const rig = {
      ...makeRig(false, true),
      capabilities: { morphTargets: false, multiSkin: false },
    };
    const rigObject = createWorldObject({ id: "character", kind: "rig", geometry: { rigId: "rig-alpha" }, material: { materialId: "skin" } });
    const world: Engine3DWorldDocument = {
      schemaVersion: "engine3d-world/1.0",
      id: "world",
      objects: [rigObject],
      materials: [createUniversalMaterial({ id: "skin", type: "skin" })],
      lights: [],
      cameras: [],
      activeCameraId: "cam",
    };

    assert.equal(canActivateSceneBridgeV3(rig), false);
    const result = new SceneBridgeV12({
      rigs: { "rig-alpha": rig },
      muscleActivationByRigId: { "rig-alpha": { zygomaticusMajor: 1 } },
    }).build(world, 4, 123, 0);
    const skinned = result.scene.primitives[0]! as Extract<Rt4dBridgePrimitive, { kind: "skinned-mesh" }>;
    assert.deepEqual(Array.from(skinned.vertices).map((value) => Math.round(value * 1000) / 1000), [0, 0, 0, 1, 0, 0, 0, 1, 0]);
    assert.equal(skinned.evidence.muscleHash, undefined);
    assert.equal(result.evidence.muscleHash, undefined);
  });

  it("falls back to v2 instead of adopting declared v4/v5 deformation flags", () => {
    const rig = {
      ...makeRig(false, true),
      capabilities: { morphTargets: false, multiSkin: false, muscleRig: true, skinSliding: true },
    };
    assert.equal(canActivateSceneBridgeV3(rig), false);
  });

  it("falls back to v2 when a muscle activation curve is undeclared", () => {
    const base = makeRig(false, true);
    const rig = {
      ...base,
      muscleRig: {
        ...base.muscleRig!,
        muscles: [{ ...base.muscleRig!.muscles[0]!, activationCurveId: "missing-curve" }],
      },
    };
    assert.equal(canActivateSceneBridgeV3(rig), false);
  });

  it("falls back to v2 when soft-tissue region ids are duplicated", () => {
    const base = makeRig(false, true);
    const rig = {
      ...base,
      muscleRig: {
        ...base.muscleRig!,
        regions: [base.muscleRig!.regions[0]!, { ...base.muscleRig!.regions[0]! }],
      },
    };
    assert.equal(canActivateSceneBridgeV3(rig), false);
  });
});
