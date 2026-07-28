import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { ConstitutionalStateEngine, renderEvidenceFrom } from "../../../js/constitution/cse.js";

const VALID_RENDER_EVIDENCE = {
  timestamp: "now",
  vertexCount: 16,
  edgeCount: 32,
  theta: 0,
  d4: 5,
  d3: 5,
  speed: 1,
  scale: 1,
};

const VALID_TIMELINE_PAUSE_EVIDENCE = {
  timestamp: "now",
  timeSec: 1,
};

const VALID_EXPORT_EVIDENCE = {
  timestamp: "now",
  vertexCount: 16,
  edgeCount: 32,
  theta: 0,
  d4: 5,
  d3: 5,
  speed: 1,
  scale: 1,
};

describe("ConstitutionalStateEngine", () => {
  it("constructor creates instance with charterId and empty records", () => {
    const cse = new ConstitutionalStateEngine();
    assert.equal(cse.charterId, "charter.4dce.v1");
    assert.deepEqual(cse.records, []);
    assert.equal(cse.onRecord, null);
  });

  it("constructor with onRecord callback", () => {
    const calls = [];
    const cse = new ConstitutionalStateEngine({ onRecord: (row) => calls.push(row) });
    assert.equal(cse.onRecord !== null, true);
  });

  describe("declareIntent()", () => {
    it("returns intent with id, kind, goal, actor, charterId, createdAt", () => {
      const cse = new ConstitutionalStateEngine();
      const intent = cse.declareIntent({ kind: "test", goal: "testing" });
      assert.ok(intent.id, "should have id");
      assert.equal(intent.kind, "test");
      assert.equal(intent.goal, "testing");
      assert.equal(intent.actor, "4dce.renderer");
      assert.equal(intent.charterId, "charter.4dce.v1");
      assert.ok(intent.createdAt, "should have createdAt");
    });

    it("intent.id starts with 'intent-'", () => {
      const cse = new ConstitutionalStateEngine();
      const intent = cse.declareIntent({ kind: "test", goal: "testing" });
      assert.ok(
        intent.id.startsWith("intent-"),
        `Expected id to start with "intent-", got: ${intent.id}`
      );
    });

    it("declareIntent without kind throws", () => {
      const cse = new ConstitutionalStateEngine();
      assert.throws(
        () => cse.declareIntent({ goal: "testing" }),
        /Intent requires kind and goal/
      );
    });

    it("declareIntent without goal throws", () => {
      const cse = new ConstitutionalStateEngine();
      assert.throws(
        () => cse.declareIntent({ kind: "test" }),
        /Intent requires kind and goal/
      );
    });

    it("declareIntent appends to records with phase='intent'", () => {
      const cse = new ConstitutionalStateEngine();
      cse.declareIntent({ kind: "test", goal: "testing" });
      assert.equal(cse.records.length, 1);
      assert.equal(cse.records[0].phase, "intent");
      assert.equal(cse.records[0].payload.kind, "test");
    });
  });

  describe("validateEvidence()", () => {
    it("null evidence returns ok=false", () => {
      const cse = new ConstitutionalStateEngine();
      const result = cse.validateEvidence(null, "render.session.start");
      assert.equal(result.ok, false);
    });

    it("evidence without timestamp returns ok=false", () => {
      const cse = new ConstitutionalStateEngine();
      const result = cse.validateEvidence({}, "render.session.start");
      assert.equal(result.ok, false);
      assert.ok(result.errors.some((e) => e.includes("timestamp")));
    });

    it("evidence with timestamp but missing vertexCount for render.session.start", () => {
      const cse = new ConstitutionalStateEngine();
      const result = cse.validateEvidence({ timestamp: "now" }, "render.session.start");
      assert.equal(result.ok, false);
      assert.ok(result.errors.some((e) => e.includes("vertexCount")));
    });

    it("full valid evidence for render.session.start passes", () => {
      const cse = new ConstitutionalStateEngine();
      const result = cse.validateEvidence(VALID_RENDER_EVIDENCE, "render.session.start");
      assert.equal(result.ok, true);
      assert.equal(result.errors.length, 0);
    });

    it("valid evidence for timeline.pause passes", () => {
      const cse = new ConstitutionalStateEngine();
      const result = cse.validateEvidence(VALID_TIMELINE_PAUSE_EVIDENCE, "timeline.pause");
      assert.equal(result.ok, true);
    });

    it("evidence without timeSec for timeline.pause fails", () => {
      const cse = new ConstitutionalStateEngine();
      const result = cse.validateEvidence({ timestamp: "now" }, "timeline.pause");
      assert.equal(result.ok, false);
      assert.ok(result.errors.some((e) => e.includes("timeSec")));
    });

    it("evidence without required fields for artifact.picture.export fails", () => {
      const cse = new ConstitutionalStateEngine();
      const result = cse.validateEvidence({ timestamp: "now" }, "artifact.picture.export");
      assert.equal(result.ok, false);
      assert.ok(result.errors.length >= 3, `Expected multiple errors, got: ${result.errors.length}`);
    });

    it("full valid evidence for artifact.picture.export passes", () => {
      const cse = new ConstitutionalStateEngine();
      const result = cse.validateEvidence(VALID_EXPORT_EVIDENCE, "artifact.picture.export");
      assert.equal(result.ok, true);
    });
  });

  describe("execute()", () => {
    it("null intent throws 'No execution without intent'", async () => {
      const cse = new ConstitutionalStateEngine();
      await assert.rejects(
        () => cse.execute({ intent: null, evidence: {}, action: "render.session.start", run: async () => {} }),
        (err) => {
          assert.ok(err.message.includes("No execution without intent"));
          return true;
        }
      );
    });

    it("intent without id throws 'No execution without intent'", async () => {
      const cse = new ConstitutionalStateEngine();
      await assert.rejects(
        () => cse.execute({ intent: { kind: "test" }, evidence: {}, action: "render.session.start", run: async () => {} }),
        (err) => {
          assert.ok(err.message.includes("No execution without intent"));
          return true;
        }
      );
    });

    it("valid intent but invalid evidence throws 'No state change without evidence'", async () => {
      const cse = new ConstitutionalStateEngine();
      await assert.rejects(
        () => cse.execute({
          intent: { id: "i1", actor: "4dce.renderer" },
          evidence: {},
          action: "render.session.start",
          run: async () => {},
        }),
        (err) => {
          assert.ok(err.message.includes("No state change without evidence"));
          return true;
        }
      );
    });

    it("valid intent + evidence but unknown actor/action throws 'No authority without contract'", async () => {
      const cse = new ConstitutionalStateEngine();
      await assert.rejects(
        () => cse.execute({
          intent: { id: "i1", actor: "unknown.actor" },
          evidence: VALID_RENDER_EVIDENCE,
          action: "render.session.start",
          run: async () => {},
        }),
        (err) => {
          assert.ok(err.message.includes("No authority without contract"));
          return true;
        }
      );
    });

    it("full valid flow returns CSR with correct fields", async () => {
      const cse = new ConstitutionalStateEngine();
      const csr = await cse.execute({
        intent: { id: "i1", actor: "4dce.renderer", kind: "render" },
        evidence: { ...VALID_RENDER_EVIDENCE },
        action: "render.session.start",
        run: async () => "result",
      });
      assert.ok(csr.id, "CSR should have id");
      assert.ok(csr.id.startsWith("csr-"), `CSR id should start with "csr-", got: ${csr.id}`);
      assert.equal(csr.intentId, "i1");
      assert.equal(csr.action, "render.session.start");
      assert.equal(csr.contractId, "contract.cinematic4d.v1");
      assert.equal(csr.charterId, "charter.4dce.v1");
      assert.deepEqual(csr.evidence, { ...VALID_RENDER_EVIDENCE });
      assert.equal(csr.result, "result");
      assert.ok(csr.createdAt, "CSR should have createdAt");
    });

    it("execute records phases: intent, evidence, authority, planning, validation", async () => {
      const cse = new ConstitutionalStateEngine();
      cse.declareIntent({ kind: "render", goal: "test" });
      const intentId = cse.records[0].payload.id;
      await cse.execute({
        intent: { id: intentId, actor: "4dce.renderer", kind: "render" },
        evidence: { ...VALID_RENDER_EVIDENCE },
        action: "render.session.start",
        run: async () => "ok",
      });
      const phases = cse.records.map((r) => r.phase);
      assert.deepEqual(phases, ["intent", "evidence", "authority", "planning", "validation"]);
    });

    it("failed execution records 'execution' phase with failed status", async () => {
      const cse = new ConstitutionalStateEngine();
      cse.declareIntent({ kind: "render", goal: "test" });
      const intentId = cse.records[0].payload.id;
      await assert.rejects(
        () => cse.execute({
          intent: { id: intentId, actor: "4dce.renderer", kind: "render" },
          evidence: { ...VALID_RENDER_EVIDENCE },
          action: "render.session.start",
          run: async () => { throw new Error("boom"); },
        })
      );
      const execPhases = cse.records.filter((r) => r.phase === "execution");
      assert.equal(execPhases.length, 1);
      assert.equal(execPhases[0].status, "failed");
    });

    it("onRecord callback is called for each phase", async () => {
      const calls = [];
      const cse = new ConstitutionalStateEngine({ onRecord: (row) => calls.push(row.phase) });
      cse.declareIntent({ kind: "render", goal: "test" });
      const intentId = cse.records[0].payload.id;
      await cse.execute({
        intent: { id: intentId, actor: "4dce.renderer", kind: "render" },
        evidence: { ...VALID_RENDER_EVIDENCE },
        action: "render.session.start",
        run: async () => "ok",
      });
      assert.deepEqual(calls, ["intent", "evidence", "authority", "planning", "validation"]);
    });
  });

  describe("latestCsr()", () => {
    it("returns null when no CSR exists", () => {
      const cse = new ConstitutionalStateEngine();
      assert.equal(cse.latestCsr("render.session.start"), null);
    });

    it("returns CSR after successful execute", async () => {
      const cse = new ConstitutionalStateEngine();
      const expected = await cse.execute({
        intent: { id: "i1", actor: "4dce.renderer" },
        evidence: { ...VALID_RENDER_EVIDENCE },
        action: "render.session.start",
        run: async () => "result",
      });
      const latest = cse.latestCsr("render.session.start");
      assert.ok(latest);
      assert.equal(latest.id, expected.id);
    });
  });

  describe("listCsrs()", () => {
    it("returns empty array when no CSRs", () => {
      const cse = new ConstitutionalStateEngine();
      assert.deepEqual(cse.listCsrs(), []);
    });

    it("returns array of CSRs after execute", async () => {
      const cse = new ConstitutionalStateEngine();
      await cse.execute({
        intent: { id: "i1", actor: "4dce.renderer" },
        evidence: { ...VALID_RENDER_EVIDENCE },
        action: "render.session.start",
        run: async () => "r1",
      });
      const csrs = cse.listCsrs();
      assert.equal(csrs.length, 1);
      assert.equal(csrs[0].intentId, "i1");
    });

    it("multiple executions produce multiple CSRs", async () => {
      const cse = new ConstitutionalStateEngine();
      await cse.execute({
        intent: { id: "i1", actor: "4dce.renderer" },
        evidence: { ...VALID_RENDER_EVIDENCE },
        action: "render.session.start",
        run: async () => "r1",
      });
      await cse.execute({
        intent: { id: "i2", actor: "4dce.renderer" },
        evidence: { ...VALID_RENDER_EVIDENCE },
        action: "render.session.start",
        run: async () => "r2",
      });
      assert.equal(cse.listCsrs().length, 2);
    });
  });

  describe("exportProvenance()", () => {
    it("returns object with charterId, charterVersion, recordCount, records, csrs", async () => {
      const cse = new ConstitutionalStateEngine();
      await cse.execute({
        intent: { id: "i1", actor: "4dce.renderer" },
        evidence: { ...VALID_RENDER_EVIDENCE },
        action: "render.session.start",
        run: async () => "r1",
      });
      const prov = cse.exportProvenance();
      assert.equal(prov.charterId, "charter.4dce.v1");
      assert.equal(prov.charterVersion, "1.0.0");
      assert.ok(typeof prov.recordCount === "number");
      assert.ok(prov.recordCount > 0);
      assert.ok(Array.isArray(prov.records));
      assert.ok(Array.isArray(prov.csrs));
      assert.equal(prov.csrs.length, 1);
    });
  });
});

