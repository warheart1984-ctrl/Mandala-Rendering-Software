/**
 * Kernel strength: differentiability, reversible state, extreme-param graceful.
 * Projector4D remains SoT. Aperture ≠ print.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { vec4 } from "../math/vec4.js";
import {
  ProjectionKernel,
  pccDifferentiabilityHolds,
  pccExtremeGracefulHolds,
  pccContinuityHolds,
  PROJECTION_KERNEL_SOT_BANNER,
} from "../projection/index.js";

describe("ProjCC kernel strength", () => {
  it("kernel header banner states Projector4D SoT and aperture≠print", () => {
    const k = new ProjectionKernel();
    assert.match(k.sotBanner, /Projector4D/);
    assert.match(k.sotBanner, /Aperture ≠ print|Aperture/);
    assert.equal(PROJECTION_KERNEL_SOT_BANNER, k.sotBanner);
  });

  it("reversible state round-trip restores params", () => {
    const k = new ProjectionKernel({ theta: 0.1, phi: 0.2, tau: 0.03, kappa: 0.4 });
    const snap = k.snapshotState();
    k.evaluateP(0.9, 1.1, 0.5, 0.8);
    assert.notEqual(k.state.theta, snap.theta);
    k.restoreState(snap);
    assert.equal(k.state.theta, snap.theta);
    assert.equal(k.state.phi, snap.phi);
    assert.equal(k.state.tau, snap.tau);
    assert.equal(k.state.kappa, snap.kappa);
  });

  it("differentiability holds for theta interior", () => {
    const point = vec4(0.4, -0.1, 0.6, 0.15);
    const r = pccDifferentiabilityHolds(point, { dim: "theta", bound: 5e4 });
    assert.equal(r.ok, true, JSON.stringify(r));
  });

  it("local Lipschitz continuity still holds", () => {
    const point = vec4(0.5, -0.25, 0.75, 0.2);
    const r = pccContinuityHolds(point, { bound: 200 });
    assert.equal(r.ok, true, JSON.stringify(r.steps));
  });

  it("extreme θ,φ,τ,κ degrade gracefully with finite observation samples", () => {
    const point = vec4(0.3, 0.1, 0.4, 0.2);
    const r = pccExtremeGracefulHolds(point);
    assert.equal(r.ok, true, JSON.stringify(r.result));
    assert.equal(r.result.printSoT, false);
    assert.equal(r.result.authority, "observation");

    const k = new ProjectionKernel({
      theta: 1e9,
      phi: -1e9,
      tau: 1e9,
      kappa: 1e9,
    });
    const safe = k.projectSafe(point);
    assert.ok(Number.isFinite(safe.screen.sx));
    assert.ok(Number.isFinite(safe.screen.sy));
    assert.equal(safe.printSoT, false);
  });
});
