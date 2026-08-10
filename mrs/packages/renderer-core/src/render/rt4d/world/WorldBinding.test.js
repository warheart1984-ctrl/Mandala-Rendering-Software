// mrs/packages/renderer-core/src/render/rt4d/world/WorldBinding.test.js
// Status: **partial** — bindWorld factory + WorldContext tests.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bindWorld } from './WorldBinding.js';
import { WaveField } from '../physics/WaveField.js';
import { CurvatureField } from '../physics/CurvatureField.js';
import { ForceField } from '../physics/ForceField.js';

test('bindWorld returns disabled context for null doc', () => {
  const ctx = bindWorld(null);
  assert.equal(ctx.waveEnabled, false);
  assert.equal(ctx.waveField, null);
  assert.ok(ctx.curvature instanceof CurvatureField);
  assert.ok(ctx.force instanceof ForceField);
  assert.deepEqual(ctx.worldDoc, {});
});

test('bindWorld returns disabled context for empty doc', () => {
  const ctx = bindWorld({});
  assert.equal(ctx.waveEnabled, false);
  assert.equal(ctx.waveField, null);
});

test('bindWorld creates WaveField when wave.enabled', () => {
  const ctx = bindWorld({
    wave: {
      enabled: true,
      gridSize: { nx: 16, ny: 16, nz: 16 },
      c: 1.5,
      dt: 0.01,
    },
  });
  assert.equal(ctx.waveEnabled, true);
  assert.ok(ctx.waveField instanceof WaveField);
  assert.equal(ctx.waveField.c, 1.5);
  assert.equal(ctx.waveField.dt, 0.01);
  assert.equal(ctx.waveField.gridSize.nx, 16);
});

test('bindWorld creates CurvatureField with waveField and beta', () => {
  const ctx = bindWorld({
    wave: { enabled: true, beta: 0.5 },
    curvature: { k0: 2.0, alpha: 0.1 },
  });
  assert.ok(ctx.curvature instanceof CurvatureField);
  assert.equal(ctx.curvature.k0, 2.0);
  assert.equal(ctx.curvature.alpha, 0.1);
  assert.equal(ctx.curvature.beta, 0.5);
  assert.equal(ctx.curvature.waveField, ctx.waveField);
});

test('bindWorld creates ForceField with gravity and wave coupling', () => {
  const ctx = bindWorld({
    wave: { enabled: true, gamma: 0.3, waveDir: { x: 1, y: 0, z: 0 } },
    physics: { gravity: { x: 0, y: -1.6, z: 0 } },
  });
  assert.ok(ctx.force instanceof ForceField);
  assert.equal(ctx.force.gamma, 0.3);
  assert.deepEqual(ctx.force.waveDir, { x: 1, y: 0, z: 0 });
  assert.equal(ctx.force.g.x, 0);
  assert.equal(ctx.force.g.y, -1.6);
  assert.equal(ctx.force.g.z, 0);
  assert.equal(ctx.force.waveField, ctx.waveField);
});

test('bindWorld uses default gravity when not specified', () => {
  const ctx = bindWorld({ wave: { enabled: true } });
  assert.equal(ctx.force.g.x, 0);
  assert.equal(ctx.force.g.y, -9.81);
  assert.equal(ctx.force.g.z, 0);
});

test('bindWorld uses default curvature config when not specified', () => {
  const ctx = bindWorld({ wave: { enabled: true } });
  assert.equal(ctx.curvature.k0, 0);
  assert.equal(ctx.curvature.sigma, 1.0);
  assert.equal(ctx.curvature.alpha, 0);
  assert.equal(ctx.curvature.beta, 0);
});

test('bindWorld handles missing nested configs gracefully', () => {
  const ctx = bindWorld({
    wave: { enabled: true },
    curvature: null,
    physics: null,
  });
  assert.ok(ctx.curvature instanceof CurvatureField);
  assert.ok(ctx.force instanceof ForceField);
});

test('bindWorld returns waveEnabled=false when wave.enabled is false', () => {
  const ctx = bindWorld({ wave: { enabled: false, gridSize: { nx: 8, ny: 8, nz: 8 } } });
  assert.equal(ctx.waveEnabled, false);
  assert.equal(ctx.waveField, null);
});

test('bindWorld creates WaveField with initialState', () => {
  const initial = new Float32Array(8 * 8 * 8);
  initial[256] = 1.0;
  const ctx = bindWorld({
    wave: {
      enabled: true,
      gridSize: { nx: 8, ny: 8, nz: 8 },
      initialState: initial,
    },
  });
  assert.equal(ctx.waveField.psiCurr[256], 1.0);
});