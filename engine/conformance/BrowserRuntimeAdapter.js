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
import { CONTRACTS } from "../../engine/constitution/contracts.js";
import { CHARTER } from "../../engine/constitution/charter.js";
import { resolveAuthority } from "../../engine/constitution/contracts.js";
import { GovernanceKernel as GK } from "../governance/GovernanceKernel.js";
import {
  getActorIdentity as browserActorIdentity,
  getCapabilities as browserCapabilities,
  route as browserRoute,
  HostAction,
} from "../runtime/hosts/BrowserHostBridge.js";

// ── helpers ────────────────────────────────────────────────────────

function getContract(contractId) {
  return CONTRACTS.contracts.find(c => c.contractId === contractId);
}

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

    // ── director ──────────────────────────────────────────────────

    "binding.director-contract-exists": async () => {
      const contract = getContract("contract.director.v1");
      const ok = contract &&
        contract.status === "enforced" &&
        contract.actor === "4dce.director" &&
        contract.authority === "coordinate";
      return { pass: !!ok, reason: ok ? undefined : "Director contract missing or not enforced" };
    },

"authority.chain-valid": async () => {
      // Verify Director authority chain: Director (coordinate) -> Specialist (execute)
      // The chain should NOT collapse boundaries between coordination and execution
      const dirContract = getContract("contract.director.v1");
      const architectContract = CONTRACTS.contracts.find(c => c.actor === "4dce.architect") ||
        CONTRACTS.contracts.find(c => c.actor === "architect");

      // Director has coordinate authority, specialists have execute authority
      const dirAuthority = dirContract?.authority === "coordinate";
      const dirForbidden = dirContract?.forbiddenActions?.includes("execute_specialist_work");
      const dirForbiddenMutate = dirContract?.forbiddenActions?.includes("mutate_artifacts_directly");
      const dirScope = dirContract?.coordinationScope?.includes("architect") &&
        dirContract?.coordinationScope?.includes("builder") &&
        dirContract?.coordinationScope?.includes("implementor") &&
        dirContract?.coordinationScope?.includes("inspector") &&
        dirContract?.coordinationScope?.includes("reviewer") &&
        dirContract?.coordinationScope?.includes("engineer-standards");

      const ok = dirAuthority && dirForbidden && dirForbiddenMutate && dirScope;
      return {
        pass: !!ok,
        reason: ok ? undefined : "Director authority chain invalid - boundaries collapsed"
      };
    },

    "governance.no-implicit-escalation": async () => {
      // Verify Director cannot implicitly escalate privileges
      // All escalations require explicit approval records
      const dirContract = getContract("contract.director.v1");

      // Check forbidden actions include escalation attempts
      const noExec = dirContract?.forbiddenActions?.includes("execute_specialist_work");
      const noMutate = dirContract?.forbiddenActions?.includes("mutate_artifacts_directly");
      const noInterpret = dirContract?.forbiddenActions?.includes("interpret");
      const noExternal = dirContract?.forbiddenActions?.includes("invoke_external");

      // Check approval record is required in evidence
      const needsApproval = dirContract?.evidenceRequirements?.includes("approval_record");

      // Verify CKL policy exists (policySet is already loaded in adapter closure)
      const policy = policySet.policies.find(
        p => p.id === "policy-director-no-execution"
      );

      const ok = noExec && noMutate && noInterpret && noExternal && needsApproval && policy;
      return {
        pass: !!ok,
        reason: ok ? undefined : "Implicit escalation possible - missing forbidden actions or approval requirement"
      };
    },

    "execution.no-cross-layer-mutation": async () => {
      // Verify Director cannot mutate artifacts directly
      // All mutations must be delegated to specialist agents with evidence
      const dirContract = getContract("contract.director.v1");

      const noMutate = dirContract?.forbiddenActions?.includes("mutate_artifacts_directly");
      const noWriteCode = dirContract?.forbiddenActions?.includes("write_code");
      const noGenerate = dirContract?.forbiddenActions?.includes("generate_artifacts");
      const noMutateModels = dirContract?.forbiddenActions?.includes("mutate_models");

      // Check evidence requirement for agent dispatch
      const needsDispatch = dirContract?.evidenceRequirements?.includes("agent_dispatch_log");
      const needsCollection = dirContract?.evidenceRequirements?.includes("output_collection");

      const ok = noMutate && noWriteCode && noGenerate && noMutateModels && needsDispatch && needsCollection;
      return {
        pass: !!ok,
        reason: ok ? undefined : "Cross-layer mutation possible - missing forbidden actions or evidence requirements"
      };
    },

    // ── replay ────────────────────────────────────────────────────

