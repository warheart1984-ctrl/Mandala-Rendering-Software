import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createInitialCertifiedState, freezeCertifiedSnapshot } from "../../proto/certified-state.mjs";
import { createImage } from "../../proto/mandala-project.mjs";
import { projectFrozenLayered } from "../project.mjs";
import { paintCpu, PAINTER_STATUS, SD_TIMEOUT_MS, SD_SIZE, SD_STEPS, SD_CFG } from "../painter/index.mjs";
import { rgbToPng, decodePngToRgb, compositeSdOverRgb } from "../png.mjs";

describe("AI Painter organ", () => {
  it("CPU painter tints under certified constraints without mutating hash", () => {
    const state = createInitialCertifiedState({ seed: 9 });
    const hash = state.hash;
    const image = createImage(16, 16);
    const snap = freezeCertifiedSnapshot(state);
    projectFrozenLayered(snap, image);
    const before = image.rgb[0];
    paintCpu(snap, image);
    assert.equal(PAINTER_STATUS, "partial");
    assert.equal(image.painter.mutatesCertified, false);
    assert.equal(image.painter.organ, "AIPainter");
    assert.match(image.painter.prompt, /stateHash/);
    assert.match(image.painter.prompt, /constitution/);
    assert.equal(state.hash, hash);
    assert.ok(image.rgb[0] >= before);
  });

  it("SD request stays tiny and PNG overlay does not mutate certified hash", () => {
    assert.ok(SD_TIMEOUT_MS >= 60000);
    assert.equal(SD_SIZE, "64x64");
    assert.equal(SD_STEPS, 4);
    assert.equal(SD_CFG, 1.0);

    const state = createInitialCertifiedState({ seed: 9 });
    const hash = state.hash;
    const image = createImage(8, 8);
    const snap = freezeCertifiedSnapshot(state);
    projectFrozenLayered(snap, image);
    paintCpu(snap, image);
    image.rgb.fill(10);
    const png = rgbToPng(4, 4, new Uint8Array(4 * 4 * 3).fill(200));
    const decoded = decodePngToRgb(png);
    assert.equal(decoded.width, 4);
    assert.equal(decoded.height, 4);
    compositeSdOverRgb(image.rgb, 8, 8, decoded.rgb, 4, 4, 0.55);
    assert.ok(image.rgb[0] > 10);
    assert.equal(state.hash, hash);
  });
});
