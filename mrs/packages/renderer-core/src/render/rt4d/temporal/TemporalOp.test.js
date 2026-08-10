// mrs/packages/renderer-core/src/render/rt4d/temporal/TemporalOp.test.js
// Status: **passing with gaps** - TemporalOp type validation tests.

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { TEMPORAL_OP_TYPES, isTemporalOpType } from "./TemporalOp.js";

describe("TemporalOp", () => {
  it("TEMPORAL_OP_TYPES has expected values", () => {
    assert.deepEqual(Object.values(TEMPORAL_OP_TYPES).sort(), [
      "compare",
      "fast_forward",
      "fork",
      "merge",
      "prune",
      "rewind",
      "simulate",
      "slice_view",
    ]);
  });

  it("TEMPORAL_OP_TYPES is frozen", () => {
    assert.throws(() => { TEMPORAL_OP_TYPES.NEW_MODE = "test"; });
  });

  it("isTemporalOpType returns true for valid types", () => {
    assert.ok(isTemporalOpType("fork"));
    assert.ok(isTemporalOpType("rewind"));
    assert.ok(isTemporalOpType("fast_forward"));
    assert.ok(isTemporalOpType("simulate"));
    assert.ok(isTemporalOpType("compare"));
    assert.ok(isTemporalOpType("prune"));
    assert.ok(isTemporalOpType("merge"));
    assert.ok(isTemporalOpType("slice_view"));
  });

  it("isTemporalOpType returns false for invalid types", () => {
    assert.ok(!isTemporalOpType("invalid"));
    assert.ok(!isTemporalOpType(""));
    assert.ok(!isTemporalOpType(null));
    assert.ok(!isTemporalOpType(undefined));
    assert.ok(!isTemporalOpType(123));
  });

  it("isTemporalOpType is case-sensitive", () => {
    assert.ok(!isTemporalOpType("FORK"));
    assert.ok(!isTemporalOpType("Fork"));
    assert.ok(!isTemporalOpType("REWIND"));
  });
});