import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, resolve } from "node:path";
import {
  ConstitutionalKnowledgeLayer,
  resolveDecision,
} from "../ConstitutionalKnowledgeLayer.js";

const governanceDir = dirname(fileURLToPath(import.meta.url));

const DEFAULT_POLICIES = [
  { id: "policy-no-execution-without-intent", condition: "intent != null", rule: "deny_if_false" },
  { id: "policy-no-state-change-without-evidence", condition: "require_evidence_for_mutation", rule: "deny_if_false" },
  { id: "policy-no-render-without-provenance", condition: "play_timeline_or_render_4d", rule: "attach_provenance" },
  { id: "policy-no-authority-without-contract", condition: "actor_has_contract", rule: "deny_if_false" },
  { id: "policy-play-timeline-requires-world", condition: "play_timeline_requires_world", rule: "deny_if_missing_world" },
  { id: "policy-ascension-drift-throttle", condition: "intent.timeline == 'mythar_ascension' && drift_score > 0.7", rule: "modify_param", param: "speed", modifier: "speed * 0.5" },
  { id: "policy-ascension-evidence", condition: "intent.timeline == 'mythar_ascension'", rule: "deny_if_false", require: ["ev-ascension-001", "ev-ascension-002"] },
];

describe("ConstitutionalKnowledgeLayer", () => {
  it("constructor with empty policies creates empty array", () => {
    const ckl = new ConstitutionalKnowledgeLayer([]);
    assert.deepEqual(ckl.policies, []);
    assert.deepEqual(ckl.precedents, []);
  });

  it("constructor with no argument creates empty policies", () => {
    const ckl = new ConstitutionalKnowledgeLayer();
    assert.deepEqual(ckl.policies, []);
  });

  it("constructor copies policies array (no reference leak)", () => {
    const src = [{ id: "p1" }];
    const ckl = new ConstitutionalKnowledgeLayer(src);
    assert.equal(ckl.policies.length, 1);
    src.push({ id: "p2" });
    assert.equal(ckl.policies.length, 1, "should not be affected by external mutation");
  });

  it("GetPoliciesForWorld returns worldId and policies array", () => {
    const ckl = new ConstitutionalKnowledgeLayer(DEFAULT_POLICIES);
    const result = ckl.GetPoliciesForWorld("world-1");
    assert.equal(result.worldId, "world-1");
    assert.ok(Array.isArray(result.policies));
    assert.equal(result.policies.length, 7);
    assert.ok(result.loadedAt, "should have loadedAt timestamp");
  });

  it("GetPoliciesForWorld with null worldId uses wildcard", () => {
    const ckl = new ConstitutionalKnowledgeLayer(DEFAULT_POLICIES);
    const result = ckl.GetPoliciesForWorld(null);
    assert.equal(result.worldId, "*");
  });

  it("GetPrecedents with intent type filter works", () => {
    const ckl = new ConstitutionalKnowledgeLayer(DEFAULT_POLICIES);
    ckl.recordPrecedent({
      intent: { type: "play_timeline", world: "w1" },
      decision: { ok: true },
    });
    ckl.recordPrecedent({
      intent: { type: "render_4d_tesseract", world: "w2" },
      decision: { ok: true },
    });

    const filtered = ckl.GetPrecedents({ type: "play_timeline" });
    assert.equal(filtered.length, 1);
    assert.equal(filtered[0].intentType, "play_timeline");

    const all = ckl.GetPrecedents({});
    assert.equal(all.length, 2);
  });

  it("GetPrecedents filters by world when type does not match", () => {
    const ckl = new ConstitutionalKnowledgeLayer(DEFAULT_POLICIES);
    ckl.recordPrecedent({
      intent: { type: "play_timeline", world: "w1" },
      decision: { ok: true },
    });

    const byWorld = ckl.GetPrecedents({ type: "other_type", world: "w1" });
    assert.equal(byWorld.length, 1, "should match by worldId");
  });

  it("recordPrecedent appends to precedents list", () => {
    const ckl = new ConstitutionalKnowledgeLayer([]);
    assert.equal(ckl.precedents.length, 0);
    ckl.recordPrecedent({
      intent: { type: "test", world: "w1", id: "i1" },
      decision: { ok: true },
    });
    assert.equal(ckl.precedents.length, 1);
  });

  it("recordPrecedent returns row with id, intentType, worldId, decision, at", () => {
    const ckl = new ConstitutionalKnowledgeLayer([]);
    const row = ckl.recordPrecedent({
      intent: { type: "play_timeline", world: "w1", id: "i1" },
      decision: { ok: true, verdict: "allow" },
    });
    assert.ok(row.id, "should have id");
    assert.ok(row.id.startsWith("precedent-"), `id should start with "precedent-", got: ${row.id}`);
    assert.equal(row.intentType, "play_timeline");
    assert.equal(row.worldId, "w1");
    assert.equal(row.intentId, "i1");
    assert.equal(row.decision, "allow");
    assert.ok(row.at, "should have at timestamp");
  });

  it("recordPrecedent uses verdict from decision if available", () => {
    const ckl = new ConstitutionalKnowledgeLayer([]);
    const row = ckl.recordPrecedent({
      intent: { type: "test" },
      decision: { ok: false, verdict: "deny" },
    });
    assert.equal(row.decision, "deny");
  });

  it("loadDefault resolves policies via import.meta.url base (Node fetch stub)", async () => {
    async function stubFetch(url) {
      const href = String(url);
      const filePath = fileURLToPath(new URL(href));
      const text = await readFile(filePath, "utf-8");
      return { ok: true, json: async () => JSON.parse(text) };
    }
    const ckl = await ConstitutionalKnowledgeLayer.loadDefault(stubFetch);
    assert.ok(ckl.policies.length >= 5, "default.policies.json should load");
  });

  it("loadDefault accepts explicit policiesBaseUrl override", async () => {
    async function stubFetch(url) {
      const filePath = fileURLToPath(new URL(String(url)));
      const text = await readFile(filePath, "utf-8");
      return { ok: true, json: async () => JSON.parse(text) };
    }
    const cklModuleDir = resolve(governanceDir, "..");
    const base = pathToFileURL(`${cklModuleDir}/`).href;
    const ckl = await ConstitutionalKnowledgeLayer.loadDefault(stubFetch, {
      policiesBaseUrl: base,
    });
    assert.ok(
      ckl.policies.some((p) => p.id === "policy-no-execution-without-intent"),
    );
  });
});

