/**
 * Lorentz boost vs Euclidean rotation Phase-1 tests.
 * Run: node --test src/render/rt4d/test/lorentz.boost.test.js
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { vec4 } from "../math/vec4.js";
import { Transform4D } from "../math/transform.js";
import {
  createLorentzBoost,
  boostPreservesInterval,
  rapidityParts,
  MINKOWSKI_METRIC,
} from "../metric/index.js";

test("rapidityParts uses cosh/sinh not cos/sin", () => {
  const η = 0.5;
  const { cosh: ch, sinh: sh } = rapidityParts(η);
  assert.ok(Math.abs(ch - Math.cosh(η)) < 1e-15);
  assert.ok(Math.abs(sh - Math.sinh(η)) < 1e-15);
  assert.ok(Math.abs(ch - Math.cos(η)) > 1e-3);
});

test("Lorentz boost preserves Minkowski interval", () => {
  const boost = createLorentzBoost("x", 0.7);
  const a = vec4(0, 0, 0, 0);
  const b = vec4(1, 0.2, -0.1, 0.5);
  assert.equal(boost.preservesMetric, "minkowski:-+++");
  assert.equal(boost.transformType, "lorentz_boost");
  assert.ok(boostPreservesInterval(boost, a, b, MINKOWSKI_METRIC, 1e-9));
});

test("Euclidean xy rotation still exists and is circular", () => {
  const r = Transform4D.rotate("xy", Math.PI / 2);
  const v = vec4(1, 0, 0, 0);
  const out = r.applyDir(v);
  assert.ok(Math.abs(out.x) < 1e-12);
  assert.ok(Math.abs(out.y - 1) < 1e-12);
});

test("boost is not a Transform4D.rotate plane", () => {
  const boost = createLorentzBoost("x", 0.3);
  assert.notEqual(boost.transformType, "rotate");
  const p = vec4(1, 0, 0, 0);
  const out = boost.apply(p);
  // Euclidean xw rotation by θ would mix with cos/sin; boost mixes with cosh/sinh
  const { cosh: ch, sinh: sh } = rapidityParts(0.3);
  assert.ok(Math.abs(out.x - ch) < 1e-12);
  assert.ok(Math.abs(out.w - -sh) < 1e-12);
});
