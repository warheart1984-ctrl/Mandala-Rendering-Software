import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { CHARTER, enforcedPrinciples } from "../../constitution/charter.js";

describe("CHARTER", () => {
  it("is frozen", () => {
    assert.ok(Object.isFrozen(CHARTER));
  });

  it("has correct id", () => {
    assert.equal(CHARTER.id, "charter.4dce.v1");
  });

  it("has correct version", () => {
    assert.equal(CHARTER.version, "1.0.0");
  });

  it("has 5 principles", () => {
    assert.equal(CHARTER.principles.length, 5);
  });

  it("each principle has id, status, and text", () => {
    for (const p of CHARTER.principles) {
      assert.equal(typeof p.id, "string", `principle ${p.id} missing id`);
      assert.equal(typeof p.status, "string", `principle ${p.id} missing status`);
      assert.equal(typeof p.text, "string", `principle ${p.id} missing text`);
      assert.ok(p.id.length > 0, `principle id must not be empty`);
      assert.ok(p.text.length > 0, `principle text must not be empty`);
    }
  });

  it("has 5 organs", () => {
    const keys = Object.keys(CHARTER.organs);
    assert.equal(keys.length, 5);
  });

  it("cinematic4d.vertexCount is 16", () => {
    assert.equal(CHARTER.cinematic4d.vertexCount, 16);
  });

  it("cinematic4d.edgeCount is 32", () => {
    assert.equal(CHARTER.cinematic4d.edgeCount, 32);
  });

  it("projection.formula4to3 contains 'd4'", () => {
    assert.ok(
      CHARTER.cinematic4d.projection.formula4to3.includes("d4"),
      `Expected formula4to3 to contain "d4", got: ${CHARTER.cinematic4d.projection.formula4to3}`
    );
  });

  it("projection.formula3to2 contains 'd3'", () => {
    assert.ok(
      CHARTER.cinematic4d.projection.formula3to2.includes("d3"),
      `Expected formula3to2 to contain "d3", got: ${CHARTER.cinematic4d.projection.formula3to2}`
    );
  });
});

describe("enforcedPrinciples()", () => {
  it("returns exactly 3 principles", () => {
    const enforced = enforcedPrinciples();
    assert.equal(enforced.length, 3);
  });

  it("returns only principles with status === 'enforced'", () => {
    const enforced = enforcedPrinciples();
    for (const p of enforced) {
      assert.equal(p.status, "enforced");
    }
    const expectedIds = [
      "no-execution-without-intent",
      "no-state-change-without-evidence",
      "no-authority-without-contract",
    ];
    assert.deepEqual(
      enforced.map((p) => p.id),
      expectedIds
    );
  });
});
