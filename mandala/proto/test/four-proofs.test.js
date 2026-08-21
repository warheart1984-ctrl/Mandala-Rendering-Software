import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { DEFAULT_CONSTITUTION, INVARIANT_ID } from "../constitution.mjs";
import {
  createInitialCertifiedState,
  freezeCertifiedSnapshot,
  loadSliceInto,
  rehash,
  sliceHashFromCache,
  scalarMass,
} from "../certified-state.mjs";
import { computeGradientInto } from "../cpu-reference.mjs";
import {
  commitProposal,
  createChamber,
  evolveTo,
  proposeIllegalMassInjection,
  stepCertified,
} from "../simulation-chamber.mjs";
import { createImage, projectCertified, projectFrozen } from "../mandala-project.mjs";
import { observerAt } from "../movie-lane.mjs";
import { probeAndCompareGradient, GPU_NUMERIC_CONTRACT } from "../backend/gpu-contract.mjs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { mkdirSync } from "node:fs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = join(__dirname, "../../../output/mandala-proto");
const T_END = 63;
const T_VIEW = 40;

function evolve(seed) {
  const state = createInitialCertifiedState({ seed });
  const chamber = createChamber();
  const hashes = [state.hash];
  const r = evolveTo(chamber, state, T_END);
  assert.equal(r.length, T_END);
  assert.ok(r.every((x) => x.committed), "all lawful steps must commit");
  for (let t = 0; t < state.temporal.filled; t++) hashes[t] = sliceHashFromCache(state, t);
  return { state, hashes, chamber };
}

describe("mandala proto — four architectural proofs", () => {
  it("1. same initial state + same constitution → same certified evolution", () => {
    const a = evolve(7);
    const b = evolve(7);
    assert.equal(a.state.constitutionId, DEFAULT_CONSTITUTION.id);
    assert.equal(a.state.hash, b.state.hash);
    assert.equal(a.hashes[0], b.hashes[0]);
    assert.equal(a.hashes[T_VIEW], b.hashes[T_VIEW]);
    assert.equal(a.hashes[T_END], b.hashes[T_END]);
    assert.equal(a.state.temporal.filled, 64);
    const c = evolve(11);
    assert.notEqual(c.state.hash, a.state.hash, "different seed must diverge");
  });

  it("2. CPU and GPU agree within numeric contract (or blocked-with-evidence)", () => {
    const { state } = evolve(7);
    mkdirSync(OUT, { recursive: true });
    const gpu = probeAndCompareGradient({
      scalar: state.scalar,
      shape: state.shape,
      outDir: OUT,
    });
    if (gpu.blockedWithEvidence || !gpu.gpuLive) {
      assert.ok(gpu.blockedWithEvidence || gpu.status === "declared");
      assert.equal(gpu.passed, false);
      return;
    }
    assert.equal(gpu.status, "partial");
    assert.ok(gpu.passed);
    assert.ok(gpu.maxAbsError <= GPU_NUMERIC_CONTRACT.maxAbsError);
  });

  it("3. arbitrary temporal viewpoints reconstruct without re-sim from 0", () => {
    const full = evolve(7);
    const hashFromCache = sliceHashFromCache(full.state, T_VIEW);
    const liveT = full.state.t;
    assert.equal(liveT, T_END);

    loadSliceInto(full.state, T_VIEW);
    assert.equal(full.state.t, T_VIEW);
    assert.equal(full.state.hash, hashFromCache);
    const view = observerAt(full.state, T_VIEW);
    assert.equal(view.reSimulatedFromZero, false);
    assert.equal(view.ownsTime, false);

    const stopped = createInitialCertifiedState({ seed: 7 });
    evolveTo(createChamber(), stopped, T_VIEW);
    assert.equal(stopped.hash, hashFromCache);

    loadSliceInto(full.state, T_END);
    assert.equal(full.state.t, T_END);
  });

  it("4. rendering cannot mutate simulation truth", () => {
    const { state } = evolve(7);
    const hashBefore = state.hash;
    const massBefore = scalarMass(state.scalar);
    const image = createImage(64, 64);
    const { liveHash } = projectCertified(state, image);
    assert.equal(liveHash, hashBefore);
    assert.equal(state.hash, hashBefore);
    rehash(state);
    assert.equal(state.hash, hashBefore);
    assert.equal(scalarMass(state.scalar), massBefore);

    const snap = freezeCertifiedSnapshot(state);
    snap.scalar[0] += 99;
    snap.defect.x = 0;
    projectFrozen(snap, image);
    rehash(state);
    assert.equal(state.hash, hashBefore);
  });
});

describe("mandala proto — gate + honesty", () => {
  it("one invariant rejects an illegal mass-injection proposal without mutating certified state", () => {
    const state = createInitialCertifiedState({ seed: 3 });
    const hash = state.hash;
    const proposal = proposeIllegalMassInjection(state, DEFAULT_CONSTITUTION);
    const result = commitProposal(state, proposal, DEFAULT_CONSTITUTION);
    assert.equal(result.committed, false);
    assert.equal(result.decision.rejected, true);
    assert.ok(result.decision.reasons.some((r) => r.code === INVARIANT_ID));
    assert.equal(state.hash, hash);
    assert.equal(state.t, 0);
  });

  it("lawful chamber step is accepted and mass stays within bound", () => {
    const state = createInitialCertifiedState({ seed: 3 });
    const mass0 = scalarMass(state.scalar);
    const r = stepCertified(createChamber(), state);
    assert.equal(r.committed, true);
    assert.equal(state.t, 1);
    assert.ok(Math.abs(scalarMass(state.scalar) - mass0) <= DEFAULT_CONSTITUTION.invariant.numericalErrorBound);
  });

  it("Mandala refuses to project an unfrozen live state", () => {
    const state = createInitialCertifiedState({ seed: 1 });
    const image = createImage(8, 8);
    assert.throws(() => projectFrozen(state, image), /frozen/);
  });

  it("CPU gradient is deterministic on a frozen slice", () => {
    const state = createInitialCertifiedState({ seed: 5 });
    const a = new Float32Array(state.vector.length);
    const b = new Float32Array(state.vector.length);
    computeGradientInto(state.scalar, a);
    computeGradientInto(state.scalar, b);
    for (let i = 0; i < a.length; i++) assert.equal(a[i], b[i]);
  });
});
