import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { decideEntitlement } from "../src/entitlement.js";

describe("decideEntitlement", () => {
  it("allows within allotment", () => {
    const d = decideEntitlement({
      userId: "u1",
      tenantId: "t1",
      planId: "creator",
      renderId: "rt4d-render-ent0000000000001",
      proposedCredits: 5,
      alreadyUsed: 0,
      at: "2026-08-02T12:00:00.000Z",
    });
    assert.equal(d.allowed, true);
    assert.equal(d.reason, "within_allotment");
    assert.equal(d.creditsUsed, 5);
    assert.equal(d.tenantId, "t1");
  });

  it("denies unknown plan without throwing", () => {
    const d = decideEntitlement({
      userId: "u1",
      tenantId: "t1",
      planId: "enterprise-ultra",
      renderId: "rt4d-render-ent0000000000002",
      proposedCredits: 1,
      at: "2026-08-02T12:00:00.000Z",
    });
    assert.equal(d.allowed, false);
    assert.match(d.reason, /PLAN_DENY/);
  });

  it("denies when allotment exceeded", () => {
    const d = decideEntitlement({
      userId: "u1",
      tenantId: "t1",
      planId: "free",
      renderId: "rt4d-render-ent0000000000003",
      proposedCredits: 1_000_000,
      alreadyUsed: 0,
      at: "2026-08-02T12:00:00.000Z",
    });
    assert.equal(d.allowed, false);
    assert.equal(d.creditsUsed, 0);
  });
});
