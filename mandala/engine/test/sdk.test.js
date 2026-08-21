import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createUniverse, stepPhysics, project, observe, paint, speak, createImage, SDK_STATUS } from "../sdk/index.mjs";

describe("SDK v0.9", () => {
  it("createUniverse → step → observe (no time ownership) → project → paint → speak", async () => {
    const u = createUniverse({ seed: 7 });
    const r = stepPhysics(u);
    assert.equal(r.committed, true);
    const view = observe(u, 0);
    assert.equal(view.ownsTime, false);
    const image = createImage(8, 8);
    const proj = project(u, image);
    assert.equal(proj.liveHash, u.state.hash);
    const painted = await paint(u, image, { trySd: false });
    assert.equal(painted.image.painter.organ, "AIPainter");
    const spoken = speak(u, { tryTts: false });
    assert.equal(spoken.organ, "Mythar");
    assert.equal(SDK_STATUS, "partial");
  });
});
