/**
 * Tests for gpu.compute.amd.legacy_efficient — 3-Layer Path SX foothold.
 * STATUS: **partial** — unit-enforced schedule + governance; no live GPU.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { route, resolveCapability } from "../router/index.js";
import {
  CAPABILITY_ID,
  detectLegacyAmdHost,
  integrateLegacyEfficientBeauty,
  selectSparseTiles,
  buildSalienceField,
} from "../router/modules/gpu/amd/legacyEfficientBeauty.js";

describe("gpu.compute.amd.legacy_efficient", () => {
  it("resolves from registry as assist compute amd", () => {
    const r = resolveCapability(CAPABILITY_ID);
    assert.equal(r.ok, true);
    assert.equal(r.authority, "assist");
    assert.equal(r.capabilityClass, "compute");
    assert.equal(r.vendor, "amd");
  });

  it("detects R9 380 as legacy GCN route hint", () => {
    const h = detectLegacyAmdHost({
      name: "AMD Radeon (TM) R9 380 Series",
      vendor: "amd",
    });
    assert.equal(h.legacyGcn, true);
    assert.equal(h.routeHint, CAPABILITY_ID);
  });

  it("Layer 3: denies without intentId", () => {
    const r = integrateLegacyEfficientBeauty({ width: 32, height: 32 });
    assert.equal(r.ok, false);
    assert.equal(r.code, "GOVERNANCE_INTENT_REQUIRED");
    assert.equal(r.metrics.usefulFraction, 0);
  });

  it("Layer 1: sparse occupancy ≈ p", () => {
    const sal = buildSalienceField(8, 8, 0);
    const s = selectSparseTiles(sal, 0.1);
    assert.equal(s.activeIndices.length, Math.max(1, Math.round(64 * 0.1)));
    assert.ok(Math.abs(s.occupancy - 0.1) < 0.05);
  });

  it("route() returns metrics when intent present", async () => {
    const r = await route(CAPABILITY_ID, {
      intentId: "test-legacy-1",
      determinismRequired: false,
      width: 64,
      height: 64,
      tileSize: 8,
      salienceFraction: 0.1,
      hostGpu: { name: "R9 380", vendor: "amd", legacyGcn: true },
    });
    assert.equal(r.ok, true);
    assert.equal(r.assistOnly, true);
    assert.equal(r.status, "partial");
    assert.ok(r.metrics.usefulFraction > 0 && r.metrics.usefulFraction <= 1);
    assert.ok(r.metrics.combinedGainEstimate >= 1);
    assert.equal(r.host.legacyGcn, true);
  });

  it("route() denies print SoT", async () => {
    const r = await route(CAPABILITY_ID, {
      intentId: "x",
      asPrintSoT: true,
    });
    assert.equal(r.ok, false);
  });

  it("determinismRequired redirects away from GPU (safeguard)", async () => {
    const r = await route(CAPABILITY_ID, {
      intentId: "det",
      determinismRequired: true,
    });
    assert.equal(r.ok, false);
    assert.equal(r.code, "GPU_PRINT_SAFEGUARD");
  });
});
