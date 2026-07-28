/**
 * Continuity tests for P(θ,φ,τ,κ) — ProjCC.
 * Status claim under test: partial.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { vec4 } from "../math/vec4.js";
import {
  ProjectionKernel,
  evaluateContinuousP,
  projectPointContinuous,
  d4WithKappa,
  pccContinuityHolds,
  createApertureFrame3D,
  apertureSampleDirection,
  resolveObservationPreset,
} from "../projection/index.js";

describe("ProjCC continuity", () => {
  it("evaluateContinuousP freezes finite state", () => {
    const s = evaluateContinuousP(0.1, 0.2, 0.05, 0.01, { width: 320, height: 240 });
    assert.equal(s.status, "partial");
    assert.equal(s.theta, 0.1);
    assert.equal(s.width, 320);
  });

  it("κ=0 leaves d4 unchanged", () => {
    assert.equal(d4WithKappa(4, 0), 4);
  });

  it("local Lipschitz continuity holds for a safe interior point", () => {
    const point = vec4(0.5, -0.25, 0.75, 0.2);
    const r = pccContinuityHolds(point, { bound: 200 });
    assert.equal(r.ok, true, JSON.stringify(r.steps));
  });

  it("kernel.project returns finite screen samples", () => {
    const k = new ProjectionKernel({ width: 640, height: 480 });
    k.evaluateP(0.15, 0.4, 0.02, 0.1);
    const { screen } = k.project(vec4(1, 0, 0.5, 0.1));
    assert.ok(Number.isFinite(screen.sx));
    assert.ok(Number.isFinite(screen.sy));
  });

  it("aperture frame role is observation_aperture not print_sot", () => {
    const frame = createApertureFrame3D(
      { theta: 0.2, phi: 0.1, kappa: 0 },
      { x: 0, y: 0, width: 640, height: 480 },
    );
    assert.equal(frame.role, "observation_aperture");
    assert.equal(frame.printSoT, false);
    assert.equal(frame.authority, "observation");
    assert.match(frame.banner, /assist\/preview only/i);
    assert.notEqual(frame.role, "print_sot");
    const dir = apertureSampleDirection(frame, 0.5, 0.5);
    assert.ok(Math.abs(Math.hypot(dir.x, dir.y, dir.z) - 1) < 1e-9);
  });

  it("perspective_w preset resolves with LiveLink perspective policy", () => {
    const r = resolveObservationPreset("perspective_w");
    assert.equal(r.state.modeId, "perspective_w");
    assert.equal(r.projectionPolicyId, 0);
  });

  it("small param step changes continuous projection smoothly", () => {
    const point = { x: 0.3, y: 0.1, z: 0.4, w: 0.15 };
    const a = projectPointContinuous(
      point,
      evaluateContinuousP(0.1, 0.1, 0, 0, { width: 640, height: 480 }),
    );
    const b = projectPointContinuous(
      point,
      evaluateContinuousP(0.1 + 1e-5, 0.1, 0, 0, { width: 640, height: 480 }),
    );
    const dist = Math.hypot(b.screen.sx - a.screen.sx, b.screen.sy - a.screen.sy);
    assert.ok(dist < 1, `expected tiny screen delta, got ${dist}`);
  });
});
