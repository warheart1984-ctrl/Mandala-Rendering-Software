/**
 * ProjCC invariant + path-tracer bind + aperture SoT tests.
 * Projector4D remains math/print SoT. Aperture ≠ print.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { vec4 } from "../math/vec4.js";
import { Projector4D } from "../output/projector.js";
import { PathTracer4D } from "../integrator/PathTracer4D.js";
import {
  pccFidelityZeroHolds,
  listPccInvariants,
  PCC_INVARIANTS,
  ProjectionKernel,
  createProjectionState,
  resolveObservationPreset,
  createPathTracerProjectionHooks,
  bindPathTracerProjection,
  describePathTracerProjectionIntegration,
  createApertureFrame3D,
  APERTURE_SOT_BANNER,
  evaluateProjectionGovernance,
  PROJECTION_GOVERNANCE_STATUS,
} from "../projection/index.js";

describe("ProjCC invariants", () => {
  it("catalog exposes PCC ids; unit-proven rows may be enforced", () => {
    const list = listPccInvariants();
    assert.ok(list.some((i) => i.id === "PCC-FIDELITY-ZERO"));
    const fidelity = PCC_INVARIANTS.find((i) => i.id === "PCC-FIDELITY-ZERO");
    assert.equal(fidelity.status, "enforced");
    const runtime = PCC_INVARIANTS.find((i) => i.id === "PCC-RUNTIME-CKL");
    assert.equal(runtime.status, "declared");
  });

  it("zero-param fidelity matches Projector4D closed form", () => {
    const point = vec4(1.5, -2, 3.25, 0.75);
    const r = pccFidelityZeroHolds(point, { d4: 4, d3: 4, scale: 80, width: 640, height: 480 });
    assert.equal(r.ok, true, JSON.stringify(r));
  });

  it("ProjectionKernel classic path matches Projector4D at identity params", () => {
    const point = vec4(0.8, 0.2, -0.4, 0.3);
    const k = new ProjectionKernel({ theta: 0, phi: 0, tau: 0, kappa: 0 });
    assert.equal(k.printSoT, false);
    assert.equal(k.authority, "observation");
    const classic = k.classicProject3D(point);
    const projector = k.createProjector4D();
    const actual = projector.project4Dto3D(point);
    assert.ok(Math.abs(classic.x - actual.x) < 1e-12);
    assert.ok(Math.abs(classic.y - actual.y) < 1e-12);
    assert.ok(Math.abs(classic.z - actual.z) < 1e-12);
  });

  it("createProjectionState rejects negative kappa", () => {
    assert.throws(() => createProjectionState({ kappa: -1 }), /kappa/);
  });

  it("slice_hyperplane preset maps to W-slice LiveLink policy", () => {
    const r = resolveObservationPreset("slice_hyperplane", { tau: 0.25 });
    assert.equal(r.projectionPolicyId, 1);
    assert.equal(r.state.tau, 0.25);
    assert.equal(r.printSoT, false);
    assert.equal(r.authority, "observation");
  });

  it("intentional_orbit preset applies non-zero angles and differs from identity", () => {
    const orbit = resolveObservationPreset("intentional_orbit");
    assert.equal(orbit.preset.status, "enforced");
    assert.ok(orbit.state.theta !== 0);
    assert.ok(orbit.state.phi !== 0);
    assert.equal(orbit.printSoT, false);
    const point = { x: 1, y: 0, z: 0, w: 0.2 };
    const id = new ProjectionKernel({
      theta: 0,
      phi: 0,
      tau: 0,
      kappa: 0,
      width: 640,
      height: 480,
    }).project(point);
    const orb = new ProjectionKernel(orbit.state).project(point);
    const dist = Math.hypot(orb.screen.sx - id.screen.sx, orb.screen.sy - id.screen.sy);
    assert.ok(dist > 1e-6, `orbit should move screen, dist=${dist}`);
  });

  it("soft_caustic preset applies kappa and changes d4 effective scale", () => {
    const soft = resolveObservationPreset("soft_caustic");
    assert.equal(soft.preset.status, "enforced");
    assert.ok(soft.state.kappa > 0);
    assert.match(soft.preset.label, /observation/i);
    const point = { x: 0.5, y: 0, z: 0.2, w: 0.1 };
    const zero = new ProjectionKernel({
      kappa: 0,
      width: 640,
      height: 480,
    }).project(point);
    const caustic = new ProjectionKernel(soft.state).project(point);
    const dist = Math.hypot(
      caustic.screen.sx - zero.screen.sx,
      caustic.screen.sy - zero.screen.sy,
    );
    assert.ok(dist > 1e-9, `soft_caustic kappa should move screen, dist=${dist}`);
  });

  it("P0: path-tracer hooks must not clobber intentional_orbit / soft_caustic presets with undefined", () => {
    const orbitHooks = createPathTracerProjectionHooks({ modeId: "intentional_orbit" });
    assert.equal(orbitHooks.state.theta, Math.PI / 6);
    assert.equal(orbitHooks.state.phi, Math.PI / 4);
    assert.equal(orbitHooks.state.tau, 0);
    assert.equal(orbitHooks.state.kappa, 0);
    assert.equal(orbitHooks.printSoT, false);
    assert.equal(orbitHooks.authority, "observation");

    const softHooks = createPathTracerProjectionHooks({ modeId: "soft_caustic" });
    assert.equal(softHooks.state.kappa, 0.5);
    assert.equal(softHooks.state.theta, 0);
    assert.equal(softHooks.state.phi, 0);
    assert.equal(softHooks.printSoT, false);

    // Sparse undefined overrides must not wipe preset angles/kappa.
    const sparse = resolveObservationPreset("intentional_orbit", {
      theta: undefined,
      phi: undefined,
      tau: undefined,
      kappa: undefined,
      width: undefined,
    });
    assert.equal(sparse.state.theta, Math.PI / 6);
    assert.equal(sparse.state.phi, Math.PI / 4);
  });

  it("aperture frame asserts printSoT:false and observation authority", () => {
    const frame = createApertureFrame3D(
      { theta: 0.2, phi: 0.1, kappa: 0.1 },
      { x: 0, y: 0, width: 640, height: 480 },
    );
    assert.equal(frame.role, "observation_aperture");
    assert.equal(frame.printSoT, false);
    assert.equal(frame.authority, "observation");
    assert.equal(frame.banner, APERTURE_SOT_BANNER);
    assert.match(frame.banner, /print remains SoT/i);
    assert.notEqual(frame.role, "print_sot");
  });

  it("path-tracer bind wires observationProjection without print authority", () => {
    const tracer = new PathTracer4D({ maxDepth: 1, rng: () => 0.5 });
    const hooks = createPathTracerProjectionHooks({
      modeId: "perspective_w",
      width: 320,
      height: 240,
    });
    assert.equal(hooks.printSoT, false);
    assert.equal(hooks.authority, "observation");
    const bound = bindPathTracerProjection(tracer, hooks);
    assert.equal(bound.wiredIntoPathTracer4D, true);
    assert.equal(bound.printSoT, false);
    assert.ok(tracer.observationProjection);
    assert.equal(tracer.observationProjection.printSoT, false);
    assert.equal(tracer.observationProjection.authority, "observation");
    const obs = tracer.projectObservationPoint(vec4(0.5, 0, 0.2, 0.1));
    assert.ok(obs);
    assert.equal(obs.printSoT, false);
    assert.equal(obs.authority, "observation");
    assert.ok(Number.isFinite(obs.screen.sx));
    const d = describePathTracerProjectionIntegration();
    assert.equal(d.wired, true);
    assert.equal(d.printSoT, false);
    assert.match(d.banner, /Projector4D is math\/print SoT/);
  });

  it("projection governance denies missing PCC metadata and attaches provenance", () => {
    const denied = evaluateProjectionGovernance(
      { id: "i1", action: "observe_projection" },
      null,
      { requirePccMetadata: true },
    );
    assert.equal(denied.deny, true);
    assert.equal(denied.printSoT, false);
    assert.equal(denied.status, PROJECTION_GOVERNANCE_STATUS);

    const allowed = evaluateProjectionGovernance(
      {
        id: "i2",
        action: "observe_projection",
        pcc: { modeId: "soft_caustic", kappa: 0.5 },
      },
      null,
    );
    assert.equal(allowed.allow, true);
    assert.equal(allowed.attachProvenance, true);
    assert.equal(allowed.provenance.printSoT, false);
    assert.equal(allowed.provenance.authority, "observation");
  });

  it("Projector4D remains importable SoT (no parallel print kernel)", () => {
    const p = new Projector4D({ d4: 4 });
    const q = p.project4Dto3D(vec4(1, 0, 0, 0));
    assert.equal(q.x, 1);
  });
});
