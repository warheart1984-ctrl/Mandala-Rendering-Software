/**
 * AC-R10' — Renderer-core surface dispatch constitutional check
 * 
 * Constitutional invariant: Different surface IDs MUST produce different geometry hashes.
 * This test runs at the renderer-core level, before any PNG encoding or path tracing.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { getSurface, sampleSurface } from "../../src/surfaces/index.js";
import {
  renderIdentityHash,
  deriveGeometryEvidenceId,
  assertRenderIdentityBoundary,
  RenderIdentityViolation,
} from "../../src/render/rt4d/identity/RenderIdentity.js";

describe("AC-R10' — Renderer-core surface dispatch constitutional check", () => {
  const RESOLUTION = 32;

  it("AC-R10'a: clifford-torus and trefoil-4d produce different geometry hashes", () => {
    const clifford = getSurface("clifford-torus");
    const trefoil = getSurface("trefoil-4d");

    assert.ok(clifford, "clifford-torus must exist");
    assert.ok(trefoil, "trefoil-4d must exist");
    assert.notEqual(clifford.id, trefoil.id, "surface IDs must differ");

    const cliffordMesh = sampleSurface(clifford, RESOLUTION);
    const trefoilMesh = sampleSurface(trefoil, RESOLUTION);

    assert.ok(cliffordMesh.geometryHash, "clifford-torus must have geometryHash");
    assert.ok(trefoilMesh.geometryHash, "trefoil-4d must have geometryHash");
    assert.notEqual(
      cliffordMesh.geometryHash,
      trefoilMesh.geometryHash,
      "clifford-torus and trefoil-4d must produce different geometry hashes"
    );
  });

  it("AC-R10'b: all registered surfaces produce unique geometry hashes at same resolution", () => {
    const surfaceIds = ["clifford-torus", "trefoil-4d", "hopf-surface", "torus-3d", "tesseract"];
    const hashes = new Map();

    for (const id of surfaceIds) {
      const surface = getSurface(id);
      assert.ok(surface, `surface ${id} must exist`);
      
      const mesh = sampleSurface(surface, RESOLUTION);
      assert.ok(mesh.geometryHash, `${id} must have geometryHash`);
      
      // Check for hash collision with previously seen surfaces
      for (const [existingId, existingHash] of hashes) {
        assert.notEqual(
          mesh.geometryHash,
          existingHash,
          `${id} must produce different geometry hash than ${existingId}`
        );
      }
      
      hashes.set(id, mesh.geometryHash);
    }
  });

  it("AC-R10'c: same surface at same resolution produces identical geometry hash (determinism)", () => {
    const surface = getSurface("clifford-torus");
    const mesh1 = sampleSurface(surface, RESOLUTION);
    const mesh2 = sampleSurface(surface, RESOLUTION);
    
    assert.equal(
      mesh1.geometryHash,
      mesh2.geometryHash,
      "same surface at same resolution must produce identical geometry hash (determinism)"
    );
  });

  it("AC-R10'd: different resolutions produce different geometry hashes for same surface", () => {
    const surface = getSurface("clifford-torus");
    const meshLow = sampleSurface(surface, 16);
    const meshHigh = sampleSurface(surface, 64);
    
    assert.notEqual(
      meshLow.geometryHash,
      meshHigh.geometryHash,
      "different resolutions must produce different geometry hashes"
    );
  });

  it("AC-R10'e: geometry hash includes vertex positions, face topology, and edges", () => {
    const clifford = getSurface("clifford-torus");
    const trefoil = getSurface("trefoil-4d");
    
    const cliffordMesh = sampleSurface(clifford, RESOLUTION);
    const trefoilMesh = sampleSurface(trefoil, RESOLUTION);
    
    // Verify all expected fields are present
    assert.ok(Array.isArray(cliffordMesh.vertices), "vertices must be array");
    assert.ok(Array.isArray(cliffordMesh.faces), "faces must be array");
    assert.ok(Array.isArray(cliffordMesh.edges), "edges must be array");
    assert.ok(typeof cliffordMesh.geometryHash === "string", "geometryHash must be string");
    assert.ok(cliffordMesh.geometryHash.length === 64, "geometryHash must be 64-char hex (sha256)");
    
    // Verify surface ID is attached
    assert.equal(cliffordMesh.surfaceId, "clifford-torus");
    assert.equal(trefoilMesh.surfaceId, "trefoil-4d");
  });

  it("AC-R10'f: surface cache is keyed by render identity — different surfaces must not share entries", () => {
    const clifford = getSurface("clifford-torus");
    const trefoil = getSurface("trefoil-4d");

    const c = sampleSurface(clifford, RESOLUTION);
    const t = sampleSurface(trefoil, RESOLUTION);

    assert.ok(c.renderIdentityKey, "clifford sample must carry renderIdentityKey");
    assert.ok(t.renderIdentityKey, "trefoil sample must carry renderIdentityKey");
    assert.notEqual(c.renderIdentityKey, t.renderIdentityKey, "identity keys must differ across surfaces");

    assert.ok(c.geometryEvidenceId, "clifford sample must carry geometryEvidenceId");
    assert.notEqual(c.geometryEvidenceId, t.geometryEvidenceId, "geometry evidence ids must differ across surfaces");
  });

  it("AC-R10'g: same identity returns the cached entry (deterministic, shared)", () => {
    const clifford = getSurface("clifford-torus");
    const a = sampleSurface(clifford, RESOLUTION);
    const b = sampleSurface(clifford, RESOLUTION);
    assert.equal(a, b, "identical render identity must return the same cached mesh object");
  });

  it("AC-R10'h: discrete surface (tesseract) hashes and carries evidence identity", () => {
    const tesseract = getSurface("tesseract");
    const mesh = sampleSurface(tesseract, RESOLUTION);
    assert.ok(mesh.geometryHash && mesh.geometryHash.length === 64, "tesseract must hash its geometry");
    assert.ok(mesh.geometryEvidenceId, "tesseract must carry geometryEvidenceId");
    assert.ok(mesh.surfaceHash, "tesseract must carry surfaceHash");
  });

  it("AC-R10'i: fail-fast boundary throws on evidence mismatch and passes on match", () => {
    const identity = {
      surfaceId: "clifford-torus",
      geometryEvidenceId: deriveGeometryEvidenceId({ surfaceId: "clifford-torus", resolution: 16, timeSeconds: 0, surfaceHash: "abc" }),
      geometryHash: "g1",
      metricId: "euclidean",
      metricVersion: "1.0.0",
      timeSeconds: 0,
      projectionId: "perspective:4:4",
    };
    const matching = {
      id: identity.geometryEvidenceId,
      surfaceId: identity.surfaceId,
      geometryHash: identity.geometryHash,
    };
    const scene = { metric: { id: "euclidean" } };
    const mesh = { geometryHash: "g1" };
    const intersector = { geometryHash: "g1" };

    assertRenderIdentityBoundary(identity, matching, mesh, scene, intersector);

    const badMesh = { geometryHash: "g2" };
    assert.throws(
      () => assertRenderIdentityBoundary(identity, matching, badMesh, scene, intersector),
      RenderIdentityViolation,
      "geometry hash mismatch must throw",
    );

    const badScene = { metric: { id: "minkowski:-+++" } };
    assert.throws(
      () => assertRenderIdentityBoundary(identity, matching, mesh, badScene, intersector),
      RenderIdentityViolation,
      "metric id mismatch must throw",
    );

    assert.throws(
      () => assertRenderIdentityBoundary({ surfaceId: identity.surfaceId }, matching, mesh, scene, intersector),
      RenderIdentityViolation,
      "missing geometryEvidenceId must throw",
    );
  });

  it("AC-R10'j: render identity hash is canonical and identity-sensitive", () => {
    const base = {
      surfaceId: "clifford-torus",
      geometryEvidenceId: "ev1",
      geometryHash: "g1",
      metricId: "euclidean",
      metricVersion: "1.0.0",
      timeSeconds: 0,
      projectionId: "perspective:4:4",
    };
    const h1 = renderIdentityHash(base);
    assert.equal(h1, renderIdentityHash({ ...base }), "same identity must hash identically");
    assert.notEqual(h1, renderIdentityHash({ ...base, surfaceId: "trefoil-4d" }), "surfaceId must change the hash");
    assert.notEqual(h1, renderIdentityHash({ ...base, geometryHash: "g2" }), "geometryHash must change the hash");
    assert.notEqual(h1, renderIdentityHash({ ...base, metricId: "minkowski:-+++" }), "metricId must change the hash");
    assert.notEqual(h1, renderIdentityHash({ ...base, timeSeconds: 1 }), "timeSeconds must change the hash");
  });
});