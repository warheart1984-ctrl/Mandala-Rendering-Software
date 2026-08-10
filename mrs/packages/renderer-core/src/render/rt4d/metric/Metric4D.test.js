// mrs/packages/renderer-core/src/render/rt4d/metric/Metric4D.test.js
// Status: **passing with gaps** - Metric4D constants and helpers tests.

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { METRIC_IDS, INTERVAL_TOL, signClass } from "./Metric4D.js";

describe("Metric4D constants and helpers", () => {
  it("METRIC_IDS has expected keys", () => {
    assert.equal(METRIC_IDS.EUCLIDEAN, "euclidean");
    assert.equal(METRIC_IDS.MINKOWSKI_MINUS_PLUS, "minkowski:-+++");
    assert.equal(METRIC_IDS.CUSTOM_DIAGONAL, "custom-diagonal");
    assert.equal(METRIC_IDS.CURVED_FIELD, "curved-metric-field");
  });

  it("METRIC_IDS is frozen", () => {
    assert.throws(() => { METRIC_IDS.NEW_KEY = "test"; });
  });

  it("INTERVAL_TOL is 1e-12", () => {
    assert.equal(INTERVAL_TOL, 1e-12);
  });

  it("signClass returns zero for values within tolerance", () => {
    assert.equal(signClass(0, 1e-12), "zero");
    assert.equal(signClass(1e-13, 1e-12), "zero");
    assert.equal(signClass(-1e-13, 1e-12), "zero");
  });

  it("signClass returns positive for values above tolerance", () => {
    assert.equal(signClass(1e-11, 1e-12), "positive");
    assert.equal(signClass(1, 1e-12), "positive");
  });

  it("signClass returns negative for values below negative tolerance", () => {
    assert.equal(signClass(-1e-11, 1e-12), "negative");
    assert.equal(signClass(-1, 1e-12), "negative");
  });

  it("signClass uses default tolerance when not provided", () => {
    assert.equal(signClass(1e-13), "zero");
    assert.equal(signClass(1e-11), "positive");
    assert.equal(signClass(-1e-11), "negative");
  });
});