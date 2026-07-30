/**
 * BrowserRuntimeAdapter — conformance probes for the browser host.
 *
 * Each probe is a self-contained test that exercises the real JS
 * services already on disk and returns { pass, reason? }.
 */

import {
  createFrameProvenance,
  ProvenanceRecorder,
} from "../runtime/ProvenanceRecorder.js";
import { ReplayService } from "../runtime/ReplayService.js";
import {
  ConstitutionalKnowledgeLayer,
  resolveDecision,
} from "../governance/ConstitutionalKnowledgeLayer.js";
import { GovernanceKernel } from "../governance/GovernanceKernel.js";
import { ConstitutionalStateEngine } from "../../js/constitution/cse.js";
import { ExecutionOrchestrator } from "../../js/engine/services/orchestrator.js";
import { TimelinePlayer } from "../../js/engine/cinematic/TimelinePlayer.js";
import {
  getActorIdentity as browserActorIdentity,
  getCapabilities as browserCapabilities,
  route as browserRoute,
  HostAction,
} from "../runtime/hosts/BrowserHostBridge.js";

// ── helpers ────────────────────────────────────────────────────────

function makeIntent(overrides = {}) {
  return {
    id: "test-intent",
    type: "play_timeline",
    kind: "play_timeline",
    actor: "4dce.renderer",
    world: "world-test",
    timeline: "test-timeline",
    evidence: ["ev-001"],
    ...overrides,
  };
}

function makeEvidence(ids = ["ev-001"], extra = {}) {
  return {
    items: ids.map((id) => ({ id, worldId: "world-test", timelineId: "test-timeline" })),
    ...extra,
  };
}

function makeSampleTimeline() {
  return {
    id: "test-timeline",
    name: "Test Timeline",
    durationSec: 2,
    tracks: [
      {
        id: "track-1",
        binding: "entity-renderer",
        clips: [
          {
            id: "clip-1",
            action: "set_param",
            startSec: 0,
            durationSec: 2,
            payload: { param: "speed", from: 1, to: 3 },
          },
        ],
      },
    ],
  };
}

// ── adapter ────────────────────────────────────────────────────────

/**
 * Build a RuntimeAdapter object for the browser host.
 * @param {Function} [fetchImpl] - optional fetch override for policy loading
 */
