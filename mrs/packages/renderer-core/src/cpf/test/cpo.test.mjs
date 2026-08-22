/**
 * cpo.test.mjs — CPO codec: lossless round-trip, determinism, RLE correctness,
 * palette ordering, hash integrity, and lossless round-trip through a real PNG
 * (produced by the codec's own alpha-preserving encoder).
 */
import assert from "node:assert/strict";
import test from "node:test";

import {
  encodeCPO,
  decodeCPO,
  validateCPO,
  encodeRleV1,
  decodeRleV1,
  encodeCPOFromPng,
  decodeCPOToPng,
} from "../cpo.mjs";
import { encodeRgbaPng, decodePngToRgba } from "../png.mjs";

/** Build a small deterministic RGBA image. */
function makeImage(width, height, fn) {
  const rgba = Buffer.alloc(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const [r, g, b, a] = fn(x, y);
      const o = (y * width + x) * 4;
      rgba[o] = r; rgba[o + 1] = g; rgba[o + 2] = b; rgba[o + 3] = a;
    }
  }
  return rgba;
}

test("RLE-v1 encode/decode is exact and matches the documented grammar", () => {
  const indices = [0, 0, 0, 1, 1, 0, 2, 2, 2, 2];
  const rle = encodeRleV1(indices);
  assert.equal(rle, "3:0,2:1,1:0,4:2");
  const back = decodeRleV1(rle);
  assert.deepEqual(Array.from(back), indices);
});

test("RLE-v1 handles empty stream", () => {
  assert.equal(encodeRleV1([]), "");
  assert.deepEqual(Array.from(decodeRleV1("")), []);
});

test("RLE-v1 rejects malformed runs", () => {
  assert.throws(() => decodeRleV1("abc"), /malformed run|bad count/);
  assert.throws(() => decodeRleV1("0:1"), /bad count/);
  assert.throws(() => decodeRleV1("2:-1"), /bad index/);
});

test("lossless round-trip on a hand-built small image", () => {
  const width = 4;
  const height = 2;
  // Two colors: black and white, in a deterministic pattern.
  const rgba = makeImage(width, height, (x) => (x < 2 ? [0, 0, 0, 255] : [255, 255, 255, 255]));
  const cpo = encodeCPO(rgba, width, height);
  assert.equal(cpo.protocol, "mandala-link/1");
  assert.equal(cpo.type, "image");
  assert.equal(cpo.subtype, "canonical-indexed-grid");
  assert.equal(cpo.payload.encoding, "rle-v1");
  const { rgba: decoded, width: dw, height: dh } = decodeCPO(cpo);
  assert.equal(dw, width);
  assert.equal(dh, height);
  assert.deepEqual(Buffer.from(decoded), rgba);
});

test("palette ordering is sorted ascending by (R,G,B,A) key", () => {
  const width = 3;
  const height = 1;
  // Insert colors out of sorted order: white, black, mid.
  const rgba = makeImage(width, height, (x) => {
    if (x === 0) return [255, 255, 255, 255];
    if (x === 1) return [0, 0, 0, 255];
    return [128, 0, 0, 255];
  });
  const cpo = encodeCPO(rgba, width, height);
  assert.deepEqual(cpo.payload.palette, [
    [0, 0, 0, 255],
    [128, 0, 0, 255],
    [255, 255, 255, 255],
  ]);
  // Indices reference the sorted palette, not first-appearance order.
  assert.equal(cpo.payload.grid, "1:2,1:0,1:1");
});

test("determinism — encode twice yields identical payload_hash + full packet", () => {
  const width = 16;
  const height = 16;
  const rgba = makeImage(width, height, (x, y) => [
    (x * 17) & 255,
    (y * 31) & 255,
    ((x + y) * 7) & 255,
    255,
  ]);
  const a = encodeCPO(rgba, width, height);
  const b = encodeCPO(Buffer.from(rgba), width, height);
  assert.equal(a.payload_hash, b.payload_hash);
  assert.equal(a.payload.palette_hash, b.payload.palette_hash);
  assert.equal(a.payload.grid_hash, b.payload.grid_hash);
  assert.equal(JSON.stringify(a), JSON.stringify(b));
});

test("validateCPO passes for a genuine packet and catches tampering", () => {
  const rgba = makeImage(4, 4, (x, y) => [x * 60, y * 60, 0, 255]);
  const cpo = encodeCPO(rgba, 4, 4);
  assert.deepEqual(validateCPO(cpo), { valid: true, errors: [] });

  // Tamper with the grid without updating the hash → detected.
  const tampered = JSON.parse(JSON.stringify(cpo));
  tampered.payload.grid = "16:0";
  const res = validateCPO(tampered);
  assert.equal(res.valid, false);
  assert.ok(res.errors.some((e) => e.includes("grid_hash")));
});

test("lossless round-trip through a real PNG produced by the codec", () => {
  const width = 12;
  const height = 9;
  // A palette of a few colors incl. non-opaque alpha to prove alpha survives.
  const palette = [
    [10, 20, 30, 255],
    [200, 40, 40, 128],
    [40, 200, 40, 255],
    [40, 40, 200, 200],
  ];
  const rgba = makeImage(width, height, (x, y) => palette[(x + y) % palette.length]);
  const png = encodeRgbaPng(width, height, rgba);

  // PNG decodes back to the exact RGBA (alpha preserved).
  const dec = decodePngToRgba(png);
  assert.equal(dec.width, width);
  assert.equal(dec.height, height);
  assert.deepEqual(Buffer.from(dec.rgba), rgba);

  // CPO from that PNG round-trips exactly, and re-emitted PNG matches byte-for-byte.
  const cpo = encodeCPOFromPng(png);
  assert.deepEqual(validateCPO(cpo), { valid: true, errors: [] });
  const { rgba: decoded } = decodeCPO(cpo);
  assert.deepEqual(Buffer.from(decoded), rgba);
  const png2 = decodeCPOToPng(cpo);
  assert.ok(Buffer.compare(png, png2) === 0, "re-encoded PNG must be byte-identical");
});

test("single-color image encodes as one run", () => {
  const rgba = makeImage(8, 8, () => [77, 88, 99, 255]);
  const cpo = encodeCPO(rgba, 8, 8);
  assert.equal(cpo.payload.palette.length, 1);
  assert.equal(cpo.payload.grid, "64:0");
  const { rgba: decoded } = decodeCPO(cpo);
  assert.deepEqual(Buffer.from(decoded), rgba);
});
