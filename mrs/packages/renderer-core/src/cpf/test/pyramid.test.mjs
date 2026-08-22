/**
 * pyramid.test.mjs — token pyramid + queryable perception. Uses a constructed
 * pattern with a known coarse structure so inspectGrid / inspectRegion outputs
 * are checked against expected sub-grids, plus determinism + hash-addressing.
 */
import assert from "node:assert/strict";
import test from "node:test";

import { encodeCPO } from "../cpo.mjs";
import {
  buildPyramid,
  inspectGrid,
  inspectRegion,
  FULL_FRAME_LEVELS,
  REGION_LEVELS,
  CPOStore,
} from "../pyramid.mjs";

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

// A 64x64 image split into four solid quadrants: TL=c0, TR=c1, BL=c2, BR=c3.
// The sorted palette makes c0<c1<c2<c3 the indices 0..3, so the coarse grid at
// any level must show four equal quadrant blocks of indices 0,1,2,3.
const QW = 64;
const QH = 64;

// Colors whose sorted order is deterministic and matches quadrant labels.
// key = (R<<24)|(G<<16)|(B<<8)|A. Ascending R gives TL<TR<BL<BR → indices 0..3.
const colors = [
  [0, 0, 0, 255],   // TL
  [10, 0, 0, 255],  // TR
  [20, 0, 0, 255],  // BL
  [30, 0, 0, 255],  // BR
];

function quadImage() {
  return makeImage(QW, QH, (x, y) => {
    const top = y < QH / 2;
    const left = x < QW / 2;
    if (top && left) return colors[0];
    if (top && !left) return colors[1];
    if (!top && left) return colors[2];
    return colors[3];
  });
}

test("buildPyramid produces all full-frame levels with hashes", () => {
  const cpo = encodeCPO(quadImage(), QW, QH);
  const pyr = buildPyramid(cpo);
  assert.equal(pyr.source_hash, `sha256:${cpo.payload_hash}`);
  for (const level of FULL_FRAME_LEVELS) {
    assert.ok(pyr.levels[level], `level ${level} present`);
    assert.equal(pyr.levels[level].indices.length, level * level);
    assert.ok(/^[0-9a-f]{64}$/.test(pyr.levels[level].level_hash));
  }
});

test("inspectGrid returns the expected quadrant structure at level 8", () => {
  const cpo = encodeCPO(quadImage(), QW, QH);
  const g = inspectGrid(cpo, 8);
  assert.equal(g.width, 8);
  assert.equal(g.height, 8);
  // Every cell in a quadrant should carry that quadrant's palette index.
  for (let gy = 0; gy < 8; gy++) {
    for (let gx = 0; gx < 8; gx++) {
      const top = gy < 4;
      const left = gx < 4;
      const expected = top && left ? 0 : top && !left ? 1 : !top && left ? 2 : 3;
      assert.equal(g.indices[gy * 8 + gx], expected, `cell (${gx},${gy})`);
    }
  }
});

test("inspectGrid rejects non-standard levels", () => {
  const cpo = encodeCPO(quadImage(), QW, QH);
  assert.throws(() => inspectGrid(cpo, 10), /level must be one of/);
  assert.throws(() => inspectGrid(cpo, 256), /level must be one of/); // 256 is crop-only
});

test("inspectRegion returns a uniform sub-grid for a single-quadrant crop", () => {
  const cpo = encodeCPO(quadImage(), QW, QH);
  // Top-left quadrant [0,0.5) x [0,0.5) is entirely color index 0.
  const r = inspectRegion(cpo, 0, 0, 0.5, 0.5, 16);
  assert.equal(r.indices.length, 16 * 16);
  assert.ok(r.indices.every((v) => v === 0), "TL crop is all index 0");
  // Bottom-right quadrant is entirely index 3.
  const r2 = inspectRegion(cpo, 0.5, 0.5, 0.5, 0.5, 16);
  assert.ok(r2.indices.every((v) => v === 3), "BR crop is all index 3");
});

test("inspectRegion on the center 50% crop shows all four quadrants", () => {
  const cpo = encodeCPO(quadImage(), QW, QH);
  // Center crop [0.25,0.75) covers a 2x2 quadrant layout.
  const r = inspectRegion(cpo, 0.25, 0.25, 0.5, 0.5, 8);
  for (let gy = 0; gy < 8; gy++) {
    for (let gx = 0; gx < 8; gx++) {
      const top = gy < 4;
      const left = gx < 4;
      const expected = top && left ? 0 : top && !left ? 1 : !top && left ? 2 : 3;
      assert.equal(r.indices[gy * 8 + gx], expected, `center cell (${gx},${gy})`);
    }
  }
});

test("inspectRegion supports level 256 (crop-only) and validates coords", () => {
  const cpo = encodeCPO(quadImage(), QW, QH);
  const r = inspectRegion(cpo, 0, 0, 0.5, 0.5, 256);
  assert.equal(r.indices.length, 256 * 256);
  assert.ok(REGION_LEVELS.includes(256));
  assert.throws(() => inspectRegion(cpo, 0, 0, 1.5, 0.5, 8), /must be in \[0,1\]/);
  assert.throws(() => inspectRegion(cpo, 0.8, 0, 0.5, 0.5, 8), /exceeds image bounds/);
});

test("queries are deterministic and hash-addressable via CPOStore", () => {
  const cpo = encodeCPO(quadImage(), QW, QH);
  const a = inspectRegion(cpo, 0.1, 0.2, 0.3, 0.3, 32);
  const b = inspectRegion(cpo, 0.1, 0.2, 0.3, 0.3, 32);
  assert.equal(a.region_hash, b.region_hash);
  assert.equal(a.grid, b.grid);

  const store = new CPOStore();
  const hash = store.put(cpo);
  const byHash = inspectRegion(hash, 0.1, 0.2, 0.3, 0.3, 32, { store });
  assert.equal(byHash.region_hash, a.region_hash);
  // Without a store, a bare hash must throw (no hidden global state).
  assert.throws(() => inspectRegion(hash, 0.1, 0.2, 0.3, 0.3, 32), /no \{ store \} resolver/);
});
