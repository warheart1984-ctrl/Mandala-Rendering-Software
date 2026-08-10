// mrs/packages/renderer-core/src/render/rt4d/projection/ProjectionKernel.test.js
// Status: **passing with gaps** - ProjectionKernel state management + projection tests.

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ProjectionKernel } from "./ProjectionKernel.js";
import { classic4Dto3D } from "./continuityMath.js";
import { vec4 } from "../math/vec4.js";

describe("ProjectionKernel", () => {
  it("constructs with default state", () => {
    const kernel = new ProjectionKernel();
    assert.equal(kernel.printSoT, false);
    assert.equal(kernel.authority, "observation");
    assert.ok(kernel.state);
    assert.equal(kernel.state.d4, 4);
    assert.equal(kernel.state.d3, 4);
  });

  it("constructs with initial state", () => {
    const kernel = new ProjectionKernel({ d4: 8, d3: 8, theta: 0.5, kappa: 0.2 });
    assert.equal(kernel.state.d4, 8);
    assert.equal(kernel.state.d3, 8);
    assert.equal(kernel.state.theta, 0.5);
    assert.equal(kernel.state.kappa, 0.2);
  });

  it("get state returns current state", () => {
    const kernel = new ProjectionKernel({ theta: 0.5 });
    const state = kernel.state;
    assert.equal(state.theta, 0.5);
    // Should be a snapshot, not the internal reference
    kernel.setState({ theta: 1.0 });
    assert.equal(state.theta, 0.5); // Original snapshot unchanged
  });

  it("setState merges and returns new state", () => {
    const kernel = new ProjectionKernel();
    kernel.setState({ theta: 0.5, phi: 1.0 });
    assert.equal(kernel.state.theta, 0.5);
    assert.equal(kernel.state.phi, 1.0);
  });

  it("snapshotState returns current state snapshot", () => {
    const kernel = new ProjectionKernel({ theta: 0.5 });
    const snap = kernel.snapshotState();
    assert.equal(snap.theta, 0.5);
  });

  it("restoreState restores snapshot", () => {
    const kernel = new ProjectionKernel({ theta: 0.5, phi: 1.0 });
    const snap = kernel.snapshotState();
    kernel.setState({ theta: 2.0, phi: 3.0 });
    kernel.restoreState(snap);
    assert.equal(kernel.state.theta, 0.5);
    assert.equal(kernel.state.phi, 1.0);
  });

  it("evaluateP updates continuous params", () => {
    const kernel = new ProjectionKernel();
    kernel.evaluateP(0.5, 1.0, 0.2, 0.1);
    assert.equal(kernel.state.theta, 0.5);
    assert.equal(kernel.state.phi, 1.0);
    assert.equal(kernel.state.tau, 0.2);
    assert.equal(kernel.state.kappa, 0.1);
  });

  it("project delegates to projectPointContinuous", () => {
    const kernel = new ProjectionKernel({ d4: 4 });
    const point = { x: 1, y: 2, z: 3, w: 1 };
    const result = kernel.project(point);
    // Classic projection: f = d4 / (d4 + w) = 4/5 = 0.8
    const expected = classic4Dto3D({ x: 1, y: 2, z: 3, w: 1 }, 4);
    assert.ok(Math.abs(result.p3.x - expected.x) < 1e-6);
    assert.ok(Math.abs(result.p3.y - expected.y) < 1e-6);
    assert.ok(Math.abs(result.p3.z - expected.z) < 1e-6);
    assert.ok(result.wFactor > 0);
    assert.ok(typeof result.screen.sx === "number");
    assert.ok(typeof result.screen.sy === "number");
  });

  it("projectSafe delegates to projectPointContinuousSafe", () => {
    const kernel = new ProjectionKernel();
    const point = { x: 1, y: 2, z: 3, w: 1 };
    const result = kernel.projectSafe(point);
    assert.ok(result.p3);
    assert.ok(typeof result.screen.sx === "number");
    assert.ok(typeof result.screen.sy === "number");
    assert.equal(result.printSoT, false);
    assert.equal(result.authority, "observation");
  });

  it("createProjector4D returns Projector4D instance", () => {
    const kernel = new ProjectionKernel({ d4: 8 });
    const projector = kernel.createProjector4D();
    assert.ok(projector);
    assert.ok(typeof projector.project3Dto2D === "function");
  });

  it("classicProject3D matches classic formula", () => {
    const kernel = new ProjectionKernel({ d4: 4 });
    const point = { x: 2, y: 3, z: 4, w: 2 };
    const proj = kernel.classicProject3D(point);
    const expected = classic4Dto3D(point, 4);
    assert.ok(Math.abs(proj.x - expected.x) < 1e-6);
    assert.ok(Math.abs(proj.y - expected.y) < 1e-6);
    assert.ok(Math.abs(proj.z - expected.z) < 1e-6);
  });

  it("PROJECTION_KERNEL_SOT_BANNER has correct text", () => {
    const kernel = new ProjectionKernel();
    assert.ok(kernel.sotBanner.includes("Aperture ≠ print"));
    assert.ok(kernel.sotBanner.includes("Projector4D"));
    assert.ok(kernel.sotBanner.includes("SoT"));
  });

  it("sotBanner and authority accessible on instance", () => {
    const kernel = new ProjectionKernel();
    assert.ok(kernel.sotBanner);
    assert.equal(kernel.authority, "observation");
    assert.equal(kernel.printSoT, false);
  });

  it("evaluateP merges with base state", () => {
    const kernel = new ProjectionKernel({ modeId: "test", intentId: "test-intent" });
    kernel.evaluateP(0.1, 0.2, 0.3, 0.4, { d4: 8 });
    assert.equal(kernel.state.theta, 0.1);
    assert.equal(kernel.state.phi, 0.2);
    assert.equal(kernel.state.tau, 0.3);
    assert.equal(kernel.state.kappa, 0.4);
    assert.equal(kernel.state.d4, 8);
    assert.equal(kernel.state.modeId, "test");
    assert.equal(kernel.state.intentId, "test-intent");
  });

  it("setState preserves existing state fields not in patch", () => {
    const kernel = new ProjectionKernel({ theta: 1, phi: 2, tau: 3, kappa: 4, d4: 8, modeId: "test" });
    kernel.setState({ theta: 10 });
    assert.equal(kernel.state.theta, 10);
    assert.equal(kernel.state.phi, 2);
    assert.equal(kernel.state.tau, 3);
    assert.equal(kernel.state.kappa, 4);
    assert.equal(kernel.state.d4, 8);
    assert.equal(kernel.state.modeId, "test");
  });
});