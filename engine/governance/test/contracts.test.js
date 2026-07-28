import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { CONTRACTS, resolveAuthority } from "../../constitution/contracts.js";

describe("CONTRACTS", () => {
  it("has 3 entries", () => {
    const keys = Object.keys(CONTRACTS);
    assert.equal(keys.length, 3);
  });

  it("is frozen", () => {
    assert.ok(Object.isFrozen(CONTRACTS));
  });

  it("cinematic4d contract has correct invariants", () => {
    const c4d = CONTRACTS["contract.cinematic4d.v1"];
    assert.ok(c4d, "cinematic4d contract exists");
    assert.equal(c4d.invariants.vertexCount, 16);
    assert.equal(c4d.invariants.edgeCount, 32);
    assert.equal(c4d.invariants.mustProject, true);
  });
});

describe("resolveAuthority()", () => {
  it("renderer can start render session", () => {
    const result = resolveAuthority("4dce.renderer", "render.session.start");
    assert.equal(result.ok, true);
    assert.equal(result.contractId, "contract.cinematic4d.v1");
  });

  it("renderer cannot play timeline", () => {
    const result = resolveAuthority("4dce.renderer", "timeline.play");
    assert.equal(result.ok, false);
    assert.ok(
      result.reason.includes("does not authorize"),
      `Expected reason to contain "does not authorize", got: ${result.reason}`
    );
  });

  it("export actor can export picture", () => {
    const result = resolveAuthority("4dce.export", "artifact.picture.export");
    assert.equal(result.ok, true);
    assert.equal(result.contractId, "contract.export.v1");
  });

  it("export actor cannot start render session", () => {
    const result = resolveAuthority("4dce.export", "render.session.start");
    assert.equal(result.ok, false);
    assert.ok(
      result.reason.includes("does not authorize"),
      `Expected reason to contain "does not authorize", got: ${result.reason}`
    );
  });

  it("timeline actor can play", () => {
    const result = resolveAuthority("4dce.timeline", "timeline.play");
    assert.equal(result.ok, true);
    assert.equal(result.contractId, "contract.timeline.v1");
  });

  it("timeline actor can pause", () => {
    const result = resolveAuthority("4dce.timeline", "timeline.pause");
    assert.equal(result.ok, true);
    assert.equal(result.contractId, "contract.timeline.v1");
  });

  it("timeline actor can seek", () => {
    const result = resolveAuthority("4dce.timeline", "timeline.seek");
    assert.equal(result.ok, true);
    assert.equal(result.contractId, "contract.timeline.v1");
  });

  it("unknown actor returns ok=false with 'No contract'", () => {
    const result = resolveAuthority("unknown.actor", "anything");
    assert.equal(result.ok, false);
    assert.ok(
      result.reason.includes("No contract"),
      `Expected reason to contain "No contract", got: ${result.reason}`
    );
  });

  it("renderer with nonexistent action returns ok=false with 'does not authorize'", () => {
    const result = resolveAuthority("4dce.renderer", "nonexistent.action");
    assert.equal(result.ok, false);
    assert.ok(
      result.reason.includes("does not authorize"),
      `Expected reason to contain "does not authorize", got: ${result.reason}`
    );
    assert.equal(result.contractId, "contract.cinematic4d.v1");
  });
});
