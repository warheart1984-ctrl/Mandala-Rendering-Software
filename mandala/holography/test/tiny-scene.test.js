/**
 * Tiny holographic scene — trail / K / determinism (isolated from certified proto).
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createInitialCertifiedState } from "../../proto/certified-state.mjs";
import {
  Worldline,
  makeGridPlane,
  createPlaneEGT,
  nearestNodeId,
  depositTrail,
  runTinyHolographicScene,
  sceneFingerprint,
  BOUNDARY_PLANE_CONVENTION,
} from "../tiny-scene.mjs";
import { createBoundaryProjection, DEFAULT_ALPHA, DEFAULT_BETA } from "../index.mjs";
import { recomputeCurvature } from "../egt.mjs";

describe("tiny holographic test scene (Bulk→Boundary→EGT→render)", () => {
  it("Worldline.positionAt matches Vec4(t, v_x*t, 0, 0)", () => {
    const wl = new Worldline({ v_x: 0.2 });
    const p = wl.positionAt(5);
    assert.equal(p.t, 5);
    assert.equal(p.x, 1);
    assert.equal(p.y, 0);
    assert.equal(p.z, 0);
    assert.deepEqual([...p.asArray], [5, 1, 0, 0]);
  });

  it("makeGridPlane builds EGT nodes on z=0 with documented convention", () => {
    const grid = makeGridPlane({
      sizeX: 10,
      sizeY: 10,
      resolutionX: 8,
      resolutionY: 8,
      z: 0,
    });
    assert.equal(grid.convention, BOUNDARY_PLANE_CONVENTION);
    assert.equal(grid.nodeCount, 64);
    assert.ok(grid.edgeCount > 0);
    for (const n of grid.nodes) {
      assert.equal(n.position.z, 0);
      assert.ok(Number.isFinite(n.position.x));
      assert.ok(Number.isFinite(n.position.y));
    }
    // Corners near ±size/2
    const xs = grid.nodes.map((n) => n.position.x);
    assert.ok(Math.min(...xs) <= -4.9);
    assert.ok(Math.max(...xs) >= 4.9);
  });

  it("static-observer projection of worldline drops t (spatial = (x,y,z))", () => {
    const bp = createBoundaryProjection();
    const wl = new Worldline({ v_x: 0.15 });
    const p4 = wl.positionAt(10);
    const p3 = bp.projectPoint4DTo3D(p4.asArray);
    assert.ok(Math.abs(p3.x - p4.x) < 1e-12);
    assert.ok(Math.abs(p3.y - p4.y) < 1e-12);
    assert.ok(Math.abs(p3.z - p4.z) < 1e-12);
  });

  it("after N frames: max(ρ) near projected path, sum(edges)>0, max(|K|)>0", () => {
    const result = runTinyHolographicScene({
      frames: 40,
      v_x: 0.15,
      resolutionX: 24,
      resolutionY: 24,
      densityIncrement: 1,
      entanglementIncrement: 0.4,
    });
    const { receipt, egt, projections } = result;

    assert.ok(receipt.maxRho > 0, "maxRho should be positive");
    assert.ok(receipt.edgeSum > 0, "sum(edges) should be > 0");
    assert.ok(receipt.maxK > 0, "max(|K|) should be > 0");

    // Peak ρ node near some projected sample (cell spacing ~ size/res)
    const cell = 10 / 23;
    assert.ok(
      receipt.minDistPeakToPath <= cell * 1.5 + 1e-6,
      `peak ρ too far from path: ${receipt.minDistPeakToPath}`,
    );

    // Trail: several distinct nearest nodes along +x
    const unique = new Set(projections.map((p) => p.nearestId));
    assert.ok(unique.size >= 3, "trail should visit multiple nodes");

    // α, β defaults
    assert.equal(egt.alpha, DEFAULT_ALPHA);
    assert.equal(egt.beta, DEFAULT_BETA);
  });

  it("deterministic for identical params", () => {
    const a = runTinyHolographicScene({ frames: 16, v_x: 0.12, resolutionX: 16, resolutionY: 16 });
    const b = runTinyHolographicScene({ frames: 16, v_x: 0.12, resolutionX: 16, resolutionY: 16 });
    assert.equal(sceneFingerprint(a), sceneFingerprint(b));
    assert.equal(a.receipt.egtHash, b.receipt.egtHash);
  });

  it("isolated scene does not mutate certified proto hash", () => {
    const state = createInitialCertifiedState({ seed: 7 });
    const hash0 = state.hash;
    runTinyHolographicScene({ frames: 8, resolutionX: 12, resolutionY: 12 });
    assert.equal(state.hash, hash0);
  });

  it("depositTrail + recomputeCurvature elevates K near trail", () => {
    const grid = makeGridPlane({ resolutionX: 10, resolutionY: 10, sizeX: 10, sizeY: 10 });
    const egt = createPlaneEGT(grid);
    const mid = nearestNodeId(egt, { x: 0, y: 0, z: 0 });
    depositTrail(egt, mid.node.position, {
      densityIncrement: 2,
      entanglementIncrement: 1,
    });
    // Neighbor deposit to create gradient
    const neighbor = egt.nodes.find((n) => n.ix === mid.node.ix + 1 && n.iy === mid.node.iy);
    assert.ok(neighbor);
    depositTrail(egt, neighbor.position, {
      densityIncrement: 0.5,
      entanglementIncrement: 0.5,
    });
    recomputeCurvature(egt);
    assert.ok(egt.rho[mid.id] > 0);
    assert.ok(sumW(egt) > 0);
    assert.ok(maxAbsK(egt) > 0);
  });
});

function sumW(egt) {
  let s = 0;
  for (const e of egt.edges) s += e.w_ij;
  return s;
}

function maxAbsK(egt) {
  let m = 0;
  for (let i = 0; i < egt.K.length; i++) {
    const a = Math.abs(egt.K[i]);
    if (a > m) m = a;
  }
  return m;
}
