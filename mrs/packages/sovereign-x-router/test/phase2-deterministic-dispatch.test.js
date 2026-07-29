import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  dispatchVendorCapability,
  integrateDeterministicAssist,
  mulberry32,
} from "../src/index.js";

describe("SX Router Phase 2 — deterministic assist dispatch", () => {
  it("integrateDeterministicAssist is deterministic for fixed seed", () => {
    const a = integrateDeterministicAssist({ seed: 42, sampleCount: 8 });
    const b = integrateDeterministicAssist({ seed: 42, sampleCount: 8 });
    assert.equal(a.ok, true);
    assert.deepEqual(a.samples, b.samples);
    assert.equal(a.receipt.frameHash, b.receipt.frameHash);
  });

  it("denies authoritative print SoT on integrator", () => {
    const r = integrateDeterministicAssist({ seed: 1, asPrintSoT: true });
    assert.equal(r.ok, false);
    assert.equal(r.code, "GPU_PRINT_SOT_DENIED");
  });

  it("dispatchVendorCapability ALLOWs registered gen assist id", () => {
    const r = dispatchVendorCapability("gpu.gen.nvidia.nim_flux", {
      intent: "assist",
      hostCapable: true,
    });
    assert.equal(r.ok, true);
    assert.equal(r.code, "ALLOWED_UPSTREAM");
  });

  it("mulberry32 produces stable first draw", () => {
    const rng = mulberry32(0xdeadbeef);
    const u0 = rng();
    const rng2 = mulberry32(0xdeadbeef);
    assert.equal(u0, rng2());
  });
});
