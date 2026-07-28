/**
 * Hyper-Caustic Lens north-star / verifier — real tolerance asserts.
 * Soft-skip removed from default path. Aperture ≠ print.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  verifyHyperCausticLensFactory,
  verifyHyperCausticLensNorthStar,
  verifyHyperCausticLensProjectionHook,
  verifyHyperCausticLensEnergySweep,
  verifyHyperCausticLensCausticSweep,
  verifyHyperCausticLensTemporalSweep,
  runHyperCausticLensVerifierSuite,
  HYPER_CAUSTIC_VERIFIER_STATUS,
} from "../projection/index.js";

describe("HyperCausticLensVerifier", () => {
  it("factory hook loads official validation scene", () => {
    const r = verifyHyperCausticLensFactory({ width: 64, height: 48 });
    assert.equal(r.ok, true);
    assert.equal(r.verdict, "pass");
    assert.equal(r.status, HYPER_CAUSTIC_VERIFIER_STATUS);
    assert.equal(r.meta.printSoT, false);
  });

  it("projection structural hook yields finite screen sample", () => {
    const r = verifyHyperCausticLensProjectionHook({ width: 64, height: 48 });
    assert.equal(r.ok, true);
    assert.equal(r.verdict, "pass");
    assert.equal(r.meta.printSoT, false);
  });

  it("energy sweep asserts finite bounded energy proxy", () => {
    const r = verifyHyperCausticLensEnergySweep({ width: 64, height: 48 });
    assert.equal(r.verdict, "pass");
    assert.equal(r.ok, true);
    assert.equal(r.meta.printSoT, false);
  });

  it("caustic kappa sweep asserts local continuity", () => {
    const r = verifyHyperCausticLensCausticSweep({ width: 64, height: 48 });
    assert.equal(r.verdict, "pass");
    assert.equal(r.ok, true);
  });

  it("temporal tau sweep asserts local continuity", () => {
    const r = verifyHyperCausticLensTemporalSweep({ width: 64, height: 48 });
    assert.equal(r.verdict, "pass");
    assert.equal(r.ok, true);
  });

  it("north-star runs real sweeps (no soft-skip) without hash dataset", () => {
    const r = verifyHyperCausticLensNorthStar({ width: 64, height: 48 });
    assert.equal(r.verdict, "pass");
    assert.equal(r.ok, true);
    assert.notEqual(r.verdict, "soft_skip");
    assert.equal(r.meta.printSoT, false);
    assert.equal(r.meta.authority, "observation");
  });

  it("north-star passes when hashes match", () => {
    const r = verifyHyperCausticLensNorthStar({
      referenceHash: "abc",
      candidateHash: "abc",
    });
    assert.equal(r.verdict, "pass");
    assert.equal(r.ok, true);
  });

  it("north-star fails when hashes differ", () => {
    const r = verifyHyperCausticLensNorthStar({
      referenceHash: "abc",
      candidateHash: "xyz",
    });
    assert.equal(r.verdict, "fail");
    assert.equal(r.ok, false);
  });

  it("suite ok without soft-skip results", () => {
    const suite = runHyperCausticLensVerifierSuite({ width: 64, height: 48 });
    assert.equal(suite.ok, true);
    assert.equal(suite.status, "partial");
    assert.equal(suite.printSoT, false);
    assert.ok(!suite.results.some((r) => r.verdict === "soft_skip"));
    assert.ok(suite.results.every((r) => r.verdict === "pass"));
  });
});
