// Sovereign Multimodal Engine — Authority Contracts
// Machine-readable contract definitions for CKL and GovernanceKernel
// Version: 1.0.0

export const CONTRACTS = {
  version: "1.0.0",
  contracts: [
    {
      contractId: "contract.sme-core.v1",
      actor: "sme.core",
      status: "declared",
      authority: "coordinate",
      allowedActions: [
        "dispatch",
        "collect",
        "validate",
        "check_policy",
        "resolve_conflicts",
        "request_approval",
        "publish"
      ],
      forbiddenActions: [
        "write_code",
        "generate_artifacts",
        "mutate_models",
        "interpret",
        "invoke_external"
      ],
      coordinationScope: [
        "architect",
        "builder",
        "implementor",
        "inspector",
        "reviewer",
        "engineer-standards"
      ],
      evidenceRequirements: [
        "intent_declaration",
        "agent_dispatch_log",
        "output_collection",
        "policy_validation",
        "approval_record"
      ],
      conformanceChecks: [
        "binding.director-contract-exists",
        "authority.chain-valid",
        "governance.no-implicit-escalation",
        "execution.no-cross-layer-mutation"
      ]
    },
    {
      contractId: "contract.sme-txt.v1",
      actor: "sme.txt",
      status: "declared",
      authority: "infer",
      allowedActions: [
        "generate_text",
        "embed_text",
        "produce_decision_record"
      ],
      forbiddenActions: [
        "modify_governance",
        "bypass_authority",
        "generate_media"
      ],
      evidenceRequirements: [
        "model_version",
        "quantization",
        "seed",
        "prompt_tokens",
        "completion_tokens",
        "reason_trace"
      ],
      conformanceChecks: [
        "provenance.frame-fields",
        "evidence.bundle-fields"
      ]
    },
    {
      contractId: "contract.sme-vis.v1",
      actor: "sme.vis",
      status: "declared",
      authority: "encode",
      allowedActions: [
        "encode_image",
        "extract_features",
        "produce_evidence"
      ],
      forbiddenActions: [
        "generate_images",
        "bypass_validation"
      ],
      evidenceRequirements: [
        "model_version",
        "quantization",
        "preprocessing_pipeline",
        "evidence_id",
        "safety_score"
      ],
      conformanceChecks: [
        "provenance.frame-fields",
        "evidence.bundle-fields"
      ]
    },
    {
      contractId: "contract.sme-aud.v1",
      actor: "sme.aud",
      status: "declared",
      authority: "transcribe",
      allowedActions: [
        "transcribe_audio",
        "embed_audio",
        "produce_timecodes"
      ],
      forbiddenActions: [
        "generate_audio",
        "bypass_validation"
      ],
      evidenceRequirements: [
        "model_version",
        "quantization",
        "seed",
        "evidence_id",
        "time_alignment"
      ],
      conformanceChecks: [
        "provenance.frame-fields",
        "evidence.bundle-fields"
      ]
    },
    {
      contractId: "contract.sme-vid.v1",
      actor: "sme.vid",
      status: "declared",
      authority: "encode",
      allowedActions: [
        "sample_frames",
        "encode_video",
        "aggregate_temporal",
        "produce_events"
      ],
      forbiddenActions: [
        "generate_video",
        "bypass_resource_limits"
      ],
      evidenceRequirements: [
        "sampling_strategy",
        "model_version",
        "quantization",
        "evidence_id",
        "frame_timestamps"
      ],
      conformanceChecks: [
        "provenance.frame-fields",
        "evidence.bundle-fields"
      ]
    },
    {
      contractId: "contract.sme-gen.v1",
      actor: "sme.gen",
      status: "declared",
      authority: "generate",
      allowedActions: [
        "generate_image",
        "generate_audio",
        "stitch_video",
        "offload_gpu"
      ],
      forbiddenActions: [
        "generate_without_authority_grant",
        "bypass_safety_policy"
      ],
      evidenceRequirements: [
        "authority_grant_id",
        "model_version",
        "quantization",
        "seed",
        "parameters",
        "safety_check_result"
      ],
      conformanceChecks: [
        "authority.chain-valid",
        "policy-no-render-without-provenance",
        "evidence.bundle-fields"
      ]
    },
    {
      contractId: "contract.sme-log.v1",
      actor: "sme.log",
      status: "declared",
      authority: "record",
      allowedActions: [
        "store_evidence",
        "index_replay",
        "write_audit",
        "verify_merkle"
      ],
      forbiddenActions: [
        "mutate_evidence",
        "delete_audit_records"
      ],
      evidenceRequirements: [
        "evidence_bundle_id",
        "world_id",
        "timeline_id",
        "merkle_root",
        "signature"
      ],
      conformanceChecks: [
        "evidence.bundle-fields",
        "evidence.dual-require",
        "provenance.recorder-exists",
        "replay.service-exists",
        "replay.deterministic-params"
      ]
    },
    {
      contractId: "contract.cinematic4d.v1",
      actor: "4dce.renderer",
      status: "enforced",
      authority: "render",
      allowedActions: [
        "render.session.start",
        "render.frame.live",
        "artifact.picture.export",
        "artifact.movie.export",
        "csr.replay.params"
      ],
      forbiddenActions: [
        "bypass_authority",
        "mutate_governance",
        "mutate_ledger"
      ],
      invariants: {
        vertexCount: 16,
        edgeCount: 32,
        mustProject: true
      },
      evidenceRequirements: [
        "vertexCount",
        "edgeCount",
        "theta",
        "d4",
        "d3",
        "speed",
        "scale"
      ],
      conformanceChecks: [
        "ckl.deny-without-intent",
        "policy-no-execution-without-intent",
        "policy-no-state-change-without-evidence",
        "policy-no-render-without-provenance"
      ]
    },
    {
      contractId: "contract.director.v1",
      actor: "4dce.director",
      status: "enforced",
      authority: "coordinate",
      allowedActions: [
        "dispatch",
        "collect",
        "validate",
        "check_policy",
        "resolve_conflicts",
        "request_approval",
        "publish",
        "plan",
        "route",
        "supervise",
        "enforce_governance",
        "render_4d_tesseract"
      ],
      forbiddenActions: [
        "write_code",
        "mutate_models",
        "interpret",
        "invoke_external",
        "execute_specialist_work",
        "mutate_artifacts_directly"
      ],
      coordinationScope: [
        "architect",
        "builder",
        "implementor",
        "inspector",
        "reviewer",
        "engineer-standards"
      ],
      mcpToolAccess: [
        "dispatch",
        "collect",
        "validate",
        "check_policy",
        "resolve_conflicts",
        "request_approval",
        "publish",
        "plan",
        "route",
        "supervise",
        "enforce_governance"
      ],
      evidenceRequirements: [
        "intent_declaration",
        "agent_dispatch_log",
        "output_collection",
        "policy_validation",
        "approval_record"
      ],
      conformanceChecks: [
        "binding.director-contract-exists",
        "authority.chain-valid",
        "governance.no-implicit-escalation",
        "execution.no-cross-layer-mutation"
      ]
    },
    {
      contractId: "contract.replay.v1",
      actor: "4dce.replay",
      status: "enforced",
      authority: "replay-only",
      forbidden: [
        "execute_specialist_work",
        "mutate_artifacts",
        "generate_artifacts",
        "invoke_external",
        "interpret",
        "escalate_authority",
        "alter_evidence"
      ],
      requiredEvidence: [
        "intent_declaration",
        "agent_dispatch_log",
        "output_collection",
        "policy_validation",
        "approval_record",
        "timestamp_chain",
        "authority_chain",
        "evidence_chain",
        "mcp_provenance_chain",
        "conformance_snapshot"
      ],
      conformance: [
        "replay.binding.director-contract-exists",
        "replay.authority.chain-valid",
        "replay.governance.no-implicit-escalation",
        "replay.execution.no-cross-layer-mutation",
        "replay.evidence-chain-complete",
        "replay.provenance-chain-complete",
        "replay.timestamp-chain-consistent",
        "replay.approval-chain-valid"
      ]
    },
    {
      contractId: "contract.user.v1",
      actor: "user:*",
      status: "enforced",
      authority: "request",
      allowedActions: [
        "submit_intent",
        "poll_result",
        "retrieve_evidence",
        "request_replay",
        "health_check",
        "readiness_check",
        "version_check"
      ],
      forbiddenActions: [
        "bypass_authority",
        "modify_governance",
        "access_raw_models"
      ],
      evidenceRequirements: [
        "intent_id",
        "modality",
        "goal",
        "constraints"
      ],
      conformanceChecks: [
        "ckl.deny-without-intent",
        "policy-no-execution-without-intent"
      ]
    },
    {
      contractId: "contract.sovereignx.v1",
      actor: "sovereignx",
      status: "enforced",
      authority: "route",
      allowedActions: [
        "route_render",
        "get_stats",
        "detect_hip"
      ],
      forbiddenActions: [
        "bypass_authority",
        "modify_governance",
        "mutate_ledger"
      ],
      evidenceRequirements: [
        "routing_decision",
        "efficiency_metrics",
        "arena_selection_reason"
      ],
      conformanceChecks: [
        "ckl.deny-without-intent",
        "policy-no-execution-without-intent"
      ]
    }
  ],
  resolveAuthority: function(actorId, action) {
    const contract = this.contracts.find(c => c.actor === actorId || c.actor.startsWith(actorId.split(':')[0] + ':*'));
    if (!contract) return { ok: false, allowed: false, reason: "No contract found for actor" };
    const forbidden = [...(contract.forbiddenActions || []), ...(contract.forbidden || [])];
    if (forbidden.includes(action)) return { ok: false, allowed: false, reason: `Action ${action} forbidden by ${contract.contractId}` };
    if (!contract.allowedActions?.includes(action)) return { ok: false, allowed: false, reason: `Action ${action} not in allow-list for ${contract.contractId}` };
    return { ok: true, allowed: true, contractId: contract.contractId, contract, authority: contract.authority };
  }
};

// ESM exports
export const resolveAuthority = (actorId, action) => {
  const contract = CONTRACTS.contracts.find(c => c.actor === actorId || c.actor.startsWith(actorId.split(':')[0] + ':*'));
  if (!contract) return { ok: false, allowed: false, reason: "No contract found for actor" };
  const forbidden = [...(contract.forbiddenActions || []), ...(contract.forbidden || [])];
  if (forbidden.includes(action)) return { ok: false, allowed: false, reason: `Action ${action} forbidden by ${contract.contractId}` };
  if (!contract.allowedActions?.includes(action)) return { ok: false, allowed: false, reason: `Action ${action} not in allow-list for ${contract.contractId}` };
  return { ok: true, allowed: true, contractId: contract.contractId, contract, authority: contract.authority };
};

// CommonJS fallback
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { CONTRACTS, resolveAuthority };
}