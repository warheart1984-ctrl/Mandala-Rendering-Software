#!/usr/bin/env node
/**
 * Constitutional 4D Physics Runtime Demo
 * 
 * Demonstrates the full pipeline:
 * 4D Physics → Certification → Projection → 3D Render with Provenance
 */

import { MetricTensor } from "../src/render/rt4d/constitutional/arena/MetricTensor.js";
import { ChristoffelSymbols } from "../src/render/rt4d/constitutional/arena/Christoffel.js";
import { CurvatureTensors } from "../src/render/rt4d/constitutional/arena/Curvature.js";
import { TensorEngine, TensorFactory, FourVector, createTensorFactory } from "../src/render/rt4d/constitutional/tensor/index.js";
import { KinematicsEngine, FourVelocity, FourMomentum } from "../src/render/rt4d/constitutional/kinematics/index.js";
import { ConstitutionalWrapper, PhysicsConformanceGate, AUTHORITIES, certifyTensor, CertifiedTensor } from "../src/render/rt4d/constitutional/governance/index.js";
import { Projector4DTo3D, Camera4D, ProjectionPolicy, CertifiedProjection, PROJECTION_MODES } from "../src/render/rt4d/constitutional/projection/index.js";
import { ConstitutionalRuntime, createInitializedRuntime } from "../src/render/rt4d/constitutional/runtime/index.js";

const C = 1;
const DTAU = 0.01;
const STEPS = 100;

console.log("=".repeat(70));
console.log("CIEMS Constitutional 4D Physics Runtime Demo");
console.log("=".repeat(70));

