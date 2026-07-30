import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { ConstitutionalKnowledgeLayer } from "../ConstitutionalKnowledgeLayer.js";
import { GovernanceKernel } from "../GovernanceKernel.js";
import { ConstitutionalStateEngine } from "../../../js/constitution/cse.js";
import { ExecutionOrchestrator } from "../../../js/engine/services/orchestrator.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const defaultPolicies = JSON.parse(
  readFileSync(join(root, "engine/governance/policies/default.policies.json"), "utf-8"),
);

const VALID_EVIDENCE = {
  timestamp: "now",
  vertexCount: 16,
  edgeCount: 32,
  theta: 0,
  d4: 5,
  d3: 5,
  speed: 1,
  scale: 1,
};

function makeEvidence(overrides = {}) {
  return { id: "ev1", worldId: "w1", timelineId: "tl1", ...VALID_EVIDENCE, ...overrides };
}

describe("ExecutionOrchestrator (CKL → GK → CSE)", () => {
  it("plan lists constitutional phases", () => {
    const ckl = new ConstitutionalKnowledgeLayer(defaultPolicies);
    const cse = new ConstitutionalStateEngine();
    const gk = new GovernanceKernel({ ckl, cse });
    const orch = new ExecutionOrchestrator({ gk, cse });
    const intent = { id: "i-test", type: "play_timeline" };
    const plan = orch.plan(intent, "render.session.start");
    assert.ok(plan.planId.startsWith("plan-"));
    assert.ok(plan.phases.includes("replay"));
  });

  it("execute runs GK gate then CSE CSR with governanceTrace", async () => {
    const cse = new ConstitutionalStateEngine();
    const ckl = new ConstitutionalKnowledgeLayer(defaultPolicies);
    const gk = new GovernanceKernel({ ckl, cse });
    const orch = new ExecutionOrchestrator({ gk, cse });

    const intent = cse.declareIntent({
      kind: "orchestrator-test",
      goal: "wire-ckl-gk-cse",
    });
    intent.world = "w-demo";
    intent.type = "play_timeline";

    const evidence = makeEvidence({ id: "ev-orch", worldId: "w-demo", timelineId: "tl-demo" });

    const { plan, decision, csr } = await orch.execute({
      intent,
      evidence,
      action: "render.session.start",
      run: async () => ({ ok: true }),
    });

    assert.equal(decision.ok, true);
    assert.equal(decision.attachProvenance, true);
    assert.ok(plan.planId);
    assert.ok(csr.id.startsWith("csr-"));
    assert.equal(csr.action, "render.session.start");

    // CKL→CSE integration: governanceTrace must be embedded in CSR
    assert.ok(csr.governanceTrace, "CSR must contain governanceTrace from CKL decision");
    assert.equal(csr.governanceTrace.verdict, "allow");
    assert.ok(Array.isArray(csr.governanceTrace.policiesApplied));
    assert.ok(csr.governanceTrace.policiesApplied.length >= 5);
    assert.equal(csr.governanceTrace.attachProvenance, true);
    assert.equal(csr.governanceTrace.decisionId, decision.decisionId);
  });

  it("execute throws when GK denies (missing world)", async () => {
    const cse = new ConstitutionalStateEngine();
    const ckl = new ConstitutionalKnowledgeLayer(defaultPolicies);
    const gk = new GovernanceKernel({ ckl, cse });
    const orch = new ExecutionOrchestrator({ gk, cse });

    const intent = cse.declareIntent({ kind: "deny", goal: "test" });
    intent.type = "play_timeline";
    intent.world = null;

    await assert.rejects(
      () =>
        orch.execute({
          intent,
          evidence: VALID_EVIDENCE,
          action: "render.session.start",
          run: async () => ({}),
        }),
      /Constitutional policy violation/,
    );
  });

  it("paramAdjust from CKL precedent drift flows into CSR governanceTrace", async () => {
    const cse = new ConstitutionalStateEngine();
    const ckl = new ConstitutionalKnowledgeLayer(defaultPolicies);
    const gk = new GovernanceKernel({ ckl, cse });
    const orch = new ExecutionOrchestrator({ gk, cse });

    // Two denied intents build precedent drift (same type for GetPrecedents matching)
    for (const i of [1, 2]) {
      const denied = { id: `i-deny-${i}`, type: "play_timeline", kind: "play_timeline", world: null, params: {} };
      gk.evaluateIntent(denied, makeEvidence());
    }

    // Third (allowed) intent should inherit speedFactor from precedent drift
    const intent = cse.declareIntent({ kind: "prec-drift", goal: "test-drift" });
    intent.world = "w-drift";
    intent.type = "play_timeline";
    intent.params = {};
    const evidence = makeEvidence({ id: "ev-drift", worldId: "w-drift", timelineId: "tl-drift" });

    const { csr } = await orch.execute({
      intent,
      evidence,
      action: "render.session.start",
      run: async () => ({ ok: true }),
    });

    assert.ok(csr.governanceTrace, "CSR must contain governanceTrace");
    assert.ok(csr.governanceTrace.paramAdjust, "paramAdjust must be present from precedent drift");
    assert.equal(csr.governanceTrace.paramAdjust.speedFactor, 0.75);
    assert.equal(csr.governanceTrace.paramAdjust.reason, "high_drift_precedent");
  });

  it("CSR governanceTrace includes precedentCount from CKL evaluation", async () => {
    const cse = new ConstitutionalStateEngine();
    const ckl = new ConstitutionalKnowledgeLayer(defaultPolicies);
    const gk = new GovernanceKernel({ ckl, cse });
    const orch = new ExecutionOrchestrator({ gk, cse });

    // Build some precedent with matching type/world
    const d1 = { id: "i-prec-1", type: "play_timeline", kind: "play_timeline", world: "w-prec" };
    gk.evaluateIntent(d1, makeEvidence({ worldId: "w-prec" }));
    const d2 = { id: "i-prec-2", type: "play_timeline", kind: "play_timeline", world: "w-prec" };
    gk.evaluateIntent(d2, makeEvidence({ worldId: "w-prec" }));

    const intent = cse.declareIntent({ kind: "prec-exec", goal: "check-counts" });
    intent.world = "w-prec";
    intent.type = "play_timeline";
    const evidence = makeEvidence({ id: "ev-prec", worldId: "w-prec", timelineId: "tl-prec" });

    const { csr } = await orch.execute({
      intent, evidence,
      action: "render.session.start",
      run: async () => ({ ok: true }),
    });

    assert.ok(csr.governanceTrace.precedentCount >= 2);
  });
});

describe("GovernanceKernel.cse (integration note)", () => {
  it("stores CSE reference without delegating evaluateIntent (partial wiring)", () => {
    const cse = new ConstitutionalStateEngine();
    const ckl = new ConstitutionalKnowledgeLayer(defaultPolicies);
    const gk = new GovernanceKernel({ ckl, cse });
    assert.equal(gk.cse, cse);
    assert.equal(typeof gk.evaluateIntent, "function");
  });
});
