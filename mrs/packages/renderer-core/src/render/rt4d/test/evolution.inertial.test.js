/**
 * Phase-2A evolution law acceptance tests (AC-E1..E8).
 * Run: node --test src/render/rt4d/test/evolution.inertial.test.js
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  bindInertialMotionLaw,
  createInertialMotionLawSpec,
  computeLawHash,
  evolveFixedSteps,
  verifyEvolutionReplay,
  envelopeFromEvolution,
  requireEvolutionLaw,
} from "../evolution/index.js";
import { validateTemporalEvidenceEnvelope } from "../temporal/index.js";

const INITIAL = {
  t: 0,
  position: { x: 0, y: 0, z: 0 },
  velocity: { x: 1, y: 0, z: 0 },
};

test("AC-E1 same law + initial + dt → same trajectory root", () => {
  const law = bindInertialMotionLaw(createInertialMotionLawSpec({ fixedDelta: 1 / 60 }));
  const a = evolveFixedSteps({ law, initialState: INITIAL, stepCount: 600 });
  const b = evolveFixedSteps({ law, initialState: INITIAL, stepCount: 600 });
  assert.equal(a.ok, true);
  assert.equal(b.ok, true);
  assert.equal(a.trajectoryRoot, b.trajectoryRoot);
  assert.equal(a.initialStateHash, b.initialStateHash);
  assert.equal(a.finalStateHash, b.finalStateHash);
});

test("AC-E2 modified law → different lawHash and trajectory root", () => {
  const lawA = bindInertialMotionLaw(createInertialMotionLawSpec({ fixedDelta: 1 / 60 }));
  const lawB = bindInertialMotionLaw(createInertialMotionLawSpec({ fixedDelta: 1 / 30 }));
  assert.notEqual(lawA.lawHash, lawB.lawHash);
  assert.notEqual(computeLawHash(lawA), computeLawHash(lawB));
  const a = evolveFixedSteps({ law: lawA, initialState: INITIAL, stepCount: 60 });
  const b = evolveFixedSteps({ law: lawB, initialState: INITIAL, stepCount: 60 });
  assert.equal(a.ok && b.ok, true);
  assert.notEqual(a.trajectoryRoot, b.trajectoryRoot);
});

test("AC-E3 modified initial state → different initialStateHash", () => {
  const law = bindInertialMotionLaw(createInertialMotionLawSpec());
  const a = evolveFixedSteps({ law, initialState: INITIAL, stepCount: 10 });
  const other = {
    ...INITIAL,
    position: { x: 1, y: 0, z: 0 },
  };
  const b = evolveFixedSteps({ law, initialState: other, stepCount: 10 });
  assert.equal(a.ok && b.ok, true);
  assert.notEqual(a.initialStateHash, b.initialStateHash);
});

test("AC-E4 replay reproduces every state hash", () => {
  const law = bindInertialMotionLaw(createInertialMotionLawSpec());
  const prior = evolveFixedSteps({ law, initialState: INITIAL, stepCount: 120 });
  assert.equal(prior.ok, true);
  const replay = verifyEvolutionReplay(prior);
  assert.equal(replay.ok, true);
  assert.equal(replay.replayStatus, "verified");
});

test("AC-E5 missing law fails closed", () => {
  const missing = requireEvolutionLaw(null);
  assert.equal(missing.ok, false);
  const evolved = evolveFixedSteps({ law: null, initialState: INITIAL, stepCount: 1 });
  assert.equal(evolved.ok, false);
  assert.match(evolved.error, /missing evolution law/);
});

test("AC-E6 non-finite state values are rejected", () => {
  const law = bindInertialMotionLaw(createInertialMotionLawSpec());
  const bad = evolveFixedSteps({
    law,
    initialState: {
      t: 0,
      position: { x: NaN, y: 0, z: 0 },
      velocity: { x: 1, y: 0, z: 0 },
    },
    stepCount: 1,
  });
  assert.equal(bad.ok, false);
  assert.match(bad.error, /finite/);
});

test("AC-E7 evidence envelope binds law, state, trajectory, replay", () => {
  const law = bindInertialMotionLaw(createInertialMotionLawSpec());
  const evo = evolveFixedSteps({ law, initialState: INITIAL, stepCount: 30 });
  assert.equal(evo.ok, true);
  const replay = verifyEvolutionReplay(evo);
  const env = envelopeFromEvolution({
    evolution: evo,
    operationId: "evo-ac-e7",
    sourceTimelineId: "timeline-main",
    resultTimelineId: "timeline-sim-01",
    replayStatus: replay.replayStatus,
  });
  const v = validateTemporalEvidenceEnvelope(env);
  assert.equal(v.ok, true, v.errors.join("; "));
  assert.equal(env.evolutionLaw.lawId, "inertial-motion-v1");
  assert.equal(env.evolutionLaw.classification, "toy_model");
  assert.equal(env.evolutionLaw.lawHash, evo.law.lawHash);
  assert.equal(env.initialStateHash, evo.initialStateHash);
  assert.equal(env.finalStateHash, evo.finalStateHash);
  assert.equal(env.trajectoryRoot, evo.trajectoryRoot);
  assert.equal(env.stepCount, 30);
  assert.equal(env.replayStatus, "verified");
  assert.equal(env.simulationLawHash, evo.law.lawHash);
  assert.equal(env.evidenceStatus, "substrate_verified");
});

test("AC-E8 claims remain toy_model / substrate_verified", () => {
  const law = bindInertialMotionLaw(createInertialMotionLawSpec());
  assert.equal(law.classification, "toy_model");
  assert.equal(law.status, "toy_model");
  const evo = evolveFixedSteps({ law, initialState: INITIAL, stepCount: 5 });
  assert.equal(evo.classification, "toy_model");
  const env = envelopeFromEvolution({
    evolution: evo,
    operationId: "evo-ac-e8",
    sourceTimelineId: "t0",
    resultTimelineId: "t1",
    replayStatus: "verified",
  });
  assert.equal(env.evolutionLaw.classification, "toy_model");
  assert.equal(env.evidenceStatus, "substrate_verified");
});

test("lawHash mismatch fails closed", () => {
  const law = bindInertialMotionLaw(createInertialMotionLawSpec());
  const tampered = { ...law, lawHash: "0".repeat(64) };
  const r = evolveFixedSteps({ law: tampered, initialState: INITIAL, stepCount: 1 });
  assert.equal(r.ok, false);
  assert.match(r.error, /lawHash mismatch/);
});
