// mrs/packages/renderer-core/src/render/rt4d/physics/ForceField.test.js
// Status: **partial** — ForceField gravity + WaveField coupling + Euler integration tests.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ForceField } from './ForceField.js';
import { WaveField } from './WaveField.js';

test('ForceField constructs with defaults', () => {
  const ff = new ForceField();
  assert.deepEqual(ff.g, { x: 0, y: -9.81, z: 0 });
  assert.equal(ff.gamma, 0.0);
  assert.deepEqual(ff.waveDir, { x: 0, y: 1, z: 0 });
  assert.equal(ff.waveField, null);
});

test('ForceField constructs with custom config', () => {
  const ff = new ForceField({
    g: { x: 0, y: -1.6, z: 0 },
    gamma: 0.5,
    waveDir: { x: 1, y: 0, z: 0 },
  });
  assert.deepEqual(ff.g, { x: 0, y: -1.6, z: 0 });
  assert.equal(ff.gamma, 0.5);
  assert.deepEqual(ff.waveDir, { x: 1, y: 0, z: 0 });
});

test('force returns gravity only when no waveField', () => {
  const ff = new ForceField({ g: { x: 0, y: -9.81, z: 0 } });
  const f = ff.force({ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 0 }, 2.0);
  assert.equal(f.fx, 0);
  assert.equal(f.fy, -19.62);
  assert.equal(f.fz, 0);
});

test('force couples to WaveField via gamma', () => {
  const wf = new WaveField({ gridSize: { nx: 8, ny: 8, nz: 8 } });
  wf.impulse(4, 4, 4, 1.0);
  wf.step(); // propagate wave
  const ff = new ForceField({
    gamma: 2.0,
    waveField: wf,
    waveDir: { x: 0, y: 1, z: 0 }, // upward coupling
  });
  // Sample near the impulse location (maps to grid indices ~4,4,4)
  const f = ff.force({ x: 4.5, y: 4.5, z: 4.5 }, { x: 0, y: 0, z: 0 }, 1.0);
  // base gravity = -9.81, wave coupling adds upward (positive y) force
  // so net force should be LESS negative than -9.81
  assert.ok(f.fy > -9.81, 'upward wave coupling should reduce downward gravity');
});

test('apply is alias for force', () => {
  const ff = new ForceField({ g: { x: 0, y: -1, z: 0 } });
  const f1 = ff.force({ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 0 }, 1);
  const f2 = ff.apply({ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 0 }, 1);
  assert.deepEqual(f1, f2);
});

test('integrate advances position and velocity (Euler)', () => {
  const ff = new ForceField({ g: { x: 0, y: -10, z: 0 } });
  const state = { x: 0, y: 100, z: 0, vx: 0, vy: 0, vz: 0, mass: 1 };
  const next = ff.integrate(state, 0.1);
  assert.ok(next.y < state.y, 'should fall downward');
  assert.ok(next.vy < 0, 'velocity should be downward');
  assert.equal(next.mass, 1);
});

test('integrate uses provided dt', () => {
  const ff = new ForceField({ g: { x: 0, y: -10, z: 0 } });
  const state = { x: 0, y: 100, z: 0, vx: 0, vy: 0, vz: 0, mass: 1 };
  const next1 = ff.integrate(state, 0.1);
  const next2 = ff.integrate(state, 0.2);
  // Larger dt should produce larger displacement
  assert.ok(state.y - next2.y > state.y - next1.y, 'larger dt -> larger displacement');
});

test('integrate preserves mass', () => {
  const ff = new ForceField();
  const state = { x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, mass: 2.5 };
  const next = ff.integrate(state, 0.1);
  assert.equal(next.mass, 2.5);
});

test('force with zero mass defaults to 1', () => {
  const ff = new ForceField({ g: { x: 0, y: -10, z: 0 } });
  const f = ff.force({ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 0 }, 0);
  assert.equal(f.fy, -10); // m defaults to 1
});