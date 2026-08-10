// mrs/packages/renderer-core/src/render/rt4d/modes/Rt4dLabMode.test.js
// Status: **passing with gaps** - Rt4dLabMode enum + metadata + helpers tests.

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  RT4D_LAB_MODES,
  DEFAULT_RT4D_LAB_MODE,
  RT4D_LAB_MODE_META,
  TIME_TRAVEL_MEANINGS,
  isRt4dLabMode,
  normalizeRt4dLabMode,
} from "./Rt4dLabMode.js";

describe("Rt4dLabMode", () => {
  it("RT4D_LAB_MODES has four modes", () => {
    assert.deepEqual(Object.values(RT4D_LAB_MODES).sort(), [
      "geometry",
      "simulation",
      "spacetime",
      "timeline",
    ]);
  });

  it("RT4D_LAB_MODES is frozen", () => {
    assert.throws(() => { RT4D_LAB_MODES.NEW_MODE = "test"; });
  });

  it("DEFAULT_RT4D_LAB_MODE is geometry", () => {
    assert.equal(DEFAULT_RT4D_LAB_MODE, "geometry");
  });

  it("RT4D_LAB_MODE_META has entries for all modes", () => {
    for (const mode of Object.values(RT4D_LAB_MODES)) {
      assert.ok(RT4D_LAB_MODE_META[mode]);
      assert.ok(RT4D_LAB_MODE_META[mode].fourthAxis);
      assert.ok(RT4D_LAB_MODE_META[mode].defaultMetricId);
      assert.ok(RT4D_LAB_MODE_META[mode].invariants);
      assert.ok(RT4D_LAB_MODE_META[mode].status);
    }
  });

  it("RT4D_LAB_MODE_META entries are frozen", () => {
    for (const mode of Object.values(RT4D_LAB_MODES)) {
      assert.throws(() => { RT4D_LAB_MODE_META[mode].status = "hacked"; });
    }
  });

  it("geometry mode metadata", () => {
    const meta = RT4D_LAB_MODE_META.geometry;
    assert.equal(meta.fourthAxis, "spatial_w");
    assert.equal(meta.defaultMetricId, "euclidean");
    assert.ok(meta.invariants.includes("O(4)"));
    assert.equal(meta.status, "partial");
  });

  it("spacetime mode metadata", () => {
    const meta = RT4D_LAB_MODE_META.spacetime;
    assert.equal(meta.fourthAxis, "coordinate_time_t");
    assert.equal(meta.defaultMetricId, "minkowski:-+++");
    assert.ok(meta.invariants.includes("Lorentz"));
    assert.equal(meta.status, "partial");
  });

  it("simulation mode metadata", () => {
    const meta = RT4D_LAB_MODE_META.simulation;
    assert.equal(meta.fourthAxis, "state_evolution_index");
    assert.equal(meta.defaultMetricId, "euclidean");
    assert.ok(meta.invariants.includes("rewind"));
    assert.equal(meta.status, "partial");
  });

  it("timeline mode metadata", () => {
    const meta = RT4D_LAB_MODE_META.timeline;
    assert.equal(meta.fourthAxis, "lineage_coordinate");
    assert.equal(meta.defaultMetricId, "euclidean");
    assert.ok(meta.invariants.includes("lineage"));
    assert.equal(meta.status, "partial");
  });

  it("TIME_TRAVEL_MEANINGS has three meanings", () => {
    assert.deepEqual(Object.values(TIME_TRAVEL_MEANINGS).sort(), [
      "simulation_rewind",
      "spacetime_visualization",
      "timeline_editing",
    ]);
  });

  it("isRt4dLabMode returns true for valid modes", () => {
    assert.ok(isRt4dLabMode("geometry"));
    assert.ok(isRt4dLabMode("spacetime"));
    assert.ok(isRt4dLabMode("simulation"));
    assert.ok(isRt4dLabMode("timeline"));
  });

  it("isRt4dLabMode returns false for invalid modes", () => {
    assert.ok(!isRt4dLabMode("invalid"));
    assert.ok(!isRt4dLabMode(""));
    assert.ok(!isRt4dLabMode(null));
    assert.ok(!isRt4dLabMode(undefined));
  });

  it("normalizeRt4dLabMode returns input for valid modes", () => {
    assert.equal(normalizeRt4dLabMode("geometry"), "geometry");
    assert.equal(normalizeRt4dLabMode("spacetime"), "spacetime");
    assert.equal(normalizeRt4dLabMode("simulation"), "simulation");
    assert.equal(normalizeRt4dLabMode("timeline"), "timeline");
  });

  it("normalizeRt4dLabMode returns default for invalid modes", () => {
    assert.equal(normalizeRt4dLabMode("invalid"), "geometry");
    assert.equal(normalizeRt4dLabMode(""), "geometry");
    assert.equal(normalizeRt4dLabMode(null), "geometry");
    assert.equal(normalizeRt4dLabMode(undefined), "geometry");
    assert.equal(normalizeRt4dLabMode("SPACETIME"), "geometry"); // case sensitive
  });

  it("constants are frozen", () => {
    assert.throws(() => { RT4D_LAB_MODES.NEW = "test"; });
    assert.throws(() => { TIME_TRAVEL_MEANINGS.NEW = "test"; });
  });
});