import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  InMemoryCharacterRigRegistry,
  addCharacterRig,
  applyCharacterPose,
  type CharacterPoseFrame,
} from "../src/adapter.js";
import { createConstitutionalCharacterRecord } from "../src/constitutional.js";
import { exportSculptGlbBundle } from "../src/glb.js";
import { createHumanRig } from "../src/rigs.js";
import type { SculptDocument, SkinLayer } from "../src/types.js";

function fixtureDocument(): SculptDocument {
  return {
    schemaVersion: "sovereign-sculpt/1.0",
    status: "core-enforced-fixture-not-production-sculpt",
    id: "adapter-human-fixture",
    species: "human",
    topologyState: "locked",
    topologyRevision: 0,
    identity: {
      id: "adapter-character",
      displayName: "Adapter non-production fixture",
      gender: { identity: "creator-specified", attribution: "creator-authored" },
    },
    morphologyProfile: {
      stature: 0.5, bodyMass: 0.5, limbLength: 0.5, torsoLength: 0.5,
      headScale: 0.5, muzzleLength: 0, earScale: 0.2, tailLength: 0, digitigradeBias: 0,
    },
    vertices: [
      { id: "v0", position: [-0.5, 0, -0.5] },
      { id: "v1", position: [0.5, 0, -0.5] },
      { id: "v2", position: [0, 1, 0] },
      { id: "v3", position: [0, 0, 0.5] },
    ],
    triangles: [
      { id: "t0", vertexIndices: [0, 1, 2], regionId: "body" },
      { id: "t1", vertexIndices: [0, 3, 1], regionId: "body" },
      { id: "t2", vertexIndices: [1, 3, 2], regionId: "body" },
      { id: "t3", vertexIndices: [2, 3, 0], regionId: "body" },
    ],
    regions: [{ id: "body", vertexIndices: [0, 1, 2, 3] }],
    masks: [],
    operationLog: [],
  };
}

function texture(assetRef: string, digest: string, colorSpace: "srgb" | "linear" = "srgb") {
  return { assetRef, digest, mimeType: "image/png" as const, colorSpace };
}

function skinFixture(
  document: SculptDocument,
  rigId: string,
  topologyDigest: string,
  uvDigest: string,
): SkinLayer {
  return {
    schemaVersion: "sovereign-skin-layer/1.0",
    id: "adapter-anime-skin",
    version: "1.0.0",
    bodyCoverage: "whole-body",
    rigId,
    sculptDocumentId: document.id,
    topologyDigest,
    uvDigest,
    materialRegions: [{ id: "body", sculptRegionId: "body", materialId: "anime-cel-body" }],
    textureChannels: {
      baseColor: texture("asset://adapter/base.png", "a".repeat(64)),
      celShade: texture("asset://adapter/cel.png", "b".repeat(64)),
      normalDetail: texture("asset://adapter/normal.png", "c".repeat(64), "linear"),
      roughness: texture("asset://adapter/roughness.png", "d".repeat(64), "linear"),
    },
    generationProvenance: {
      method: "governed-model",
      generatorId: "mandala-anime-painter",
      generatorVersion: "1.0.0",
      authorityRef: "authority://creator",
      rightsRef: "rights://original",
      inputDigests: ["e".repeat(64)],
    },
    surfaceOnly: true,
    anatomyMutationAllowed: false,
  };
}

function poseFrame(rigId: string): CharacterPoseFrame {
  return {
    schemaVersion: "sovereign-pose-frame/1.0",
    frameId: "frame:12",
    rigId,
    rigVersion: "character-rig/1.0",
    frameIndex: 12,
    timeSeconds: 0.5,
    boneTransforms: [{
      boneId: "root",
      translation: [0, 0, 0],
      rotation: [0, 0, 0, 1],
      scale: [1, 1, 1],
    }],
    blendshapeWeights: [{ blendshapeId: "jawOpen", weight: 0.35 }],
    provenance: { intentId: "intent:anime-shot", operatorId: "operator:test" },
  };
}