describe("renderEvidenceFrom()", () => {
  it("returns valid evidence shape from renderer state", () => {
    const renderer = {
      vertices4D: [],
      edges: [],
      theta: 0,
      d4: 5,
      d3: 5,
      speed: 1,
      scale: 1,
      weights: {},
      surfaceId: "tesseract",
    };
    const ev = renderEvidenceFrom(renderer);
    assert.ok(ev.timestamp, "should have timestamp");
    assert.equal(ev.surfaceId, "tesseract");
    assert.equal(ev.vertexCount, 0);
    assert.equal(ev.edgeCount, 0);
    assert.equal(ev.theta, 0);
    assert.equal(ev.d4, 5);
    assert.equal(ev.d3, 5);
    assert.equal(ev.speed, 1);
    assert.equal(ev.scale, 1);
    assert.deepEqual(ev.weights, {});
    assert.ok(Array.isArray(ev.rotationPlanes));
  });

  it("defaults surfaceId to 'tesseract' when not provided", () => {
    const renderer = {
      vertices4D: [1, 2, 3],
      edges: [[0, 1], [1, 2]],
      theta: 0,
      d4: 5,
      d3: 5,
      speed: 1,
      scale: 1,
      weights: {},
    };
    const ev = renderEvidenceFrom(renderer);
    assert.equal(ev.surfaceId, "tesseract");
    assert.equal(ev.vertexCount, 3);
    assert.equal(ev.edgeCount, 2);
  });

  it("extras are merged into result", () => {
    const renderer = {
      vertices4D: [],
      edges: [],
      theta: 0,
      d4: 5,
      d3: 5,
      speed: 1,
      scale: 1,
      weights: {},
    };
    const ev = renderEvidenceFrom(renderer, { customField: "hello", speed: 99 });
    assert.equal(ev.customField, "hello");
    assert.equal(ev.speed, 99, "extras should override defaults");
  });

  it("weights is a copy, not a reference", () => {
    const renderer = {
      vertices4D: [],
      edges: [],
      theta: 0,
      d4: 5,
      d3: 5,
      speed: 1,
      scale: 1,
      weights: { a: 1 },
    };
    const ev = renderEvidenceFrom(renderer);
    renderer.weights.a = 999;
    assert.equal(ev.weights.a, 1, "should not be affected by mutating original");
  });

  it("rotationPlanes matches CHARTER.cinematic4d.activePlanes", () => {
    const renderer = {
      vertices4D: [],
      edges: [],
      theta: 0,
      d4: 5,
      d3: 5,
      speed: 1,
      scale: 1,
      weights: {},
    };
    const ev = renderEvidenceFrom(renderer);
    assert.deepEqual(ev.rotationPlanes, ["XW", "YZ", "ZW", "YW"]);
  });
});
