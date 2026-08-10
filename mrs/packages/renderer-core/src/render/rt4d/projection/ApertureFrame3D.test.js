// mrs/packages/renderer-core/src/render/rt4d/projection/ApertureFrame3D.test.js
// Status: **passing with gaps** - ApertureFrame3D creation + sampling tests.

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createApertureFrame3D, apertureSampleDirection, APERTURE_SOT_BANNER } from "./ApertureFrame3D.js";

describe("ApertureFrame3D", () => {
  it("creates aperture frame from state and viewport", () => {
    const frame = createApertureFrame3D(
      { theta: 0, phi: 0, d3: 4, d4: 4, kappa: 0, tau: 0, modeId: "test" },
      { x: 0, y: 0, width: 512, height: 512 }
    );
    assert.equal(frame.role, "observation_aperture");
    assert.equal(frame.printSoT, false);
    assert.equal(frame.authority, "observation");
    assert.equal(frame.banner, "Governed observation aperture — assist/preview only; CPU RT4D print remains SoT.");
    assert.equal(frame.status, "enforced");
    assert.equal(frame.viewport.width, 512);
    assert.equal(frame.viewport.height, 512);
    assert.ok(frame.tau === 0);
    assert.ok(frame.kappa === 0);
  });

  it("throws on invalid viewport dimensions", () => {
    assert.throws(() => createApertureFrame3D(
      { theta: 0, phi: 0, d3: 4, d4: 4, kappa: 0, tau: 0, modeId: "test" },
      { x: 0, y: 0, width: 0, height: 512 }
    ), /viewport width.*must be > 0/);
    assert.throws(() => createApertureFrame3D(
      { theta: 0, phi: 0, d3: 4, d4: 4, kappa: 0, tau: 0, modeId: "test" },
      { x: 0, y: 0, width: 512, height: -1 }
    ), /viewport width.*must be > 0/);
  });

  it("apertureSampleDirection returns normalized direction", () => {
    const frame = createApertureFrame3D(
      { theta: 0, phi: 0, d3: 4, d4: 4, kappa: 0, tau: 0, modeId: "test" },
      { x: 0, y: 0, width: 512, height: 512 }
    );
    const dir = apertureSampleDirection(frame, 0.5, 0.5);
    const len = Math.hypot(dir.x, dir.y, dir.z);
    assert.ok(Math.abs(len - 1) < 1e-6);
    // Center of viewport -> forward direction
    assert.ok(Math.abs(dir.z - 1) < 1e-6);
  });

  it("apertureSampleDirection samples edges correctly", () => {
    const frame = createApertureFrame3D(
      { theta: 0, phi: 0, d3: 4, d4: 4, kappa: 0, tau: 0, modeId: "test" },
      { x: 0, y: 0, width: 512, height: 512 }
    );
    // Top-left corner
    const tl = apertureSampleDirection(frame, 0, 0);
    assert.ok(tl.x < 0 && tl.y < 0 && tl.z > 0);
    // Bottom-right corner
    const br = apertureSampleDirection(frame, 1, 1);
    assert.ok(br.x > 0 && br.y > 0 && br.z > 0);
  });

  it("returns correct role and authority", () => {
    const frame = createApertureFrame3D(
      { theta: 0, phi: 0, d3: 4, d4: 4, kappa: 0, tau: 0, modeId: "test" },
      { x: 0, y: 0, width: 512, height: 512 }
    );
    assert.equal(frame.role, "observation_aperture");
    assert.equal(frame.authority, "observation");
    assert.equal(frame.printSoT, false);
  });

  it("focalHint and nearHint derived from d3 and kappa", () => {
    const frame = createApertureFrame3D(
      { theta: 0, phi: 0, d3: 8, d4: 4, kappa: 0.5, tau: 0, modeId: "test" },
      { x: 0, y: 0, width: 512, height: 512 }
    );
    // focalHint = d3 * (1 + 0.1 * kappa) = 8 * (1 + 0.05) = 8.4
    assert.ok(Math.abs(frame.focalHint - 8.4) < 1e-9);
    // nearHint = max(1e-3, 0.01 * focalHint) = max(1e-3, 0.084) = 0.084
    assert.ok(Math.abs(frame.nearHint - 0.084) < 1e-9);
  });

  it("frame is frozen", () => {
    const frame = createApertureFrame3D(
      { theta: 0, phi: 0, d3: 4, d4: 4, kappa: 0, tau: 0, modeId: "test" },
      { x: 0, y: 0, width: 512, height: 512 }
    );
    assert.throws(() => { frame.role = "hacked"; });
    assert.throws(() => { frame.viewport.width = 999; });
  });

  it("viewport rect is frozen", () => {
    const frame = createApertureFrame3D(
      { theta: 0, phi: 0, d3: 4, d4: 4, kappa: 0, tau: 0, modeId: "test" },
      { x: 10, y: 20, width: 100, height: 200 }
    );
    assert.throws(() => { frame.viewport.x = 99; });
  });
});