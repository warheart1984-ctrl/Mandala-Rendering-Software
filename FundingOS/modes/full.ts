/**
 * FundingOS Full Mode — All capabilities unlocked.
 */

import { getVendorSkillsLoader } from "../engine/skills/vendor-skills.js";
import { MRS_CAPABILITIES } from "../engine/mrs-crew/MRSCapabilities.js";

export const FULL_MODE = Object.freeze({
  name: "full",
  description: "All capabilities unlocked — vendor skills + MRS crew + sage reasoning",
  capabilities: [
    "contract_validation",
    "intent_declaration",
    "evidence_production",
    "policy_compliance",
    "provenance_recording",
    "deep_analysis",
    "extended_reasoning",
    "cross_domain_synthesis",
    "precedent_evaluation",
    "all_vendor_skills",
    "mrs_crew_access",
    "full_orchestration"
  ],
  restrictions: [],
  mrsCrewAccess: true,
  vendorSkillsAccess: "all",
  sageReasoning: true,
  mrsCapabilities: MRS_CAPABILITIES
});

export function createFullMode(agentType, skillsLoader) {
  const allSkills = skillsLoader?.getSkillNames() || [];
  return {
    ...FULL_MODE,
    agentType,
    availableVendorSkills: allSkills,
    mrsCapabilities: MRS_CAPABILITIES
  };
}

export function isFullMode(mode) {
  return mode?.name === "full";
}

export function getAllVendorSkills(skillsLoader) {
  return skillsLoader?.getSkillNames() || [];
}

export function getMRSCapabilities() {
  return MRS_CAPABILITIES;
}