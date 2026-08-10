import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { MetricTensor } from "../../constitutional/arena/MetricTensor.js";
import { ChristoffelSymbols } from "../../constitutional/arena/Christoffel.js";
import { CurvatureTensors } from "../../constitutional/arena/Curvature.js";
import { TensorEngine, TensorFactory, FourVector, TENSOR_RANKS, COORDINATE_DOMAINS, createTensorFactory } from "../../constitutional/tensor/index.js";
import { KinematicsEngine, FourVelocity, FourMomentum, FourAcceleration } from "../../constitutional/kinematics/index.js";
import { ConstitutionalWrapper, PhysicsConformanceGate, AUTHORITIES, CERTIFICATION_STATUSES, CertifiedTensor, certifyTensor } from "../../constitutional/governance/index.js";
import { Projector4DTo3D, Camera4D, ProjectionPolicy, CertifiedProjection, PROJECTION_MODES } from "../../constitutional/projection/index.js";
import { ConstitutionalRuntime, createInitializedRuntime } from "../../constitutional/runtime/index.js";

describe("Constitutional Arena", () => {
  it("creates Minkowski metric with correct signature", () => {
    const metric = new MetricTensor([-1, 1, 1, 1]);
    assert.deepEqual(metric.signature, [-1, 1, 1, 1]);
    assert.equal(metric.determinant, -1);
  });

  it("computes interval correctly", () => {
    const metric = MetricTensor.minkowski();
    const dx = { x: 1, y: 0, z: 0, w: 1 };
    const ds2 = metric.intervalVec4(dx);
    assert.equal(ds2, 0); // null interval
  });

  it("raises and lowers indices", () => {
    const metric = MetricTensor.minkowski();
    const v = new FourVector(1, 2, 3, 4, metric);
    const raised = metric.raise(v);
    const lowered = metric.lower(raised);
    assert.equal(Math.abs(lowered.x - v.x) < 1e-10, true);
    assert.equal(Math.abs(lowered.y - v.y) < 1e-10, true);
    assert.equal(Math.abs(lowered.z - v.z) < 1e-10, true);
    assert.equal(Math.abs(lowered.w - v.w) < 1e-10, true);
  });

  it("certifies intervals", () => {
    const metric = MetricTensor.minkowski();
    // Metric signature [-1, 1, 1, 1] applies to [x, y, z, w]
    // {x: 1, y: 0, z: 0, w: 0} -> ds² = -1 (timelike)
    const dx1 = { x: 1, y: 0, z: 0, w: 0 };
    const cert1 = metric.certifyInterval(dx1);
    assert.equal(cert1.certified, true);
    assert.equal(cert1.causalType, "timelike");
    
    // {x: 0, y: 0, z: 0, w: 1} -> ds² = 1 (spacelike)
    const dx2 = { x: 0, y: 0, z: 0, w: 1 };
    const cert2 = metric.certifyInterval(dx2);
    assert.equal(cert2.certified, true);
    assert.equal(cert2.causalType, "spacelike");
    
    // {x: 1, y: 0, z: 0, w: 1} -> ds² = -1 + 1 = 0 (null)
    const dx3 = { x: 1, y: 0, z: 0, w: 1 };
    const cert3 = metric.certifyInterval(dx3);
    assert.equal(cert3.certified, true);
    assert.equal(cert3.causalType, "null");
  });

  it("Christoffel symbols are zero for flat metric", () => {
    const metric = MetricTensor.minkowski();
    const christoffel = new ChristoffelSymbols(metric);
    const nonZero = christoffel.gamma.filter(g => Math.abs(g) > 1e-15).length;
    assert.equal(nonZero, 0);
  });

  it("Curvature tensors are zero for flat metric", () => {
    const metric = MetricTensor.minkowski();
    const curvature = new CurvatureTensors(metric);
    assert.equal(curvature.getRicciScalar(), 0);
    for (let i = 0; i < 16; i++) {
      assert.equal(Math.abs(curvature.ricci[i]), 0);
      assert.equal(Math.abs(curvature.einstein[i]), 0);
    }
  });
});

describe("Constitutional Tensor Engine", () => {
  it("creates tensors of various ranks", () => {
    const metric = MetricTensor.minkowski();
    const factory = createTensorFactory(metric);

    const s = factory.scalar(42);
    assert.equal(s.rank, TENSOR_RANKS.SCALAR);
    assert.equal(s.value, 42);

    const v = factory.vector(1, 2, 3, 4);
    assert.equal(v.rank, TENSOR_RANKS.VECTOR);
    assert.equal(v.toArray().length, 4);

    const r2 = factory.zeroRank2();
    assert.equal(r2.rank, TENSOR_RANKS.RANK2);
    assert.equal(r2.toArray().length, 16);
  });

  it("TensorEngine performs covariant derivative (flat = partial)", () => {
    const metric = MetricTensor.minkowski();
    const christoffel = new ChristoffelSymbols(metric);
    const engine = new TensorEngine(metric, christoffel);

    const v = new FourVector(1, 2, 3, 4, metric);
    const covDeriv = engine.covariantDerivative(v, 0);
    assert.equal(covDeriv.rank, 2);
  });

  it("TensorEngine computes divergence", () => {
    const metric = MetricTensor.minkowski();
    const christoffel = new ChristoffelSymbols(metric);
    const engine = new TensorEngine(metric, christoffel);

    const t = new FourVector(1, 2, 3, 4, metric);
    const r2 = engine.tensorProduct(t, t);
    const div = engine.divergence(r2);
    assert.equal(div.rank, 1);
  });
});

