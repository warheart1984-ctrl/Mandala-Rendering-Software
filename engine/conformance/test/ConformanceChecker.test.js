import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { evaluateConformance, formatReport } from "../ConformanceChecker.js";

function makeProfile(checkIds) {
  return {
    version: "1.0",
    checks: checkIds.map((id) => ({
      id,
      domain: id.split(".")[0],
      description: `Check ${id}`,
      severity: "critical",
    })),
  };
}

function makeAdapter(results) {
  const adapter = {};
  for (const [id, result] of Object.entries(results)) {
    adapter[id] = async () => result;
  }
  return adapter;
}

describe("evaluateConformance()", () => {
  it("returns compliant:true when all probes pass", async () => {
    const profile = makeProfile(["a.x", "b.y"]);
    const adapter = makeAdapter({
      "a.x": { pass: true },
      "b.y": { pass: true },
    });
    const report = await evaluateConformance("test", profile, adapter);
    assert.equal(report.compliant, true);
    assert.equal(report.total, 2);
    assert.equal(report.passed, 2);
    assert.equal(report.failed, 0);
  });

  it("returns compliant:false when any probe fails", async () => {
    const profile = makeProfile(["a.x", "b.y"]);
    const adapter = makeAdapter({
      "a.x": { pass: true },
      "b.y": { pass: false, reason: "broken" },
    });
    const report = await evaluateConformance("test", profile, adapter);
    assert.equal(report.compliant, false);
    assert.equal(report.passed, 1);
    assert.equal(report.failed, 1);
  });

  it("marks check as failed when probe is missing", async () => {
    const profile = makeProfile(["a.x", "b.y"]);
    const adapter = makeAdapter({
      "a.x": { pass: true },
    });
    const report = await evaluateConformance("test", profile, adapter);
    assert.equal(report.compliant, false);
    const missing = report.results.find((r) => r.id === "b.y");
    assert.equal(missing.pass, false);
    assert.ok(missing.reason.includes("No probe"));
  });

  it("marks check as failed when probe throws", async () => {
    const profile = makeProfile(["a.x"]);
    const adapter = {
      "a.x": async () => { throw new Error("probe crashed"); },
    };
    const report = await evaluateConformance("test", profile, adapter);
    assert.equal(report.compliant, false);
    assert.equal(report.results[0].pass, false);
    assert.ok(report.results[0].reason.includes("probe crashed"));
  });

  it("includes runtime name in report", async () => {
    const profile = makeProfile(["a.x"]);
    const adapter = makeAdapter({ "a.x": { pass: true } });
    const report = await evaluateConformance("my-runtime", profile, adapter);
    assert.equal(report.runtime, "my-runtime");
  });

  it("includes profile version in report", async () => {
    const profile = makeProfile(["a.x"]);
    profile.version = "2.0";
    const adapter = makeAdapter({ "a.x": { pass: true } });
    const report = await evaluateConformance("test", profile, adapter);
    assert.equal(report.profileVersion, "2.0");
  });

  it("includes timestamp in report", async () => {
    const profile = makeProfile(["a.x"]);
    const adapter = makeAdapter({ "a.x": { pass: true } });
    const report = await evaluateConformance("test", profile, adapter);
    assert.ok(report.timestamp);
    assert.ok(new Date(report.timestamp).getTime() > 0);
  });

  it("result objects have id, domain, pass fields", async () => {
    const profile = makeProfile(["a.x"]);
    const adapter = makeAdapter({ "a.x": { pass: true } });
    const report = await evaluateConformance("test", profile, adapter);
    const r = report.results[0];
    assert.equal(r.id, "a.x");
    assert.equal(r.domain, "a");
    assert.equal(r.pass, true);
  });

  it("preserves reason from passing probes", async () => {
    const profile = makeProfile(["a.x"]);
    const adapter = makeAdapter({ "a.x": { pass: true, reason: "all good" } });
    const report = await evaluateConformance("test", profile, adapter);
    assert.equal(report.results[0].reason, "all good");
  });

  it("handles empty check list", async () => {
    const profile = makeProfile([]);
    const adapter = {};
    const report = await evaluateConformance("test", profile, adapter);
    assert.equal(report.compliant, true);
    assert.equal(report.total, 0);
    assert.equal(report.passed, 0);
  });

  it("handles all checks failing", async () => {
    const profile = makeProfile(["a.x", "b.y", "c.z"]);
    const adapter = makeAdapter({
      "a.x": { pass: false, reason: "fail a" },
      "b.y": { pass: false, reason: "fail b" },
      "c.z": { pass: false, reason: "fail c" },
    });
    const report = await evaluateConformance("test", profile, adapter);
    assert.equal(report.compliant, false);
    assert.equal(report.failed, 3);
    assert.equal(report.passed, 0);
  });
});

describe("formatReport()", () => {
  it("returns a string", async () => {
    const profile = makeProfile(["a.x"]);
    const adapter = makeAdapter({ "a.x": { pass: true } });
    const report = await evaluateConformance("test", profile, adapter);
    const output = formatReport(report);
    assert.equal(typeof output, "string");
    assert.ok(output.length > 0);
  });

  it("contains runtime name", async () => {
    const profile = makeProfile(["a.x"]);
    const adapter = makeAdapter({ "a.x": { pass: true } });
    const report = await evaluateConformance("my-host", profile, adapter);
    const output = formatReport(report);
    assert.ok(output.includes("my-host"));
  });

  it("contains COMPLIANT when all pass", async () => {
    const profile = makeProfile(["a.x"]);
    const adapter = makeAdapter({ "a.x": { pass: true } });
    const report = await evaluateConformance("test", profile, adapter);
    const output = formatReport(report);
    assert.ok(output.includes("COMPLIANT"));
  });

  it("contains NON-COMPLIANT when any fail", async () => {
    const profile = makeProfile(["a.x", "b.y"]);
    const adapter = makeAdapter({
      "a.x": { pass: true },
      "b.y": { pass: false, reason: "broken" },
    });
    const report = await evaluateConformance("test", profile, adapter);
    const output = formatReport(report);
    assert.ok(output.includes("NON-COMPLIANT"));
    assert.ok(output.includes("broken"));
  });

  it("shows domain grouping", async () => {
    const profile = makeProfile(["provenance.x", "provenance.y", "ckl.z"]);
    const adapter = makeAdapter({
      "provenance.x": { pass: true },
      "provenance.y": { pass: true },
      "ckl.z": { pass: true },
    });
    const report = await evaluateConformance("test", profile, adapter);
    const output = formatReport(report);
    assert.ok(output.includes("provenance"));
    assert.ok(output.includes("ckl"));
  });
});

describe("evaluateConformance() with real profile", () => {
  it("loads default.conformance-profile.json and runs 16 checks", async () => {
    const { default: profile } = await import("../default.conformance-profile.json", {
      with: { type: "json" },
    });
    const checkIds = profile.checks.map((c) => c.id);
    assert.equal(checkIds.length, 16);

    const adapter = makeAdapter(
      Object.fromEntries(checkIds.map((id) => [id, { pass: true }])),
    );
    const report = await evaluateConformance("mock", profile, adapter);
    assert.equal(report.compliant, true);
    assert.equal(report.total, 16);
    assert.equal(report.passed, 16);
  });
});
