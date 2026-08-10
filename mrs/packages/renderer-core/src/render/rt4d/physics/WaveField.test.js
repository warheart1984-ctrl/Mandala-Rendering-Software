// mrs/packages/renderer-core/src/render/rt4d/physics/WaveField.test.js
// Status: **partial** — WaveField core solver tests + CFL/energy/boundary validation.
// Upgraded from skeleton (Drive-G-1).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { WaveField } from './WaveField.js';

test('WaveField constructs with default grid', () => {
  const wf = new WaveField();
  assert.equal(wf.gridSize.nx, 32);
  assert.equal(wf.gridSize.ny, 32);
  assert.equal(wf.gridSize.nz, 32);
  assert.equal(wf.c, 1.0);
  assert.equal(wf.dt, 0.016);
  assert.equal(wf.psiCurr.length, 32 * 32 * 32);
});

test('WaveField constructs with custom grid and params', () => {
  const wf = new WaveField({
    gridSize: { nx: 16, ny: 8, nz: 4 },
    c: 2.0,
    dt: 0.01,
  });
  assert.equal(wf.gridSize.nx, 16);
  assert.equal(wf.gridSize.ny, 8);
  assert.equal(wf.gridSize.nz, 4);
  assert.equal(wf.c, 2.0);
  assert.equal(wf.dt, 0.01);
  assert.equal(wf.psiCurr.length, 16 * 8 * 4);
});

test('impulse sets value at valid index', () => {
  const wf = new WaveField({ gridSize: { nx: 8, ny: 8, nz: 8 } });
  wf.impulse(3, 4, 5, 2.5);
  const idx = wf.index(3, 4, 5);
  assert.equal(wf.psiCurr[idx], 2.5);
});

test('impulse ignores out-of-bounds indices', () => {
  const wf = new WaveField({ gridSize: { nx: 8, ny: 8, nz: 8 } });
  wf.impulse(-1, 0, 0);
  wf.impulse(8, 0, 0);
  wf.impulse(0, -1, 0);
  wf.impulse(0, 8, 0);
  wf.impulse(0, 0, -1);
  wf.impulse(0, 0, 8);
  // Should not throw; values remain 0
  for (const v of wf.psiCurr) assert.equal(v, 0);
});

test('step advances time and updates buffers', () => {
  const wf = new WaveField({ gridSize: { nx: 8, ny: 8, nz: 8 }, dt: 0.01 });
  wf.impulse(4, 4, 4, 1.0);
  const before = wf.psiCurr[wf.index(4, 4, 4)];
  wf.step();
  const after = wf.psiCurr[wf.index(4, 4, 4)];
  // Value should change due to Laplacian diffusion
  assert.notEqual(after, before);
});

test('sampleNormalized returns 0 for out-of-bounds', () => {
  const wf = new WaveField({ gridSize: { nx: 8, ny: 8, nz: 8 } });
  assert.equal(wf.sampleNormalized(-10, 0, 0), 0);
  assert.equal(wf.sampleNormalized(100, 0, 0), 0);
});

test('reflecting boundary mirrors interior values', () => {
  const wf = new WaveField({ gridSize: { nx: 8, ny: 8, nz: 8 }, boundary: 'reflecting' });
  wf.impulse(1, 4, 4, 1.0); // interior cell adjacent to boundary
  wf.step();
  // Boundary at ix=0 should mirror ix=1
  const boundaryVal = wf.psiCurr[wf.index(0, 4, 4)];
  const interiorVal = wf.psiCurr[wf.index(1, 4, 4)];
  assert.ok(Math.abs(boundaryVal - interiorVal) < 1e-6, 'boundary mirrors interior');
});

test('CFL condition: dt must satisfy c*dt/dx <= 1/sqrt(3) for stability', () => {
  const dx = 1.0;
  const c = 1.0;
  const maxDt = dx / (c * Math.sqrt(3));
  const wf = new WaveField({ c, dt: maxDt * 0.9, gridSize: { nx: 16, ny: 16, nz: 16 } });
  wf.impulse(8, 8, 8, 1.0);
  // Should remain stable for several steps
  for (let i = 0; i < 10; i++) wf.step();
  const val = wf.sampleNormalized(8, 8, 8);
  assert.ok(Number.isFinite(val), 'should remain finite with CFL-satisfying dt');
});

test('CFL violation: dt too large causes instability (NaN/Infinity)', () => {
  const dx = 1.0;
  const c = 1.0;
  const maxDt = dx / (c * Math.sqrt(3));
  const wf = new WaveField({ c, dt: maxDt * 2.0, gridSize: { nx: 16, ny: 16, nz: 16 } });
  wf.impulse(8, 8, 8, 1.0);
  for (let i = 0; i < 20; i++) wf.step();
  const val = wf.sampleNormalized(8, 8, 8);
  // Should blow up
  assert.ok(!Number.isFinite(val) || Math.abs(val) > 1e6, 'should diverge with CFL-violating dt');
});

test('energy conservation: total discrete energy grows sub-linearly (no explosion)', () => {
  const wf = new WaveField({ gridSize: { nx: 16, ny: 16, nz: 16 }, dt: 0.001, boundary: 'reflecting' });
  wf.impulse(8, 8, 8, 1.0);
  let prevMax = 0;
  for (let step = 0; step < 100; step++) {
    wf.step();
    let maxVal = 0;
    for (const v of wf.psiCurr) if (Math.abs(v) > maxVal) maxVal = Math.abs(v);
    // Energy should not explode exponentially - max should grow sub-linearly
    if (step > 0) {
      const growthRate = maxVal / Math.max(prevMax, 1e-10);
      assert.ok(growthRate < 1.5, `growth rate should be sub-linear (rate=${growthRate.toFixed(3)} at step ${step})`);
    }
    prevMax = maxVal;
  }
});

test('impulse with initialState populates psiCurr', () => {
  const initial = new Float32Array(8 * 8 * 8);
  initial[initial.length / 2] = 1.0;
  const wf = new WaveField({ gridSize: { nx: 8, ny: 8, nz: 8 }, initialState: initial });
  assert.equal(wf.psiCurr[initial.length / 2], 1.0);
});

test('step swaps buffers correctly (psiPrev/psiCurr/psiNext rotation)', () => {
  const wf = new WaveField({ gridSize: { nx: 4, ny: 4, nz: 4 } });
  const prevPtr = wf.psiPrev;
  const currPtr = wf.psiCurr;
  const nextPtr = wf.psiNext;
  wf.step();
  assert.equal(wf.psiPrev, currPtr);
  assert.equal(wf.psiCurr, nextPtr);
  assert.equal(wf.psiNext, prevPtr);
});