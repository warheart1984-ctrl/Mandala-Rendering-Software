import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { canonicalJson, sha256Canonical } from "../src/canonical.js";
import {
  applySculptOperation,
  lockSculptTopology,
  sculptDocumentHash,
  sculptTopologyDigest,
  validateSculptDocument,
} from "../src/sculpt.js";
import type { SculptDocument } from "../src/types.js";

function fixture(): SculptDocument {
  return {
    schemaVersion: "sovereign-sculpt/1.0",
    status: "core-enforced-fixture-not-production-sculpt",
    id: "symmetric-fixture",
    species: "human",
    topologyState: "authoring",
    topologyRevision: 0,
    identity: {
      id: "char-1",
      displayName: "Fixture",
      gender: { identity: "nonbinary", attribution: "creator-authored" },
    },
    morphologyProfile: {
      stature: 0.5,
      bodyMass: 0.5,
      limbLength: 0.5,
      torsoLength: 0.5,
      headScale: 0.5,
      muzzleLength: 0,
      earScale: 0.5,
      tailLength: 0,
      digitigradeBias: 0,
    },
    vertices: [
      { id: "left", position: [-1, 0, 0] },
      { id: "right", position: [1, 0, 0] },
      { id: "top", position: [0, 1, 0] },
    ],
    triangles: [{ id: "face-0", vertexIndices: [0, 1, 2], regionId: "face" }],
    regions: [{ id: "face", vertexIndices: [0, 1, 2] }],
    masks: [{ id: "left-only", weights: [1, 0, 0] }],
    operationLog: [],
  };
}

