/**
 * Gain capture — deterministic pin of the 3-layer combined-gain estimate.
 *
 * PURPOSE: Make every gain number produced by gpu.compute.amd.legacy_efficient
 * replayable (P4 replayable reality). Combined gain is SCHEDULE MATH, not a
 * GPU timer (see docs/governance/cecp/trails/sx-legacy-efficient-3layer-2026-07/
 * 04-reviewer-conformance.md: "Combined gain must not be marketed as measured
 * GPU speedup").
 *
 * CLAIM CAPTURE (corrected 2026-08-10):
 *   Claim: "55.9× GPU speedup on the 4GB card" — MEASURED, not schedule math.
 *   Source: Axiom-X OpenCL benchmark — axiom_x/benchmark/bench_legacy_still.py
 *   (reproduce: npm run sx:axiom-bench). Evidence:
 *     tmp/axiom-x-bench-512/evidence.json — GPU wall 1.224 ms vs CPU 68.44 ms
 *       -> speedupWallCpuOverGpu 55.91×; outputHashMatchGpuVsCpu true; rmse 0.0;
 *       deterministic true (Ellesmere / RX 580, 36 CU, 4 GiB).
 *     tmp/axiom-x-bench-256/evidence.json — 0.522 ms vs 10.124 ms -> 19.41×;
 *       hash match, rmse 0.0.
 *   That measured number is a DIFFERENT surface from this module's schedule-math
 *   combinedGainEstimate:
 *       combinedGainEstimate =
 *         governanceGainDeclared(1.5, hardcoded)
 *         × algoGain(1/usefulFraction)
 *         × max(1, memoryEfficiencyGainEstimate)
 *   Router reproducibility: denseBpf = 4/64 = 0.0625 and sparseBpf =
 *   (4×1.125)/64 = 0.0703125 are constants, so memGain ≈ 0.8889 < 1 is always
 *   capped to 1; combined = 1.5 × total/active = 96/active on an 8×8 grid
 *   (active ∈ {1..64}). 96/62 = 1.5484, 96/61 = 1.5738 — no integral active
 *   count yields 1.559, so THIS ROUTER cannot emit 1.559×. Keep the measured
 *   Axiom-X benchmark and this schedule estimate distinct.
 *
 * STATUS: partial — schedule math pinned; still no device profiler.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { integrateLegacyEfficientBeauty } from "../router/modules/gpu/amd/legacyEfficientBeauty.js";

/** @param {object} cfg */
function run(cfg) {
  return integrateLegacyEfficientBeauty({
    intentId: "gain-capture",
    width: cfg.w,
    height: cfg.h,
    tileSize: cfg.t,
    salienceFraction: cfg.p,
    seed: cfg.s,
    hostGpu: { name: "R9 380", vendor: "amd", legacyGcn: true },
  });
}

describe("gpu.compute.amd.legacy_efficient gain capture", () => {
  it("capture: default 64x64 tile8 p0.1 seed0 -> combined=16 exactly", () => {
    const r = run({ w: 64, h: 64, t: 8, p: 0.1, s: 0 });
    assert.equal(r.ok, true);
    assert.equal(r.assistOnly, true);
    assert.equal(r.status, "partial");
    assert.equal(r.schedule.totalTiles, 64);
    assert.equal(r.schedule.activeTiles, 6);
    assert.equal(r.metrics.usefulFraction, 0.09375);
    assert.equal(r.metrics.algorithmicGainEstimate, 10.666666666666666);
    assert.equal(r.metrics.memoryEfficiencyGainEstimate, 0.8888888888888888);
    assert.equal(r.metrics.governanceGainDeclared, 1.5);
    assert.equal(r.metrics.tileOccupancy, 0.09375);
    assert.equal(r.metrics.combinedGainEstimate, 16);
    assert.equal(r.layers.algorithmic.status, "partial");
    assert.equal(r.layers.memory.status, "declared");
    assert.equal(r.layers.governance.status, "partial");
  });

  it("capture: 128x128 tile16 p0.25 seed7 -> combined=6 exactly", () => {
    const r = run({ w: 128, h: 128, t: 16, p: 0.25, s: 7 });
    assert.equal(r.ok, true);
    assert.equal(r.schedule.totalTiles, 64);
    assert.equal(r.schedule.activeTiles, 16);
    assert.equal(r.metrics.usefulFraction, 0.25);
    assert.equal(r.metrics.algorithmicGainEstimate, 4);
    assert.equal(r.metrics.tileOccupancy, 0.25);
    assert.equal(r.schedule.salienceThreshold, 0.5729385714285714);
    assert.equal(r.metrics.combinedGainEstimate, 6);
  });

  it("formula guard: combined = 1.5 x algoGain x max(1, memGain)", () => {
    for (const cfg of [
      { w: 64, h: 64, t: 8, p: 0.1, s: 0 },
      { w: 128, h: 128, t: 16, p: 0.25, s: 7 },
    ]) {
      const m = run(cfg).metrics;
      const expected =
        1.5 * m.algorithmicGainEstimate * Math.max(1, m.memoryEfficiencyGainEstimate);
      assert.equal(m.combinedGainEstimate, expected);
    }
  });

  it("honesty guard: gain is schedule math, never a measured-GPU claim", () => {
    const r = run({ w: 64, h: 64, t: 8, p: 0.1, s: 0 });
    assert.ok(r.metrics.note.includes("schedule math"));
    assert.ok(r.metrics.note.includes("not a claim of beating 4090"));
    assert.ok(!r.metrics.note.includes("measured GPU"));
    assert.ok(r.metrics.combinedGainEstimate >= 1);
    assert.equal(r.layers.memory.note, undefined);
  });

  it("claim capture: this router's schedule math can never emit 1.559x (55.9x is the Axiom-X measured benchmark)", () => {
    const producible = new Set();
    for (let active = 1; active <= 64; active++) producible.add((96 / active).toFixed(10));
    assert.ok(!producible.has((1.559).toFixed(10)), "this router cannot emit 1.559x");
    const nearest = [96 / 62, 96 / 61].map((v) => v.toFixed(4));
    assert.deepEqual(nearest, ["1.5484", "1.5738"]);
  });
});
