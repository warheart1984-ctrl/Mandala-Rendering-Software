// mrs/packages/renderer-core/src/render/rt4d/proton/bloom.test.js
// Status: **partial** — applyBloom CPU separable Gaussian bloom tests.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyBloom } from './bloom.js';

test('applyBloom throws without width/height', () => {
  assert.throws(() => applyBloom(new Float32Array(16), 4));
  assert.throws(() => applyBloom(new Float32Array(16), 4, 4));
});

test('applyBloom preserves size', () => {
  const rgba = new Float32Array(4 * 8 * 8).fill(0.5);
  const out = applyBloom(rgba, 8, 8);
  assert.equal(out.length, 8 * 8 * 4);
});

test('applyBloom preserves alpha', () => {
  const rgba = new Float32Array(4 * 4 * 4);
  rgba[3] = 0.7;
  rgba[7] = 0.7;
  const out = applyBloom(rgba, 4, 4, { threshold: 0 });
  assert.ok(Math.abs(out[3] - 0.7) < 1e-6);
  assert.ok(Math.abs(out[7] - 0.7) < 1e-6);
});

test('applyBloom with zero threshold blooms everything', () => {
  const rgba = new Float32Array(4 * 4 * 4).fill(0.5);
  const out = applyBloom(rgba, 4, 4, { threshold: 0, strength: 1, radius: 1 });
  // With threshold=0, everything blooms, so output should be brighter
  assert.ok(out[0] > 0.5, 'should be brighter with threshold=0');
});

test('applyBloom with high threshold blooms nothing', () => {
  const rgba = new Float32Array(4 * 4 * 4).fill(0.5);
  const out = applyBloom(rgba, 4, 4, { threshold: 1.0, strength: 1 });
  // With threshold=1.0, nothing blooms (luminance=0.5 < 1.0)
  assert.equal(out[0], 0.5);
  assert.equal(out[1], 0.5);
  assert.equal(out[2], 0.5);
});

test('applyBloom preserves dark pixels with default threshold', () => {
  const rgba = new Float32Array(4 * 4 * 4).fill(0.1); // dark
  const out = applyBloom(rgba, 4, 4);
  // Default threshold=1.0, luminance=0.21 < 1.0, no bright pixels extracted
  // But blur kernel may spread slightly - check it's close to original
  assert.ok(Math.abs(out[0] - 0.1) < 0.01);
  assert.ok(Math.abs(out[1] - 0.1) < 0.01);
  assert.ok(Math.abs(out[2] - 0.1) < 0.01);
});

test('applyBloom with bright pixels produces output', () => {
  const rgba = new Float32Array(4 * 4 * 4).fill(0);
  // Make center pixel very bright
  const center = 4 * 8 + 2;
  rgba[center * 4] = 2.0; // R
  rgba[center * 4 + 1] = 2.0; // G
  rgba[center * 4 + 2] = 2.0; // B
  rgba[center * 4 + 3] = 1.0; // A

  const out = applyBloom(rgba, 4, 4, { threshold: 0.5, strength: 1, radius: 2 });
  // Output should be valid
  assert.ok(out.length === 4 * 4 * 4);
  // All values should be finite
  for (const v of out) assert.ok(Number.isFinite(v));
});

test('applyBloom with custom radius', () => {
  const rgba = new Float32Array(4 * 8 * 8).fill(0);
  const center = 4 * 32 + 4;
  rgba[center * 4] = 10;
  rgba[center * 4 + 1] = 10;
  rgba[center * 4 + 2] = 10;

  const out1 = applyBloom(rgba, 8, 8, { threshold: 0, strength: 1, radius: 1 });
  const out2 = applyBloom(rgba, 8, 8, { threshold: 0, strength: 1, radius: 4 });

  // Larger radius should spread bloom further
  const dist1 = Math.abs(out1[center * 4 + 1]);
  const dist2 = Math.abs(out2[center * 4 + 1]);
  // Just check both run without error and produce different results
  assert.ok(dist1 !== dist2 || out1[0] !== out2[0]);
});

test('applyBloom with zero strength adds nothing', () => {
  const rgba = new Float32Array(4 * 4 * 4).fill(0.5);
  const out = applyBloom(rgba, 4, 4, { threshold: 0, strength: 0 });
  assert.equal(out[0], 0.5);
  assert.equal(out[1], 0.5);
  assert.equal(out[2], 0.5);
});

test('applyBloom preserves non-bloomed pixels approximately', () => {
  const rgba = new Float32Array(4 * 2 * 2);
  rgba[0] = 0; rgba[1] = 0; rgba[2] = 0; rgba[3] = 1;
  rgba[4] = 1; rgba[5] = 1; rgba[6] = 1; rgba[7] = 1;
  rgba[8] = 0.5; rgba[9] = 0.5; rgba[10] = 0.5; rgba[11] = 1;
  rgba[12] = 0; rgba[13] = 0; rgba[14] = 0; rgba[15] = 1;

  const out = applyBloom(rgba, 2, 2, { threshold: 0.9, strength: 1 });
  // First pixel (black) stays near black
  assert.ok(out[0] < 0.5);
  assert.ok(out[1] < 0.5);
  assert.ok(out[2] < 0.5);
  // Second pixel (white) blooms
  assert.ok(out[4] > 1);
  // Third pixel (gray) below threshold
  assert.ok(Math.abs(out[8] - 0.5) < 0.5);
});