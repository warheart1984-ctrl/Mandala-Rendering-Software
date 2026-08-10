// mrs/packages/renderer-core/src/render/rt4d/metric/CurvedMetricField.test.js
// Status: **partial** — Christoffel symbols + geodesic integration tests.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CurvedMetricField } from './CurvedMetricField.js';
import { METRIC_IDS } from './Metric4D.js';

test('CurvedMetricField constructs with defaults', () => {
  const cmf = new CurvedMetricField();
  assert.equal(cmf.id, METRIC_IDS.CURVED_FIELD);
  assert.equal(cmf.status, 'partial');
  assert.ok(typeof cmf.metricFunc === 'function');
});

test('default metric is Minkowski', () => {
  const cmf = new CurvedMetricField();
  const g = cmf.metric({ t: 0, x: 0, y: 0, z: 0 });
  assert.equal(g[0], -1); // g_tt
  assert.equal(g[5], 1);  // g_xx
  assert.equal(g[10], 1); // g_yy
  assert.equal(g[15], 1); // g_zz
  // off-diagonal should be 0
  for (let i = 0; i < 16; i++) {
    if (![0, 5, 10, 15].includes(i)) assert.equal(g[i], 0);
  }
});

test('inverse metric is inverse for diagonal', () => {
  const cmf = new CurvedMetricField();
  const g = cmf.metric({ t: 0, x: 0, y: 0, z: 0 });
  const gInv = cmf.inverseMetric({ t: 0, x: 0, y: 0, z: 0 });
  assert.equal(gInv[0], -1); // g^tt
  assert.equal(gInv[5], 1);  // g^xx
  assert.equal(gInv[10], 1); // g^yy
  assert.equal(gInv[15], 1); // g^zz
});

test('innerProduct with Minkowski metric', () => {
  const cmf = new CurvedMetricField();
  const u = [1, 0, 0, 0]; // timelike
  const v = [1, 0, 0, 0];
  const ip = cmf.innerProduct({ t: 0, x: 0, y: 0, z: 0 }, u, v);
  assert.equal(ip, -1); // g_tt * 1 * 1 = -1
});

test('classifyInterval for timelike separation', () => {
  const cmf = new CurvedMetricField();
  const p1 = { t: 0, x: 0, y: 0, z: 0 };
  const p2 = { t: 1, x: 0, y: 0, z: 0 };
  assert.equal(cmf.classifyInterval(p1, p2), 'timelike');
});

test('classifyInterval for spacelike separation', () => {
  const cmf = new CurvedMetricField();
  const p1 = { t: 0, x: 0, y: 0, z: 0 };
  const p2 = { t: 0, x: 1, y: 0, z: 0 };
  assert.equal(cmf.classifyInterval(p1, p2), 'spacelike');
});

test('classifyInterval for lightlike separation (exactly zero interval)', () => {
  const cmf = new CurvedMetricField();
  const p1 = { t: 0, x: 0, y: 0, z: 0 };
  const p2 = { t: 1, x: 1, y: 0, z: 0 }; // ds² = -1 + 1 = 0
  // In Minkowski, lightlike intervals have exactly zero interval
  assert.equal(cmf.classifyInterval(p1, p2), 'zero');
});

test('christoffel symbols are zero for flat Minkowski', () => {
  const cmf = new CurvedMetricField();
  const Gamma = cmf.christoffel({ t: 0, x: 0, y: 0, z: 0 });
  for (const g of Gamma) assert.equal(g, 0);
});

test('christoffel cache works', () => {
  const cmf = new CurvedMetricField();
  const g1 = cmf.christoffel({ t: 1, x: 2, y: 3, z: 4 });
  const g2 = cmf.christoffel({ t: 1, x: 2, y: 3, z: 4 });
  assert.equal(g1, g2); // same reference from cache
});

test('custom metric function', () => {
  const cmf = new CurvedMetricField({
    metricFunc: (pt) => new Float32Array([
      -1 + 0.1 * pt.x, 0, 0, 0,
      0, 1, 0, 0,
      0, 0, 1, 0,
      0, 0, 0, 1,
    ]),
  });
  const g = cmf.metric({ t: 0, x: 5, y: 0, z: 0 });
  assert.equal(g[0], -0.5); // -1 + 0.1*5
});

test('geodesic in flat space is straight line', () => {
  const cmf = new CurvedMetricField();
  const start = { t: 0, x: 0, y: 0, z: 0 };
  const vel = [1, 0.5, 0, 0]; // dt/dτ=1, dx/dτ=0.5
  const traj = cmf.geodesic(start, vel, 0.1, 10);
  assert.equal(traj.length, 10);
  // Records position BEFORE each step, so last entry at step 9 has t=0.9, x=0.45
  assert.ok(Math.abs(traj[9].pos.x - 0.45) < 0.1, `x=${traj[9].pos.x}`);
  assert.ok(Math.abs(traj[9].pos.t - 0.9) < 0.1, `t=${traj[9].pos.t}`);
});

test('custom metric: g_tt = -1 + 0.1*x produces curved geodesic', () => {
  const cmf = new CurvedMetricField({
    metricFunc: (pt) => new Float32Array([
      -1 + 0.1 * pt.x, 0, 0, 0,
      0, 1, 0, 0,
      0, 0, 1, 0,
      0, 0, 0, 1,
    ]),
  });
  const start = { t: 0, x: 0, y: 0, z: 0 };
  const vel = [1, 0.5, 0, 0];
  const traj = cmf.geodesic(start, vel, 0.01, 100);
  // With g_tt varying with x, trajectory should curve
  assert.ok(Math.abs(traj[99].pos.x - 5.0) > 0.01, 'should deviate from flat');
});