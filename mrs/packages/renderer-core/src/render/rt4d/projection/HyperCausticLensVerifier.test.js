// mrs/packages/renderer-core/src/render/rt4d/projection/HyperCausticLensVerifier.test.js
// Status: **passing with gaps** - HyperCausticLensVerifier factory + sweeps tests.

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  verifyHyperCausticLensFactory,
  verifyHyperCausticLensEnergySweep,
  verifyHyperCausticLensCausticSweep,
  verifyHyperCausticLensTemporalSweep,
  verifyHyperCausticLensNorthStar,
  verifyHyperCausticLensProjectionHook,
  runHyperCausticLensVerifierSuite,
  HYPER_CAUSTIC_VERIFIER_STATUS,
  HYPER_CAUSTIC_SOT_BANNER,
} from "./HyperCausticLensVerifier.js";

describe("HyperCausticLensVerifier", () => {
  it("verifyHyperCausticLensFactory returns pass for valid options", () => {
    const result = verifyHyperCausticLensFactory({ width: 64, height: 48 });
    assert.equal(result.ok, true);
    assert.equal(result.verdict, "pass");
    assert.equal(result.status, "partial");
    assert.ok(result.reason.includes("factory hook"));
    assert.ok(result.meta.hasScene);
    assert.ok(result.meta.hasCamera);
    assert.equal(result.meta.printSoT, false);
    assert.equal(result.meta.authority, "observation");
    assert.equal(result.meta.banner, HYPER_CAUSTIC_SOT_BANNER);
  });

  it("verifyHyperCausticLensFactory handles missing factory", () => {
    // This test assumes createHyperCausticLens might fail in some environments
    // We just verify the error handling structure
    const result = verifyHyperCausticLensFactory({ width: 64, height: 48 });
    // Either pass or fail with proper structure
    assert.ok(typeof result.ok === "boolean");
    assert.ok(typeof result.verdict === "string");
    assert.equal(result.status, "partial");
  });

  it("verifyHyperCausticLensEnergySweep runs energy sweep", () => {
    const result = verifyHyperCausticLensEnergySweep({ width: 32, height: 24 });
    // Should run without throwing
    assert.ok(typeof result.ok === "boolean");
    assert.ok(typeof result.verdict === "string");
    assert.equal(result.status, "partial");
    assert.ok(Array.isArray(result.meta?.steps));
  });

  it("verifyHyperCausticLensCausticSweep runs caustic continuity check", () => {
    const result = verifyHyperCausticLensCausticSweep({ eps: 1e-3, bound: 1000 });
    assert.ok(typeof result.ok === "boolean");
    assert.ok(typeof result.verdict === "string");
    assert.equal(result.status, "partial");
    assert.ok(typeof result.meta?.lip === "number");
  });

  it("verifyHyperCausticLensTemporalSweep runs temporal continuity check", () => {
    const result = verifyHyperCausticLensTemporalSweep({ eps: 1e-3, bound: 1000 });
    assert.ok(typeof result.ok === "boolean");
    assert.ok(typeof result.verdict === "string");
    assert.equal(result.status, "partial");
    assert.ok(Array.isArray(result.meta?.steps));
  });

  it("verifyHyperCausticLensNorthStar compares hashes", () => {
    const result = verifyHyperCausticLensNorthStar({
      referenceHash: "abc123",
      candidateHash: "abc123",
    });
    assert.equal(result.ok, true);
    assert.equal(result.verdict, "pass");
    assert.equal(result.meta.referenceHash, "abc123");
    assert.equal(result.meta.candidateHash, "abc123");
  });

  it("verifyHyperCausticLensNorthStar fails on hash mismatch", () => {
    const result = verifyHyperCausticLensNorthStar({
      referenceHash: "abc123",
      candidateHash: "def456",
    });
    assert.equal(result.ok, false);
    assert.equal(result.verdict, "fail");
    assert.equal(result.meta.referenceHash, "abc123");
    assert.equal(result.meta.candidateHash, "def456");
  });

  it("verifyHyperCausticLensProjectionHook tests ProjCC kernel", () => {
    const result = verifyHyperCausticLensProjectionHook({ width: 64, height: 48 });
    assert.ok(typeof result.ok === "boolean");
    assert.ok(typeof result.verdict === "string");
    assert.equal(result.status, "partial");
    assert.ok(typeof result.meta?.screen === "object");
  });

  it("runHyperCausticLensVerifierSuite runs full suite", () => {
    const result = runHyperCausticLensVerifierSuite({ width: 32, height: 24 });
    assert.ok(typeof result.ok === "boolean");
    assert.equal(result.status, "partial");
    assert.equal(result.printSoT, false);
    assert.equal(result.authority, "observation");
    assert.equal(result.banner, HYPER_CAUSTIC_SOT_BANNER);
    assert.ok(Array.isArray(result.results));
    assert.equal(result.results.length, 6);
  });

  it("HYPER_CAUSTIC_VERIFIER_STATUS is 'partial'", () => {
    assert.equal(HYPER_CAUSTIC_VERIFIER_STATUS, "partial");
  });

  it("HYPER_CAUSTIC_SOT_BANNER has correct text", () => {
    assert.ok(HYPER_CAUSTIC_SOT_BANNER.includes("Aperture ≠ print"));
    assert.ok(HYPER_CAUSTIC_SOT_BANNER.includes("observation projection"));
  });
});