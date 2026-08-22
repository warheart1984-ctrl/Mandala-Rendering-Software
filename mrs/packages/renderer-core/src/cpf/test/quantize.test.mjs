/**
 * quantize.test.mjs — OPTIONAL lossy quantizer. Proves it is deterministic,
 * clearly lossy, reduces the color count, and that CPO round-trip is exact
 * w.r.t. the QUANTIZED buffer (lossless after quantization).
 */
import assert from "node:assert/strict";
import test from "node:test";

import { quantizeRgbaBitDepth } from "../quantize.mjs";
import { encodeCPO, decodeCPO } from "../cpo.mjs";

function gradient(width, height) {
  const rgba = Buffer.alloc(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const o = (y * width + x) * 4;
      rgba[o] = (x * 255) / (width - 1);
      rgba[o + 1] = (y * 255) / (height - 1);
      rgba[o + 2] = ((x + y) * 255) / (width + height - 2);
      rgba[o + 3] = 255;
    }
  }
  return rgba;
}

test("quantizer is deterministic and marked lossy", () => {
  const rgba = gradient(16, 16);
  const a = quantizeRgbaBitDepth(rgba, { bits: 3 });
  const b = quantizeRgbaBitDepth(Buffer.from(rgba), { bits: 3 });
  assert.equal(a.lossy, true);
  assert.equal(a.method, "uniform-bit-depth");
  assert.deepEqual(Buffer.from(a.rgba), Buffer.from(b.rgba));
});

test("quantizer preserves endpoints and reduces distinct colors", () => {
  const rgba = gradient(32, 32);
  const before = new Set();
  for (let i = 0; i < rgba.length; i += 4) before.add(`${rgba[i]},${rgba[i + 1]},${rgba[i + 2]}`);
  const { rgba: q } = quantizeRgbaBitDepth(rgba, { bits: 2 });
  const after = new Set();
  for (let i = 0; i < q.length; i += 4) after.add(`${q[i]},${q[i + 1]},${q[i + 2]}`);
  assert.ok(after.size < before.size, "quantization reduces color count");
  // 0 and 255 must survive bit replication so extremes are stable.
  assert.equal(quantizeRgbaBitDepth(Buffer.from([0, 255, 0, 255]), { bits: 3 }).rgba[0], 0);
  assert.equal(quantizeRgbaBitDepth(Buffer.from([255, 0, 0, 255]), { bits: 3 }).rgba[0], 255);
});

test("CPO round-trip is exact w.r.t. the quantized buffer (lossless-after-quantize)", () => {
  const width = 24;
  const height = 24;
  const { rgba: q } = quantizeRgbaBitDepth(gradient(width, height), { bits: 4 });
  const cpo = encodeCPO(q, width, height);
  const { rgba: decoded } = decodeCPO(cpo);
  assert.deepEqual(Buffer.from(decoded), Buffer.from(q));
});

test("bits=8 is a no-op and bad bits throw", () => {
  const rgba = gradient(8, 8);
  const { rgba: q } = quantizeRgbaBitDepth(rgba, { bits: 8 });
  assert.deepEqual(Buffer.from(q), rgba);
  assert.throws(() => quantizeRgbaBitDepth(rgba, { bits: 0 }), /bits must be/);
  assert.throws(() => quantizeRgbaBitDepth(rgba, { bits: 9 }), /bits must be/);
});
