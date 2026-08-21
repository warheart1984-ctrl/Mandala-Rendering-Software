import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { sha256Canonical } from "../src/canonical.js";
import {
  constitutionalRecordDigest,
  createConstitutionalCharacterRecord,
  validateWholeBodySkinLayer,
  verifyConstitutionalCharacterRecord,
  type ConstitutionalCharacterRecord,
} from "../src/constitutional.js";
import { exportSculptGlbBundle, type SculptGlbBundle } from "../src/glb.js";
import { createAnthroRig, createFoxQuadrupedRig, createHumanRig } from "../src/rigs.js";
import type { CharacterRigSchema, SculptDocument, SkinLayer, Species } from "../src/types.js";

function fixtureDocument(species: Species): SculptDocument {
  return {
    schemaVersion: "sovereign-sculpt/1.0",
    status: "core-enforced-fixture-not-production-sculpt",
    id: `${species}-constitutional-fixture`,
    species,
    topologyState: "locked",
    topologyRevision: 0,
    identity: {
      id: `${species}-constitutional-character`,
      displayName: `${species} constitutional fixture`,
      gender: {
        identity: species === "fox" ? "not-applicable-fictional-fox" : "creator-specified",
        pronouns: ["they", "them"],
        attribution: "creator-authored",
      },
    },
    morphologyProfile: {
      stature: 0.5, bodyMass: 0.5, limbLength: 0.5, torsoLength: 0.5,
      headScale: 0.5, muzzleLength: species === "human" ? 0 : 0.7,
      earScale: species === "human" ? 0.2 : 0.8,
      tailLength: species === "human" ? 0 : 0.8,
      digitigradeBias: species === "human" ? 0 : 0.8,
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

function skinFixture(document: SculptDocument, rig: CharacterRigSchema, bundle: SculptGlbBundle): SkinLayer {
  const a = "a".repeat(64);
  const b = "b".repeat(64);
  const c = "c".repeat(64);
  const d = "d".repeat(64);
  return {
    schemaVersion: "sovereign-skin-layer/1.0",
    id: `${document.species}-whole-body-anime-skin`,
    version: "1.0.0",
    bodyCoverage: "whole-body",
    rigId: rig.id,
    sculptDocumentId: document.id,
    topologyDigest: bundle.inspection.digests.topologySha256,
    uvDigest: bundle.inspection.digests.uvSha256,
    materialRegions: [{ id: "whole-body", sculptRegionId: "body", materialId: "anime-cel-body" }],
    textureChannels: {
      baseColor: texture("asset://skin/base-color.png", a),
      celShade: texture("asset://skin/cel-shade.png", b),
      normalDetail: texture("asset://skin/normal-detail.png", c, "linear"),
      roughness: texture("asset://skin/roughness.png", d, "linear"),
    },
    generationProvenance: {
      method: "governed-model",
      generatorId: "mandala-anime-painter",
      generatorVersion: "1.0.0",
      authorityRef: "authority://character-creator",
      rightsRef: "rights://original-character",
      inputDigests: [bundle.fixture.sourceSha256],
    },
    surfaceOnly: true,
    anatomyMutationAllowed: false,
  };
}

function setup(species: Species, rig: CharacterRigSchema) {
  const document = fixtureDocument(species);
  const bundle = exportSculptGlbBundle(document, rig);
  const skin = skinFixture(document, rig, bundle);
  const record = createConstitutionalCharacterRecord({ document, rig, bundle, skinLayers: [skin] });
  return { document, rig, bundle, skin, record };
}

describe("constitutional character records and whole-body skin governance", () => {
  it("pins human, fox, and anthro species/gender/rig/mesh/GLB/source records", () => {
    for (const [species, rig] of [
      ["human", createHumanRig()],
      ["fox", createFoxQuadrupedRig()],
      ["anthro", createAnthroRig()],
    ] as const) {
      const { document, bundle, record } = setup(species, rig);
      const verification = verifyConstitutionalCharacterRecord(record, { document, rig, bundle });
      assert.equal(verification.ok, true, `${species}: ${JSON.stringify(verification.issues)}`);
      assert.equal(record.species, species);
      assert.equal(record.topology.state, "locked");
      assert.equal(record.topology.revision, document.topologyRevision);
      assert.equal(record.digests.genderDigest, sha256Canonical(document.identity.gender));
      assert.equal(record.digests.glbDigest, bundle.inspection.digests.glbSha256);
      assert.equal(record.digests.sourceDigest, bundle.fixture.sourceSha256);
      assert.equal(record.recordDigest, constitutionalRecordDigest(record));
    }
  });

  it("binds each texture hash to the exact topology and UV hashes", () => {
    const { document, rig, bundle, skin, record } = setup("human", createHumanRig());
    assert.equal(skin.topologyDigest, record.digests.topologyDigest);
    assert.equal(skin.uvDigest, record.digests.uvDigest);
    assert.equal(record.skinLayerDigests[0], sha256Canonical(skin));
    assert.equal(validateWholeBodySkinLayer(skin, {
      rigId: rig.id,
      sculptDocumentId: document.id,
      topologyDigest: bundle.inspection.digests.topologySha256,
      uvDigest: bundle.inspection.digests.uvSha256,
    }).ok, true);
  });

  it("rejects anatomy mutation, topology/UV mismatch, and an unapproved channel", () => {
    const { document, rig, bundle, skin } = setup("human", createHumanRig());
    const context = {
      rigId: rig.id,
      sculptDocumentId: document.id,
      topologyDigest: bundle.inspection.digests.topologySha256,
      uvDigest: bundle.inspection.digests.uvSha256,
    };
    const anatomyMutation = { ...skin, anatomyMutationAllowed: true } as unknown as SkinLayer;
    assert.ok(validateWholeBodySkinLayer(anatomyMutation, context).issues.some((entry) =>
      entry.code === "skin-anatomy-mutation"));

    const wrongBinding = {
      ...skin,
      topologyDigest: "1".repeat(64),
      uvDigest: "2".repeat(64),
    } satisfies SkinLayer;
    const bindingCodes = validateWholeBodySkinLayer(wrongBinding, context).issues.map((entry) => entry.code);
    assert.ok(bindingCodes.includes("skin-topology-mismatch"));
    assert.ok(bindingCodes.includes("skin-uv-mismatch"));

    const unapproved = {
      ...skin,
      textureChannels: { ...skin.textureChannels, displacement: skin.textureChannels.normalDetail },
    } as unknown as SkinLayer;
    assert.ok(validateWholeBodySkinLayer(unapproved, context).issues.some((entry) =>
      entry.code === "skin-channel-unapproved"));
  });

  it("detects constitutional and texture tampering", () => {
    const { document, rig, bundle, record } = setup("anthro", createAnthroRig());
    const tamperedLayer: SkinLayer = {
      ...record.skinLayers[0]!,
      textureChannels: {
        ...record.skinLayers[0]!.textureChannels,
        baseColor: {
          ...record.skinLayers[0]!.textureChannels.baseColor,
          digest: "f".repeat(64),
        },
      },
    };
    const tampered = {
      ...record,
      skinLayers: [tamperedLayer],
    } as ConstitutionalCharacterRecord;
    const verification = verifyConstitutionalCharacterRecord(tampered, { document, rig, bundle });
    assert.equal(verification.ok, false);
    const codes = verification.issues.map((entry) => entry.code);
    assert.ok(codes.includes("skin-digest-mismatch"));
    assert.ok(codes.includes("record-digest-mismatch"));
  });
});
