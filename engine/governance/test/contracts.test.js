import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { CONTRACTS, resolveAuthority } from "../../constitution/contracts.js";

describe("CONTRACTS", () => {
  it("has 10 SME contracts", () => {
    assert.equal(CONTRACTS.contracts.length, 10);
  });

  it("includes director + replay contracts", () => {
    const director = CONTRACTS.contracts.find(
      (c) => c.contractId === "contract.director.v1",
    );
    const replay = CONTRACTS.contracts.find(
      (c) => c.contractId === "contract.replay.v1",
    );
    assert.ok(director, "director contract exists");
    assert.ok(replay, "replay contract exists");
    assert.equal(director.status, "enforced");
    assert.equal(director.authority, "coordinate");
    assert.ok(director.forbiddenActions.includes("execute_specialist_work"));
    assert.ok(replay.authority, "replay-only");
    assert.ok(replay.forbidden.includes("escalate_authority"));
  });

  it("module exports a resolveAuthority helper", () => {
    assert.equal(typeof resolveAuthority, "function");
    assert.equal(typeof CONTRACTS.resolveAuthority, "function");
  });
});

describe("resolveAuthority()", () => {
  it("sme.txt can generate text", () => {
    const result = resolveAuthority("sme.txt", "generate_text");
    assert.equal(result.ok, true);
    assert.equal(result.contractId, "contract.sme-txt.v1");
  });

  it("sme.txt cannot write code", () => {
    const result = resolveAuthority("sme.txt", "write_code");
    assert.equal(result.ok, false);
    assert.ok(
      result.reason.includes("not in allow-list"),
      `Expected reason to contain "not in allow-list", got: ${result.reason}`,
    );
  });

  it("director cannot execute specialist work", () => {
    const result = resolveAuthority("4dce.director", "execute_specialist_work");
    assert.equal(result.ok, false);
    assert.ok(
      result.reason.includes("forbidden"),
      `Expected reason to contain "forbidden", got: ${result.reason}`,
    );
  });

  it("director can dispatch", () => {
    const result = resolveAuthority("4dce.director", "dispatch");
    assert.equal(result.ok, true);
    assert.equal(result.contractId, "contract.director.v1");
  });

  it("replay cannot escalate authority", () => {
    const result = resolveAuthority("4dce.replay", "escalate_authority");
    assert.equal(result.ok, false);
  });

  it("unknown actor returns ok=false with 'No contract'", () => {
    const result = resolveAuthority("unknown.actor", "anything");
    assert.equal(result.ok, false);
    assert.ok(
      result.reason.includes("No contract"),
      `Expected reason to contain "No contract", got: ${result.reason}`,
    );
  });

  it("known actor with nonexistent action is denied", () => {
    const result = resolveAuthority("sme.txt", "nonexistent.action");
    assert.equal(result.ok, false);
    assert.ok(
      result.reason.includes("not in allow-list"),
      `Expected reason to contain "not in allow-list", got: ${result.reason}`,
    );
  });
});
