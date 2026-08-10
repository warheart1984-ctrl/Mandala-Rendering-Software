// mrs/packages/renderer-core/src/render/rt4d/physics/fromWorldWaveConfig.test.js
// Status: **partial** — fromWorldWaveConfig factory tests.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fromWorldWaveConfig } from './fromWorldWaveConfig.js';
import { WaveField } from './WaveField.js';
import { CurvatureField } from './CurvatureField.js';
import { ForceField } from './ForceField.js';

test('fromWorldWaveConfig returns disabled when waveConfig is null', () => {
  const result = fromWorldWaveConfig(null);
  assert.equal(result.enabled, false);
  assert.equal(result.waveField, null);
  assert.ok(result.curvature instanceof CurvatureField);
  assert.ok(result.force instanceof ForceField);
});

test('fromWorldWaveConfig returns disabled when waveConfig.enabled is false', () => {
  const result = fromWorldWaveConfig({ enabled: false });
  assert.equal(result.enabled, false);
  assert.equal(result.waveField, null);
});

test('fromWorldWaveConfig creates WaveField when enabled', () => {
  const result = fromWorldWaveConfig({
    enabled: true,
    gridSize: { nx: 16, ny: 16, nz: 16 },
    c: 2.0,
    dt: 0.01,
  });
  assert.equal(result.enabled, true);
  assert.ok(result.waveField instanceof WaveField);
  assert.equal(result.waveField.c, 2.0);
  assert.equal(result.waveField.dt, 0.01);
  assert.equal(result.waveField.gridSize.nx, 16);
});

test('fromWorldWaveConfig wires CurvatureField with waveField and beta', () => {
  const result = fromWorldWaveConfig({
    enabled: true,
    beta: 0.5,
  }, {
    curvature: { k0: 1.0, alpha: 0.1 },
  });
  assert.ok(result.curvature instanceof CurvatureField);
  assert.equal(result.curvature.beta, 0.5);
  assert.equal(result.curvature.k0, 1.0);
  assert.equal(result.curvature.alpha, 0.1);
  assert.equal(result.curvature.waveField, result.waveField);
});

test('fromWorldWaveConfig wires ForceField with waveField and gamma', () => {
  const result = fromWorldWaveConfig({
    enabled: true,
    gamma: 0.3,
    waveDir: { x: 1, y: 0, z: 0 },
  }, {
    force: { g: { x: 0, y: -1, z: 0 } },
  });
  assert.ok(result.force instanceof ForceField);
  assert.equal(result.force.gamma, 0.3);
  assert.deepEqual(result.force.waveDir, { x: 1, y: 0, z: 0 });
  assert.equal(result.force.g.x, 0);
  assert.equal(result.force.g.y, -1);
  assert.equal(result.force.g.z, 0);
  assert.equal(result.force.waveField, result.waveField);
});

test('extras config overrides waveConfig for curvature', () => {
  const result = fromWorldWaveConfig({
    enabled: true,
    beta: 0.1,
  }, {
    curvature: { k0: 2.0, beta: 0.5 }, // extras should override
  });
  assert.equal(result.curvature.beta, 0.5);
  assert.equal(result.curvature.k0, 2.0);
});

test('extras config overrides waveConfig for force', () => {
  const result = fromWorldWaveConfig({
    enabled: true,
    gamma: 0.1,
    waveDir: { x: 0, y: 1, z: 0 },
  }, {
    force: { gamma: 0.5, waveDir: { x: 1, y: 0, z: 0 } },
  });
  assert.equal(result.force.gamma, 0.5);
  assert.deepEqual(result.force.waveDir, { x: 1, y: 0, z: 0 });
});

test('returns disabled objects when waveConfig is undefined', () => {
  const result = fromWorldWaveConfig(undefined);
  assert.equal(result.enabled, false);
  assert.equal(result.waveField, null);
});