/**
 * Sovereign X Router — physical invariant registration / evidence routing.
 * Run: node --test src/gpu/SovereignXPhysicalInvariants.test.js
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  SOVEREIGNX_PHYSICAL_INVARIANT_CAPABILITY,
  PHYSICAL_INVARIANT_EVIDENCE_REF_PREFIX,
  SOVEREIGNX_PHYSICAL_INVARIANT_EVIDENCE_SCHEMA,
  listRegisteredPhysicalInvariants,
  getSovereignXPhysicalInvariantRegistration,
  attachPhysicalInvariantEvidence,
  evaluatePhysicalInvariantEvidence,
  routeSovereignXRenderer,
  createSovereignXNativeDispatch,
} from "./SovereignXRenderAdapter.js";
import { PHYSICAL_INVARIANTS } from "../render/rt4d/math/physicalInvariants.js";

const CANONICAL_IDS = ["PI-GEO-LENGTH", "PI-CALC-ENERGY", "PI-TRIG-RADIAL"];

describe("Sovereign X physical invariant registration", () => {
  it("registers all canonical PI-* ids with status tested", () => {
    const reg = getSovereignXPhysicalInvariantRegistration();
    assert.equal(reg.capability, SOVEREIGNX_PHYSICAL_INVARIANT_CAPABILITY);
    assert.equal(reg.status, "tested");
    const ids = listRegisteredPhysicalInvariants().map((d) => d.id);
    assert.deepEqual(ids, CANONICAL_IDS);
    assert.deepEqual(
      ids,
      PHYSICAL_INVARIANTS.map((inv) => inv.id),
    );
    for (const d of listRegisteredPhysicalInvariants()) {
      assert.equal(d.status, "tested");
      assert.equal(d.evidenceRef, `${PHYSICAL_INVARIANT_EVIDENCE_REF_PREFIX}${d.id}`);
      assert.equal(d.sourceModule, "render/rt4d/math/physicalInvariants.js");
    }
  });
});

describe("Sovereign X physical invariant evidence routing", () => {
  it("attachPhysicalInvariantEvidence merges refs without dropping existing ones", () => {
    const decision = attachPhysicalInvariantEvidence({
      action: "dispatch",
      backend: "vulkan",
      evidenceRefs: ["e-existing"],
    });
    assert.equal(decision.action, "dispatch");
    assert.equal(decision.physicalInvariantStatus, "tested");
    assert.ok(decision.evidenceRefs.includes("e-existing"));
    for (const id of CANONICAL_IDS) {
      assert.ok(decision.evidenceRefs.includes(`${PHYSICAL_INVARIANT_EVIDENCE_REF_PREFIX}${id}`));
    }
  });

  it("routeSovereignXRenderer always exposes registration; evidence attach is opt-in", async () => {
    const adapters = [{ id: "browser-canvas", backend: "canvas", available: true }];
    const base = await routeSovereignXRenderer({
      adapters,
      router: { name: "test" },
      request: { id: "r1" },
      runtime: {},
      limits: {},
      routeRender: () => ({ action: "dispatch", backend: "canvas", adapter: adapters[0], evidenceRefs: [] }),
    });
    assert.equal(base.physicalInvariants.status, "tested");
    assert.deepEqual(
      base.physicalInvariants.invariants.map((d) => d.id),
      CANONICAL_IDS,
    );
    assert.equal(base.physicalInvariantEvidence, null);
    assert.deepEqual(base.decision.evidenceRefs, []);

    const withRefs = await routeSovereignXRenderer({
      adapters,
      router: { name: "test" },
      request: { id: "r2" },
      runtime: {},
      limits: {},
      includePhysicalInvariantEvidence: true,
      routeRender: () => ({
        action: "dispatch",
        backend: "canvas",
        adapter: adapters[0],
        evidenceRefs: ["prior"],
      }),
    });
    assert.ok(withRefs.decision.evidenceRefs.includes("prior"));
    assert.ok(
      withRefs.decision.evidenceRefs.includes(`${PHYSICAL_INVARIANT_EVIDENCE_REF_PREFIX}PI-GEO-LENGTH`),
    );
  });

  it("evaluatePhysicalInvariantEvidence uses math predicates; gate remains false", () => {
    const records = evaluatePhysicalInvariantEvidence({
      "PI-GEO-LENGTH": { v: { x: 3, y: 4 }, vRot: { x: 3, y: 4 } },
      "PI-CALC-ENERGY": { eBefore: 1, eAfter: 1 },
      "PI-TRIG-RADIAL": { x: 1, y: 0, xp: 0, yp: 1 },
    });
    assert.equal(records.length, 3);
    for (const r of records) {
      assert.equal(r.schema, SOVEREIGNX_PHYSICAL_INVARIANT_EVIDENCE_SCHEMA);
      assert.equal(r.catalogStatus, "tested");
      assert.equal(r.gate, false);
      assert.equal(r.routed, true);
      assert.equal(r.predicateResult.ok, true);
    }
  });

  it("native dispatch forwards attached physical-invariant evidenceRefs", async () => {
    const decision = attachPhysicalInvariantEvidence({
      backend: "vulkan",
      adapter: { id: "gpu-1" },
      evidenceRefs: [],
    });
    const dispatch = createSovereignXNativeDispatch({
      sceneId: "scene",
      scenePath: "scene.json",
      outputDir: "out",
      width: 64,
      height: 64,
      frames: 1,
      fps: 30,
      createJob: (v) => ({ version: "1.0", jobId: "job", ...v }),
      dispatchJob: async () => ({ status: "completed" }),
    });
    const native = await dispatch(decision);
    assert.equal(native.kind, "sovereignx-native-render");
    for (const id of CANONICAL_IDS) {
      assert.ok(native.job.evidenceRefs.includes(`${PHYSICAL_INVARIANT_EVIDENCE_REF_PREFIX}${id}`));
    }
  });

  it("failing measurement yields ok:false without deny semantics", () => {
    const [energy] = evaluatePhysicalInvariantEvidence({
      "PI-CALC-ENERGY": { eBefore: 1, eAfter: 2 },
    }).filter((r) => r.invariantId === "PI-CALC-ENERGY");
    assert.equal(energy.predicateResult.ok, false);
    assert.equal(energy.gate, false);
  });
});
