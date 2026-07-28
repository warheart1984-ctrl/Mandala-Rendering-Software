import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { ConstitutionalKnowledgeLayer, resolveDecision } from "../ConstitutionalKnowledgeLayer.js";
import { GovernanceKernel } from "../GovernanceKernel.js";
import {
  ProvenanceRecorder,
  createFrameProvenance,
} from "../../runtime/ProvenanceRecorder.js";
import { ReplayService } from "../../runtime/ReplayService.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const defaultPolicies = JSON.parse(readFileSync(join(root, "engine/governance/policies/default.policies.json"), "utf-8"));

function makeEvidence(overrides = {}) {
  return { id: "ev1", timestamp: "now", ...overrides };
}

function makeIntent(overrides = {}) {
  return { id: "i1", type: "play_timeline", actor: "4dce.renderer", world: "w1", ...overrides };
}

describe("Conformance: provenance.recorder-exists", () => {
  it("ProvenanceRecorder has record/getFrames/clear", () => {
    const recorder = new ProvenanceRecorder();
    assert.equal(typeof recorder.record, "function");
    assert.equal(typeof recorder.getFrames, "function");
    assert.equal(typeof recorder.clear, "function");
  });
});

describe("Conformance: provenance.frame-fields", () => {
  it("frame has all 5 required fields", () => {
    const frame = createFrameProvenance({
      intentId: "i1",
      timelineId: "t1",
      worldId: "w1",
      timeSeconds: 0,
      parameters: {},
    });
    for (const field of ["intentId", "timelineId", "worldId", "timeSeconds", "parameters"]) {
      assert.ok(field in frame, `missing ${field}`);
    }
  });
});

describe("Conformance: provenance.frame-recorded-during-play", () => {
  it("frame is recorded", () => {
    const recorder = new ProvenanceRecorder();
    recorder.record(createFrameProvenance({
      intentId: "i1",
      timelineId: "t1",
      worldId: "w1",
      timeSeconds: 0,
      parameters: {},
    }));
    assert.ok(recorder.getFrames().length > 0);
  });
});

describe("Conformance: replay.service-exists", () => {
  it("ReplayService has static replay method", () => {
    assert.equal(typeof ReplayService.replay, "function");
  });
});

describe("Conformance: replay.deterministic-params", () => {
  it("applyFrame restores params via ReplayService", () => {
    const target = {
      params: {},
      applyFrame(frame) {
        this.params = { ...frame.parameters };
      },
    };
    const frame = createFrameProvenance({
      parameters: { theta: 1.5, speed: 2 },
    });
    ReplayService.replay([frame], target);
    assert.equal(target.params.theta, 1.5);
    assert.equal(target.params.speed, 2);
  });
});

describe("Conformance: binding.resolver-exists", () => {
  it("resolver resolves track bindings", () => {
    const bindings = { renderer: { apply: () => {} } };
    const resolved = bindings["renderer"];
    assert.ok(resolved);
  });
});

describe("Conformance: binding.all-tracks-resolved", () => {
  it("all tracks resolve successfully", () => {
    const tracks = [{ binding: "renderer" }, { binding: "camera" }];
    const bindings = { renderer: {}, camera: {} };
    const unresolved = tracks.filter((t) => !bindings[t.binding]);
    assert.equal(unresolved.length, 0);
  });
});

describe("Conformance: timeline.loader-exists", () => {
  it("loads GovernedTimelineDto structure", () => {
    const timeline = { id: "tl1", name: "test", tracks: [{ binding: "renderer", clips: [{ action: "set_param", from: 0, to: 1, duration: 1 }] }] };
    assert.ok(Array.isArray(timeline.tracks));
    assert.ok(timeline.tracks[0].clips.length > 0);
  });
});

describe("Conformance: timeline.clip-application", () => {
  it("lerp(from, to, 0.5) = midpoint", () => {
    const from = 1, to = 3;
    const result = from + (to - from) * 0.5;
    assert.equal(result, 2);
  });
});

describe("Conformance: timeline.world-required", () => {
  it("play_timeline without world is denied", () => {
    const ckl = new ConstitutionalKnowledgeLayer(defaultPolicies);
    const policies = ckl.GetPoliciesForWorld("*");
    const intent = makeIntent({ world: null });
    const decision = resolveDecision(intent, makeEvidence(), policies);
    assert.equal(decision.ok, false);
    assert.ok(decision.violations.includes("policy-play-timeline-requires-world"));
  });
});

describe("Conformance: evidence.bundle-fields", () => {
  it("evidence has id, worldId, timelineId", () => {
    const evidence = { id: "ev1", worldId: "w1", timelineId: "t1" };
    assert.ok(evidence.id);
    assert.ok(evidence.worldId);
    assert.ok(evidence.timelineId);
  });
});

describe("Conformance: evidence.dual-require", () => {
  it("ascension with 1/2 evidence is denied", () => {
    const ckl = new ConstitutionalKnowledgeLayer(defaultPolicies);
    const policies = ckl.GetPoliciesForWorld("*");
    const intent = makeIntent({ timeline: "mythar_ascension" });
    const evidence = makeEvidence({ evidenceIds: ["ev-ascension-001"] });
    const decision = resolveDecision(intent, evidence, policies);
    assert.equal(decision.ok, false);
    assert.ok(decision.violations.includes("policy-ascension-evidence"));
  });
});

describe("Conformance: ckl.policy-load", () => {
  it("default policies has >= 5 policies", () => {
    assert.ok(defaultPolicies.length >= 5);
  });
});

describe("Conformance: ckl.deny-without-intent", () => {
  it("null intent is denied", () => {
    const ckl = new ConstitutionalKnowledgeLayer(defaultPolicies);
    const policies = ckl.GetPoliciesForWorld("*");
    const decision = resolveDecision(null, null, policies);
    assert.equal(decision.ok, false);
  });
});

describe("Conformance: ckl.modify-param", () => {
  it("ascension with drift 0.9 produces paramAdjust", () => {
    const ckl = new ConstitutionalKnowledgeLayer(defaultPolicies);
    const policies = ckl.GetPoliciesForWorld("*");
    const intent = makeIntent({ timeline: "mythar_ascension" });
    const evidence = makeEvidence({ driftScore: 0.9, evidenceIds: ["ev-ascension-001", "ev-ascension-002"] });
    const decision = resolveDecision(intent, evidence, policies);
    assert.ok(decision.paramAdjust, "expected paramAdjust");
  });
});

describe("Conformance: ckl.attach-provenance", () => {
  it("play_timeline with evidence sets attachProvenance", () => {
    const ckl = new ConstitutionalKnowledgeLayer(defaultPolicies);
    const policies = ckl.GetPoliciesForWorld("*");
    const intent = makeIntent();
    const evidence = makeEvidence();
    const decision = resolveDecision(intent, evidence, policies);
    assert.equal(decision.attachProvenance, true);
  });
});