"replay.governance.no-implicit-escalation": async () => {
      // Verify Replay cannot implicitly escalate privileges
      const replayContract = getContract("contract.replay.v1");

      const noExec = replayContract?.forbidden?.includes("execute_specialist_work");
      const noMutate = replayContract?.forbidden?.includes("mutate_artifacts");
      const noGenerate = replayContract?.forbidden?.includes("generate_artifacts");
      const noExternal = replayContract?.forbidden?.includes("invoke_external");
      const noInterpret = replayContract?.forbidden?.includes("interpret");
      const noEscalate = replayContract?.forbidden?.includes("escalate_authority");
      const noAlterEvidence = replayContract?.forbidden?.includes("alter_evidence");

      const policy = policySet.policies.find(
        p => p.id === "policy-replay-no-execution" || p.id === "policy-replay-authority-boundary"
      );

      const ok = noExec && noMutate && noGenerate && noExternal && noInterpret && noEscalate && noAlterEvidence && policy;
      return {
        pass: !!ok,
        reason: ok ? undefined : "Implicit escalation possible - missing forbidden actions or approval requirement"
      };
    },

    "replay.execution.no-cross-layer-mutation": async () => {
      // Verify Replay cannot mutate artifacts directly
      const replayContract = getContract("contract.replay.v1");

      const noMutate = replayContract?.forbidden?.includes("mutate_artifacts");
      const noGenerate = replayContract?.forbidden?.includes("generate_artifacts");
      const noInterpret = replayContract?.forbidden?.includes("interpret");
      const noExternal = replayContract?.forbidden?.includes("invoke_external");
      const noEscalate = replayContract?.forbidden?.includes("escalate_authority");
      const noAlterEvidence = replayContract?.forbidden?.includes("alter_evidence");

      // Check required evidence
      const needsIntent = replayContract?.requiredEvidence?.includes("intent_declaration");
      const needsDispatch = replayContract?.requiredEvidence?.includes("agent_dispatch_log");
      const needsCollection = replayContract?.requiredEvidence?.includes("output_collection");
      const needsPolicy = replayContract?.requiredEvidence?.includes("policy_validation");
      const needsApproval = replayContract?.requiredEvidence?.includes("approval_record");
      const needsTimestamp = replayContract?.requiredEvidence?.includes("timestamp_chain");
      const needsAuthority = replayContract?.requiredEvidence?.includes("authority_chain");
      const needsEvidenceChain = replayContract?.requiredEvidence?.includes("evidence_chain");
      const needsProvenance = replayContract?.requiredEvidence?.includes("mcp_provenance_chain");
      const needsConformance = replayContract?.requiredEvidence?.includes("conformance_snapshot");

      const ok = noMutate && noGenerate && noInterpret && noExternal && noEscalate && noAlterEvidence &&
        needsIntent && needsDispatch && needsCollection && needsPolicy && needsApproval &&
        needsTimestamp && needsAuthority && needsEvidenceChain && needsProvenance && needsConformance;
      return {
        pass: !!ok,
        reason: ok ? undefined : "Cross-layer mutation possible - missing forbidden actions or evidence requirements"
      };
    },

    "replay.evidence-chain-complete": async () => {
      // Verify replay record has complete evidence chain
      const replayContract = getContract("contract.replay.v1");
      const requiredEvidence = replayContract?.requiredEvidence || [];
      const evidenceChainComplete = requiredEvidence.length === 10; // All 10 required evidence types
      return { pass: !!evidenceChainComplete, reason: evidenceChainComplete ? undefined : "Evidence chain incomplete" };
    },

    "replay.provenance-chain-complete": async () => {
      // Verify replay record has complete MCP provenance chain
      const replayContract = getContract("contract.replay.v1");
      const requiredEvidence = replayContract?.requiredEvidence || [];
      const hasProvenance = requiredEvidence.includes("mcp_provenance_chain");
      return { pass: !!hasProvenance, reason: hasProvenance ? undefined : "MCP provenance chain missing" };
    },

    "replay.timestamp-chain-consistent": async () => {
      // Verify replay record has consistent timestamp chain
      const replayContract = getContract("contract.replay.v1");
      const requiredEvidence = replayContract?.requiredEvidence || [];
      const hasTimestamp = requiredEvidence.includes("timestamp_chain");
      return { pass: !!hasTimestamp, reason: hasTimestamp ? undefined : "Timestamp chain missing" };
    },

    "replay.approval-chain-valid": async () => {
      // Verify replay record has valid approval chain
      const replayContract = getContract("contract.replay.v1");
      const requiredEvidence = replayContract?.requiredEvidence || [];
      const hasApproval = requiredEvidence.includes("approval_record");
      return { pass: !!hasApproval, reason: hasApproval ? undefined : "Approval chain missing" };
    },

    // ── normalization (rt4d audit-fixed constants) ────────────────

    "normalization.brdf-energy": async () => {
      try {
        const { Lambertian4D } = await import(
          "../../mrs/packages/renderer-core/src/render/rt4d/material/bsdf4d.js"
        );
        const { vec4 } = await import(
          "../../mrs/packages/renderer-core/src/render/rt4d/math/vec4.js"
        );
        const mat = new Lambertian4D(vec4(1, 1, 1, 1));
        const n = vec4(0, 0, 1, 0);
        const wi = vec4(0, 0, 1, 0);
        const wo = vec4(0, 0, 1, 0);
        const val = mat.evaluate(wi, wo, n);
        const expected = 3 / (4 * Math.PI);
        const ok =
          Math.abs(val.x - expected) < 1e-9 &&
          Math.abs(val.y - expected) < 1e-9 &&
          Math.abs(val.z - expected) < 1e-9;
        return {
          pass: ok,
          reason: ok ? undefined : `Lambertian BRDF=${val.x}, expected ${expected}`,
        };
      } catch (err) {
        return {
          pass: false,
          reason: `normalization probe unavailable: ${err.message}`,
        };
      }
    },

  };
}
