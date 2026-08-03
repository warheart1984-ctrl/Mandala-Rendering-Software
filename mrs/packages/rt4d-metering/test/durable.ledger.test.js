import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { JsonlTenantLedger } from "../src/durable/JsonlTenantLedger.js";
import { resetCreditSchedule } from "../src/creditSchedule.js";

function receipt(renderId = "rt4d-render-durable00000001") {
  return {
    renderId,
    pixelHash: "d".repeat(64),
    pngHash: "e".repeat(64),
    projectionHash: "f".repeat(64),
    runtimeFingerprint: { node: "v20", zlib: "1", platform: "linux", arch: "x64" },
    evidenceStatus: "substrate_verified",
    width: 256,
    height: 256,
    samplesPerPixel: 1,
    maxDepth: 2,
    computeSeconds: 1,
    storageBytes: 2048,
  };
}

describe("JsonlTenantLedger durable exactly-once", () => {
  /** @type {string} */
  let dir;

  beforeEach(() => {
    resetCreditSchedule();
    dir = mkdtempSync(join(tmpdir(), "rt4d-jsonl-"));
  });

  afterEach(() => {
    resetCreditSchedule();
    rmSync(dir, { recursive: true, force: true });
  });

  it("charges once under concurrent double-submit", async () => {
    const ledger = new JsonlTenantLedger(dir);
    const input = {
      userId: "user-d",
      tenantId: "tenant-a",
      planId: "creator",
      engineReceipt: receipt(),
      recordedAt: "2026-08-02T12:00:00.000Z",
    };
    const [a, b] = await Promise.all([
      ledger.recordUsageFromReceipt(input),
      ledger.recordUsageFromReceipt(input),
    ]);
    const first = a.duplicate ? b : a;
    const second = a.duplicate ? a : b;
    assert.equal(first.duplicate, false);
    assert.equal(second.duplicate, true);
    assert.equal(second.ledgerEntry.creditsDelta, 0);
    assert.equal(ledger.creditsUsedByUser("user-d", "tenant-a"), first.usage.creditsUsed);

    const reloaded = new JsonlTenantLedger(dir);
    const usage = await reloaded.getUsage(receipt().renderId, "tenant-a");
    assert.equal(usage?.creditsUsed, first.usage.creditsUsed);
  });

  it("exports audit chain by renderId", async () => {
    const ledger = new JsonlTenantLedger(dir);
    const r = await ledger.recordUsageFromReceipt({
      userId: "user-e",
      tenantId: "tenant-b",
      planId: "pro",
      engineReceipt: receipt("rt4d-render-audit0000000001"),
      recordedAt: "2026-08-02T12:00:00.000Z",
    });
    assert.equal(r.decision.allowed, true);
    const chain = await ledger.getAuditChain(
      "rt4d-render-audit0000000001",
      "tenant-b",
    );
    assert.equal(chain.renderId, "rt4d-render-audit0000000001");
    assert.equal(chain.usage?.creditsUsed, r.usage.creditsUsed);
    assert.ok(chain.decisions.length >= 1);
    assert.ok(chain.ledgerEntries.length >= 1);
    assert.equal(chain.receiptRef?.pixelHash, "d".repeat(64));
  });

  it("records entitlement deny without charging", async () => {
    const ledger = new JsonlTenantLedger(dir);
    // Exhaust free allotment with many small charges first if needed —
    // free plan has a small monthly allotment; use an absurd proposed path via studio→free deny.
    // Easier: unknown planId path.
    const denied = await ledger.recordUsageFromReceipt({
      userId: "user-f",
      tenantId: "tenant-c",
      planId: "free",
      engineReceipt: {
        ...receipt("rt4d-render-deny000000000001"),
        // inflate work so credits exceed free allotment in one shot
        width: 4096,
        height: 4096,
        samplesPerPixel: 64,
        maxDepth: 16,
        computeSeconds: 3600,
        storageBytes: 512 * 1024 * 1024,
      },
      recordedAt: "2026-08-02T12:00:00.000Z",
    });
    // If still within allotment, force second huge render until deny — or check planGate.
    if (denied.decision.allowed) {
      // Keep charging until deny
      let last = denied;
      for (let i = 0; i < 50 && last.decision.allowed; i++) {
        last = await ledger.recordUsageFromReceipt({
          userId: "user-f",
          tenantId: "tenant-c",
          planId: "free",
          engineReceipt: {
            ...receipt(`rt4d-render-deny${String(i).padStart(16, "0")}`),
            width: 4096,
            height: 4096,
            samplesPerPixel: 64,
            maxDepth: 16,
            computeSeconds: 3600,
            storageBytes: 512 * 1024 * 1024,
          },
        });
      }
      assert.equal(last.decision.allowed, false);
      assert.equal(last.usage, null);
      assert.match(last.decision.reason, /PLAN_DENY|allotment|limit/i);
    } else {
      assert.equal(denied.usage, null);
      assert.equal(denied.decision.allowed, false);
    }
  });
});
