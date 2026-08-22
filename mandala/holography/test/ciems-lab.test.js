/**
 * CIEMS holography lab soft invariants.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createInitialCertifiedState } from "../../proto/certified-state.mjs";
import {
  createBulkSpacetimeEngine,
  createHolographicEncoder,
} from "../index.mjs";
import {
  CIEMS_HOLOGRAPHY_STATUS,
  CIEMS_LENS,
  checkBulkEgtCoupling,
  entanglementHealth,
  runGovernedLabStep,
  buildGovernanceAudit,
} from "../ciems-lab.mjs";
import { runTinyHolographicScene } from "../tiny-scene.mjs";

describe("holography CIEMS soft checks", () => {
  it("coupling fails when bulk stepped without EGT update", () => {
    const fail = checkBulkEgtCoupling({ bulkStepped: true, egtUpdated: false });
    assert.equal(fail.ok, false);
    assert.equal(fail.code, "bulk-without-egt-update");
    const ok = checkBulkEgtCoupling({ bulkStepped: true, egtUpdated: true });
    assert.equal(ok.ok, true);
  });

  it("runGovernedLabStep fails soft check when skipEgtUpdate", () => {
    const state = createInitialCertifiedState({ seed: 7 });
    const hash0 = state.hash;
    const bulk = createBulkSpacetimeEngine({ state });
    const encoder = createHolographicEncoder({ stride: 4 });
    // Simulate bulk step without chamber mutation
    const bad = runGovernedLabStep({
      bulk,
      encoder,
      stepBulk: true,
      simulateBulkStep: true,
      skipEgtUpdate: true,
    });
    assert.equal(bad.coupling.ok, false);
    assert.equal(state.hash, hash0);

    const good = runGovernedLabStep({
      bulk,
      encoder,
      stepBulk: true,
      simulateBulkStep: true,
      skipEgtUpdate: false,
    });
    assert.equal(good.coupling.ok, true);
    assert.equal(state.hash, hash0);
  });

  it("tiny scene receipt includes governance audit", () => {
    const result = runTinyHolographicScene({ frames: 8, resolutionX: 12, resolutionY: 12 });
    assert.equal(result.receipt.governance.status, CIEMS_HOLOGRAPHY_STATUS);
    assert.ok(result.receipt.governance.ok);
    assert.ok(result.receipt.governance.invariants.bulkEgtCoupling.ok);
    assert.ok(result.receipt.governance.metrics.entanglementHealth.healthy);
    assert.ok(CIEMS_LENS.BulkSpacetimeEngine.layer);
    assert.ok(CIEMS_LENS.EGT.layer);
  });

  it("entanglementHealth reflects trail", () => {
    const result = runTinyHolographicScene({ frames: 10, resolutionX: 16, resolutionY: 16 });
    const h = entanglementHealth(result.egt);
    assert.ok(h.healthy);
    assert.ok(h.edgeSum > 0);
    const audit = buildGovernanceAudit({
      coupling: checkBulkEgtCoupling({ bulkStepped: true, egtUpdated: true }),
      health: h,
      reconstructionError: result.receipt.reconstructionError,
    });
    assert.ok(audit.ok);
  });
});
