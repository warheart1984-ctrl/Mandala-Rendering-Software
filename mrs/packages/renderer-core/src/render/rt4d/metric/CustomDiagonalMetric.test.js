// mrs/packages/renderer-core/src/render/rt4d/metric/CustomDiagonalMetric.test.js
// Status: **passing with gaps** - CustomDiagonalMetric tests (innerProduct, interval, classifyInterval).

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { CustomDiagonalMetric } from "./CustomDiagonalMetric.js";
import { METRIC_IDS } from "./Metric4D.js";

describe("CustomDiagonalMetric", () => {
  it("constructs with valid diag array", () => {
    const m = new CustomDiagonalMetric([1, 1, 1, -1]);
    assert.equal(m.diag.length, 4);
    assert.deepEqual(m.diag, [1, 1, 1, -1]);
  });

  it("throws on invalid diag length", () => {
    assert.throws(() => new CustomDiagonalMetric([1, 1, 1]), /diag length 4/);
    assert.throws(() => new CustomDiagonalMetric([1, 1, 1, 1, 1]), /diag length 4/);
    assert.throws(() => new CustomDiagonalMetric("not array"), /diag length 4/);
  });

  it("sets id, version, signature, tol from options", () => {
    const m = new CustomDiagonalMetric([1, 1, 1, -1], {
      id: "custom-1",
      signature: "my-metric",
      tol: 1e-9,
    });
    assert.equal(m.id, "custom-1");
    assert.equal(m.signature, "my-metric");
    assert.equal(m.tol, 1e-9);
  });

  it("uses default id/signature/tol when not provided", () => {
    const m = new CustomDiagonalMetric([1, 1, 1, -1]);
    assert.equal(m.id, "custom-diagonal");
    assert.equal(m.signature, "custom");
    assert.equal(m.tol, 1e-12);
  });

  it("diag is frozen", () => {
    const m = new CustomDiagonalMetric([1, 2, 3, 4]);
    assert.throws(() => { m.diag[0] = 99; });
  });

  it("innerProduct computes weighted dot product", () => {
    const m = new CustomDiagonalMetric([2, 3, 4, -5]);
    const a = { x: 1, y: 2, z: 3, w: 4 };
    const b = { x: 5, y: 6, z: 7, w: 8 };
    // 2*1*5 + 3*2*6 + 4*3*7 + (-5)*4*8 = 10 + 36 + 84 - 160 = -30
    assert.equal(m.innerProduct(a, b), -30);
  });

  it("innerProduct is symmetric", () => {
    const m = new CustomDiagonalMetric([2, 3, 4, -5]);
    const a = { x: 1, y: 2, z: 3, w: 4 };
    const b = { x: 5, y: 6, z: 7, w: 8 };
    assert.equal(m.innerProduct(a, b), m.innerProduct(b, a));
  });

  it("intervalSquared computes squared interval", () => {
    const m = new CustomDiagonalMetric([1, 1, 1, -1]);
    const a = { x: 0, y: 0, z: 0, w: 0 };
    const b = { x: 1, y: 0, z: 0, w: 0 };
    // dx=1, dy=0, dz=0, dw=0 -> 1*1^2 = 1
    assert.equal(m.intervalSquared({ x: 0, y: 0, z: 0, w: 0 }, { x: 1, y: 0, z: 0, w: 0 }), 1);
    assert.equal(m.intervalSquared({ x: 0, y: 0, z: 0, w: 0 }, { x: 0, y: 1, z: 0, w: 0 }), 1);
    assert.equal(m.intervalSquared({ x: 0, y: 0, z: 0, w: 0 }, { x: 0, y: 0, z: 0, w: 1 }), -1);
  });

  it("interval is alias for intervalSquared", () => {
    const m = new CustomDiagonalMetric([1, 1, 1, -1]);
    const a = { x: 0, y: 0, z: 0, w: 0 };
    const b = { x: 1, y: 0, z: 0, w: 0 };
    assert.equal(m.interval(a, b), m.intervalSquared(a, b));
  });

  it("classifyInterval returns euclidean for positive definite", () => {
    const m = new CustomDiagonalMetric([1, 1, 1, 1]);
    assert.equal(m.classifyInterval({ x: 0, y: 0, z: 0, w: 0 }, { x: 1, y: 0, z: 0, w: 0 }), "euclidean");
  });

it("classifyInterval for Minkowski (+--- signature)", () => {
    const m = new CustomDiagonalMetric([1, 1, 1, -1]); // (+---) signature
    // t=0, x=1 -> spacelike
    assert.equal(m.classifyInterval({ x: 0, y: 0, z: 0, w: 0 }, { x: 1, y: 1, z: 0, w: 0 }), "spacelike");
    // t=1, x=0 -> timelike
    assert.equal(m.classifyInterval({ x: 0, y: 0, z: 0, w: 0 }, { x: 0, y: 0, z: 0, w: 1 }), "timelike");
    // t=1, x=1 -> lightlike (ds^2 = -1 + 1 = 0)
    assert.equal(m.classifyInterval({ x: 0, y: 0, z: 0, w: 0 }, { x: 1, y: 0, z: 0, w: 1 }), "lightlike");
  });

  it("classifyInterval returns lightlike for zero interval", () => {
    const m = new CustomDiagonalMetric([-1, 1, 1, 1]);
    // t=1, x=1, y=0, z=0 -> -1 + 1 = 0
    assert.equal(m.classifyInterval({ x: 0, y: 0, z: 0, w: 0 }, { x: 1, y: 1, z: 0, w: 0 }), "lightlike");
  });

  it("handles custom tol", () => {
    const m = new CustomDiagonalMetric([1, 1, 1, -1], { tol: 1e-6 });
    assert.equal(m.tol, 1e-6);
  });

  it("returns euclidean for positive definite metrics", () => {
    const m = new CustomDiagonalMetric([2, 3, 4, 5]);
    assert.equal(m.classifyInterval({ x: 0, y: 0, z: 0, w: 0 }, { x: 1, y: 0, z: 0, w: 0 }), "euclidean");
  });

  it("returns euclidean for negative definite metrics", () => {
    const m = new CustomDiagonalMetric([-1, -1, -1, -1]);
    assert.equal(m.classifyInterval({ x: 0, y: 0, z: 0, w: 0 }, { x: 1, y: 0, z: 0, w: 0 }), "euclidean");
  });

  it("diag is frozen and cannot be mutated", () => {
    const m = new CustomDiagonalMetric([1, 2, 3, 4]);
    assert.throws(() => { m.diag[0] = 99; });
  });
});