function setup() {
  const document = fixtureDocument();
  const rig = createHumanRig();
  const bundle = exportSculptGlbBundle(document, rig);
  const skin = skinFixture(
    document,
    rig.id,
    bundle.inspection.digests.topologySha256,
    bundle.inspection.digests.uvSha256,
  );
  const constitutionalRecord = createConstitutionalCharacterRecord({
    document, rig, bundle, skinLayers: [skin],
  });
  return { document, rig, bundle, skin, constitutionalRecord };
}

describe("Engine3D/Mandala deterministic character adapter", () => {
  it("registers real digest references and replays an identical pose identically", () => {
    const fixture = setup();
    const registry = new InMemoryCharacterRigRegistry();
    const binding = addCharacterRig(registry, fixture);
    assert.equal(binding.constitutionalRecordDigest, fixture.constitutionalRecord.recordDigest);
    assert.equal(binding.engine3dRecordRef, `sha256:${fixture.constitutionalRecord.recordDigest}`);
    assert.equal(binding.mandalaRecordRef, binding.engine3dRecordRef);
    assert.equal(binding.glbDigest, fixture.bundle.inspection.digests.glbSha256);

    const frame = poseFrame(fixture.rig.id);
    const first = applyCharacterPose(registry, fixture.document.identity.id, frame);
    const second = applyCharacterPose(registry, fixture.document.identity.id, frame);
    assert.deepEqual(first, second);
    assert.equal(first.replayDigest, second.replayDigest);
    assert.equal(registry.snapshot().bindings.length, 1);
  });

  it("emits surface material/texture bindings without any geometry operation", () => {
    const fixture = setup();
    const registry = new InMemoryCharacterRigRegistry();
    const binding = registry.addCharacterRig(fixture);
    assert.equal(binding.geometryMutationAllowed, false);
    assert.equal(binding.materialTextureBindings.length, 4);
    assert.equal(binding.materialTextureBindings[0]?.textureSha256, "a".repeat(64));
    assert.equal(binding.materialTextureBindings.every((entry) =>
      entry.topologyDigest === fixture.constitutionalRecord.digests.topologyDigest &&
      entry.uvDigest === fixture.constitutionalRecord.digests.uvDigest &&
      entry.surfaceOnly), true);

    const applied = registry.applyCharacterPose(fixture.document.identity.id, poseFrame(fixture.rig.id));
    assert.deepEqual(applied.geometryMutation, { allowed: false, operations: [] });
    const serialized = JSON.stringify(applied);
    assert.equal(serialized.includes('"vertices"'), false);
    assert.equal(serialized.includes('"indices"'), false);
    assert.equal(serialized.includes('"positions"'), false);
  });

  it("rejects a pose for unknown bones or out-of-range facial weights", () => {
    const fixture = setup();
    const registry = new InMemoryCharacterRigRegistry();
    registry.addCharacterRig(fixture);
    const base = poseFrame(fixture.rig.id);
    assert.throws(() => registry.applyCharacterPose(fixture.document.identity.id, {
      ...base,
      boneTransforms: [{ ...base.boneTransforms[0]!, boneId: "unknown-bone" }],
    }), /unknown bone/);
    assert.throws(() => registry.applyCharacterPose(fixture.document.identity.id, {
      ...base,
      blendshapeWeights: [{ blendshapeId: "jawOpen", weight: 4 }],
    }), /out of range/);
  });

  it("rejects replay registration when a skin is pinned to another topology", () => {
    const fixture = setup();
    const registry = new InMemoryCharacterRigRegistry();
    const wrongSkin = { ...fixture.skin, topologyDigest: "0".repeat(64) } satisfies SkinLayer;
    assert.throws(() => registry.addCharacterRig({
      document: fixture.document,
      rig: fixture.rig,
      bundle: fixture.bundle,
      skinLayers: [wrongSkin],
    }), /skin-topology-mismatch/);
  });
});
