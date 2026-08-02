import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  deriveCreditsFromReceipt,
  CREDIT_FORMULA_STATUS,
  CREDIT_FORMULA,
} from "../src/deriveCredits.js";

function baseReceipt(overrides = {}) {
  return {
    renderId: "rt4d-render-abcdef0123456789",
    pixelHash: "a".repeat(64),
    pngHash: "b".repeat(64),
    projectionHash: "c".repeat(64),
    runtimeFingerprint: {
      node: "v20.0.0",
      zlib: "1.2.0",
      platform: "win32",
      arch: "x64",
    },
    evidenceStatus: "substrate_verified",
    width: 512,
    height: 512,
    samplesPerPixel: 1,
    maxDepth: 4,
    computeSeconds: 8.4,
    storageBytes: 4281192,
    ...overrides,
  };
}

describe("deriveCreditsFromReceipt", () => {
  it("is deterministic for identical receipts", () => {
    const a = deriveCreditsFromReceipt(baseReceipt());
    const b = deriveCreditsFromReceipt(baseReceipt());
    assert.equal(a.creditsUsed, b.creditsUsed);
    assert.equal(a.computeSeconds, 8.4);
    assert.equal(a.storageBytes, 4281192);
    assert.equal(a.formulaStatus, "declared");
    assert.equal(CREDIT_FORMULA_STATUS, "declared");
  });

  it("matches declared formula for known inputs", () => {
    const receipt = baseReceipt({
      width: 512,
      height: 512,
      samplesPerPixel: 1,
      maxDepth: 4,
      computeSeconds: 8.4,
      storageBytes: 4281192,
    });
    const workUnits = 512 * 512 * 1 * 4;
    const raw =
      workUnits / CREDIT_FORMULA.WORK_UNITS_PER_CREDIT +
      8.4 * CREDIT_FORMULA.CREDITS_PER_COMPUTE_SECOND +
      4281192 / CREDIT_FORMULA.BYTES_PER_CREDIT;
    const expected = Math.max(1, Math.ceil(raw));
    assert.equal(deriveCreditsFromReceipt(receipt).creditsUsed, expected);
  });

  it("fails closed on incomplete evidence status", () => {
    assert.throws(
      () => deriveCreditsFromReceipt(baseReceipt({ evidenceStatus: "draft" })),
      (err) => err.code === "ENGINE_EVIDENCE_INCOMPLETE",
    );
  });

  it("requires join hashes (renderId / pixelHash / pngHash / projectionHash)", () => {
    assert.throws(() =>
      deriveCreditsFromReceipt(baseReceipt({ pixelHash: "" })),
    );
    assert.throws(() =>
      deriveCreditsFromReceipt(baseReceipt({ renderId: "" })),
    );
  });
});
