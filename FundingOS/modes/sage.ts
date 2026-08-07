/**
 * FundingOS Sage Mode — Elevated reasoning capabilities.
 */

export const SAGE_MODE = Object.freeze({
  name: "sage",
  description: "Elevated reasoning with extended analysis capabilities",
  capabilities: [
    "contract_validation",
    "intent_declaration",
    "evidence_production",
    "policy_compliance",
    "provenance_recording",
    "deep_analysis",
    "extended_reasoning",
    "cross_domain_synthesis",
    "precedent_evaluation"
  ],
  restrictions: [
    "no_full_vendor_skills",
    "no_mrs_crew_access"
  ],
  mrsCrewAccess: false,
  vendorSkillsAccess: [],
  sageReasoning: true,
  sageTypes: Object.freeze({
    "architect": "Architect Sage — elevated design reasoning",
    "builder": "Builder Sage — elevated scaffold coherence",
    "implementor": "Implementor Sage — elevated edge case handling",
    "inspector": "Inspector Sage — elevated probe matrix",
    "reviewer": "Reviewer Sage — elevated constitutional audit",
    "engineer-standards": "ESFR Sage — elevated quality gate",
    "director": "Director Sage — elevated orchestration reasoning"
  })
});

export function createSageMode(agentType) {
  return {
    ...SAGE_MODE,
    agentType,
    sageType: SAGE_MODE.sageTypes[agentType] || "Generic Sage"
  };
}

export function isSageMode(mode) {
  return mode?.name === "sage";
}

export function getSageType(agentType) {
  return SAGE_MODE.sageTypes[agentType] || "Generic Sage";
}