/**
 * EGT → approximate bulk reconstruction tests (Claim A — partial PoC).
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { runTinyHolographicScene } from "../tiny-scene.mjs";
import {
  RECONSTRUCT_STATUS,
  extractEGTFeatures,
  liftEGTToBulkGuess,
  reconstructApproximateBulk,
  compareReconstruction,
  reconstructWorldlineFromEGT,
  defaultTinySceneTolerance,
} from "../reconstruct.mjs";

describe("holographic reconstruct (EGT → B̂)", () => {
  it("reconstructed worldline stays within tolerance of true path", () => {
    const result = runTinyHolographicScene({
      frames: 40,
      v_x: 0.15,
      resolutionX: 32,
      resolutionY: 32,
      densityIncrement: 1,
      entanglementIncrement: 0.35,
    });
    const { reconstruction, receipt, track, grid } = result;
    assert.equal(reconstruction.status, RECONSTRUCT_STATUS);
    assert.ok(Number.isFinite(receipt.reconstructionError));
    const tol = defaultTinySceneTolerance({
      sizeX: grid.sizeX,
      resolutionX: grid.resolutionX,
    });
    assert.ok(
      receipt.reconstructionError <= tol,
      `reconstructionError ${receipt.reconstructionError} > ${tol}`,
    );
    assert.ok(receipt.maxRhoPeakDist <= tol * 3);
    assert.ok(reconstruction.metrics.withinTolerance);
    assert.ok(reconstruction.worldline.count >= track.length * 0.9);
  });

  it("feature extract + lift produces energy concentration near trail", () => {
    const result = runTinyHolographicScene({
      frames: 24,
      v_x: 0.2,
      resolutionX: 24,
      resolutionY: 24,
    });
    const features = extractEGTFeatures(result.egt);
    assert.ok(features.rhoPeaks.length >= 1);
    const guess = liftEGTToBulkGuess(result.egt, { features });
    assert.ok(guess.primary.amplitude > 0);
    const d = Math.hypot(
      guess.primary.x - result.track[result.track.length - 1].x,
      guess.primary.y - result.track[result.track.length - 1].y,
    );
    assert.ok(d < 6, `primary too far from endpoint: ${d}`);
  });

  it("deterministic for identical params", () => {
    const a = runTinyHolographicScene({ frames: 12, resolutionX: 16, resolutionY: 16 });
    const b = runTinyHolographicScene({ frames: 12, resolutionX: 16, resolutionY: 16 });
    assert.equal(a.receipt.reconstructionError, b.receipt.reconstructionError);
    assert.equal(a.receipt.maxRhoPeakDist, b.receipt.maxRhoPeakDist);
  });

  it("standalone reconstructApproximateBulk matches receipt fields", () => {
    const result = runTinyHolographicScene({ frames: 16, resolutionX: 20, resolutionY: 20 });
    const again = reconstructApproximateBulk(result.egt, result.track, result.framePeaks);
    assert.equal(
      again.receiptFields.reconstructionError,
      result.receipt.reconstructionError,
    );
    const wl = reconstructWorldlineFromEGT(result.egt, { framePeaks: result.framePeaks });
    const metrics = compareReconstruction(wl, result.track, {
      egt: result.egt,
      framePeaks: result.framePeaks,
    });
    assert.ok(metrics.bounded);
  });
});
