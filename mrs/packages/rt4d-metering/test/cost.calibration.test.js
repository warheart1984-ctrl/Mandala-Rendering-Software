import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import {
  observeCost,
  FixtureCostObserver,
  AwsCurCostObserver,
} from "../src/cost/CostObserver.js";
import { calibrateCredits } from "../src/cost/calibrate.js";
import {
  getCreditSchedule,
  resetCreditSchedule,
} from "../src/creditSchedule.js";
import { deriveCreditsFromReceipt } from "../src/deriveCredits.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixtures = JSON.parse(
  readFileSync(join(__dirname, "../fixtures/cost-samples.json"), "utf8"),
);

function meterableReceipt(overrides = {}) {
  return {
    renderId: "rt4d-render-calibrate00000001",
    pixelHash: "a".repeat(64),
    pngHash: "b".repeat(64),
    projectionHash: "c".repeat(64),
    runtimeFingerprint: { node: "v20", zlib: "1", platform: "win32", arch: "x64" },
    evidenceStatus: "substrate_verified",
    width: 512,
    height: 512,
    samplesPerPixel: 1,
    maxDepth: 4,
    computeSeconds: 8,
    storageBytes: 4281192,
    ...overrides,
  };
}

describe("cost calibration", () => {
  beforeEach(() => resetCreditSchedule());
  afterEach(() => resetCreditSchedule());

  it("labels fixture observations honestly", () => {
    const sample = fixtures.samples[0];
    const obs = new FixtureCostObserver().observe(sample);
    assert.equal(obs.source, "fixture");
    assert.equal(obs.status, "partial");
    assert.equal(obs.awsCostUsd, 0.012);
  });

  it("dispatches observeCost by source", () => {
    const obs = observeCost(fixtures.samples[1]);
    assert.equal(obs.source, "declared_estimate");
    assert.equal(obs.status, "declared");
  });

  it("refuses aws_cur without cost dollars", () => {
    assert.throws(
      () =>
        new AwsCurCostObserver().observe({
          renderId: "rt4d-render-cur-missing-cost",
          computeSeconds: 1,
          storageBytes: 1,
          source: "aws_cur",
        }),
      /AWS_CUR_UNAVAILABLE/,
    );
  });

  it("calibrateCredits proposes versioned schedule without minting alone", () => {
    const before = getCreditSchedule();
    const result = calibrateCredits(fixtures.samples[0], { apply: false });
    assert.equal(result.applied, false);
    assert.ok(result.recommendedCredits >= 1);
    assert.notEqual(result.proposedSchedule.version, before.version);
    assert.equal(result.formulaStatus, "declared");
    assert.equal(getCreditSchedule().version, before.version);
  });

  it("applied calibration retargets deriveCreditsFromReceipt schedule", () => {
    const baseline = deriveCreditsFromReceipt(meterableReceipt());
    calibrateCredits(fixtures.samples[0], { apply: true });
    const after = deriveCreditsFromReceipt(meterableReceipt());
    assert.notEqual(after.scheduleVersion, baseline.scheduleVersion);
    assert.equal(typeof after.creditsUsed, "number");
    assert.ok(after.creditsUsed >= 1);
  });
});