describe("canonical sculpt substrate", () => {
  it("canonicalizes object keys and hashes deterministically", () => {
    assert.equal(canonicalJson({ z: 1, a: [2, 3] }), '{"a":[2,3],"z":1}');
    assert.equal(sha256Canonical({ b: 2, a: 1 }), sha256Canonical({ a: 1, b: 2 }));
  });

  it("keeps gender identity separate from morphology", () => {
    assert.equal(validateSculptDocument(fixture()).ok, true);
    const invalid = {
      ...fixture(),
      morphologyProfile: { ...fixture().morphologyProfile, gender: "female" },
    } as unknown as SculptDocument;
    assert.equal(validateSculptDocument(invalid).issues.some((issue) => issue.code === "gender-in-morphology"), true);
  });

  it("applies soft radial movement without mutating or reordering vertices", () => {
    const original = fixture();
    const moved = applySculptOperation(original, {
      id: "move-1",
      kind: "move",
      delta: [0, 2, 0],
      selection: { center: [-1, 0, 0], radius: 2, falloff: "linear" },
    });
    assert.deepEqual(original.vertices.map((vertex) => vertex.position), [[-1, 0, 0], [1, 0, 0], [0, 1, 0]]);
    assert.deepEqual(moved.vertices.map((vertex) => vertex.id), ["left", "right", "top"]);
    assert.deepEqual(moved.vertices[0]!.position, [-1, 2, 0]);
    assert.deepEqual(moved.vertices[1]!.position, [1, 0, 0]);
    assert.ok(moved.vertices[2]!.position[1] > 1 && moved.vertices[2]!.position[1] < 2);
  });

  it("mirrors x-axis move direction and selection", () => {
    const moved = applySculptOperation(fixture(), {
      id: "symmetry-1",
      kind: "move",
      delta: [0.5, 0, 0],
      symmetry: "x",
      selection: { maskId: "left-only" },
    });
    assert.deepEqual(moved.vertices[0]!.position, [-1.5, 0, 0]);
    assert.deepEqual(moved.vertices[1]!.position, [1.5, 0, 0]);
  });

  it("mirrors rotations as axial vectors around reflected pivots", () => {
    const rotated = applySculptOperation(fixture(), {
      id: "symmetry-rotate-1",
      kind: "rotate",
      radians: [0, 0, Math.PI / 2],
      symmetry: "x",
      selection: { maskId: "left-only" },
    });
    assert.ok(Math.abs(rotated.vertices[0]!.position[0]) < 1e-12);
    assert.ok(Math.abs(rotated.vertices[1]!.position[0]) < 1e-12);
    assert.ok(Math.abs(rotated.vertices[0]!.position[1] - 1) < 1e-12);
    assert.ok(Math.abs(rotated.vertices[1]!.position[1] - 1) < 1e-12);
  });

  it("supports deterministic scale, rotate, and mask operations", () => {
    const scaled = applySculptOperation(fixture(), {
      id: "scale-1",
      kind: "scale",
      factors: [2, 1, 1],
    });
    assert.deepEqual(scaled.vertices[0]!.position, [-2, 0, 0]);
    const rotated = applySculptOperation(scaled, {
      id: "rotate-1",
      kind: "rotate",
      radians: [0, 0, Math.PI / 2],
    });
    assert.ok(Math.abs(rotated.vertices[0]!.position[0]) < 1e-12);
    assert.ok(Math.abs(rotated.vertices[0]!.position[1] + 2) < 1e-12);
    const masked = applySculptOperation(rotated, {
      id: "mask-1",
      kind: "mask",
      maskId: "raised",
      mode: "set",
      value: 0.75,
      selection: { regionIds: ["face"] },
    });
    assert.deepEqual(masked.masks.find((mask) => mask.id === "raised")?.weights, [0.75, 0.75, 0.75]);
    for (const document of [scaled, rotated, masked]) {
      assert.equal(document.topologyState, "authoring");
      assert.equal(document.topologyRevision, 0);
      assert.equal(document.parentTopologyDigest, undefined);
    }
  });

  it("subdivides by appending stable edge midpoints and interpolated masks", () => {
    const original = fixture();
    const parentDigest = sculptTopologyDigest(original);
    const subdivided = applySculptOperation(original, {
      id: "subdivide-1",
      kind: "subdivide",
    });
    assert.deepEqual(subdivided.vertices.slice(0, 3).map((vertex) => vertex.id), ["left", "right", "top"]);
    assert.deepEqual(subdivided.vertices.slice(3).map((vertex) => vertex.position), [
      [0, 0, 0],
      [0.5, 0.5, 0],
      [-0.5, 0.5, 0],
    ]);
    assert.equal(subdivided.triangles.length, 4);
    assert.deepEqual(subdivided.masks[0]!.weights, [1, 0, 0, 0.5, 0, 0.5]);
    assert.equal(subdivided.topologyRevision, 1);
    assert.equal(subdivided.parentTopologyDigest, parentDigest);
    assert.notEqual(sculptTopologyDigest(subdivided), parentDigest);
  });

  it("locks topology without changing geometry/order and rejects later subdivision", () => {
    const authoring = applySculptOperation(fixture(), {
      id: "authoring-subdivide",
      kind: "subdivide",
    });
    const beforeVertexIds = authoring.vertices.map((vertex) => vertex.id);
    const beforeTriangles = authoring.triangles.map((triangle) => triangle.vertexIndices);
    const locked = lockSculptTopology(authoring);
    assert.equal(locked.topologyState, "locked");
    assert.equal(locked.topologyRevision, authoring.topologyRevision);
    assert.deepEqual(locked.vertices.map((vertex) => vertex.id), beforeVertexIds);
    assert.deepEqual(locked.triangles.map((triangle) => triangle.vertexIndices), beforeTriangles);
    assert.equal(locked.operationLog.at(-1)?.kind, "lock-topology");
    assert.equal(validateSculptDocument(locked).ok, true);
    assert.throws(() => applySculptOperation(locked, {
      id: "runtime-retopology",
      kind: "subdivide",
    }), /authoring/);
  });

  it("rejects non-finite operations and has stable document hashes", () => {
    assert.throws(() => applySculptOperation(fixture(), {
      id: "bad",
      kind: "move",
      delta: [Number.NaN, 0, 0],
    }), /non-finite|finite/);
    assert.equal(sculptDocumentHash(fixture()), sculptDocumentHash(fixture()));
  });

  it("rejects out-of-range morphology controls", () => {
    const invalid = {
      ...fixture(),
      morphologyProfile: { ...fixture().morphologyProfile, stature: 1.1 },
    } satisfies SculptDocument;
    assert.equal(
      validateSculptDocument(invalid).issues.some((issue) => issue.code === "morphology-range"),
      true,
    );
  });

  it("validates topology lifecycle metadata and lock evidence", () => {
    const invalidRevision = {
      ...fixture(),
      topologyRevision: -1,
    } satisfies SculptDocument;
    assert.equal(validateSculptDocument(invalidRevision).issues.some((issue) => issue.code === "topology-revision"), true);

    const dishonestLock = {
      ...fixture(),
      topologyState: "locked",
    } satisfies SculptDocument;
    assert.equal(validateSculptDocument(dishonestLock).issues.some((issue) => issue.code === "missing-topology-lock"), true);
  });
});
