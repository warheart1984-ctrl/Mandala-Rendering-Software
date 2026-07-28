import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { GovernanceKernel } from "../GovernanceKernel.js";
import { ConstitutionalKnowledgeLayer } from "../ConstitutionalKnowledgeLayer.js";
import { CHARTER } from "../../constitution/charter.js";

const DEFAULT_POLICIES = [
  { id: "policy-no-execution-without-intent", condition: "intent != null", rule: "deny_if_false" },
  { id: "policy-no-state-change-without-evidence", condition: "require_evidence_for_mutation", rule: "deny_if_false" },
  { id: "policy-no-render-without-provenance", condition: "play_timeline_or_render_4d", rule: "attach_provenance" },
  { id: "policy-no-authority-without-contract", condition: "actor_has_contract", rule: "deny_if_false" },
  { id: "policy-play-timeline-requires-world", condition: "play_timeline_requires_world", rule: "deny_if_missing_world" },
  { id: "policy-ascension-drift-throttle", condition: "intent.timeline == 'mythar_ascension' && drift_score > 0.7", rule: "modify_param", param: "speed", modifier: "speed * 0.5" },
  { id: "policy-ascension-evidence", condition: "intent.timeline == 'mythar_ascension'", rule: "deny_if_false", require: ["ev-ascension-001", "ev-ascension-002"] },
];

describe("GovernanceKernel", () => {
  it("constructor with ckl sets charterId from CHARTER.id", () => {
    const ckl = new ConstitutionalKnowledgeLayer(DEFAULT_POLICIES);
    const kernel = new GovernanceKernel({ ckl });
    assert.equal(kernel.charterId, CHARTER.id);
    assert.equal(kernel.ckl, ckl);
  });

  it("constructor without ckl creates empty CKL", () => {
    const kernel = new GovernanceKernel();
    assert.ok(kernel.ckl, "ckl should be set");
    assert.equal(kernel.ckl.policies.length, 0);
    assert.equal(kernel.charterId, CHARTER.id);
  });

  it("constructor with null ckl creates empty CKL", () => {
    const kernel = new GovernanceKernel({ ckl: null });
    assert.ok(kernel.ckl);
    assert.equal(kernel.ckl.policies.length, 0);
  });

  it("evaluateIntent(null, null) returns ok=false", () => {
    const ckl = new ConstitutionalKnowledgeLayer(DEFAULT_POLICIES);
    const kernel = new GovernanceKernel({ ckl });
    const decision = kernel.evaluateIntent(null, null);
    assert.equal(decision.ok, false);
  });

  it("evaluateIntent with valid play_timeline returns ok=true with correct fields", () => {
    const ckl = new ConstitutionalKnowledgeLayer(DEFAULT_POLICIES);
    const kernel = new GovernanceKernel({ ckl });
    const decision = kernel.evaluateIntent(
      { id: "i1", type: "play_timeline", actor: "4dce.renderer", world: "w1" },
      { id: "ev1" }
    );
    assert.equal(decision.ok, true);
    assert.equal(decision.charterId, CHARTER.id);
    assert.equal(decision.intentId, "i1");
    assert.equal(decision.worldId, "w1");
  });

  it("evaluateIntent populates policiesApplied array", () => {
    const ckl = new ConstitutionalKnowledgeLayer(DEFAULT_POLICIES);
    const kernel = new GovernanceKernel({ ckl });
    const decision = kernel.evaluateIntent(
      { id: "i1", type: "play_timeline", actor: "4dce.renderer", world: "w1" },
      { id: "ev1" }
    );
    assert.ok(Array.isArray(decision.policiesApplied));
    assert.equal(decision.policiesApplied.length, 7);
    assert.ok(decision.policiesApplied.includes("policy-no-execution-without-intent"));
  });

  it("evaluateIntent populates precedentCount", () => {
    const ckl = new ConstitutionalKnowledgeLayer(DEFAULT_POLICIES);
    const kernel = new GovernanceKernel({ ckl });
    const decision = kernel.evaluateIntent(
      { id: "i1", type: "play_timeline", actor: "4dce.renderer", world: "w1" },
      { id: "ev1" }
    );
    assert.equal(typeof decision.precedentCount, "number");
    assert.equal(decision.precedentCount, 0);
  });

  it("evaluateIntent records precedent in CKL", () => {
    const ckl = new ConstitutionalKnowledgeLayer(DEFAULT_POLICIES);
    const kernel = new GovernanceKernel({ ckl });
    assert.equal(ckl.precedents.length, 0);
    kernel.evaluateIntent(
      { id: "i1", type: "play_timeline", actor: "4dce.renderer", world: "w1" },
      { id: "ev1" }
    );
    assert.equal(ckl.precedents.length, 1);
    assert.equal(ckl.precedents[0].intentId, "i1");
  });

  it("two calls to evaluateIntent: second has precedentCount >= 1", () => {
    const ckl = new ConstitutionalKnowledgeLayer(DEFAULT_POLICIES);
    const kernel = new GovernanceKernel({ ckl });
    kernel.evaluateIntent(
      { id: "i1", type: "play_timeline", actor: "4dce.renderer", world: "w1" },
      { id: "ev1" }
    );
    const second = kernel.evaluateIntent(
      { id: "i2", type: "play_timeline", actor: "4dce.renderer", world: "w1" },
      { id: "ev2" }
    );
    assert.ok(second.precedentCount >= 1, `Expected precedentCount >= 1, got: ${second.precedentCount}`);
  });

  it("resolveAuthority delegates to contracts module", () => {
    const kernel = new GovernanceKernel();
    const result = kernel.resolveAuthority("4dce.renderer", "render.session.start");
    assert.equal(result.ok, true);
    assert.equal(result.contractId, "contract.cinematic4d.v1");

    const denied = kernel.resolveAuthority("4dce.renderer", "timeline.play");
    assert.equal(denied.ok, false);
  });

  it("intent with world in constraints.worldId resolves correctly", () => {
    const ckl = new ConstitutionalKnowledgeLayer(DEFAULT_POLICIES);
    const kernel = new GovernanceKernel({ ckl });
    const decision = kernel.evaluateIntent(
      { id: "i1", type: "play_timeline", actor: "4dce.renderer", constraints: { worldId: "w-42" } },
      { id: "ev1" }
    );
    assert.equal(decision.worldId, "w-42");
    assert.equal(decision.ok, true);
  });

  it("denied intent still records precedent", () => {
    const ckl = new ConstitutionalKnowledgeLayer(DEFAULT_POLICIES);
    const kernel = new GovernanceKernel({ ckl });
    kernel.evaluateIntent(null, null);
    assert.equal(ckl.precedents.length, 1);
    assert.equal(ckl.precedents[0].decision, "deny");
  });
});
