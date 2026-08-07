/**
 * FundingOS Constitutional Contracts — Authority maps for all 25 actors.
 * SoT under engine/constitution/contracts.js
 * Includes 18 FundingOS agents + 7 MRS Crew agents.
 */

import { CHARTER } from "./charter.js";

const createContract = (id, actor, authority, allowedActions, forbiddenActions = [], coordinationScope = [], mcpToolAccess = [], evidenceRequirements = [], conformanceChecks = []) => ({
  id,
  actor,
  status: "declared",
  authority,
  allowedActions: Object.freeze(allowedActions),
  forbiddenActions: Object.freeze(forbiddenActions),
  coordinationScope: Object.freeze(coordinationScope),
  mcpToolAccess: Object.freeze(mcpToolAccess),
  evidenceRequirements: Object.freeze(evidenceRequirements),
  conformanceChecks: Object.freeze(conformanceChecks)
});

export const CONTRACTS = Object.freeze({
  // ============================================================
  // DISCOVERY DIVISION (3 agents)
  // ============================================================
  "contract.fundingos.scout.v1": createContract(
    "contract.fundingos.scout.v1",
    "fundingos.scout",
    "discover",
    ["search_opportunities", "filter_opportunities", "score_relevance", "emit_discovery_report"],
    ["write_proposal", "calculate_budget", "submit_application", "invoke_external"],
    [],
    ["query_knowledge_platform"],
    ["intent_declaration", "discovery_evidence", "relevance_scores"],
    ["binding.fundingos-contract-exists", "evidence.discovery-chain-complete"]
  ),
  "contract.fundingos.market-intelligence.v1": createContract(
    "contract.fundingos.market-intelligence.v1",
    "fundingos.market-intelligence",
    "analyze",
    ["analyze_market", "assess_competition", "identify_trends", "emit_intelligence_report"],
    ["write_proposal", "calculate_budget", "submit_application", "invoke_external"],
    [],
    ["query_knowledge_platform"],
    ["intent_declaration", "analysis_evidence", "market_data_sources"],
    ["binding.fundingos-contract-exists", "evidence.analysis-chain-complete"]
  ),
  "contract.fundingos.policy-watch.v1": createContract(
    "contract.fundingos.policy-watch.v1",
    "fundingos.policy-watch",
    "monitor",
    ["monitor_regulations", "track_policy_changes", "alert_compliance", "emit_policy_brief"],
    ["write_proposal", "calculate_budget", "submit_application", "invoke_external"],
    [],
    ["query_knowledge_platform"],
    ["intent_declaration", "monitoring_evidence", "policy_sources"],
    ["binding.fundingos-contract-exists", "evidence.monitoring-chain-complete"]
  ),

  // ============================================================
  // STRATEGY DIVISION (3 agents)
  // ============================================================
  "contract.fundingos.strategy.v1": createContract(
    "contract.fundingos.strategy.v1",
    "fundingos.strategy",
    "strategize",
    ["develop_strategy", "align_portfolio", "recommend_priorities", "emit_strategy_plan"],
    ["write_proposal", "calculate_budget", "submit_application", "invoke_external"],
    ["scout", "market-intelligence", "policy-watch", "portfolio", "priority"],
    ["query_knowledge_platform"],
    ["intent_declaration", "strategy_rationale", "alignment_evidence"],
    ["binding.fundingos-contract-exists", "authority.strategy-chain-valid"]
  ),
  "contract.fundingos.portfolio.v1": createContract(
    "contract.fundingos.portfolio.v1",
    "fundingos.portfolio",
    "manage",
    ["manage_portfolio", "balance_allocations", "track_performance", "emit_portfolio_report"],
    ["write_proposal", "calculate_budget", "submit_application", "invoke_external"],
    ["strategy", "priority", "award", "reporting", "performance"],
    ["query_knowledge_platform"],
    ["intent_declaration", "portfolio_decisions", "allocation_evidence"],
    ["binding.fundingos-contract-exists", "authority.portfolio-chain-valid"]
  ),
  "contract.fundingos.priority.v1": createContract(
    "contract.fundingos.priority.v1",
    "fundingos.priority",
    "rank",
    ["rank_opportunities", "score_alignment", "prioritize_pipeline", "emit_priority_matrix"],
    ["write_proposal", "calculate_budget", "submit_application", "invoke_external"],
    ["scout", "market-intelligence", "policy-watch", "strategy"],
    ["query_knowledge_platform"],
    ["intent_declaration", "ranking_criteria", "scoring_evidence"],
    ["binding.fundingos-contract-exists", "authority.priority-chain-valid"]
  ),

  // ============================================================
  // PREPARATION DIVISION (3 agents)
  // ============================================================
  "contract.fundingos.proposal.v1": createContract(
    "contract.fundingos.proposal.v1",
    "fundingos.proposal",
    "write",
    ["write_narrative", "structure_proposal", "integrate_budget", "assemble_attachments", "emit_proposal_draft"],
    ["calculate_budget", "submit_application", "invoke_external"],
    ["strategy", "budget", "documentation", "mrs.director"],
    ["storyforge_build_narrative", "storyforge_full_pipeline", "query_knowledge_platform"],
    ["intent_declaration", "narrative_evidence", "provenance_refs"],
    ["binding.fundingos-contract-exists", "evidence.proposal-chain-complete", "funding-narrative-evidence"]
  ),
  "contract.fundingos.budget.v1": createContract(
    "contract.fundingos.budget.v1",
    "fundingos.budget",
    "calculate",
    ["calculate_budget", "validate_costs", "optimize_allocation", "emit_budget_breakdown"],
    ["write_proposal", "submit_application", "invoke_external"],
    ["proposal", "strategy", "portfolio"],
    ["query_knowledge_platform"],
    ["intent_declaration", "calculation_evidence", "cost_sources"],
    ["binding.fundingos-contract-exists", "evidence.budget-chain-complete"]
  ),
  "contract.fundingos.documentation.v1": createContract(
    "contract.fundingos.documentation.v1",
    "fundingos.documentation",
    "assemble",
    ["assemble_documents", "format_submission", "validate_completeness", "emit_document_package"],
    ["write_proposal", "calculate_budget", "submit_application", "invoke_external"],
    ["proposal", "budget", "eligibility", "compliance"],
    ["query_knowledge_platform"],
    ["intent_declaration", "assembly_log", "validation_results"],
    ["binding.fundingos-contract-exists", "evidence.documentation-chain-complete"]
  ),

  // ============================================================
  // COMPLIANCE DIVISION (3 agents)
  // ============================================================
  "contract.fundingos.eligibility.v1": createContract(
    "contract.fundingos.eligibility.v1",
    "fundingos.eligibility",
    "verify",
    ["verify_eligibility", "check_requirements", "assess_qualifications", "emit_eligibility_report"],
    ["write_proposal", "calculate_budget", "submit_application", "invoke_external"],
    ["policy-watch", "documentation"],
    ["query_knowledge_platform"],
    ["intent_declaration", "verification_evidence", "requirement_mapping"],
    ["binding.fundingos-contract-exists", "evidence.eligibility-chain-complete"]
  ),
  "contract.fundingos.compliance.v1": createContract(
    "contract.fundingos.compliance.v1",
    "fundingos.compliance",
    "check",
    ["check_compliance", "validate_regulations", "audit_submission", "emit_compliance_report"],
    ["write_proposal", "calculate_budget", "submit_application", "invoke_external"],
    ["policy-watch", "eligibility", "documentation", "audit"],
    ["query_knowledge_platform"],
    ["intent_declaration", "compliance_evidence", "regulation_refs"],
    ["binding.fundingos-contract-exists", "evidence.compliance-chain-complete"]
  ),
  "contract.fundingos.audit.v1": createContract(
    "contract.fundingos.audit.v1",
    "fundingos.audit",
    "audit",
    ["prepare_audit", "collect_evidence", "verify_trails", "emit_audit_package"],
    ["write_proposal", "calculate_budget", "submit_application", "invoke_external"],
    ["compliance", "reporting", "performance"],
    ["query_knowledge_platform"],
    ["intent_declaration", "audit_evidence", "trail_verification"],
    ["binding.fundingos-contract-exists", "evidence.audit-chain-complete"]
  ),

  // ============================================================
  // EXECUTION DIVISION (3 agents)
  // ============================================================
  "contract.fundingos.submission.v1": createContract(
    "contract.fundingos.submission.v1",
    "fundingos.submission",
    "submit",
    ["submit_application", "track_submission", "confirm_receipt", "emit_submission_record"],
    ["write_proposal", "calculate_budget", "invoke_external"],
    ["documentation", "compliance", "calendar"],
    ["query_knowledge_platform"],
    ["intent_declaration", "submission_evidence", "receipt_confirmation"],
    ["binding.fundingos-contract-exists", "evidence.submission-chain-complete", "funding-render-provenance"]
  ),
  "contract.fundingos.calendar.v1": createContract(
    "contract.fundingos.calendar.v1",
    "fundingos.calendar",
    "track",
    ["track_deadlines", "schedule_milestones", "alert_upcoming", "emit_calendar_view"],
    ["write_proposal", "calculate_budget", "submit_application", "invoke_external"],
    ["submission", "reporting", "performance"],
    ["query_knowledge_platform"],
    ["intent_declaration", "schedule_evidence", "milestone_tracking"],
    ["binding.fundingos-contract-exists", "evidence.calendar-chain-complete"]
  ),
  "contract.fundingos.communication.v1": createContract(
    "contract.fundingos.communication.v1",
    "fundingos.communication",
    "communicate",
    ["send_notification", "manage_correspondence", "track_responses", "emit_communication_log"],
    ["write_proposal", "calculate_budget", "submit_application", "invoke_external"],
    ["submission", "calendar", "award", "reporting"],
    ["query_knowledge_platform", "speakers_mix_audio"],
    ["intent_declaration", "communication_evidence", "response_tracking"],
    ["binding.fundingos-contract-exists", "evidence.communication-chain-complete"]
  ),

  // ============================================================
  // STEWARDSHIP DIVISION (3 agents)
  // ============================================================
  "contract.fundingos.award.v1": createContract(
    "contract.fundingos.award.v1",
    "fundingos.award",
    "manage",
    ["manage_award", "track_disbursements", "monitor_terms", "emit_award_status"],
    ["write_proposal", "calculate_budget", "submit_application", "invoke_external"],
    ["portfolio", "reporting", "performance", "calendar", "communication"],
    ["query_knowledge_platform"],
    ["intent_declaration", "award_evidence", "disbursement_records"],
    ["binding.fundingos-contract-exists", "evidence.award-chain-complete"]
  ),
  "contract.fundingos.reporting.v1": createContract(
    "contract.fundingos.reporting.v1",
    "fundingos.reporting",
    "report",
    ["generate_report", "collect_metrics", "format_deliverable", "emit_progress_report"],
    ["write_proposal", "calculate_budget", "submit_application", "invoke_external"],
    ["award", "performance", "calendar", "communication", "mrs.director"],
    ["query_knowledge_platform", "render_rt4d_preview", "storyforge_full_pipeline"],
    ["intent_declaration", "report_evidence", "metric_sources", "provenance_refs"],
    ["binding.fundingos-contract-exists", "evidence.reporting-chain-complete", "funding-render-provenance", "funding-narrative-evidence"]
  ),
  "contract.fundingos.performance.v1": createContract(
    "contract.fundingos.performance.v1",
    "fundingos.performance",
    "track",
    ["track_performance", "measure_outcomes", "assess_impact", "emit_performance_report"],
    ["write_proposal", "calculate_budget", "submit_application", "invoke_external"],
    ["award", "reporting", "portfolio", "calendar"],
    ["query_knowledge_platform", "compute_engine_spiral_state"],
    ["intent_declaration", "performance_evidence", "outcome_metrics"],
    ["binding.fundingos-contract-exists", "evidence.performance-chain-complete"]
  ),

  // ============================================================
  // MRS CREW (7 agents) — Integrated Capability Agents
  // ============================================================
  "contract.mrs.director.v1": createContract(
    "contract.mrs.director.v1",
    "mrs.director",
    "coordinate",
    ["dispatch", "collect", "validate", "check_policy", "resolve_conflicts", "request_approval", "publish", "plan", "route", "supervise", "enforce_governance"],
    ["write_code", "generate_artifacts", "mutate_models", "interpret", "invoke_external", "execute_specialist_work", "mutate_artifacts_directly"],
    ["mrs.architect", "mrs.builder", "mrs.implementor", "mrs.inspector", "mrs.reviewer", "mrs.engineer-standards"],
    ["render_rt4d_preview", "storyforge_build_narrative", "storyforge_full_pipeline", "beatbox_score_narrative", "speakers_mix_audio", "compute_engine_spiral_state", "query_knowledge_platform"],
    ["intent_declaration", "agent_dispatch_log", "output_collection", "policy_validation", "approval_record"],
    ["binding.director-contract-exists", "authority.chain-valid", "governance.no-implicit-escalation", "execution.no-cross-layer-mutation"]
  ),
  "contract.mrs.architect.v1": createContract(
    "contract.mrs.architect.v1",
    "mrs.architect",
    "design",
    ["design_architecture", "create_contracts", "define_acceptance_criteria", "produce_file_manifest"],
    ["write_code", "implement_features", "run_tests", "invoke_external"],
    [],
    ["query_knowledge_platform"],
    ["intent_declaration", "design_rationale", "acceptance_criteria"],
    ["binding.mrs-contract-exists"]
  ),
  "contract.mrs.builder.v1": createContract(
    "contract.mrs.builder.v1",
    "mrs.builder",
    "scaffold",
    ["create_package_structure", "generate_stubs", "wire_dependencies", "create_empty_tests"],
    ["write_business_logic", "implement_features", "run_tests", "invoke_external"],
    [],
    ["query_knowledge_platform"],
    ["intent_declaration", "scaffold_manifest"],
    ["binding.mrs-contract-exists"]
  ),
  "contract.mrs.implementor.v1": createContract(
    "contract.mrs.implementor.v1",
    "mrs.implementor",
    "implement",
    ["implement_features", "wire_endpoints", "write_tests", "fix_bugs"],
    ["design_architecture", "create_contracts", "invoke_external"],
    ["mrs.architect", "mrs.builder"],
    ["query_knowledge_platform"],
    ["intent_declaration", "implementation_evidence", "test_results"],
    ["binding.mrs-contract-exists"]
  ),
  "contract.mrs.inspector.v1": createContract(
    "contract.mrs.inspector.v1",
    "mrs.inspector",
    "inspect",
    ["run_tests", "verify_claims", "check_implementation", "produce_evidence_report"],
    ["write_code", "design_architecture", "invoke_external"],
    [],
    ["query_knowledge_platform"],
    ["intent_declaration", "inspection_evidence", "verification_results"],
    ["binding.mrs-contract-exists"]
  ),
  "contract.mrs.reviewer.v1": createContract(
    "contract.mrs.reviewer.v1",
    "mrs.reviewer",
    "audit",
    ["audit_constitutional_compliance", "verify_evidence_chains", "check_policy_adherence", "produce_audit_report"],
    ["write_code", "modify_files", "invoke_external"],
    [],
    ["query_knowledge_platform"],
    ["intent_declaration", "audit_evidence", "compliance_findings"],
    ["binding.mrs-contract-exists"]
  ),
  "contract.mrs.engineer-standards.v1": createContract(
    "contract.mrs.engineer-standards.v1",
    "mrs.engineer-standards",
    "quality-gate",
    ["review_code_quality", "check_types", "verify_lint", "approve_ship"],
    ["write_code", "modify_architecture", "invoke_external"],
    [],
    ["query_knowledge_platform"],
    ["intent_declaration", "quality_evidence", "gate_decision"],
    ["binding.mrs-contract-exists"]
  )
});

export function resolveAuthority(actorId, action) {
  const contract = Object.values(CONTRACTS).find((c) => c.actor === actorId);
  if (!contract) {
    return { ok: false, reason: `No contract for actor ${actorId}` };
  }
  if (!contract.allowedActions.includes(action)) {
    return {
      ok: false,
      reason: `Contract ${contract.id} does not authorize ${action}`,
      contractId: contract.id,
    };
  }
  return { ok: true, contractId: contract.id, contract };
}

export function getContract(actorId) {
  return Object.values(CONTRACTS).find((c) => c.actor === actorId);
}

export function getContractsByDivision(division) {
  const divisionAgents = CHARTER.agentDivisions[division] || [];
  return divisionAgents.map(a => getContract(`fundingos.${a}`) || getContract(`mrs.${a}`)).filter(Boolean);
}