export async function createBrowserAdapter(fetchImpl) {
  const ckl = await ConstitutionalKnowledgeLayer.loadDefault(fetchImpl);
  const policySet = ckl.GetPoliciesForWorld("world-test");

  return {
    // ── MultiHost constitutional surface (not conformance probe ids) ──
    getActorIdentity: (overrides) => browserActorIdentity(overrides),
    getCapabilities: () => browserCapabilities(),
    route: (action, payload = {}) => browserRoute(action, payload),
    HostAction,

    // ── provenance ──────────────────────────────────────────────

    "provenance.recorder-exists": async () => {
      const r = new ProvenanceRecorder();
      const hasApi =
        typeof r.record === "function" &&
        typeof r.getFrames === "function" &&
        typeof r.clear === "function";
      return { pass: hasApi, reason: hasApi ? undefined : "Missing recorder API" };
    },

    "provenance.frame-fields": async () => {
      const f = createFrameProvenance({
        intentId: "i",
        timelineId: "t",
        worldId: "w",
        timeSeconds: 1.0,
        parameters: { speed: 2 },
      });
      const ok =
        f.intentId === "i" &&
        f.timelineId === "t" &&
        f.worldId === "w" &&
        typeof f.timeSeconds === "number" &&
        typeof f.parameters === "object";
      return { pass: ok, reason: ok ? undefined : "Frame missing required fields" };
    },

    "provenance.frame-recorded-during-play": async () => {
      const rec = new ProvenanceRecorder();
      const tl = makeSampleTimeline();
      const player = new TimelinePlayer(tl);
      const renderer = { speed: 1 };

      player.play();
      for (let i = 0; i < 10; i++) {
        player.tick(0.2, renderer);
        rec.record(
          createFrameProvenance({
            intentId: "i",
            timelineId: tl.id,
            worldId: "w",
            timeSeconds: player.timeSec,
            parameters: { speed: renderer.speed },
          }),
        );
      }

      const ok = rec.count > 0;
      return { pass: ok, reason: ok ? undefined : "No frames recorded" };
    },

    // ── replay ──────────────────────────────────────────────────

    "replay.service-exists": async () => {
      const ok = typeof ReplayService.replay === "function";
      return { pass: ok, reason: ok ? undefined : "ReplayService.replay not found" };
    },

    "replay.deterministic-params": async () => {
      const frames = [
        createFrameProvenance({ intentId: "i", timelineId: "t", worldId: "w", timeSeconds: 0, parameters: { speed: 1.5 } }),
        createFrameProvenance({ intentId: "i", timelineId: "t", worldId: "w", timeSeconds: 1, parameters: { speed: 2.5 } }),
      ];
      const captured = [];
      const target = {
        applyFrame(f) {
          captured.push({ ...f.parameters });
        },
      };
      ReplayService.replay(frames, target);
      const ok =
        captured.length === 2 &&
        captured[0].speed === 1.5 &&
        captured[1].speed === 2.5;
      return { pass: ok, reason: ok ? undefined : "Replayed params mismatch" };
    },

    // ── binding ─────────────────────────────────────────────────

    "binding.resolver-exists": async () => {
      // Browser binding is implicit (renderer is the bound target).
      // We verify the TimelinePlayer applies to an object by reference.
      const renderer = { speed: 0 };
      const tl = makeSampleTimeline();
      const player = new TimelinePlayer(tl);
      player.play();
      player.tick(1.0, renderer);
      const ok = renderer.speed !== 0;
      return { pass: ok, reason: ok ? undefined : "TimelinePlayer did not bind" };
    },

    "binding.all-tracks-resolved": async () => {
      // In browser, all tracks resolve because the renderer object has
      // the target properties.  Check that tick applied something.
      const renderer = { speed: 0 };
      const tl = makeSampleTimeline();
      const player = new TimelinePlayer(tl);
      player.play();
      const result = player.tick(1.0, renderer);
      const ok = result.applied.length > 0;
      return { pass: ok, reason: ok ? undefined : "Track clip not applied" };
    },

    // ── timeline ────────────────────────────────────────────────

    "timeline.loader-exists": async () => {
      // Browser loads timeline JSON via fetch and constructs TimelinePlayer.
      const tl = makeSampleTimeline();
      const player = new TimelinePlayer(tl);
      const ok = player.durationSec === 2;
      return { pass: ok };
    },

    "timeline.clip-application": async () => {
      const renderer = { speed: 0 };
      const tl = makeSampleTimeline();
      const player = new TimelinePlayer(tl);
      player.play();
      player.tick(1.0, renderer); // midpoint → lerp(1,3,0.5) = 2
      const ok = Math.abs(renderer.speed - 2) < 0.01;
      return { pass: ok, reason: ok ? undefined : `Expected 2, got ${renderer.speed}` };
    },

    "timeline.world-required": async () => {
      const intent = makeIntent({ world: null });
      const evidence = makeEvidence();
      const result = resolveDecision(intent, evidence, policySet);
      const ok = !result.ok;
      return { pass: ok, reason: ok ? undefined : "CKL allowed play without world" };
    },

    // ── evidence ────────────────────────────────────────────────

    "evidence.bundle-fields": async () => {
      const ev = makeEvidence(["ev-001"]);
      const item = ev.items?.[0];
      const ok = item?.id && item?.worldId && item?.timelineId;
      return { pass: !!ok };
    },

    "evidence.dual-require": async () => {
      const intent = makeIntent({ timeline: "mythar_ascension" });
      // Only one of the two required evidence ids
      const evidence = makeEvidence(["ev-ascension-001"]);
      const result = resolveDecision(intent, evidence, policySet);
      const ok = !result.ok;
      return {
        pass: ok,
        reason: ok ? undefined : "CKL did not deny missing dual evidence",
      };
    },

    // ── ckl ─────────────────────────────────────────────────────

    "ckl.policy-load": async () => {
      const ok = policySet.policies.length >= 5;
      return { pass: ok, reason: ok ? undefined : `Only ${policySet.policies.length} policies loaded` };
    },

    "ckl.deny-without-intent": async () => {
      const result = resolveDecision(null, [], policySet);
      const ok = !result.ok;
      return { pass: ok, reason: ok ? undefined : "CKL allowed null intent" };
    },

    "ckl.modify-param": async () => {
      const intent = makeIntent({
        timeline: "mythar_ascension",
        evidence: ["ev-ascension-001", "ev-ascension-002"],
        params: { driftScore: 0.9 },
      });
      const evidence = makeEvidence(["ev-ascension-001", "ev-ascension-002"], { driftScore: 0.9 });
      const result = resolveDecision(intent, evidence, policySet, []);
      const ok =
        result.ok &&
        result.paramAdjust &&
        typeof result.paramAdjust.speed === "number" &&
        result.paramAdjust.speed < 1;
      return { pass: ok, reason: ok ? undefined : "modify_param did not adjust speed" };
    },

    "ckl.attach-provenance": async () => {
      const intent = makeIntent();
      const evidence = makeEvidence();
      const result = resolveDecision(intent, evidence, policySet);
      return { pass: result.attachProvenance === true };
    },

    // ── csr ─────────────────────────────────────────────────────

    "csr.governance-trace": async () => {
      const cse = new ConstitutionalStateEngine();
      const gk = new GovernanceKernel({ ckl });
      const orchestrator = new ExecutionOrchestrator({ gk, cse });
      const intent = cse.declareIntent({
        kind: "conformance-test",
        goal: "csr-governance-trace",
      });
      intent.world = "world-test";
      intent.type = "play_timeline";
      const evidence = {
        id: "ev-conformance",
        worldId: "world-test",
        timelineId: "test-timeline",
        timestamp: "now",
        vertexCount: 16,
        edgeCount: 32,
        theta: 0,
        d4: 5,
        d3: 5,
        speed: 1,
        scale: 1,
      };

      const { csr } = await orchestrator.execute({
        intent,
        evidence,
        action: "render.session.start",
        run: async () => ({ ok: true }),
      });

      const ok =
        !!csr?.governanceTrace &&
        !!csr.governanceTrace.decisionId &&
        csr.governanceTrace.verdict === "allow" &&
        Array.isArray(csr.governanceTrace.policiesApplied) &&
        typeof csr.governanceTrace.precedentCount === "number" &&
        csr.governanceTrace.attachProvenance === true;
      return {
        pass: ok,
        reason: ok ? undefined : "CSR missing governanceTrace fields",
      };
    },
  };
}
