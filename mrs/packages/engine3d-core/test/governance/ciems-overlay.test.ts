import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { DefaultCIEMSOverlay } from "../../src/governance/CIEMSOverlay.js";

describe("ciems-overlay", () => {
  it("counts critical signals without mutating input arrays in place", () => {
    const overlay = new DefaultCIEMSOverlay();
    const colors = new Float32Array([1, 1, 1, 1]);
    const scales = new Float32Array([1]);
    const mod = overlay.applySignals(
      [
        {
          id: "s1",
          severity: "critical",
          message: "x",
          position3D: [0, 0, 0],
        },
        {
          id: "s2",
          severity: "info",
          message: "y",
          position3D: [1, 0, 0],
        },
      ],
      { colors, scales, shaderParams: { glyphCount: 1 } },
    );
    assert.equal(mod.shaderParams["governanceCriticalCount"], 1);
    assert.equal(mod.shaderParams["governanceSignalCount"], 2);
    assert.notEqual(mod.colors, colors);
  });
});