async function runDemo() {
  console.log("\n[1/7] ARENA: Creating Minkowski Metric...");
  const metric = new MetricTensor([-1, 1, 1, 1]);
  console.log(`    Metric: ${JSON.stringify(metric.toJSON())}`);
  console.log(`    Signature: [${metric.signature}]`);
  console.log(`    Hash: ${metric.hash()}`);

  const christoffel = new ChristoffelSymbols(metric);
  console.log(`    Christoffel non-zero: ${christoffel.gamma.filter(g => Math.abs(g) > 1e-15).length}`);

  const curvature = new CurvatureTensors(metric);
  console.log(`    Ricci scalar: ${curvature.getRicciScalar()}`);
  console.log(`    Curvature: ${JSON.stringify(curvature.toJSON())}`);

  console.log("\n[2/7] TENSOR ENGINE: Creating tensor factory...");
  const tensorEngine = new TensorEngine(metric, christoffel);
  const factory = createTensorFactory(metric);

  const position4D = factory.position(0, 1, 2, 3);
  console.log(`    Position: [${position4D.toArray()}]`);

  const velocity4D = factory.vector(0.9, 0.1, 0.2, 0.5);
  console.log(`    Velocity: [${velocity4D.toArray()}]`);

  const emTensor = factory.emTensor(new FourVector(0, 0, 0, 0, metric));
  console.log(`    EM Tensor (from zero potential): OK`);

  const stressEnergy = factory.stressEnergy(1.0, 0.1, new FourVelocity(velocity4D, metric));
  console.log(`    Stress-Energy (perfect fluid): OK`);

  console.log("\n[3/7] KINEMATICS: Creating kinematics engine...");
  const kinematics = new KinematicsEngine(metric, christoffel, C);

  const u = kinematics.createFourVelocity(velocity4D).normalize(C);
  console.log(`    4-Velocity normalized: ${u.isNormalized(C)}`);
  console.log(`    u·u = ${metric.norm2(u)} (expected: ${-C*C})`);

  const p = kinematics.momentumFromVelocity(2.0, u);
  const invCheck = p.invariantCheck();
  console.log(`    4-Momentum invariant: p·p = ${invCheck.norm2} (expected: ${invCheck.expected})`);
  console.log(`    Diff: ${invCheck.diff}`);

  const a = kinematics.accelerationFromGeodesic(u);
  console.log(`    4-Acceleration (geodesic): [${a.toArray()}]`);

  console.log("\n[4/7] GOVERNANCE: Certifying physical quantities...");
  const posCert = certifyTensor(position4D, AUTHORITIES.KINEMATICS_ENGINE, 
    [{ name: "metric_compatibility", passed: true }],
    [{ type: "initial_position" }]);
  console.log(`    Position certified: ${posCert.certificationId} (${posCert.certificationStatus})`);

  const velCert = kinematics.certifyFourVelocity(u, C);
  console.log(`    Velocity certified: ${velCert.certificationId} (${velCert.certificationStatus})`);

  const momCert = kinematics.certifyFourMomentum(p, 2.0);
  console.log(`    Momentum certified: ${momCert.certificationId} (${momCert.certificationStatus})`);

  const wrapper = new ConstitutionalWrapper({ strictMode: false });
  const govResult = await wrapper.wrap({
    id: "demo-kinematics",
    type: "kinematics_step",
    authority: AUTHORITIES.KINEMATICS_ENGINE,
    input: { position: position4D.toArray(), velocity: u.toArray() },
    validationRules: [
      { name: "timelike_velocity", check: (v) => metric.isTimelike(v) ? {} : { throw: new Error("Not timelike") } },
      { name: "normalized", check: (v) => Math.abs(metric.norm2(v) + C*C) < 1e-10 ? {} : { throw: new Error("Not normalized") } },
    ],
  });
  console.log(`    Governance wrapper: ${govResult.success ? "PASS" : "FAIL"}`);

  console.log("\n[5/7] PHYSICS CONFORMANCE: Running 16-check physics gate...");
  const physicsGate = new PhysicsConformanceGate({ c: C, strictMode: false });
  const physicsState = {
    metric,
    christoffel,
    fourVelocity: u,
    fourMomentum: p,
    mass: 2.0,
    provenance: [{ record: "demo" }],
    replayToken: "demo-token",
    seed: 42,
  };
  const conformance = await physicsGate.runAll(physicsState);
  console.log(`    Physics Conformance: ${conformance.passed}/${conformance.total} checks passed`);
  console.log(`    Success: ${conformance.success}`);

  console.log("\n[6/7] PROJECTION: 4D → 3D with certified mapping...");
  const camera = Camera4D.atOrigin();
  const policy = ProjectionPolicy.perspective(4);
  console.log(`    Camera: ${camera.cameraId}`);
  console.log(`    Policy: ${policy.mode} (d=${policy.parameters.d})`);

  const projector = new Projector4DTo3D(metric);
  const projResult = projector.project(position4D, policy, camera);
  console.log(`    Projected 3D: (${projResult.x.toFixed(4)}, ${projResult.y.toFixed(4)}, ${projResult.z.toFixed(4)})`);

  const certifiedProj = CertifiedProjection.create(projResult, {
    stateId: "DEMO-STATE-001",
    cameraId: camera.cameraId,
    metricId: metric.hash(),
    projectionMode: policy.mode,
    projectionParameters: policy.getParameters(),
    sourceCertificate: posCert,
    intentId: "demo-projection",
    worldId: "demo-world",
    timelineId: "demo-timeline",
  });
  certifiedProj.setVerification(CertifiedTensor._hashTensor({ components: [projResult.x, projResult.y, projResult.z, 0], rank: 1 }));
  console.log(`    Certified Projection: ${certifiedProj.projectionId}`);
  console.log(`    Provenance: ${JSON.stringify(certifiedProj.toProvenanceRecord(), null, 2).slice(0, 200)}...`);

  console.log("\n[7/7] RUNTIME: Full constitutional 7-layer loop...");
  const runtime = await createInitializedRuntime({
    metricSignature: [-1, 1, 1, 1],
    c: C,
    dtau: DTAU,
    d4: 4,
    camera,
    projectionPolicy: policy,
    position: position4D,
    velocity: velocity4D,
    mass: 2.0,
    governance: { strictMode: false, requireReplay: false, requireAudit: false },
  });

  console.log(`    Running ${STEPS} steps...`);
  const results = await runtime.run(STEPS);
  console.log(`    Completed ${results.length} steps`);

  const finalState = runtime.getState();
  console.log(`    Final position: [${finalState.position}]`);
  console.log(`    Final velocity: [${finalState.velocity}]`);
  console.log(`    Certifications generated: ${finalState.certifications.length}`);
  console.log(`    Provenance chain length: ${runtime.getProvenanceChain().length}`);
  console.log(`    Governance records: ${runtime.getGovernanceRecords().length}`);

  console.log("\n" + "=".repeat(70));
  console.log("DEMO COMPLETE: Constitutional 4D Physics → Certified 3D Render");
  console.log("=".repeat(70));

  return {
    metric,
    kinematics,
    governance: govResult,
    conformance,
    projection: certifiedProj,
    runtime: finalState,
  };
}

runDemo().catch(console.error);