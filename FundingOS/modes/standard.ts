/**
 * FundingOS Standard Mode — Base capabilities for all agents.
 */

export const STANDARD_MODE = Object.freeze({
  name: "standard",
  description: "Normal operation with base capabilities",
  capabilities: [
    "contract_validation",
    "intent_declaration",
    "evidence_production",
    "policy_compliance",
    "provenance_recording"
  ],
  restrictions: [
    "no_sage_reasoning",
    "no_full_vendor_skills",
    "no_mrs_crew_access"
  ],
  mrsCrewAccess: false,
  vendorSkillsAccess: [],
  sageReasoning: false
});

export function createStandardMode() {
  return { ...STANDARD_MODE };
}

export function isStandardMode(mode) {
  return mode?.name === "standard";
}