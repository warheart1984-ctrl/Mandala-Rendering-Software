/**
 * spo.test.mjs — Semantic Perception Object schema + hash-linked validation.
 * Proves an SPO with a matching source_hash validates and a mismatched one is
 * rejected, and that the perception provider is honestly marked skeleton.
 */
import assert from "node:assert/strict";
import test from "node:test";

import { encodeCPO } from "../cpo.mjs";
import { makeSPO, validateSPO, spoMatchesCPO, skeletonProvider } from "../spo.mjs";

function tinyCPO(seed = 0) {
  const width = 4;
  const height = 4;
  const rgba = Buffer.alloc(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    rgba[i * 4] = (i * 40 + seed) & 255;
    rgba[i * 4 + 1] = (i * 15 + seed) & 255;
    rgba[i * 4 + 2] = seed & 255;
    rgba[i * 4 + 3] = 255;
  }
  return encodeCPO(rgba, width, height);
}

test("makeSPO stamps a skeleton provider and links by hash", () => {
  const cpo = tinyCPO(1);
  const spo = makeSPO({
    cpo,
    regions: [{ region: "r0", label: "sky", confidence: 0.9, bbox: [0, 0, 1, 0.4] }],
  });
  assert.equal(spo.type, "semantic-overlay");
  assert.equal(spo.source_hash, `sha256:${cpo.payload_hash}`);
  assert.equal(spo.provider.status, "skeleton");
  assert.equal(spo.provider.model, null);
});

test("validateSPO ACCEPTS a matching source_hash", () => {
  const cpo = tinyCPO(2);
  const spo = makeSPO({
    cpo,
    regions: [{ region: "r0", label: "foreground", confidence: 0.5, bbox: [0.1, 0.1, 0.5, 0.5] }],
  });
  const res = validateSPO(spo, cpo);
  assert.deepEqual(res, { valid: true, errors: [] });
  assert.equal(spoMatchesCPO(spo, cpo), true);
});

test("validateSPO REJECTS a mismatched source_hash", () => {
  const cpoA = tinyCPO(3);
  const cpoB = tinyCPO(4);
  assert.notEqual(cpoA.payload_hash, cpoB.payload_hash);
  const spo = makeSPO({ cpo: cpoA, regions: [] });
  const res = validateSPO(spo, cpoB);
  assert.equal(res.valid, false);
  assert.ok(res.errors.some((e) => e.includes("does not match CPO")));
  assert.equal(spoMatchesCPO(spo, cpoB), false);
});

test("validateSPO catches malformed regions", () => {
  const cpo = tinyCPO(5);
  const spo = makeSPO({
    cpo,
    regions: [
      { region: "bad", label: "", confidence: 2, bbox: [0, 0, 2, 0.5] },
    ],
  });
  const res = validateSPO(spo, cpo);
  assert.equal(res.valid, false);
  assert.ok(res.errors.some((e) => e.includes("label")));
  assert.ok(res.errors.some((e) => e.includes("confidence")));
  assert.ok(res.errors.some((e) => e.includes("bbox")));
});

test("validateSPO rejects an out-of-format source_hash", () => {
  const spo = {
    type: "semantic-overlay",
    schema_version: "1.0.0",
    source_hash: "notahash",
    regions: [],
    provider: skeletonProvider(),
  };
  const res = validateSPO(spo);
  assert.equal(res.valid, false);
  assert.ok(res.errors.some((e) => e.includes("source_hash")));
});
