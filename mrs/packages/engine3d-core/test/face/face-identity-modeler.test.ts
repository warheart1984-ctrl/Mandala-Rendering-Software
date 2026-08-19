/**
 * FaceIdentityModeler — deterministic identity face sculpting tests.
 *
 * Status: **enforced**
 *  - determinism: same descriptor + same base mesh => identical vertices/hash
 *  - distinctness: different descriptors => different geometry + hashes
 *  - biometric conformance: sculpted AABB stays within human-sized profile
 *  - topology preserved: indices unchanged, vertex count unchanged
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  defaultFaceRigConfig,
  defaultFaceRiggedGlbPath,
  loadFaceRig,
  renderEngine3dStill,
} from "../../src/index.js";
import {
  MAX_IDENTITY_DISPLACEMENT,
  deriveFaceRegionMasks,
  faceMeshFromRig,
  identityDescriptorHash,
  NEUTRAL_DESCRIPTOR,
  normalizeDescriptor,
  sculptFaceIdentity,
} from "../../src/face/FaceIdentityModeler.js";

const FIXTURE = defaultFaceRiggedGlbPath();

function baseMesh() {
  assert.ok(existsSync(FIXTURE), `missing fixture at ${FIXTURE}`);
  const loaded = loadFaceRig(defaultFaceRigConfig(FIXTURE));
  const mesh = faceMeshFromRig(loaded.rig);
  assert.ok(mesh, "face mesh present");
  return mesh;
}

const DISTINCT = {
  skullWidth: 0.6,
  skullDepth: 0.3,
  jawWidth: -0.5,
  cheekProminence: 0.7,
  browRidge: 0.8,
  noseWidth: 0.4,
  noseLength: 0.9,
  lipFullness: -0.6,
  chinProminence: 0.5,
  eyeSpacing: 0.4,
  eyeDepth: 0.6,
};

describe("FaceIdentityModeler", () => {
  it("fixture has a sculpptable face mesh", () => {
    const mesh = baseMesh();
    assert.ok(mesh.vertices.length > 0);
  });

  it("region masks cover every vertex with finite values in [0,1]", () => {
    const mesh = baseMesh();
    const masks = deriveFaceRegionMasks(mesh);
    const count = mesh.vertices.length / 3;
    for (const [name, mask] of Object.entries(masks)) {
      assert.equal(mask.length, count, `${name} mask length`);
      for (let i = 0; i < count; i++) {
        assert.ok(Number.isFinite(mask[i]), `${name}[${i}] finite`);
        assert.ok(mask[i]! >= 0 && mask[i]! <= 1, `${name}[${i}] in range`);
      }
    }
    // Anatomy priors are non-empty: the fixture encodes eyes + mouth.
    const mouthActive = masks.mouth.some((v) => v > 0.2);
    assert.equal(mouthActive, true, "mouth region derived from fixture morphs");
  });

  it("descriptor normalization clamps to [-1,1] and is neutral by default", () => {
    const n = normalizeDescriptor({ skullWidth: 99, noseLength: -99, browRidge: undefined });
    assert.equal(n.skullWidth, 1);
    assert.equal(n.noseLength, -1);
    assert.equal(n.browRidge, 0);
    assert.deepEqual(normalizeDescriptor({}), NEUTRAL_DESCRIPTOR);
  });

  it("identity hash is deterministic and descriptor-sensitive", () => {
    assert.equal(
      identityDescriptorHash({ jawWidth: 0.5, browRidge: 0.25 }),
      identityDescriptorHash({ browRidge: 0.25, jawWidth: 0.5 }),
    );
    assert.notEqual(
      identityDescriptorHash({ jawWidth: 0.5 }),
      identityDescriptorHash({ jawWidth: 0.51 }),
    );
  });

  it("sculpt is deterministic: same descriptor => identical vertices + hash", () => {
    const mesh = baseMesh();
    const a = sculptFaceIdentity(mesh, DISTINCT);
    const b = sculptFaceIdentity(mesh, DISTINCT);
    assert.equal(a.identityHash, b.identityHash);
    assert.equal(a.vertexCount, b.vertexCount);
    assert.deepEqual(Array.from(a.vertices), Array.from(b.vertices));
    assert.deepEqual(Array.from(a.normals), Array.from(b.normals));
    assert.equal(a.aabb.vertexCount, b.aabb.vertexCount);
  });

  it("different descriptors => different geometry + hashes", () => {
    const mesh = baseMesh();
    const a = sculptFaceIdentity(mesh, DISTINCT);
    const b = sculptFaceIdentity(mesh, { ...DISTINCT, noseLength: 0.91 });
    assert.notEqual(a.identityHash, b.identityHash);
    assert.notDeepEqual(Array.from(a.vertices), Array.from(b.vertices));
  });

  it("sculpt changes geometry relative to neutral and preserves topology", () => {
    const mesh = baseMesh();
    const neutral = sculptFaceIdentity(mesh, {});
    const sculpted = sculptFaceIdentity(mesh, DISTINCT);
    assert.equal(sculpted.vertices.length, neutral.vertices.length);
    assert.equal(sculpted.indices.length, mesh.indices.length);
    assert.deepEqual(Array.from(sculpted.indices), Array.from(mesh.indices));
    const maxDelta = Math.max(
      ...Array.from(
        { length: neutral.vertexCount },
        (_, i) => {
          const o = i * 3;
          return Math.hypot(
            sculpted.vertices[o]! - neutral.vertices[o]!,
            sculpted.vertices[o + 1]! - neutral.vertices[o + 1]!,
            sculpted.vertices[o + 2]! - neutral.vertices[o + 2]!,
          );
        },
      ),
    );
    assert.ok(maxDelta > 0, "sculpt actually moved vertices");
    assert.ok(
      maxDelta <= MAX_IDENTITY_DISPLACEMENT * 1.5,
      `max displacement ${maxDelta} bounded`,
    );
  });

  it("per-axis sculpt moves geometry in the expected direction", () => {
    const mesh = baseMesh();
    const wide = sculptFaceIdentity(mesh, { skullWidth: 1 });
    const neutral = sculptFaceIdentity(mesh, {});
    const aabbW = wide.aabb;
    const aabbN = neutral.aabb;
    assert.ok(
      aabbW.max[0] - aabbW.min[0] > aabbN.max[0] - aabbN.min[0],
      "skullWidth widens the head",
    );
    const long = sculptFaceIdentity(mesh, { noseLength: 1 });
    assert.ok(
      long.aabb.max[2] > wide.aabb.max[2] || long.aabb.max[2] > neutral.aabb.max[2],
      "noseLength increases forward extent",
    );
  });

  it("biometric conformance: sculpted AABB passes human-sized profile", () => {
    const mesh = baseMesh();
    for (const descriptor of [
      {},
      DISTINCT,
      { skullWidth: 1, jawWidth: 1, cheekProminence: -1, noseLength: -1, lipFullness: -1 },
      { skullWidth: -1, jawWidth: -1, cheekProminence: 1, browRidge: -1, eyeDepth: 1 },
    ]) {
      const model = sculptFaceIdentity(mesh, descriptor);
      assert.ok(model.biometric, `biometric for ${JSON.stringify(descriptor)}`);
      assert.equal(
        model.biometric.ok,
        true,
        `human-sized conformance: ${model.biometric.issues.join("; ")}`,
      );
    }
  });

  it("applied amplitudes report only non-zero axes", () => {
    const mesh = baseMesh();
    const model = sculptFaceIdentity(mesh, { skullWidth: 0.5 });
    assert.ok(Object.keys(model.appliedAmplitudes).includes("skullWidth"));
    assert.equal(model.appliedAmplitudes["skullWidth"], 0.5 * MAX_IDENTITY_DISPLACEMENT);
    assert.equal(model.appliedAmplitudes["noseLength"], undefined);
  });

  it("renderEngine3dStill applies faceIdentity and records the identity hash", () => {
    const outDir = mkdtempSync(join(tmpdir(), "face-id-"));
    try {
      const a = renderEngine3dStill({
        outDir,
        width: 128,
        height: 128,
        faceIdentity: { jawWidth: 0.7, noseLength: 0.6, browRidge: 0.5 },
      });
      const b = renderEngine3dStill({
        outDir,
        width: 128,
        height: 128,
        faceIdentity: { jawWidth: -0.7, noseLength: -0.6, browRidge: -0.5 },
      });
      assert.equal(a.structureRecord.face_rig, true);
      assert.ok(a.structureRecord.face_identity_hash, "identity hash present");
      assert.ok(
        /Deterministic identity sculpt/.test(a.structureRecord.note ?? ""),
      );
      assert.notEqual(
        a.structureRecord.face_identity_hash,
        b.structureRecord.face_identity_hash,
      );
    } finally {
      rmSync(outDir, { recursive: true, force: true });
    }
  });
});
