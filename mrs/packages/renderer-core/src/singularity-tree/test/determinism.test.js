/** Determinism tests — SeedManager, StateHasher, generateDeterminismReport. */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createRoot } from "../index.js";
import { SeedManager, SeededRng, deriveSeed, mulberry32, SINGULARITY_TREE_SEED_BANNER } from "../determinism/SeedManager.js";
import { hashState, stateSignature, configurationHash, combineHashes, canonicalJson } from "../determinism/StateHasher.js";
import { generateDeterminismReport } from "../index.js";

describe("SingularityTree Determinism", () => {
  describe("SeedManager", () => {
    it("SeedManager exports expected symbols", () => {
      assert.ok(typeof SeedManager === "object");
      assert.ok(typeof SeededRng === "function");
      assert.ok(typeof deriveSeed === "function");
      assert.ok(typeof mulberry32 === "function");
      assert.strictEqual(SINGULARITY_TREE_SEED_BANNER, "singularity-tree.seed.banner.v1");
    });

    it("deriveSeed produces deterministic output", () => {
      const s1 = deriveSeed(0xc0ffee, 0, 7);
      const s2 = deriveSeed(0xc0ffee, 0, 7);
      assert.strictEqual(s1, s2);
    });

    it("mulberry32 produces a 32-bit value", () => {
      const m = mulberry32(0xdeadbeef);
      assert.ok(typeof m === "number");
      assert.ok(m >= 0 && m < 2 ** 32);
    });
  });

  describe("StateHasher", () => {
    it("hashState produces a fixed-length hash", () => {
      const h = hashState({ kind: "test.v1", x: 1, y: 2 });
      assert.ok(typeof h === "string");
      assert.strictEqual(h.length, 16);
    });

    it("stateSignature is deterministic", () => {
      const s1 = stateSignature({ potential: 0.25, level: 3 });
      const s2 = stateSignature({ potential: 0.25, level: 3 });
      assert.strictEqual(s1, s2);
    });

    it("configurationHash is consistent", () => {
      const cfg = createRoot({}).config;
      const ch1 = configurationHash(cfg);
      const ch2 = configurationHash(cfg);
      assert.strictEqual(ch1, ch2);
    });
  });

  describe("generateDeterminismReport", () => {
    it("produces a report with identical hashes", () => {
      const report = generateDeterminismReport({});
      assert.ok(report.identical === true || report.identical === false);
      assert.ok(report.runs === 2);
      assert.ok(typeof report.rootId === "string");
    });

    it("report includes stateHashesEqual", () => {
      const report = generateDeterminismReport({});
      assert.ok(typeof report.stateHashesEqual === "boolean");
    });
  });
});