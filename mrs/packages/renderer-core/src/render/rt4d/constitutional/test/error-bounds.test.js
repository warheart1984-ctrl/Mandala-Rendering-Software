import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { MetricTensor } from "../../constitutional/arena/MetricTensor.js";
import { FourVector } from "../../constitutional/tensor/index.js";
import { KinematicsEngine, FourVelocity, FourMomentum } from "../../constitutional/kinematics/index.js";
import { certifyTensor, AUTHORITIES } from "../../constitutional/governance/index.js";
import { computeErrorBound, residualCheck, withinTolerance } from "../../constitutional/governance/MathValidity.js";
import { Projector4DTo3D, Camera4D, ProjectionPolicy, PROJECTION_MODES } from "../../constitutional/projection/index.js";
import { createInitializedRuntime } from "../../constitutional/runtime/index.js";

describe("Error Bounds (gap 3)", () => {
  describe("computeErrorBound", () => {
    it("computes max residual across checks with sources", () => {
      const checks = [
        { name: "a", residual: 1e-12 },
        { name: "b", diff: 2e-10 },
        { name: "c", error: 5e-13 },
      ];
      const bound = computeErrorBound(checks);
      assert.equal(bound.max, 2e-10);
      assert.equal(bound.sources.length, 3);
      assert.equal(bound.sources[0].check, "a");
    });

    it("ignores non-finite and non-numeric values", () => {
      const bound = computeErrorBound([{ name: "x", residual: Infinity }, { name: "y" }, null]);
      assert.equal(bound.max, 0);
      assert.equal(bound.sources.length, 0);
    });

    it("residualCheck passes only under tolerance", () => {
      assert.equal(residualCheck("mass_shell", 1e-14, 1e-9).passed, true);
      assert.equal(residualCheck("mass_shell", 1e-3, 1e-9).passed, false);
    });

    it("withinTolerance compares the bound to a threshold", () => {
      assert.equal(withinTolerance({ max: 1e-11, sources: [] }, 1e-9), true);
      assert.equal(withinTolerance({ max: 1e-6, sources: [] }, 1e-9), false);
    });
  });

  describe("CertifiedTensor error bounds", () => {
    it("certify() attaches errorBound to validation", () => {
      const cert = certifyTensor(
        new FourVector(1, 0, 0, 0, MetricTensor.minkowski()),
        AUTHORITIES.TENSOR_ENGINE,
        [
          { name: "norm", passed: true, residual: 1e-15 },
          { name: "finite", passed: true },
        ]
      );
      assert.equal(cert.validation.errorBound.max, 1e-15);
      assert.equal(cert.validation.errorBound.sources[0].check, "norm");
      assert.equal(cert.isWithinTolerance(1e-9), true);
      assert.equal(cert.isWithinTolerance(1e-16), false);
    });

    it("toProvenanceRecord carries errorBound", () => {
      const cert = certifyTensor(
        new FourVector(1, 0, 0, 0, MetricTensor.minkowski()),
        AUTHORITIES.TENSOR_ENGINE,
        [{ name: "norm", passed: true, residual: 1e-15 }]
      );
      const record = cert.toProvenanceRecord();
      assert.equal(record.errorBound.max, 1e-15);
      assert.equal(record.validationPassed, true);
    });
  });

  describe("kinematics certs carry residuals", () => {
    const metric = MetricTensor.minkowski();
    const engine = new KinematicsEngine(metric);

    it("four-velocity cert has mass-shell residual in error bound", () => {
      const u = new FourVelocity(new FourVector(1, 0, 0, 0, metric), metric).normalize(1);
      const cert = engine.certifyFourVelocity(u, 1);
      assert.equal(cert.isValid(), true);
      assert.ok(cert.errorBound().max < 1e-9, `mass-shell residual too large: ${cert.errorBound().max}`);
      assert.ok(cert.isWithinTolerance(1e-9));
    });

    it("four-momentum cert has invariant residual in error bound", () => {
      const u = new FourVelocity(new FourVector(1, 0, 0, 0, metric), metric).normalize(1);
      const p = FourMomentum.fromVelocity(1, u);
      const cert = engine.certifyFourMomentum(p, 1);
      assert.equal(cert.isValid(), true);
      assert.ok(cert.errorBound().max < 1e-9, `invariant residual too large: ${cert.errorBound().max}`);
    });
  });

  describe("projection error bounds", () => {
    const projector = new Projector4DTo3D();
    const camera = new Camera4D({ position: new FourVector(0, 0, 0, 0, MetricTensor.minkowski()) });
    const policy = new ProjectionPolicy(PROJECTION_MODES.PERSPECTIVE, { d: 2 });

    it("perspective projection roundtrips within tolerance", () => {
      const point = new FourVector(1, 0, 0, 0.5, MetricTensor.minkowski());
      const result = projector.project(point, policy, camera);
      const bound = projector.computeErrorBound(result);
      assert.equal(bound.finite, true);
      assert.ok(bound.roundtripResidual < 1e-9, `roundtrip residual too large: ${bound.roundtripResidual}`);
      assert.ok(Number.isFinite(bound.conditionEstimate));
      assert.equal(bound.withinTolerance, true);
    });

    it("degenerate perspective (w=d) is marked non-finite", () => {
      const point = new FourVector(1, 0, 0, 2, MetricTensor.minkowski());
      const result = projector.project(point, policy, camera);
      assert.equal(result.degenerate, true);
      const bound = projector.computeErrorBound(result);
      assert.equal(bound.finite, false);
      assert.equal(bound.withinTolerance, false);
    });

    it("orthographic projection has zero residual", () => {
      const orthoPolicy = new ProjectionPolicy(PROJECTION_MODES.ORTHOGRAPHIC, {});
      const point = new FourVector(3, 4, 5, 1, MetricTensor.minkowski());
      const result = projector.project(point, orthoPolicy, camera);
      const bound = projector.computeErrorBound(result);
      assert.equal(bound.roundtripResidual, 0);
      assert.equal(bound.finite, true);
    });
  });

  describe("runtime carries error bounds through provenance", () => {
    it("100-step run records errorBound on every frame's certs", async () => {
      const metric = MetricTensor.minkowski();
      const runtime = await createInitializedRuntime({
        metricSignature: [-1, 1, 1, 1],
        c: 1,
        dtau: 0.01,
        d4: 4,
        camera: Camera4D.atOrigin(),
        projectionPolicy: ProjectionPolicy.perspective(4),
        position: new FourVector(0, 1, 0, 0, metric),
        velocity: new FourVector(1, 0, 0, 0, metric),
        mass: 1.0,
        governance: { strictMode: false, requireReplay: false, requireAudit: false },
      });
      for (let i = 0; i < 100; i++) await runtime.step();

      const chain = runtime.getProvenanceChain();
      assert.ok(chain.length >= 100);

      for (const record of chain) {
        assert.ok(record.positionCert.errorBound.max < 1e-6, `step ${record.step} geodesic residual too large`);
        assert.ok(record.velocityCert.errorBound.max < 1e-9, `step ${record.step} velocity residual too large`);
        assert.equal(record.projection.errorBound.finite, true);
        assert.equal(record.projection.errorBound.withinTolerance, true);
      }
    });
  });
});
