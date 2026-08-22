/**
 * Boundary reconstruction + CIEMS soft invariant + interference (expansions).
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { runTinyHolographicScene } from "../tiny-scene.mjs";
import {
  reconstructApproximateBulk,
  reconstructBulkFromEGT,
  defaultTinySceneTolerance,
} from "../reconstruct.mjs";
import {
  checkBulkEgtCoupling,
  runGovernedLabStep,
} from "../ciems-lab.mjs";
import {
  runInterferenceVsControl,
  runTwoWorldlineInterference,
} from "../scenes/two-worldline-interference.mjs";
import { createBulkSpacetimeEngine } from "../bulk-spacetime-engine.mjs";
import { createHolographicEncoder } from "../holographic-encoder.mjs";
import { createInitialCertifiedState } from "../../proto/certified-state.mjs";

describe("boundary reconstruction (EGT → B̂, partial)", () => {
  it("tiny scene mean position error within grid tolerance", () => {
    const result = runTinyHolographicScene({
      frames: 40,
      v_x: 0.15,
      resolutionX: 24,
      resolutionY: 24,
    });
    const { receipt, reconstruction, grid } = result;
    const tol = defaultTinySceneTolerance({
      sizeX: grid.sizeX,
      resolutionX: grid.resolutionX,
    });
    assert.ok(
      Number.isFinite(receipt.reconstructionError),
      "receipt must report reconstructionError",
    );
    assert.ok(
      receipt.reconstructionError <= tol,
      `reconstructionError ${receipt.reconstructionError} > tol ${tol}`,
    );
    assert.equal(reconstruction.status, "partial");
    assert.ok(reconstruction.metrics.withinTolerance);
  });

  it("reconstructBulkFromEGT lifts ρ peaks to 4D", () => {
    const result = runTinyHolographicScene({
      frames: 20,
      resolutionX: 16,
      resolutionY: 16,
    });
    const hat = reconstructBulkFromEGT(result.egt, { t: result.egt.t });
    assert.equal(hat.status, "partial");
    assert.ok(hat.points.length >= 1);
    assert.ok(Number.isFinite(hat.primary.x));
    assert.equal(hat.primary.t, result.egt.t);
  });
});

describe("multi-worldline interference", () => {
  it("interaction raises maxRho and edgeSum vs non-interacting control", () => {
    const { comparison, interacting } = runInterferenceVsControl({
      frames: 48,
      resolutionX: 24,
      resolutionY: 24,
      threshold: 1.2,
    });
    assert.ok(comparison.interactionFrameCount > 0, "expected close approaches");
    assert.ok(
      comparison.maxRhoHigher,
      `maxRho interact ${comparison.interactingMaxRho} <= control ${comparison.controlMaxRho}`,
    );
    assert.ok(
      comparison.edgeSumHigher,
      `edgeSum interact ${comparison.interactingEdgeSum} <= control ${comparison.controlEdgeSum}`,
    );
    assert.ok(interacting.receipt.spikeProof.ok || comparison.edgeSumHigher);
  });

  it("control with interact:false has zero interaction frames", () => {
    const ctrl = runTwoWorldlineInterference({
      frames: 40,
      interact: false,
      resolutionX: 20,
      resolutionY: 20,
    });
    assert.equal(ctrl.receipt.interactionFrameCount, 0);
    assert.equal(ctrl.receipt.interact, false);
  });
});

describe("CIEMS lab soft invariant (stepBulk → updateEGT)", () => {
  it("passes when updateEGT follows bulk step", () => {
    const state = createInitialCertifiedState({ seed: 11 });
    const bulk = createBulkSpacetimeEngine({ state });
    const encoder = createHolographicEncoder({ stride: 4 });
    const { coupling } = runGovernedLabStep({ bulk, encoder, stepBulk: true });
    assert.equal(coupling.ok, true);
    assert.equal(coupling.code, "ok");
  });

  it("fails soft check when bulk steps without updateEGT", () => {
    const coupling = checkBulkEgtCoupling({
      bulkStepped: true,
      egtUpdated: false,
    });
    assert.equal(coupling.ok, false);
    assert.equal(coupling.code, "bulk-without-egt-update");
  });

  it("runGovernedLabStep skipEgtUpdate reports violation", () => {
    const state = createInitialCertifiedState({ seed: 13 });
    const bulk = createBulkSpacetimeEngine({ state });
    const encoder = createHolographicEncoder({ stride: 4 });
    const { coupling } = runGovernedLabStep({
      bulk,
      encoder,
      stepBulk: true,
      skipEgtUpdate: true,
    });
    assert.equal(coupling.ok, false);
  });
});
