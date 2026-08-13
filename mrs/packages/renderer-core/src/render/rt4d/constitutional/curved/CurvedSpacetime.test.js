import test from "node:test";
import assert from "node:assert/strict";

import { CurvedGeodesicRunner, createWeakFieldMetric } from "./index.js";

const M = 0.2;
const R0 = 1.4;
const V = 0.36;
const GAMMA = 1 / Math.sqrt(1 - V * V);

test("weak-field metric is curved (isotropic Schwarzschild)", () => {
  const metric = createWeakFieldMetric(M);
  const gtt = metric.componentAt([0, R0, 0, 0], 0, 0);
  const gxx = metric.componentAt([0, R0, 0, 0], 1, 1);
  assert.ok(Math.abs(gtt + (1 - (2 * M) / R0)) < 1e-12, "g_tt = -(1 - 2M/r)");
  assert.ok(Math.abs(gxx - (1 + (2 * M) / R0)) < 1e-12, "g_ii = 1 + 2M/r");
  const nonZero = metric.christoffelNonZeroAt([0, R0, 0, 0]);
  assert.ok(nonZero > 0, "spacetime is curved (nonzero Christoffel)");
});

test("curved geodesic conserves energy (u_t) and angular momentum (covariant L)", () => {
  const runner = new CurvedGeodesicRunner({ M, dtau: 0.01 });
  const x0 = [0, R0, 0, 0];
  const u0 = [GAMMA, 0, GAMMA * V, 0];
  const res = runner.run(x0, u0, 1200);

  assert.equal(res.allChecksPass, true, "every RK4 step passes certified checks");

  const metric = createWeakFieldMetric(M);
  const t0 = res.trajectory[0];
  const E0 = metric.componentAt(t0.position, 0, 0) * t0.velocity[0];
  const L0 =
    t0.position[1] * metric.componentAt(t0.position, 2, 2) * t0.velocity[2] -
    t0.position[2] * metric.componentAt(t0.position, 1, 1) * t0.velocity[1];

  for (const t of res.trajectory) {
    const x = t.position;
    const u = t.velocity;
    const E = metric.componentAt(x, 0, 0) * u[0];
    const L = x[1] * metric.componentAt(x, 2, 2) * u[2] - x[2] * metric.componentAt(x, 1, 1) * u[1];
    assert.ok(Math.abs(E - E0) < 1e-9, `energy drift ${Math.abs(E - E0)}`);
    assert.ok(Math.abs(L - L0) < 1e-9, `angular momentum drift ${Math.abs(L - L0)}`);
  }
});

test("curved geodesic produces a bounded orbit with perihelion precession", () => {
  const runner = new CurvedGeodesicRunner({ M, dtau: 0.01 });
  const x0 = [0, R0, 0, 0];
  const u0 = [GAMMA, 0, GAMMA * V, 0];
  const res = runner.run(x0, u0, 20000);

  const rMin = Math.min(...res.trajectory.map((t) => Math.hypot(t.position[1], t.position[2])));
  const rMax = Math.max(...res.trajectory.map((t) => Math.hypot(t.position[1], t.position[2])));
  assert.ok(rMin > 0.5, `orbit stays above 2M zone, r_min=${rMin.toFixed(3)}`);
  assert.ok(rMax < 4.0, `orbit stays bounded, r_max=${rMax.toFixed(3)}`);

  const peri = [];
  for (let i = 1; i < res.trajectory.length - 1; i++) {
    const r = Math.hypot(res.trajectory[i].position[1], res.trajectory[i].position[2]);
    const rp = Math.hypot(res.trajectory[i - 1].position[1], res.trajectory[i - 1].position[2]);
    const rn = Math.hypot(res.trajectory[i + 1].position[1], res.trajectory[i + 1].position[2]);
    if (r < rp && r < rn) {
      const p = res.trajectory[i].position;
      peri.push({ angle: Math.atan2(p[2], p[1]), r });
    }
  }
  assert.ok(peri.length >= 2, `at least 2 perihelion passages detected, got ${peri.length}`);
});