describe("Constitutional Kinematics", () => {
  it("creates normalized 4-velocity", () => {
    const metric = MetricTensor.minkowski();
    const kinematics = new KinematicsEngine(metric, new ChristoffelSymbols(metric));

    const u = kinematics.createFourVelocity(new FourVector(1, 0.5, 0.5, 0.5, metric)).normalize(1);
    assert.equal(u.isNormalized(1), true);
    assert.equal(Math.abs(metric.norm2(u) + 1) < 1e-10, true);
  });

  it("creates 4-momentum from velocity", () => {
    const metric = MetricTensor.minkowski();
    const kinematics = new KinematicsEngine(metric, new ChristoffelSymbols(metric));

    const u = kinematics.createFourVelocity(new FourVector(1, 0, 0, 0, metric)).normalize(1);
    const p = kinematics.momentumFromVelocity(2.0, u);

    const inv = p.invariantCheck();
    assert.equal(Math.abs(inv.diff) < 1e-10, true);
    assert.equal(p.mass, 2.0);
  });

  it("geodesic solver steps correctly in flat space", () => {
    const metric = MetricTensor.minkowski();
    const christoffel = new ChristoffelSymbols(metric);
    const kinematics = new KinematicsEngine(metric, christoffel);

    const x = new FourVector(0, 0, 0, 0, metric);
    const u = kinematics.createFourVelocity(new FourVector(1, 0, 0, 0, metric)).normalize(1);

    const result = kinematics.geodesicStep(x, u, 0.1);
    assert.ok(result.position);
    assert.ok(result.velocity);
    assert.ok(result.acceleration);
  });

  it("certifies 4-velocity and 4-momentum", () => {
    const metric = MetricTensor.minkowski();
    const kinematics = new KinematicsEngine(metric, new ChristoffelSymbols(metric));

    const u = kinematics.createFourVelocity(new FourVector(1, 0.5, 0, 0, metric)).normalize(1);
    const velCert = kinematics.certifyFourVelocity(u, 1);
    assert.equal(velCert.certificationStatus, CERTIFICATION_STATUSES.VALIDATED);

    const p = kinematics.momentumFromVelocity(1.0, u);
    const momCert = kinematics.certifyFourMomentum(p, 1.0);
    assert.equal(momCert.certificationStatus, CERTIFICATION_STATUSES.VALIDATED);
  });
});

describe("Constitutional Governance", () => {
  it("certifies tensors with governance metadata", () => {
    const metric = MetricTensor.minkowski();
    const v = new FourVector(1, 2, 3, 4, metric);

    const certified = certifyTensor(v, AUTHORITIES.KINEMATICS_ENGINE, 
      [{ name: "test_check", passed: true }],
      [{ type: "test_evidence" }]);

    assert.ok(certified.certificationId);
    assert.equal(certified.authority, AUTHORITIES.KINEMATICS_ENGINE);
    assert.equal(certified.validation.passed, true);
    assert.equal(certified.certificationStatus, CERTIFICATION_STATUSES.VALIDATED);
    assert.ok(certified.verification.hash);
  });

  it("ConstitutionalWrapper validates operations", async () => {
    const wrapper = new ConstitutionalWrapper({ strictMode: false });
    const result = await wrapper.wrap({
      id: "test-op",
      type: "test",
      authority: AUTHORITIES.TENSOR_ENGINE,
      input: { value: 42 },
      validationRules: [
        { name: "positive", check: (v) => v.value > 0 ? {} : { throw: new Error("not positive") } },
      ],
    });
    assert.equal(result.success, true);
    assert.ok(result.governanceRecord);
  });

  it("PhysicsConformanceGate runs 16 checks", async () => {
    const metric = MetricTensor.minkowski();
    const christoffel = new ChristoffelSymbols(metric);
    const kinematics = new KinematicsEngine(metric, christoffel);
    const u = kinematics.createFourVelocity(new FourVector(1, 0, 0, 0, metric)).normalize(1);
    const p = kinematics.momentumFromVelocity(1.0, u);

    const gate = new PhysicsConformanceGate({ c: 1, strictMode: false });
    const state = {
      metric,
      christoffel,
      fourVelocity: u,
      fourMomentum: p,
      mass: 1.0,
      provenance: [{ record: "test" }],
      replayToken: "test",
      seed: 42,
    };

    const result = await gate.runAll(state);
    assert.equal(result.total, 16);
    assert.ok(result.passed >= 14); // Most should pass in flat space
  });
});

