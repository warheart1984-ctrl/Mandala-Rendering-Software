import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { ConstitutionalKnowledgeLayer, resolveDecision } from "../ConstitutionalKnowledgeLayer.js";
import { GovernanceKernel } from "../GovernanceKernel.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const defaultPolicies = JSON.parse(readFileSync(join(root, "engine/governance/policies/default.policies.json"), "utf-8"));

function makeEvidence(overrides = {}) {
  return { id: "ev1", timestamp: "now", vertexCount: 16, edgeCount: 32, theta: 0, d4: 5, d3: 5, speed: 1, scale: 1, ...overrides };
}

function makeIntent(overrides = {}) {
  return { id: `i-${Date.now()}-${Math.random().toString(36).slice(2)}`, type: "play_timeline", actor: "4dce.renderer", world: "w1", ...overrides };
}

describe("Integration: full governed cycle", () => {
  it("CKL → GK → evaluateIntent → ok with attachProvenance", () => {
    const ckl = new ConstitutionalKnowledgeLayer(defaultPolicies);
    const gk = new GovernanceKernel({ ckl });
    const intent = makeIntent();
    const evidence = makeEvidence();

    const decision = gk.evaluateIntent(intent, evidence);
    assert.equal(decision.ok, true);
    assert.equal(decision.attachProvenance, true);
    assert.equal(decision.charterId, "charter.4dce.v1");
    assert.equal(decision.worldId, "w1");
    assert.ok(Array.isArray(decision.policiesApplied));
    assert.ok(decision.policiesApplied.length >= 5);
  });

  it("authority check passes for valid actor/action", () => {
    const ckl = new ConstitutionalKnowledgeLayer(defaultPolicies);
    const gk = new GovernanceKernel({ ckl });
    const auth = gk.resolveAuthority("4dce.renderer", "render.session.start");
    assert.equal(auth.ok, true);
    assert.equal(auth.contractId, "contract.cinematic4d.v1");
  });

  it("deny flow: play_timeline with null world", () => {
    const ckl = new ConstitutionalKnowledgeLayer(defaultPolicies);
    const gk = new GovernanceKernel({ ckl });
    const intent = makeIntent({ world: null });
    const evidence = makeEvidence();

    const decision = gk.evaluateIntent(intent, evidence);
    assert.equal(decision.ok, false);
    assert.ok(decision.violations.includes("policy-play-timeline-requires-world"));
  });

  it("precedent accumulation across calls", () => {
    const ckl = new ConstitutionalKnowledgeLayer(defaultPolicies);
    const gk = new GovernanceKernel({ ckl });

    gk.evaluateIntent(makeIntent(), makeEvidence());
    gk.evaluateIntent(makeIntent(), makeEvidence());
    const third = gk.evaluateIntent(makeIntent(), makeEvidence());

    assert.ok(third.precedentCount >= 2, `expected >= 2, got ${third.precedentCount}`);
  });

  it("authority denial still records precedent", () => {
    const ckl = new ConstitutionalKnowledgeLayer(defaultPolicies);
    const gk = new GovernanceKernel({ ckl });
    const intent = makeIntent({ actor: "unknown" });
    const evidence = makeEvidence();

    gk.evaluateIntent(intent, evidence);
    const precedents = ckl.GetPrecedents(intent);
    assert.ok(precedents.length > 0);
  });

  it("different worlds get correct worldId", () => {
    const ckl = new ConstitutionalKnowledgeLayer(defaultPolicies);
    const gk = new GovernanceKernel({ ckl });

    const d1 = gk.evaluateIntent(makeIntent({ world: "alpha" }), makeEvidence());
    const d2 = gk.evaluateIntent(makeIntent({ world: "beta" }), makeEvidence());

    assert.equal(d1.worldId, "alpha");
    assert.equal(d2.worldId, "beta");
  });

  it("precedent drift: 2+ denials produce speedFactor", () => {
    const ckl = new ConstitutionalKnowledgeLayer(defaultPolicies);
    const gk = new GovernanceKernel({ ckl });

    // Two denied intents (missing world) — need params for drift to trigger
    gk.evaluateIntent(makeIntent({ world: null, params: {} }), makeEvidence());
    gk.evaluateIntent(makeIntent({ world: null, params: {} }), makeEvidence());

    // Third should have precedent drift (needs params for speedFactor)
    const intent = makeIntent({ params: {} });
    const decision = gk.evaluateIntent(intent, makeEvidence());
    assert.ok(decision.paramAdjust, "expected paramAdjust from precedent drift");
    assert.equal(decision.paramAdjust.speedFactor, 0.75);
  });

  it("full governed cycle with CSR verification", () => {
    const ckl = new ConstitutionalKnowledgeLayer(defaultPolicies);
    const gk = new GovernanceKernel({ ckl });

    const intent = makeIntent();
    const evidence = makeEvidence();
    const decision = gk.evaluateIntent(intent, evidence);

    assert.equal(decision.ok, true);

    // Simulate CSR creation (as CSE would do)
    const csr = {
      id: `csr-${Date.now()}`,
      intentId: decision.intentId,
      action: "play_timeline",
      contractId: gk.resolveAuthority(intent.actor, "play_timeline").contractId,
      charterId: decision.charterId,
      evidence,
      result: decision,
      createdAt: new Date().toISOString(),
    };

    assert.ok(csr.id);
    assert.equal(csr.intentId, intent.id);
    assert.equal(csr.charterId, "charter.4dce.v1");
    assert.ok(csr.contractId);
    assert.ok(csr.createdAt);
  });
});