describe("resolveDecision()", () => {
  const policySet = { policies: DEFAULT_POLICIES };

  it("null intent returns ok=false with policy-no-execution-without-intent violation", () => {
    const result = resolveDecision(null, null, policySet);
    assert.equal(result.ok, false);
    assert.equal(result.verdict, "deny");
    assert.ok(
      result.violations.includes("policy-no-execution-without-intent"),
      `Expected violation for null intent, got: ${JSON.stringify(result.violations)}`
    );
  });

  it("mutation type without evidence is denied", () => {
    const result = resolveDecision(
      { type: "play_timeline" },
      null,
      policySet
    );
    assert.equal(result.ok, false);
    assert.ok(
      result.violations.includes("policy-no-state-change-without-evidence"),
      `Expected evidence violation, got: ${JSON.stringify(result.violations)}`
    );
  });

  it("play_timeline with evidence and no actor is denied (actor_has_contract)", () => {
    const result = resolveDecision(
      { type: "play_timeline" },
      { id: "ev1" },
      policySet
    );
    assert.equal(result.ok, false);
    assert.ok(
      result.violations.includes("policy-no-authority-without-contract"),
      `Expected authority violation, got: ${JSON.stringify(result.violations)}`
    );
  });

  it("play_timeline with actor but no world is denied", () => {
    const result = resolveDecision(
      { type: "play_timeline", actor: "4dce.renderer" },
      { id: "ev1" },
      policySet
    );
    assert.equal(result.ok, false);
    assert.ok(
      result.violations.includes("policy-play-timeline-requires-world"),
      `Expected world violation, got: ${JSON.stringify(result.violations)}`
    );
  });

  it("play_timeline with all required fields is allowed with attachProvenance", () => {
    const result = resolveDecision(
      { type: "play_timeline", actor: "4dce.renderer", world: "w1" },
      { id: "ev1" },
      policySet
    );
    assert.equal(result.ok, true);
    assert.equal(result.verdict, "allow");
    assert.equal(result.attachProvenance, true);
  });

  it("update_world without evidence is denied", () => {
    const result = resolveDecision(
      { type: "update_world" },
      null,
      policySet
    );
    assert.equal(result.ok, false);
    assert.ok(
      result.violations.includes("policy-no-state-change-without-evidence")
    );
  });

  it("render_4d_tesseract without evidence is denied", () => {
    const result = resolveDecision(
      { type: "render_4d_tesseract" },
      null,
      policySet
    );
    assert.equal(result.ok, false);
    assert.ok(
      result.violations.includes("policy-no-state-change-without-evidence")
    );
    assert.ok(
      result.violations.includes("policy-no-render-without-provenance")
    );
  });

  it("intent with null actor is denied (actor_has_contract)", () => {
    const result = resolveDecision(
      { actor: null },
      { id: "ev1" },
      policySet
    );
    assert.equal(result.ok, false);
    assert.ok(
      result.violations.includes("policy-no-authority-without-contract")
    );
  });

  it("unknown actor without registered contract is denied", () => {
    const result = resolveDecision(
      { type: "query", actor: "unknown.actor" },
      { id: "ev1" },
      policySet
    );
    assert.equal(result.ok, false);
    assert.ok(
      result.violations.includes("policy-no-authority-without-contract"),
      `Expected authority violation, got: ${JSON.stringify(result.violations)}`
    );
  });

  it("actor with explicit unauthorized action is denied via resolveAuthority", () => {
    const result = resolveDecision(
      {
        type: "query",
        actor: "4dce.renderer",
        action: "timeline.play",
      },
      { id: "ev1" },
      policySet
    );
    assert.equal(result.ok, false);
    assert.ok(
      result.violations.includes("policy-no-authority-without-contract")
    );
  });

  it("actor with explicit authorized action is allowed", () => {
    const result = resolveDecision(
      {
        type: "query",
        actor: "4dce.renderer",
        action: "render.session.start",
      },
      { id: "ev1" },
      policySet
    );
    assert.equal(result.ok, true);
    assert.equal(result.verdict, "allow");
  });

  it("play_timeline with world=null is denied", () => {
    const result = resolveDecision(
      { type: "play_timeline", actor: "4dce.renderer", world: null },
      { id: "ev1" },
      policySet
    );
    assert.equal(result.ok, false);
    assert.ok(
      result.violations.includes("policy-play-timeline-requires-world")
    );
  });

  it("play_timeline with world on intent is allowed", () => {
    const result = resolveDecision(
      { type: "play_timeline", actor: "4dce.renderer", world: "w1" },
      { id: "ev1" },
      policySet
    );
    assert.equal(result.ok, true);
    assert.equal(result.attachProvenance, true);
  });

  it("play_timeline with world from constraints.worldId is allowed", () => {
    const result = resolveDecision(
      { type: "play_timeline", actor: "4dce.renderer", constraints: { worldId: "w1" } },
      { id: "ev1" },
      policySet
    );
    assert.equal(result.ok, true);
    assert.equal(result.attachProvenance, true);
  });

  it("ascension drift throttle applies paramAdjust when drift > 0.7", () => {
    const result = resolveDecision(
      { type: "play_timeline", actor: "4dce.renderer", world: "w1", timeline: "mythar_ascension" },
      { id: "ev1", driftScore: 0.9 },
      policySet
    );
    assert.ok(result.paramAdjust, "paramAdjust should exist");
    assert.ok(result.paramAdjust.speed !== undefined, "paramAdjust.speed should exist");
    assert.equal(result.paramAdjust.speed, 0.5, "speed should be 1 * 0.5 = 0.5");
  });

  it("modify_param with unparseable modifier leaves param unchanged", () => {
    const policies = [
      ...DEFAULT_POLICIES,
      {
        id: "policy-bad-modifier",
        condition: "intent.timeline == 'mythar_ascension' && drift_score > 0.7",
        rule: "modify_param",
        param: "speed",
        modifier: "not-a-valid-expr",
      },
    ];
    const result = resolveDecision(
      {
        type: "play_timeline",
        actor: "4dce.renderer",
        world: "w1",
        timeline: "mythar_ascension",
        params: { speed: 3 },
      },
      { id: "ev1", driftScore: 0.9 },
      { policies },
    );
    assert.equal(result.paramAdjust.speed, 3);
  });

  it("modify_param with unknown multiplier variable leaves param unchanged", () => {
    const policies = [
      ...DEFAULT_POLICIES,
      {
        id: "policy-missing-var",
        condition: "intent.timeline == 'mythar_ascension' && drift_score > 0.7",
        rule: "modify_param",
        param: "speed",
        modifier: "missingKey * 0.5",
      },
    ];
    const result = resolveDecision(
      {
        type: "play_timeline",
        actor: "4dce.renderer",
        world: "w1",
        timeline: "mythar_ascension",
        params: { speed: 4 },
      },
      { id: "ev1", driftScore: 0.9 },
      { policies },
    );
    assert.equal(result.paramAdjust.speed, 4);
  });

  it("ascension drift throttle does not fire when drift <= 0.7", () => {
    const result = resolveDecision(
      { type: "play_timeline", actor: "4dce.renderer", world: "w1", timeline: "mythar_ascension" },
      { id: "ev1", driftScore: 0.5 },
      policySet
    );
    assert.equal(result.paramAdjust, null, "paramAdjust should be null when drift is low");
  });

  it("ascension evidence missing causes denial", () => {
    const result = resolveDecision(
      { type: "play_timeline", actor: "4dce.renderer", world: "w1", timeline: "mythar_ascension" },
      { id: "ev1" },
      policySet
    );
    assert.equal(result.ok, false);
    assert.ok(
      result.violations.includes("policy-ascension-evidence"),
      `Expected ascension-evidence violation, got: ${JSON.stringify(result.violations)}`
    );
  });

  it("ascension evidence present is allowed", () => {
    const result = resolveDecision(
      { type: "play_timeline", actor: "4dce.renderer", world: "w1", timeline: "mythar_ascension" },
      { id: "ev1", evidenceIds: ["ev-ascension-001", "ev-ascension-002"] },
      policySet
    );
    assert.equal(result.ok, true);
    assert.equal(result.attachProvenance, true);
  });

  it("non-mutation type with no evidence is allowed", () => {
    const result = resolveDecision(
      { type: "query", actor: "4dce.renderer" },
      null,
      policySet
    );
    assert.equal(result.ok, true);
  });

  it("precedent drift: 2+ denials produce speedFactor adjustment", () => {
    const precedents = [
      { decision: false },
      { decision: false },
      { decision: true },
    ];
    const result = resolveDecision(
      { type: "play_timeline", actor: "4dce.renderer", world: "w1", params: { speed: 1 } },
      { id: "ev1" },
      policySet,
      precedents
    );
    assert.ok(result.paramAdjust, "paramAdjust should exist");
    assert.equal(result.paramAdjust.speedFactor, 0.75);
  });

  it("precedent drift does not trigger with fewer than 2 denials", () => {
    const precedents = [
      { decision: false },
      { decision: true },
    ];
    const result = resolveDecision(
      { type: "play_timeline", actor: "4dce.renderer", world: "w1", params: { speed: 1 } },
      { id: "ev1" },
      policySet,
      precedents
    );
    assert.equal(result.paramAdjust, null);
  });

  it("non-matching timeline produces no ascension violations", () => {
    const result = resolveDecision(
      { type: "play_timeline", actor: "4dce.renderer", world: "w1", timeline: "some_other_timeline" },
      { id: "ev1" },
      policySet
    );
    assert.equal(result.ok, true);
    assert.ok(
      !result.violations.includes("policy-ascension-evidence"),
      "should not have ascension-evidence violation for non-matching timeline"
    );
  });

  it("empty policySet results in ok=true", () => {
    const result = resolveDecision(
      { type: "play_timeline", actor: "4dce.renderer", world: "w1" },
      { id: "ev1" },
      { policies: [] }
    );
    assert.equal(result.ok, true);
    assert.equal(result.violations.length, 0);
  });

  it("null policySet results in ok=true (no policies to evaluate)", () => {
    const result = resolveDecision(
      { type: "play_timeline", actor: "4dce.renderer", world: "w1" },
      { id: "ev1" },
      null
    );
    assert.equal(result.ok, true);
    assert.equal(result.violations.length, 0);
  });

  it("successful decision includes decisionId", () => {
    const result = resolveDecision(
      { id: "intent-xyz", type: "play_timeline", actor: "4dce.renderer", world: "w1" },
      { id: "ev1" },
      policySet
    );
    assert.equal(result.ok, true);
    assert.equal(result.decisionId, "decision-intent-xyz");
  });
});
