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

describe("ExecutionOrchestrator (CKL → GK → CSE)", () => {
  it("plan lists constitutional phases", () => {
    const ckl = new ConstitutionalKnowledgeLayer(defaultPolicies);
    const gk = new GovernanceKernel({ ckl, cse: new ConstitutionalStateEngine() });
    const orch = new ExecutionOrchestrator({ gk, cse: gk.cse });
    const intent = { id: "i-test", type: "play_timeline" };
    const plan = orch.plan(intent, "render.session.start");
    assert.ok(plan.planId.startsWith("plan-"));
    assert.ok(plan.phases.includes("replay"));
  });

  it("execute runs GK gate then CSE CSR", async () => {
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

    const evidence = { ...VALID_EVIDENCE, id: "ev-orch", worldId: "w-demo", timelineId: "tl-demo" };

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