describe("Constitutional Projection", () => {
  it("projects 4D to 3D with perspective", () => {
    const metric = MetricTensor.minkowski();
    const projector = new Projector4DTo3D(metric);
    const camera = Camera4D.atOrigin();
    const policy = ProjectionPolicy.perspective(4);

    const point = new FourVector(1, 2, 3, 1, metric);
    const result = projector.project(point, policy, camera);

    assert.ok(Number.isFinite(result.x));
    assert.ok(Number.isFinite(result.y));
    assert.ok(Number.isFinite(result.z));
    assert.equal(result.mode, PROJECTION_MODES.PERSPECTIVE);
  });

  it("projects 4D to 3D with slice", () => {
    const metric = MetricTensor.minkowski();
    const projector = new Projector4DTo3D(metric);
    const camera = Camera4D.atOrigin();
    const policy = ProjectionPolicy.slice(1.0, 0.1);

    const point = new FourVector(1, 2, 3, 1.0, metric);
    const result = projector.project(point, policy, camera);
    assert.equal(result.rejected === false, true);

    const point2 = new FourVector(1, 2, 3, 2.0, metric);
    const result2 = projector.project(point2, policy, camera);
    assert.equal(result2.rejected === true, true);
  });

  it("projects 4D to 3D with stereographic", () => {
    const metric = MetricTensor.minkowski();
    const projector = new Projector4DTo3D(metric);
    const camera = Camera4D.atOrigin();
    const policy = ProjectionPolicy.stereographic(4);

    const point = new FourVector(1, 2, 3, 1, metric);
    const result = projector.project(point, policy, camera);
    assert.ok(Number.isFinite(result.x));
    assert.equal(result.mode, PROJECTION_MODES.STEREOGRAPHIC);
  });

  it("creates certified projection with provenance", () => {
    const metric = MetricTensor.minkowski();
    const projector = new Projector4DTo3D(metric);
    const camera = Camera4D.atOrigin();
    const policy = ProjectionPolicy.perspective(4);

    const point = new FourVector(1, 2, 3, 1, metric);
    const result = projector.project(point, policy, camera);

    const certified = CertifiedProjection.create(result, {
      stateId: "TEST-001",
      cameraId: camera.cameraId,
      metricId: metric.hash(),
      projectionMode: policy.mode,
      projectionParameters: policy.getParameters(),
      intentId: "test-projection",
      worldId: "test-world",
      timelineId: "test-timeline",
    });

    assert.ok(certified.projectionId);
    assert.ok(certified.projectionVerification);
    const prov = certified.toProvenanceRecord();
    assert.equal(prov.projectionMode, PROJECTION_MODES.PERSPECTIVE);
    assert.equal(prov.cameraId, camera.cameraId);
    assert.equal(prov.metricId, metric.hash());
  });
});

describe("Constitutional Runtime", () => {
  it("initializes and runs steps", async () => {
    const runtime = await createInitializedRuntime({
      metricSignature: [-1, 1, 1, 1],
      c: 1,
      dtau: 0.01,
      d4: 4,
      camera: Camera4D.atOrigin(),
      projectionPolicy: ProjectionPolicy.perspective(4),
      position: new FourVector(0, 1, 0, 0, MetricTensor.minkowski()),
      velocity: new FourVelocity(new FourVector(1, 0, 0, 0, MetricTensor.minkowski()), MetricTensor.minkowski()).normalize(1),
      mass: 1.0,
      governance: { strictMode: false, requireReplay: false, requireAudit: false },
    });

    const result = await runtime.step();
    assert.equal(result.step, 0);
    assert.ok(result.position);
    assert.ok(result.velocity);
    assert.ok(result.projection);
    assert.ok(result.conformance);

    const state = runtime.getState();
    assert.equal(state.stepCount, 1);
    assert.equal(state.certifications.length, 3);
  });

  it("maintains provenance chain", async () => {
    const runtime = await createInitializedRuntime({
      metricSignature: [-1, 1, 1, 1],
      c: 1,
      dtau: 0.01,
      d4: 4,
      camera: Camera4D.atOrigin(),
      projectionPolicy: ProjectionPolicy.perspective(4),
      position: new FourVector(0, 0, 0, 0, MetricTensor.minkowski()),
      velocity: new FourVelocity(new FourVector(1, 0, 0, 0, MetricTensor.minkowski()), MetricTensor.minkowski()).normalize(1),
      mass: 1.0,
      governance: { strictMode: false, requireReplay: false, requireAudit: false },
    });

    await runtime.run(5);
    const chain = runtime.getProvenanceChain();
    assert.equal(chain.length, 5);
    assert.ok(chain[0].replayToken);
    assert.ok(chain[4].replayToken);
  });
});