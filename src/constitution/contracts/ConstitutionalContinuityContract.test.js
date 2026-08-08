/**
 * Test suite for ConstitutionalContinuityContract
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { constitutionalContinuityContract, CONTINUITY_LEVELS, CONTINUITY_TYPES, CONTINUITY_VERDICTS } from "./ConstitutionalContinuityContract.js";

describe("ConstitutionalContinuityContract", () => {
  it("registers a continuity", () => {
    const record = constitutionalContinuityContract.registerContinuity({
      type: "temporal",
      sourceState: { timestamp: "2026-01-01T00:00:00Z", position: { x: 0, y: 0, z: 0 } },
      targetState: { timestamp: "2026-01-01T00:00:01Z", position: { x: 1, y: 0, z: 0 } },
      level: "substrate_verified",
      evidence: ["ev-1", "ev-2"],
      causalChain: []
    });
    
    assert.ok(record.id);
    assert.equal(record.type, "temporal");
    assert.equal(record.level, "substrate_verified");
    assert.equal(record.status, "unevaluated");
  });

  it("verifies temporal continuity", async () => {
    const record = constitutionalContinuityContract.registerContinuity({
      type: "temporal",
      sourceState: { timestamp: "2026-01-01T00:00:00Z" },
      targetState: { timestamp: "2026-01-01T00:00:01Z" },
      level: "substrate_verified"
    });
    
    const result = await constitutionalContinuityContract.verifyContinuity(record.id);
    assert.equal(result.verified, true);
    assert.equal(result.verdict, "preserved");
  });

  it("rejects temporal violations", async () => {
    const record = constitutionalContinuityContract.registerContinuity({
      type: "temporal",
      sourceState: { timestamp: "2026-01-01T00:00:01Z" },
      targetState: { timestamp: "2026-01-01T00:00:00Z" }, // Backwards in time
      level: "substrate_verified"
    });
    
    const result = await constitutionalContinuityContract.verifyContinuity(record.id);
    assert.equal(result.verified, false);
    assert.equal(result.verdict, "broken");
  });

  it("verifies spatial continuity", async () => {
    const record = constitutionalContinuityContract.registerContinuity({
      type: "spatial",
      sourceState: { position: { x: 0, y: 0, z: 0 } },
      targetState: { position: { x: 0.1, y: 0, z: 0 } },
      maxSpatialJump: 1.0
    });
    
    const result = await constitutionalContinuityContract.verifyContinuity(record.id);
    assert.equal(result.verified, true);
  });

  it("rejects spatial jumps", async () => {
    const record = constitutionalContinuityContract.registerContinuity({
      type: "spatial",
      sourceState: { position: { x: 0, y: 0, z: 0 } },
      targetState: { position: { x: 100, y: 0, z: 0 } },
      maxSpatialJump: 1.0
    });
    
    const result = await constitutionalContinuityContract.verifyContinuity(record.id);
    assert.equal(result.verified, false);
    assert.equal(result.verdict, "broken");
  });

  it("verifies causal continuity", async () => {
    const record = constitutionalContinuityContract.registerContinuity({
      type: "causal",
      sourceState: { timestamp: "2026-01-01T00:00:00Z" },
      targetState: { timestamp: "2026-01-01T00:00:01Z" },
      causalChain: [
        { cause: "event-a", effect: "event-b", timestamp: "2026-01-01T00:00:00.5Z", strength: 1.0 },
        { cause: "event-b", effect: "event-c", timestamp: "2026-01-01T00:00:00.75Z", strength: 0.8 }
      ]
    });
    
    const result = await constitutionalContinuityContract.verifyContinuity(record.id);
    assert.equal(result.verified, true);
  });

  it("rejects causal violations", async () => {
    const record = constitutionalContinuityContract.registerContinuity({
      type: "causal",
      sourceState: { timestamp: "2026-01-01T00:00:01Z" },
      targetState: { timestamp: "2026-01-01T00:00:00Z" },
      causalChain: [
        { cause: "event-a", effect: "event-b", timestamp: "2026-01-01T00:00:01Z", strength: 1.0 }
      ]
    });
    
    const result = await constitutionalContinuityContract.verifyContinuity(record.id);
    assert.equal(result.verified, false);
  });

  it("verifies identity continuity", async () => {
    const record = constitutionalContinuityContract.registerContinuity({
      type: "identity",
      sourceState: { identity: "entity-123" },
      targetState: { identity: "entity-123" }
    });
    
    const result = await constitutionalContinuityContract.verifyContinuity(record.id);
    assert.equal(result.verified, true);
  });

  it("rejects identity changes without transform", async () => {
    const record = constitutionalContinuityContract.registerContinuity({
      type: "identity",
      sourceState: { identity: "entity-1" },
      targetState: { identity: "entity-2" }
    });
    
    const result = await constitutionalContinuityContract.verifyContinuity(record.id);
    assert.equal(result.verified, false);
  });

  it("creates continuity chains", async () => {
    const c1 = constitutionalContinuityContract.registerContinuity({
      type: "temporal",
      sourceState: { timestamp: "2026-01-01T00:00:00Z" },
      targetState: { timestamp: "2026-01-01T00:00:01Z" }
    });
    
    const c2 = constitutionalContinuityContract.registerContinuity({
      type: "temporal",
      sourceState: { timestamp: "2026-01-01T00:00:01Z" },
      targetState: { timestamp: "2026-01-01T00:00:02Z" }
    });
    
    const chain = await constitutionalContinuityContract.createContinuityChain("chain-1", [c1.id, c2.id]);
    
    assert.equal(chain.continuityIds.length, 2);
    assert.equal(chain.links.length, 2);
    assert.ok(chain.overallVerdict);
  });

  it("detects violations in chains", async () => {
    const c1 = constitutionalContinuityContract.registerContinuity({
      type: "temporal",
      sourceState: { timestamp: "2026-01-01T00:00:00Z" },
      targetState: { timestamp: "2026-01-01T00:00:01Z" }
    });
    
    const c2 = constitutionalContinuityContract.registerContinuity({
      type: "temporal",
      sourceState: { timestamp: "2026-01-01T00:00:02Z" },
      targetState: { timestamp: "2026-01-01T00:00:00Z" } // backwards
    });
    
    const chain = await constitutionalContinuityContract.createContinuityChain("chain-1", [c1.id, c2.id]);
    const violations = await constitutionalContinuityContract.detectViolations(chain.id);
    
    assert.ok(violations.length > 0);
    assert.ok(violations.some(v => v.type === "broken_continuity"));
  });

  it("tracks violations", async () => {
    const record = constitutionalContinuityContract.registerContinuity({
      type: "temporal",
      sourceState: { timestamp: "2026-01-01T00:00:01Z" },
      targetState: { timestamp: "2026-01-01T00:00:00Z" }
    });
    
    await constitutionalContinuityContract.verifyContinuity(record.id);
    
    const violations = constitutionalContinuityContract.getViolations();
    assert.ok(violations.length > 0);
    assert.ok(violations.some(v => v.severity === "critical"));
  });
});