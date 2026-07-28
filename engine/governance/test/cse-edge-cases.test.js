import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { join, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const { ConstitutionalStateEngine, renderEvidenceFrom } = await import(pathToFileURL(join(root, "js/constitution/cse.js")).href);

describe("renderEvidenceFrom edge cases", () => {
  it("defaults surfaceId to 'tesseract' when not provided", () => {
    const renderer = { vertices4D: [{ x: 0, y: 0, z: 0, w: 0 }], edges: [], theta: 0, d4: 5, d3: 5, speed: 1, scale: 1, weights: {} };
    const ev = renderEvidenceFrom(renderer);
    assert.equal(ev.surfaceId, "tesseract");
  });

  it("handles undefined renderer properties gracefully", () => {
    const renderer = { vertices4D: [], edges: [] };
    const ev = renderEvidenceFrom(renderer);
    assert.ok(ev.surfaceId);
    assert.ok(ev.rotationPlanes);
    assert.ok(Array.isArray(ev.vertices4D) || ev.vertices4D === undefined);
  });

  it("extras override defaults", () => {
    const renderer = { vertices4D: [], edges: [], surfaceId: "torus" };
    const ev = renderEvidenceFrom(renderer, { surfaceId: "custom" });
    assert.equal(ev.surfaceId, "custom");
  });

  it("extras do not mutate original object", () => {
    const renderer = { vertices4D: [], edges: [] };
    const extras = { custom: "value" };
    renderEvidenceFrom(renderer, extras);
    assert.equal(extras.custom, "value");
  });

  it("weights is a copy not a reference", () => {
    const renderer = { vertices4D: [], edges: [], weights: { a: 1 } };
    const ev = renderEvidenceFrom(renderer);
    ev.weights.b = 2;
    assert.equal(renderer.weights.b, undefined);
  });
});

describe("CSE execute edge cases", () => {
  it("records 'execution' phase with 'failed' status when run throws", async () => {
    const cse = new ConstitutionalStateEngine();
    const intent = cse.declareIntent({ kind: "test", goal: "test" });
    const evidence = { timestamp: "now", vertexCount: 16, edgeCount: 32, theta: 0, d4: 5, d3: 5, speed: 1, scale: 1 };

    await assert.rejects(
      () => cse.execute({ intent, evidence, action: "render.session.start", run: async () => { throw new Error("boom"); } }),
      { message: "boom" },
    );

    const execPhases = cse.records.filter((r) => r.phase === "execution");
    assert.equal(execPhases.length, 1);
    assert.equal(execPhases[0].status, "failed");
  });

  it("CSR not created when run throws", async () => {
    const cse = new ConstitutionalStateEngine();
    const intent = cse.declareIntent({ kind: "test", goal: "test" });
    const evidence = { timestamp: "now", vertexCount: 16, edgeCount: 32, theta: 0, d4: 5, d3: 5, speed: 1, scale: 1 };

    await assert.rejects(
      () => cse.execute({ intent, evidence, action: "render.session.start", run: async () => { throw new Error("fail"); } }),
    );

    assert.equal(cse.listCsrs().length, 0);
  });

  it("latestCsr returns null for action with no CSR", () => {
    const cse = new ConstitutionalStateEngine();
    assert.equal(cse.latestCsr("nonexistent"), null);
  });

  it("listCsrs excludes failed executions", async () => {
    const cse = new ConstitutionalStateEngine();
    const intent = cse.declareIntent({ kind: "test", goal: "test" });
    const evidence = { timestamp: "now", vertexCount: 16, edgeCount: 32, theta: 0, d4: 5, d3: 5, speed: 1, scale: 1 };

    await cse.execute({ intent, evidence, action: "render.session.start", run: async () => "ok" });
    await assert.rejects(
      () => cse.execute({ intent, evidence, action: "render.session.start", run: async () => { throw new Error("fail"); } }),
    );

    assert.equal(cse.listCsrs().length, 1);
  });

  it("exportProvenance has correct recordCount", async () => {
    const cse = new ConstitutionalStateEngine();
    const intent = cse.declareIntent({ kind: "test", goal: "test" });
    const evidence = { timestamp: "now", vertexCount: 16, edgeCount: 32, theta: 0, d4: 5, d3: 5, speed: 1, scale: 1 };
    await cse.execute({ intent, evidence, action: "render.session.start", run: async () => "ok" });

    const prov = cse.exportProvenance();
    assert.equal(prov.recordCount, cse.records.length);
    assert.equal(prov.csrs.length, 1);
  });
});

describe("CSE declareIntent edge cases", () => {
  it("with all optional fields", () => {
    const cse = new ConstitutionalStateEngine();
    const intent = cse.declareIntent({
      kind: "play_timeline",
      goal: "test timeline",
      constraints: { worldId: "w1" },
      actor: "4dce.timeline",
    });
    assert.equal(intent.actor, "4dce.timeline");
    assert.deepEqual(intent.constraints, { worldId: "w1" });
    assert.equal(intent.charterId, "charter.4dce.v1");
  });

  it("onRecord callback receives each phase", () => {
    const phases = [];
    const cse = new ConstitutionalStateEngine({ onRecord: (entry) => phases.push(entry.phase) });
    const intent = cse.declareIntent({ kind: "test", goal: "test" });
    assert.ok(phases.includes("intent"));
  });
});
