/**
 * World-engine foothold — ecological inheritance into Amendment VII scale.
 * Status: **partial** (one world profile; not full biogeometric enforcement).
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  loadBiogeometricCatalog,
  getWorldProfile,
  inheritEcologicalScale,
  HALT_MISSING_WORLD_CONTEXT,
} from "../../src/face/EcologicalInheritance.js";
import {
  inheritMetricsFromContext,
  requireScaleContext,
} from "../../src/face/MetricInheritance.js";

describe("Ecological inheritance foothold", () => {
  it("loads temperate-grove-v1 biogeometric catalog", () => {
    const cat = loadBiogeometricCatalog();
    assert.equal(cat.schemaVersion, "biogeometric-profile/0.1-partial");
    assert.equal(cat.status, "partial");
    assert.equal(cat.dependsOn, "ckl-amendment-vii-biometric-organic");
    const grove = getWorldProfile("temperate-grove-v1", cat);
    assert.ok(grove);
    assert.equal(grove!.domain, "biological");
    assert.equal(grove!.worldScaleClass, "human-sized");
  });

  it("inheritEcologicalScale feeds worldScaleClass into MetricInheritance", () => {
    const eco = inheritEcologicalScale({
      worldProfileId: "temperate-grove-v1",
      requireWorldContext: true,
    });
    assert.equal(eco.ok, true);
    assert.equal(eco.worldScaleClass, "human-sized");
    assert.equal(eco.haltCode, null);

    const gate = requireScaleContext(eco.metricContext);
    assert.equal(gate.ok, true);
    assert.equal(gate.source, "world");

    const inherited = inheritMetricsFromContext({
      ...eco.metricContext,
      requireScaleClass: true,
    });
    assert.equal(inherited.scaleClass, "human-sized");
    assert.equal(inherited.status, "enforced");
  });

  it("HALT:MISSING-WORLD-CONTEXT when required and absent", () => {
    const missing = inheritEcologicalScale({ requireWorldContext: true });
    assert.equal(missing.ok, false);
    assert.equal(missing.haltCode, HALT_MISSING_WORLD_CONTEXT);
  });
});
