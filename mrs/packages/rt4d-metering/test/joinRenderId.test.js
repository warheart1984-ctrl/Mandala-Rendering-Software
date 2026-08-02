import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { InMemoryLedger } from "../src/ledger.js";
import { UsageRecordSchema } from "../src/types.js";

describe("join-to-renderId", () => {
  it("stores usage keyed by engine renderId with evidence join fields", () => {
    const ledger = new InMemoryLedger();
    const renderId = "rt4d-render-deadbeefcafebabe";
    const { usage } = ledger.recordUsageFromReceipt({
      userId: "join-user",
      planId: "creator",
      engineReceipt: {
        renderId,
        pixelHash: "11".repeat(32),
        pngHash: "22".repeat(32),
        projectionHash: "33".repeat(32),
        runtimeFingerprint: {
          node: "v22.0.0",
          zlib: "1.3",
          platform: "win32",
          arch: "x64",
        },
        evidenceStatus: "substrate_verified",
        width: 128,
        height: 128,
        samplesPerPixel: 1,
        maxDepth: 2,
        computeSeconds: 0.5,
        storageBytes: 2048,
      },
      recordedAt: "2026-08-02T12:00:00.000Z",
    });

    const parsed = UsageRecordSchema.parse(usage);
    assert.equal(parsed.renderId, renderId);
    assert.equal(ledger.getUsage(renderId)?.pixelHash, "11".repeat(32));
    assert.equal(ledger.getUsage(renderId)?.pngHash, "22".repeat(32));
    assert.equal(ledger.getUsage(renderId)?.projectionHash, "33".repeat(32));
    assert.equal(ledger.getUsage(renderId)?.evidenceStatus, "substrate_verified");
    assert.ok(ledger.getUsage(renderId)?.runtimeFingerprint);
  });

  it("rejects metering when evidence join is incomplete", () => {
    const ledger = new InMemoryLedger();
    assert.throws(() =>
      ledger.recordUsageFromReceipt({
        userId: "join-user",
        planId: "creator",
        engineReceipt: {
          renderId: "rt4d-render-missinghashes0001",
          pixelHash: "11".repeat(32),
          // pngHash missing
          projectionHash: "33".repeat(32),
          runtimeFingerprint: { platform: "linux" },
          evidenceStatus: "substrate_verified",
        },
      }),
    );
  });
});
