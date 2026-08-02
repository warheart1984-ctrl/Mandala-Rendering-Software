import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { assertWithinPlanLimits } from "../src/planGate.js";
import { InMemoryLedger } from "../src/ledger.js";

function receipt(renderId, creditsHint = {}) {
  return {
    renderId,
    pixelHash: "p".repeat(64),
    pngHash: "g".repeat(64),
    projectionHash: "j".repeat(64),
    runtimeFingerprint: { node: "v20", zlib: "1", platform: "linux", arch: "x64" },
    evidenceStatus: "substrate_verified",
    width: 512,
    height: 512,
    samplesPerPixel: 8,
    maxDepth: 8,
    computeSeconds: 20,
    storageBytes: 8_000_000,
    ...creditsHint,
  };
}

describe("assertWithinPlanLimits", () => {
  it("allows proposed credits within allotment", () => {
    const ok = assertWithinPlanLimits("u1", "free", 10, 0);
    assert.equal(ok.ok, true);
    assert.equal(ok.allotment, 50);
    assert.equal(ok.remaining, 40);
  });

  it("fail-closed denies when proposed exceeds remaining", () => {
    assert.throws(
      () => assertWithinPlanLimits("u1", "free", 51, 0),
      (err) => err.code === "PLAN_DENY",
    );
    assert.throws(
      () => assertWithinPlanLimits("u1", "free", 10, 45),
      (err) => err.code === "PLAN_DENY",
    );
  });

  it("fail-closed on unknown plan", () => {
    assert.throws(
      () => assertWithinPlanLimits("u1", "unlimited", 1, 0),
      (err) => err.code === "PLAN_DENY",
    );
  });

  it("ledger denies usage that would exceed plan allotment", () => {
    const ledger = new InMemoryLedger();
    // Small render fits free allotment; second heavy render must deny.
    const first = ledger.recordUsageFromReceipt({
      userId: "u-free",
      planId: "free",
      engineReceipt: {
        ...receipt("rt4d-render-aaaaaaaaaaaaaaaa"),
        width: 64,
        height: 64,
        samplesPerPixel: 1,
        maxDepth: 1,
        computeSeconds: 0.1,
        storageBytes: 512,
      },
      recordedAt: "2026-08-02T00:00:00.000Z",
    });
    assert.equal(first.duplicate, false);
    assert.ok(first.usage.creditsUsed < 50);
    assert.throws(
      () =>
        ledger.recordUsageFromReceipt({
          userId: "u-free",
          planId: "free",
          engineReceipt: receipt("rt4d-render-bbbbbbbbbbbbbbbb"),
        }),
      (err) => err.code === "PLAN_DENY",
    );
  });
});
