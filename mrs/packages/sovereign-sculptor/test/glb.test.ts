import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  exportSculptDocumentToGlb,
  exportSculptGlbBundle,
  parseGlbStrict,
  readAccessorTight,
  validateGlb,
} from "../src/glb.js";
import { createAnthroRig, createFoxQuadrupedRig, createHumanRig } from "../src/rigs.js";
import type { CharacterRigSchema, SculptDocument, Species } from "../src/types.js";

function fixtureDocument(species: Species, id = `${species}-fixture`): SculptDocument {
  return {
    schemaVersion: "sovereign-sculpt/1.0",
    status: "core-enforced-fixture-not-production-sculpt",
    id,
    species,
    topologyState: "locked",
    topologyRevision: 0,
    identity: {
      id: `${species}-character`,
      displayName: `${species} non-production fixture`,
      gender: { identity: "creator-specified", attribution: "creator-authored" },
    },
    morphologyProfile: {
      stature: 0.5,
      bodyMass: 0.5,
      limbLength: 0.5,
      torsoLength: 0.5,
      headScale: 0.5,
      muzzleLength: species === "human" ? 0 : 0.7,
      earScale: species === "human" ? 0.2 : 0.8,
      tailLength: species === "human" ? 0 : 0.8,
      digitigradeBias: species === "human" ? 0 : 0.8,
    },
    vertices: [
      { id: "vertex:0", position: [-0.5, 0, -0.5] },
      { id: "vertex:1", position: [0.5, 0, -0.5] },
      { id: "vertex:2", position: [0, 1, 0] },
      { id: "vertex:3", position: [0, 0, 0.5] },
    ],
    triangles: [
      { id: "triangle:0", vertexIndices: [0, 1, 2], regionId: "body" },
      { id: "triangle:1", vertexIndices: [0, 3, 1], regionId: "body" },
      { id: "triangle:2", vertexIndices: [1, 3, 2], regionId: "body" },
      { id: "triangle:3", vertexIndices: [2, 3, 0], regionId: "body" },
    ],
    regions: [{ id: "body", vertexIndices: [0, 1, 2, 3] }],
    masks: [],
    operationLog: [],
  };
}

function fixturePairs(): readonly [SculptDocument, CharacterRigSchema][] {
  return [
    [fixtureDocument("human"), createHumanRig()],
    [fixtureDocument("fox"), createFoxQuadrupedRig()],
    [fixtureDocument("anthro"), createAnthroRig()],
  ];
}

describe("deterministic strict GLB 2 character fixtures", () => {
  it("refuses export until the topology lineage is locked", () => {
    const document = fixtureDocument("human");
    assert.throws(
      () => exportSculptDocumentToGlb({ ...document, topologyState: "authoring" }, createHumanRig()),
      /topology-locked/,
    );
  });

  it("exports byte-identical GLBs and stable tight logical hashes", () => {
    const document = fixtureDocument("human");
    const rig = createHumanRig();
    const first = exportSculptDocumentToGlb(document, rig);
    const second = exportSculptDocumentToGlb(document, rig);
    assert.deepEqual(first, second);
    const firstResult = validateGlb(first, { profile: "human" });
    const secondResult = validateGlb(second, { profile: "human" });
    assert.equal(firstResult.ok, true, JSON.stringify(firstResult.issues));
    assert.deepEqual(firstResult.inspection?.digests, secondResult.inspection?.digests);
  });

  it("treats accessor index zero as present and reads its tight POSITION bytes", () => {
    const glb = exportSculptDocumentToGlb(fixtureDocument("human"), createHumanRig());
    const parsed = parseGlbStrict(glb);
    const primitive = parsed.gltf.meshes[0].primitives[0];
    assert.equal(primitive.attributes.POSITION, 0);
    const position = readAccessorTight(parsed.gltf, parsed.bin, 0);
    assert.equal(position.type, "VEC3");
    assert.equal(position.componentType, 5126);
    assert.equal(position.count, 4);
    assert.equal(position.tightBytes.byteLength, 4 * 3 * 4);
  });

  it("strictly validates human, fox, and anthro face/body rig profiles", () => {
    for (const [document, rig] of fixturePairs()) {
      const result = validateGlb(exportSculptDocumentToGlb(document, rig), {
        profile: document.species,
      });
      assert.equal(result.ok, true, `${document.species}: ${JSON.stringify(result.issues)}`);
      assert.equal(result.inspection?.species, document.species);
      assert.equal(result.inspection?.boneIds.length, rig.bones.length);
      assert.equal(result.inspection?.primitives[0]?.morphIds.length, rig.blendshapes.length);
    }
  });

  it("fails a fixed vertex-order pin after vertex reordering", () => {
    const originalDocument = fixtureDocument("human");
    const rig = createHumanRig();
    const original = exportSculptGlbBundle(originalDocument, rig);
    const reorderedDocument: SculptDocument = {
      ...originalDocument,
      vertices: [
        originalDocument.vertices[1]!,
        originalDocument.vertices[0]!,
        originalDocument.vertices[2]!,
        originalDocument.vertices[3]!,
      ],
    };
    const reordered = exportSculptDocumentToGlb(reorderedDocument, rig);
    const result = validateGlb(reordered, {
      expectedDigests: {
        vertexOrderSha256: original.inspection.digests.vertexOrderSha256,
        topologySha256: original.inspection.digests.topologySha256,
      },
    });
    assert.equal(result.ok, false);
    assert.ok(result.issues.some((entry) => entry.code === "digest-mismatch"));
  });

  it("rejects a GLB chunk whose declared bounds exceed the file", () => {
    const glb = exportSculptDocumentToGlb(fixtureDocument("human"), createHumanRig());
    const tampered = glb.slice();
    new DataView(tampered.buffer, tampered.byteOffset, tampered.byteLength).setUint32(12, tampered.byteLength, true);
    const result = validateGlb(tampered);
    assert.equal(result.ok, false);
    assert.equal(result.issues[0]?.code, "invalid-glb-container");
  });
});
