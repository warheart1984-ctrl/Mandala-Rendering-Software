import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { InMemoryLedger, JsonFileLedger } from "../src/ledger.js";

function receipt(renderId = "rt4d-render-1111111111111111") {
  return {
    renderId,
    pixelHash: "p".repeat(64),
    pngHash: "g".repeat(64),
    projectionHash: "j".repeat(64),
    runtimeFingerprint: { node: "v20", zlib: "1", platform: "linux", arch: "x64" },
    evidenceStatus: "substrate_verified",
    width: 256,
    height: 256,
    samplesPerPixel: 1,
    maxDepth: 2,
    computeSeconds: 1,
    storageBytes: 1024,
  };
}

describe("ledger idempotency", () => {
  it("does not double-charge the same renderId", () => {
    const ledger = new InMemoryLedger();
    const first = ledger.recordUsageFromReceipt({
      userId: "user-a",
      planId: "creator",
      engineReceipt: receipt(),
      recordedAt: "2026-08-02T00:00:00.000Z",
    });
    const second = ledger.recordUsageFromReceipt({
      userId: "user-a",
      planId: "creator",
      engineReceipt: receipt(),
      recordedAt: "2026-08-02T00:01:00.000Z",
    });

    assert.equal(first.duplicate, false);
    assert.equal(second.duplicate, true);
    assert.equal(second.ledgerEntry.creditsDelta, 0);
    assert.equal(second.ledgerEntry.idempotentReplay, true);
    assert.equal(ledger.creditsUsedByUser("user-a"), first.usage.creditsUsed);
    assert.equal(ledger.usageByRenderId.size, 1);
  });

  it("JsonFileLedger persists and reloads by renderId", () => {
    const dir = mkdtempSync(join(tmpdir(), "rt4d-meter-"));
    const path = join(dir, "ledger.json");
    try {
      const a = new JsonFileLedger(path);
      const r = a.recordUsageFromReceipt({
        userId: "user-b",
        planId: "pro",
        engineReceipt: receipt("rt4d-render-2222222222222222"),
        recordedAt: "2026-08-02T00:00:00.000Z",
      });
      const b = new JsonFileLedger(path);
      const again = b.recordUsageFromReceipt({
        userId: "user-b",
        planId: "pro",
        engineReceipt: receipt("rt4d-render-2222222222222222"),
      });
      assert.equal(again.duplicate, true);
      assert.equal(b.getUsage(r.usage.renderId)?.creditsUsed, r.usage.creditsUsed);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
