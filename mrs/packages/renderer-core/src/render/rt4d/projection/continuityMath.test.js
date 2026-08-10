// mrs/packages/renderer-core/src/render/rt4d/projection/continuityMath.test.js
// Status: **passing with gaps** - continuityMath continuity/fidelity/safe extreme paths tests.

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  effectiveW,
  wProjFactor,
  applyViewOrientation,
  d4WithKappa,
  clampExtremeParams,
  evaluateContinuousP,
  projectPointContinuous,
  projectPointContinuousSafe,
  classic4Dto3D,
  EXTREME_PARAM_LIMITS,
} from "./continuityMath.js";

describe("continuityMath", () => {
  it("effectiveW subtracts tau from w", () => {
    assert.equal(effectiveW(5, 2), 3);
    assert.equal(effectiveW(5, 0), 5);
    assert.equal(effectiveW(5, -2), 7);
  });

  it("wProjFactor matches classic formula when tau=0", () => {
    assert.equal(wProjFactor(4, 2, 0), 4 / 6);
    assert.equal(wProjFactor(4, 0, 0), 1);
    assert.equal(wProjFactor(4, -2, 0), 4 / 2);
  });

  it("wProjFactor with tau shifts w", () => {
    assert.equal(wProjFactor(4, 2, 1), 4 / 5);
    assert.equal(wProjFactor(4, 0, 1), 4 / 3);
  });

  it("applyViewOrientation identity at zero angles", () => {
    const p = { x: 1, y: 2, z: 3 };
    const r = applyViewOrientation(p, 0, 0);
    assert.equal(r.x, 1);
    assert.equal(r.y, 2);
    assert.equal(r.z, 3);
  });

  it("applyViewOrientation rotates around Z by phi", () => {
    const p = { x: 1, y: 0, z: 0 };
    const r = applyViewOrientation(p, 0, Math.PI / 2);
    assert.ok(Math.abs(r.x - 0) < 1e-6);
    assert.ok(Math.abs(r.y - 1) < 1e-6);
    assert.ok(Math.abs(r.z - 0) < 1e-6);
  });

  it("applyViewOrientation tilts by theta in XZ plane", () => {
    const p = { x: 0, y: 0, z: 1 };
    const r = applyViewOrientation(p, Math.PI / 2, 0);
    // x = 1*1 + 1*0 = 1, z = -1*1 + 0 = 0
    assert.ok(Math.abs(r.x - 1) < 1e-6);
    assert.ok(Math.abs(r.z - 0) < 1e-6);
  });

  it("d4WithKappa scales d4 by (1 + 0.1*kappa)", () => {
    assert.equal(d4WithKappa(4, 0), 4);
    assert.equal(d4WithKappa(4, 0.5), 4 * 1.05);
    assert.equal(d4WithKappa(10, 1), 11);
  });

  it("clampExtremeParams clamps theta", () => {
    const state = { theta: 10, phi: 0, tau: 0, kappa: 0 };
    const clamped = clampExtremeParams(state);
    assert.equal(clamped.theta, Math.PI);
  });

  it("clampExtremeParams clamps phi", () => {
    const state = { theta: 0, phi: 10, tau: 0, kappa: 0 };
    const clamped = clampExtremeParams(state);
    assert.equal(clamped.phi, Math.PI * 2);
  });

  it("clampExtremeParams clamps tau", () => {
    const state = { theta: 0, phi: 0, tau: 2000, kappa: 0 };
    const clamped = clampExtremeParams(state);
    assert.equal(clamped.tau, 1000);
  });

  it("clampExtremeParams clamps kappa to >=0 and max", () => {
    let clamped = clampExtremeParams({ theta: 0, phi: 0, tau: 0, kappa: -5 });
    assert.equal(clamped.kappa, 0);
    clamped = clampExtremeParams({ theta: 0, phi: 0, tau: 0, kappa: 2000 });
    assert.equal(clamped.kappa, 1000);
  });

  it("clampExtremeParams handles NaN/Infinity", () => {
    const clamped = clampExtremeParams({ theta: NaN, phi: Infinity, tau: -Infinity, kappa: NaN });
    assert.equal(clamped.theta, 0);
    assert.equal(clamped.phi, 0);
    assert.equal(clamped.tau, 0);
    assert.equal(clamped.kappa, 0);
  });

  it("clampExtremeParams preserves other fields", () => {
    const state = { theta: 0, phi: 0, tau: 0, kappa: 0, d4: 4, d3: 4, modeId: "test" };
    const clamped = clampExtremeParams(state);
    assert.equal(clamped.d4, 4);
    assert.equal(clamped.d3, 4);
    assert.equal(clamped.modeId, "test");
  });

  it("evaluateContinuousP creates projection state", () => {
    const state = evaluateContinuousP(0.5, 1.0, 0.1, 0.2, { d4: 8, d3: 8 });
    assert.equal(state.theta, 0.5);
    assert.equal(state.phi, 1.0);
    assert.equal(state.tau, 0.1);
    assert.equal(state.kappa, 0.2);
    assert.equal(state.d4, 8);
    assert.equal(state.d3, 8);
  });

  it("classic4Dto3D matches standard formula", () => {
    const p = { x: 2, y: 3, z: 4, w: 2 };
    const proj = classic4Dto3D(p, 4);
    // f = 4 / (4 + 2) = 2/3
    assert.ok(Math.abs(proj.x - 2 * 2 / 3) < 1e-6);
    assert.ok(Math.abs(proj.y - 3 * 2 / 3) < 1e-6);
    assert.ok(Math.abs(proj.z - 4 * 2 / 3) < 1e-6);
  });

  it("EXTREME_PARAM_LIMITS has expected values", () => {
    assert.equal(EXTREME_PARAM_LIMITS.theta, Math.PI);
    assert.equal(EXTREME_PARAM_LIMITS.phi, Math.PI * 2);
    assert.equal(EXTREME_PARAM_LIMITS.tau, 1e3);
    assert.equal(EXTREME_PARAM_LIMITS.kappa, 1e3);
  });
});