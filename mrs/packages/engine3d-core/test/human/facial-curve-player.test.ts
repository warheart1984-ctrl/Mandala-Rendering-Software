import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { FacialCurvePlayer } from "../../src/human/FacialCurvePlayer.js";

describe("FacialCurvePlayer", () => {
  it("interpolates keyframes and sums weights per morph id", () => {
    const player = new FacialCurvePlayer({
      curves: [
        {
          id: "smile-curve",
          targets: ["smile"],
          keyframes: [
            { time: 0, weights: { smile: 0 } },
            { time: 1, weights: { smile: 1 } },
          ],
        },
        {
          id: "brow-curve",
          targets: ["smile", "browUp"],
          keyframes: [
            { time: 0, weights: { smile: 0.25, browUp: 0 } },
            { time: 1, weights: { smile: 0.25, browUp: 0.5 } },
          ],
        },
      ],
    });
    assert.deepEqual(player.evaluate(0.5), { browUp: 0.25, smile: 0.75 });
  });

  it("clamps outside the keyframe range", () => {
    const player = new FacialCurvePlayer({
      curves: [{ id: "blink", targets: ["blink"], keyframes: [{ time: 1, weights: { blink: 0.2 } }] }],
    });
    assert.deepEqual(player.evaluate(0), { blink: 0.2 });
    assert.deepEqual(player.evaluate(5), { blink: 0.2 });
  });
});
