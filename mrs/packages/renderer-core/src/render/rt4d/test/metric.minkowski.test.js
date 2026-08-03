/**
 * Minkowski / Euclidean metric Phase-1 tests.
 * Run: node --test src/render/rt4d/test/metric.minkowski.test.js
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { vec4 } from "../math/vec4.js";
import {
  EUCLIDEAN_METRIC_4D,
  MINKOWSKI_METRIC,
  MinkowskiMetric,
} from "../metric/index.js";

test("Euclidean metric self-product equals squared length", () => {
  const a = vec4(1, 2, 3, 4);
  assert.equal(EUCLIDEAN_METRIC_4D.innerProduct(a, a), 1 + 4 + 9 + 16);
  assert.equal(EUCLIDEAN_METRIC_4D.classifyInterval(a, vec4(0, 0, 0, 0)), "euclidean");
});

test("Minkowski lightlike null interval along light ray", () => {
  const o = vec4(0, 0, 0, 0);
  const p = vec4(1, 0, 0, 1); // Δx=1, Δt=1 → s² = -1 + 1 = 0
  assert.ok(Math.abs(MINKOWSKI_METRIC.interval(o, p)) < 1e-12);
  assert.equal(MINKOWSKI_METRIC.classifyInterval(o, p), "lightlike");
});

test("Minkowski timelike and spacelike signs (-+++)", () => {
  const o = vec4(0, 0, 0, 0);
  const timelike = vec4(0, 0, 0, 1); // s² = -1
  const spacelike = vec4(1, 0, 0, 0); // s² = +1
  assert.equal(MINKOWSKI_METRIC.classifyInterval(o, timelike), "timelike");
  assert.equal(MINKOWSKI_METRIC.classifyInterval(o, spacelike), "spacelike");
  assert.ok(MINKOWSKI_METRIC.interval(o, timelike) < 0);
  assert.ok(MINKOWSKI_METRIC.interval(o, spacelike) > 0);
});

test("Minkowski c scaling treats w as coordinate time t", () => {
  const m = new MinkowskiMetric({ c: 2 });
  assert.equal(m.c, 2);
  const o = vec4(0, 0, 0, 0);
  const p = vec4(2, 0, 0, 1); // |Δx| = c|Δt| → lightlike
  assert.equal(m.classifyInterval(o, p), "lightlike");
});
