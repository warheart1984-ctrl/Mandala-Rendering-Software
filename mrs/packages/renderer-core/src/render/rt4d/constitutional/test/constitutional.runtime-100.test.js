import { test } from "node:test";
import assert from "node:assert/strict";

import { MetricTensor } from "../arena/MetricTensor.js";
import { FourVector } from "../tensor/index.js";
import { FourVelocity } from "../kinematics/index.js";
import { Camera4D, ProjectionPolicy } from "../projection/index.js";
import { CERTIFICATION_STATUSES } from "../governance/index.js";
import {
  ConstitutionalRuntime,
  createInitializedRuntime,
} from "../runtime/index.js";

const STEPS = 100;

function makeConfig() {
  const metric = MetricTensor.minkowski();
  return {
    metricSignature: [-1, 1, 1, 1],
    c: 1,
    dtau: 0.01,
    d4: 4,
    camera: Camera4D.atOrigin(),
    projectionPolicy: ProjectionPolicy.perspective(4),
    position: new FourVector(0, 1, 0, 0, metric),
    velocity: new FourVelocity(new FourVector(1, 0, 0, 0, metric), metric).normalize(1),
    mass: 1.0,
    governance: { strictMode: false, requireReplay: false, requireAudit: false },
  };
}

test("ConstitutionalRuntime runs all 100 steps with full governance", async () => {
  const runtime = await createInitializedRuntime(makeConfig());
  const results = await runtime.run(STEPS);

  assert.equal(results.length, STEPS, "exactly 100 step results");
  assert.equal(runtime.getState().stepCount, STEPS);

  let totalChecks = 0;
  let totalPassed = 0;
  for (let i = 0; i < results.length; i++) {
    const r = results[i];
    assert.equal(r.step, i, `step index sequential at ${i}`);

    assert.ok(r.position, `position present at step ${i}`);
    assert.ok(r.velocity, `velocity present at step ${i}`);
    assert.ok(r.projection, `projection present at step ${i}`);

    assert.ok(
      Number.isFinite(r.projection.x) && Number.isFinite(r.projection.y) && Number.isFinite(r.projection.z),
      `projection finite at step ${i}`
    );

    assert.ok(r.conformance, `conformance present at step ${i}`);
    assert.equal(r.conformance.total, 16, `16 conformance checks at step ${i}`);
    assert.equal(r.conformance.passed, 16, `16/16 conformance passed at step ${i}`);
    totalChecks += r.conformance.total;
    totalPassed += r.conformance.passed;

    assert.equal(r.certifications.length, 3, `3 certifications at step ${i}`);
    for (const cert of r.certifications) {
      assert.equal(cert.certificationStatus, CERTIFICATION_STATUSES.VALIDATED, `certified validated at step ${i}`);
    }

    assert.ok(r.provenance.replayToken, `replay token at step ${i}`);
  }
  assert.equal(totalChecks, STEPS * 16);
  assert.equal(totalPassed, STEPS * 16);
});

test("velocity stays on the mass shell through all 100 steps", async () => {
  const runtime = await createInitializedRuntime(makeConfig());
  await runtime.run(STEPS);
  const state = runtime.getState();
  const metric = state.metric;

  for (let i = 0; i < state.trajectory.length; i++) {
    const [t, x, y, z] = state.trajectory[i].velocity;
    const u = new FourVector(t, x, y, z, metric);
    const norm = metric.norm2(u);
    assert.ok(Math.abs(norm + 1) < 1e-6, `norm2 ~ -1 at step ${i}, got ${norm}`);
  }
});

test("provenance chain length and certifications match 100 steps", async () => {
  const runtime = await createInitializedRuntime(makeConfig());
  await runtime.run(STEPS);

  const chain = runtime.getProvenanceChain();
  assert.equal(chain.length, STEPS);
  for (const record of chain) {
    assert.ok(record.replayToken);
    assert.ok(record.positionCert);
    assert.ok(record.velocityCert);
    assert.ok(record.momentumCert);
    assert.ok(record.projection);
  }

  const certifications = runtime.getCertifications();
  assert.equal(certifications.length, STEPS * 3);

  const governanceRecords = runtime.getGovernanceRecords();
  assert.equal(governanceRecords.length, STEPS);
});

test("replay is deterministic across two identical 100-step runs", async () => {
  const a = await createInitializedRuntime(makeConfig());
  const b = await createInitializedRuntime(makeConfig());
  await a.run(STEPS);
  await b.run(STEPS);

  const chainA = a.getProvenanceChain();
  const chainB = b.getProvenanceChain();
  assert.equal(chainA.length, STEPS);
  assert.equal(chainB.length, STEPS);

  for (let i = 0; i < STEPS; i++) {
    assert.equal(chainA[i].replayToken, chainB[i].replayToken, `replay token matches at step ${i}`);
  }

  const verdict = await a.verifyReplay(chainA, chainB);
  assert.deepEqual(verdict, { match: true, steps: STEPS });
});

test("explicit run(100) behaves identically to default maxSteps of 100", async () => {
  const explicit = new ConstitutionalRuntime({ ...makeConfig(), maxSteps: 100 });
  explicit.initialize();
  const results = await explicit.run(100);
  assert.equal(results.length, 100);
  assert.equal(explicit.getState().stepCount, 100);
});
