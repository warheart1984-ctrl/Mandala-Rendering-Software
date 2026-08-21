/**
 * Two-worldline interference scene tests.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  runTwoWorldlineInterference,
  spatialDistance,
  INTERFERENCE_STATUS,
} from "../scenes/two-worldline-interference.mjs";
import { Worldline } from "../tiny-scene.mjs";

describe("two-worldline interference", () => {
  it("produces interaction frames and edgeSum spike", () => {
    const result = runTwoWorldlineInterference({
      frames: 50,
      threshold: 0.9,
      resolutionX: 28,
      resolutionY: 28,
    });
    assert.equal(result.receipt.status, INTERFERENCE_STATUS);
    assert.ok(
      result.receipt.interactionFrameCount > 0,
      "expected at least one interaction frame",
    );
    assert.ok(result.receipt.spikeProof.ok, "expected edgeSum spike vs early baseline");
    assert.ok(result.receipt.maxRho > 0);
    assert.ok(result.receipt.maxK > 0);
    assert.ok(result.receipt.edgeSum > 0);
  });

  it("worldlines approach within threshold mid-run", () => {
    const w1 = new Worldline({ v_x: 0.18, x0: -4.5, y0: -0.4, v_y: 0.02 });
    const w2 = new Worldline({ v_x: -0.18, x0: 4.5, y0: 0.4, v_y: -0.02 });
    let minD = Infinity;
    for (let t = 0; t < 50; t++) {
      const d = spatialDistance(w1.positionAt(t), w2.positionAt(t));
      if (d < minD) minD = d;
    }
    assert.ok(minD < 0.9, `min separation ${minD} should cross threshold`);
  });

  it("deterministic interference receipt fingerprint", () => {
    const a = runTwoWorldlineInterference({ frames: 30, resolutionX: 20, resolutionY: 20 });
    const b = runTwoWorldlineInterference({ frames: 30, resolutionX: 20, resolutionY: 20 });
    assert.equal(a.receipt.egtHash, b.receipt.egtHash);
    assert.equal(a.receipt.interactionFrameCount, b.receipt.interactionFrameCount);
  });
});
