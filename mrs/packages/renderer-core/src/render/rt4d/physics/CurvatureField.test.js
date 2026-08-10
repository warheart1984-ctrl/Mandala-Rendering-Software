// mrs/packages/renderer-core/src/render/rt4d/physics/CurvatureField.test.js
// Status: **partial** — CurvatureField Gaussian profile + WaveField coupling tests.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CurvatureField } from './CurvatureField.js';
import { WaveField } from './WaveField.js';

test('CurvatureField constructs with defaults', () => {
  const cf = new CurvatureField();
  assert.equal(cf.k0, 0.0);
  assert.deepEqual(cf.center, { x: 0, y: 0, z: 0 });
  assert.equal(cf.sigma, 1.0);
  assert.equal(cf.alpha, 0.0);
  assert.equal(cf.beta, 0.0);
  assert.equal(cf.waveField, null);
});

test('CurvatureField constructs with custom config', () => {
  const cf = new CurvatureField({
    k0: 2.5,
    center: { x: 1, y: 2, z: 3 },
    sigma: 0.5,
    alpha: 0.1,
    beta: 0.5,
  });
  assert.equal(cf.k0, 2.5);
  assert.deepEqual(cf.center, { x: 1, y: 2, z: 3 });
  assert.equal(cf.sigma, 0.5);
  assert.equal(cf.alpha, 0.1);
  assert.equal(cf.beta, 0.5);
});

test('baseK computes Gaussian profile at center', () => {
  const cf = new CurvatureField({ k0: 1.0, sigma: 1.0 });
  const k = cf.baseK(0, 0, 0);
  assert.ok(Math.abs(k - 1.0) < 1e-10, 'k should be k0 at center');
});

test('baseK decays with distance', () => {
  const cf = new CurvatureField({ k0: 1.0, sigma: 1.0 });
  const k0 = cf.baseK(0, 0, 0);
  const k1 = cf.baseK(2, 0, 0); // distance 2
  assert.ok(k1 < k0, 'curvature should decay with distance');
  assert.ok(k1 > 0, 'should remain positive');
});

test('kWithWave returns base when no waveField', () => {
  const cf = new CurvatureField({ k0: 2.0 });
  const k = cf.kWithWave(0, 0, 0);
  assert.equal(k, 2.0);
});

test('kWithWave couples to WaveField', () => {
  const wf = new WaveField({ gridSize: { nx: 8, ny: 8, nz: 8 } });
  wf.impulse(4, 4, 4, 1.0);
  const cf = new CurvatureField({ k0: 1.0, beta: 0.5, waveField: wf });
  const k = cf.kWithWave(0.5, 0.5, 0.5); // maps to grid index ~4,4,4
  // baseK at (0.5,0.5,0.5) with center at (0,0,0) should be positive
  // psi at impulse location should be positive, so k = base * (1 + beta * psi) > base
  const base = cf.baseK(0.5, 0.5, 0.5);
  assert.ok(k >= base, 'wave coupling should increase curvature when psi > 0');
});

test('bendDirection modifies direction based on curvature', () => {
  const cf = new CurvatureField({ alpha: 0.5, k0: 1.0 });
  const pos = { x: 0, y: 0, z: 0 };
  const dir = { x: 1, y: 0, z: 0 };
  const fieldDir = { x: 0, y: 1, z: 0 };
  const bent = cf.bendDirection(pos, dir, fieldDir);
  const len = Math.hypot(bent.x, bent.y, bent.z);
  assert.ok(Math.abs(len - 1.0) < 1e-10, 'should return normalized direction');
  // With k0=1, alpha=0.5 at center, bend should be in fieldDir direction
  assert.ok(bent.y > 0, 'should bend toward fieldDir');
});

test('bendDirection handles zero-length direction', () => {
  const cf = new CurvatureField({ alpha: 0.5, k0: 1.0 });
  const bent = cf.bendDirection({ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 0 }, { x: 1, y: 0, z: 0 });
  // With k0=1 at center, curvature should bend toward fieldDir even with zero input dir
  const len = Math.hypot(bent.x, bent.y, bent.z);
  assert.ok(len > 0, 'should return valid direction');
  assert.ok(bent.x > 0, 'should bend toward fieldDir.x');
});

test('sample returns zero tensor (stub)', () => {
  const cf = new CurvatureField();
  const s = cf.sample({ x: 0, y: 0, z: 0 });
  assert.deepEqual(s, { kxx: 0, kyy: 0, kzz: 0 });
});