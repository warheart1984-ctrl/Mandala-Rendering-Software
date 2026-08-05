// Sovereign Multimodal Engine — Machine-Readable Constitutional Charter
// Source of Truth for runtime governance engine
// Version: 1.0.0

export const CHARTER = {
  version: "1.0.0",
  name: "Sovereign Multimodal Engine",
  authority: "SME-Core",
  principles: [
    {
      id: "P1",
      name: "No execution without intent",
      status: "enforced",
      runtimeGate: true,
      description: "Every operation must have a declared UserIntent with intentId, modality, goal, constraints."
    },
    {
      id: "P2",
      name: "No state change without evidence",
      status: "enforced",
      runtimeGate: true,
      description: "Every mutation produces EvidenceRecord with evidenceId, worldId, timelineId, model version, quantization, seed."
    },
    {
      id: "P3",
      name: "No authority without contract",
      status: "enforced",
      runtimeGate: true,
      description: "Actors must hold valid authority contracts. CKL evaluates on every request."
    },
    {
      id: "P4",
      name: "Replayable reality",
      status: "partial",
      runtimeGate: false,
      description: "Deterministic execution given identical inputs, config, model versions, seeds."
    },
    {
      id: "P5",
      name: "Framework independence",
      status: "declared",
      runtimeGate: false,
      description: "Constitution governs behavior, not libraries. Framework versions recorded as evidence."
    },
    {
      id: "P6",
      name: "Modality neutrality",
      status: "enforced",
      runtimeGate: true,
      description: "Text, image, audio, video are governed substrates. No modality bypasses the constitutional chain."
    }
  ],
  constitutionalChain: [
    { step: 1, name: "AUTHORITY", module: "SME-AUTH", engine: "ConstitutionalKnowledgeLayer", output: "AuthorityRecord" },
    { step: 2, name: "VALIDATION", module: "SME-VAL", engine: "ValidationEngine", output: "ValidationRecord" },
    { step: 3, name: "FUSION", module: "SME-FUSE", engine: "FusionEngine", output: "FusionRecord" },
    { step: 3, name: "DECISION", module: "SME-DEC", engine: "GovernanceKernel", output: "DecisionRecord" },
    { step: 5, name: "EVIDENCE", module: "SME-EVR", engine: "ProvenanceRecorder", output: "EvidenceBundle" },
    { step: 6, name: "VERIFICATION", module: "SME-EVR", engine: "ReplayVerifier", output: "VerificationRecord" },
    { step: 7, name: "REPLAY", module: "SME-EVR", engine: "ReplayService", output: "ReplayRecord" },
    { step: 8, name: "AUDIT", module: "SME-AUDIT", engine: "AuditLogger", output: "AuditRecord" }
  ],
  modules: [
    { id: "sme-core", name: "SME-Core", role: "orchestrator", contract: "contract.sme-core.v1", authority: "coordinate" },
    { id: "sme-txt", name: "SME-TXT", role: "text_reasoning", contract: "contract.sme-txt.v1", authority: "infer" },
    { id: "sme-vis", name: "SME-VIS", role: "vision_encoder", contract: "contract.sme-vis.v1", authority: "encode" },
    { id: "sme-aud", name: "SME-AUD", role: "audio_transcriber", contract: "contract.sme-aud.v1", authority: "transcribe" },
    { id: "sme-vid", name: "SME-VID", role: "video_encoder", contract: "contract.sme-vid.v1", authority: "encode" },
    { id: "sme-gen", name: "SME-GEN", role: "generative_media", contract: "contract.sme-gen.v1", authority: "generate" },
    { id: "sme-log", name: "SME-LOG", role: "evidence_replay_audit", contract: "contract.sme-log.v1", authority: "record" },
    { id: "director", name: "Director", role: "coordinator", contract: "contract.director.v1", authority: "coordinate" },
    { id: "replay", name: "Replay", role: "replay_only", contract: "contract.replay.v1", authority: "replay-only" }
  ],
  policies: [
    { id: "policy-no-execution-without-intent", scope: "runtime", severity: "critical", action: "deny_if_false", condition: "intent != null" },
    { id: "policy-no-state-change-without-evidence", scope: "state", severity: "high", action: "deny_if_false", condition: "evidence != null" },
    { id: "policy-no-render-without-provenance", scope: "render", severity: "high", action: "attach_provenance", condition: "always" },
    { id: "policy-no-authority-without-contract", scope: "authority", severity: "critical", action: "deny_if_false", condition: "actor.contract != null" },
    { id: "policy-play-timeline-requires-world", scope: "timeline", severity: "critical", action: "deny_if_missing_world", condition: "play_timeline" },
    { id: "policy-ascension-drift-throttle", scope: "render", severity: "medium", action: "modify_param", condition: "drift > 0.7" },
    { id: "policy-ascension-evidence", scope: "runtime", severity: "critical", action: "deny_if_false", condition: "dual_evidence" },
    { id: "policy-director-contract-required", scope: "authority", severity: "critical", action: "deny_if_false", condition: "director.contract != null" },
    { id: "policy-director-no-execution", scope: "execution", severity: "critical", action: "deny_if_false", condition: "director.action in forbidden" },
    { id: "policy-director-mcp-provenance", scope: "render", severity: "high", action: "attach_provenance", condition: "director.mcp_invocation" },
    { id: "policy-replay-contract-required", scope: "authority", severity: "critical", action: "deny_if_false", condition: "replay.contract != null" },
    { id: "policy-replay-no-execution", scope: "execution", severity: "critical", action: "deny_if_false", condition: "replay.action in forbidden" },
    { id: "policy-replay-evidence-integrity", scope: "replay", severity: "high", action: "deny_if_false", condition: "replay.evidence_complete" },
    { id: "policy-replay-provenance-integrity", scope: "replay", severity: "high", action: "deny_if_false", condition: "replay.provenance_complete" },
    { id: "policy-replay-authority-boundary", scope: "authority", severity: "critical", action: "deny_if_false", condition: "replay.authority == replay-only" }
  ],
  conformanceChecks: [
    "provenance.recorder-exists",
    "provenance.frame-fields",
    "provenance.frame-recorded-during-play",
    "replay.service-exists",
    "replay.deterministic-params",
    "binding.resolver-exists",
    "binding.all-tracks-resolved",
    "binding.director-contract-exists",
    "timeline.loader-exists",
    "timeline.clip-application",
    "timeline.world-required",
    "evidence.bundle-fields",
    "evidence.dual-require",
    "ckl.policy-load",
    "ckl.deny-without-intent",
    "ckl.modify-param",
    "ckl.attach-provenance",
    "authority.chain-valid",
    "governance.no-implicit-escalation",
    "execution.no-cross-layer-mutation",
    "replay.binding.director-contract-exists",
    "replay.authority.chain-valid",
    "replay.governance.no-implicit-escalation",
    "replay.execution.no-cross-layer-mutation",
    "replay.evidence-chain-complete",
    "replay.provenance-chain-complete",
    "replay.timestamp-chain-consistent",
    "replay.approval-chain-valid",
    "normalization.brdf-energy"
  ],
  protectedPaths: [
    "constitution/",
    "engine/constitution/",
    "engine/governance/policies/",
    "engine/conformance/default.conformance-profile.json",
    "AGENTS.md",
    "CITATION.cff",
    ".zenodo.json"
  ],
  agentRules: [
    "declare_intent_before_modification",
    "produce_evidence_for_changes",
    "respect_authority_contracts",
    "preserve_evidence_chains",
    "accurate_status_tags",
    "run_conformance_before_merge",
    "no_secrets_or_credentials"
  ]
};

export function enforcedPrinciples() {
  return CHARTER.principles.filter((p) => p.status === "enforced");
}

// CommonJS fallback
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { CHARTER };
}