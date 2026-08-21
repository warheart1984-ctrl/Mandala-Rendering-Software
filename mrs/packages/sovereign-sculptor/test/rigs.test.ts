import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  characterRigHash,
  createAnthroRig,
  createFoxQuadrupedRig,
  createHumanRig,
  skinLayerHash,
  validateCharacterRig,
  validateSkinLayer,
} from "../src/rigs.js";
import type { CharacterRigSchema, SkinLayer } from "../src/types.js";

const DIGEST_A = "a".repeat(64);
const DIGEST_B = "b".repeat(64);

function skinFixture(): SkinLayer {
  const texture = {
    assetRef: "asset://skin/base-color.png",
    digest: DIGEST_A,
    mimeType: "image/png",
    colorSpace: "srgb",
  } as const;
  return {
    schemaVersion: "sovereign-skin-layer/1.0",
    id: "whole-body-cel-skin",
    version: "1.0.0",
    bodyCoverage: "whole-body",
    rigId: "human-standard-v1",
    sculptDocumentId: "human-sculpt-1",
    topologyDigest: DIGEST_A,
    uvDigest: DIGEST_B,
    materialRegions: [
      { id: "body-surface", sculptRegionId: "body", materialId: "cel-body" },
    ],
    textureChannels: {
      baseColor: texture,
      celShade: { ...texture, assetRef: "asset://skin/cel-shade.png" },
      normalDetail: { ...texture, assetRef: "asset://skin/normal-detail.png", colorSpace: "linear" },
      roughness: { ...texture, assetRef: "asset://skin/roughness.png", colorSpace: "linear" },
      marking: { ...texture, assetRef: "asset://skin/marking.png" },
    },
    generationProvenance: {
      method: "governed-model",
      generatorId: "mandala-painter",
      generatorVersion: "1.0.0",
      authorityRef: "authority://character-owner",
      rightsRef: "rights://original-character",
      inputDigests: [DIGEST_A],
      promptDigest: DIGEST_B,
    },
    surfaceOnly: true,
    anatomyMutationAllowed: false,
  };
}

describe("governed character rig fixtures", () => {
  it("builds stable valid human face/body/hand rig", () => {
    const rig = createHumanRig();
    assert.equal(validateCharacterRig(rig).ok, true);
    assert.equal(rig.species, "human");
    assert.equal(rig.capabilities.face, true);
    assert.equal(rig.capabilities.body, true);
    assert.equal(rig.capabilities.hands, true);
    assert.equal(rig.capabilities.tail, false);
    assert.equal(rig.bones[0]!.id, "root");
    assert.equal(characterRigHash(rig), characterRigHash(createHumanRig()));
  });

  it("builds fox quadruped with face/body/tail/ears/paws/digitigrade capabilities", () => {
    const rig = createFoxQuadrupedRig();
    for (const key of ["face", "body", "tail", "ears", "paws", "digitigrade"] as const) {
      assert.equal(rig.capabilities[key], true, key);
    }
    assert.ok(rig.bones.some((bone) => bone.id === "tail.2"));
    assert.ok(rig.bones.some((bone) => bone.id === "ear.L"));
    assert.equal(validateCharacterRig(rig).ok, true);
  });

  it("builds anthro rig with full face/body/tail/ear/digitigrade/hand capability", () => {
    const rig = createAnthroRig();
    for (const key of ["face", "body", "tail", "ears", "digitigrade", "hands"] as const) {
      assert.equal(rig.capabilities[key], true, key);
    }
    assert.ok(rig.bones.some((bone) => bone.id === "hock.L"));
    assert.equal(validateCharacterRig(rig).ok, true);
  });

  it("keeps parent order and finite bind/constraint values", () => {
    for (const rig of [createHumanRig(), createFoxQuadrupedRig(), createAnthroRig()]) {
      const indexById = new Map(rig.bones.map((bone, index) => [bone.id, index]));
      rig.bones.forEach((bone, index) => {
        if (bone.parentId) assert.ok(indexById.get(bone.parentId)! < index);
        assert.equal(bone.bindTransform.every(Number.isFinite), true);
        assert.equal(bone.constraint.rotationRadians.min.every(Number.isFinite), true);
        assert.equal(bone.constraint.rotationRadians.max.every(Number.isFinite), true);
      });
    }
  });

  it("rejects missing mandatory capabilities and cyclic bones", () => {
    const fox = createFoxQuadrupedRig();
    const missingTail = {
      ...fox,
      capabilities: { ...fox.capabilities, tail: false },
    } satisfies CharacterRigSchema;
    assert.equal(validateCharacterRig(missingTail).issues.some((issue) => issue.code === "missing-capability"), true);

    const human = createHumanRig();
    const cyclic = {
      ...human,
      bones: human.bones.map((bone) =>
        bone.id === "root" ? { ...bone, parentId: "head" } : bone,
      ),
    } satisfies CharacterRigSchema;
    const codes = validateCharacterRig(cyclic).issues.map((issue) => issue.code);
    assert.ok(codes.includes("root-count"));
    assert.ok(codes.includes("bone-cycle"));
  });

  it("labels factory outputs honestly as non-production fixtures", () => {
    assert.equal(createHumanRig().status, "core-enforced-fixture-not-production-rig");
  });

  it("validates and hashes governed whole-body surface skins", () => {
    const skin = skinFixture();
    assert.equal(validateSkinLayer(skin).ok, true);
    assert.equal(skinLayerHash(skin), skinLayerHash(skinFixture()));
    assert.equal(skin.anatomyMutationAllowed, false);
  });

  it("rejects anatomy mutation and geometry displacement channels", () => {
    const anatomyMutation = {
      ...skinFixture(),
      anatomyMutationAllowed: true,
    } as unknown as SkinLayer;
    assert.equal(validateSkinLayer(anatomyMutation).issues.some((issue) => issue.code === "anatomy-policy"), true);

    const displacement = {
      ...skinFixture(),
      textureChannels: {
        ...skinFixture().textureChannels,
        displacement: skinFixture().textureChannels.normalDetail,
      },
    } as unknown as SkinLayer;
    assert.equal(
      validateSkinLayer(displacement).issues.some((issue) => issue.code === "geometry-channel-forbidden"),
      true,
    );
  });
});
