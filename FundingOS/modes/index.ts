/**
 * FundingOS Modes System — Main entry point for agent modes.
 */

import { createStandardMode } from "./standard";
import { createSageMode } from "./sage";
import { createFullMode } from "./full";
import type { VendorSkillsLoader } from "../engine/skills/vendor-skills";

export const MODES = Object.freeze({
  standard: "standard",
  sage: "sage",
  full: "full"
});

export function createMode(modeName: string, agentType: string, skillsLoader?: VendorSkillsLoader) {
  switch (modeName) {
    case "standard":
      return createStandardMode();
    case "sage":
      return createSageMode(agentType);
    case "full":
      return createFullMode(agentType, skillsLoader);
    default:
      throw new Error(`Unknown mode: ${modeName}`);
  }
}

export function getModeCapabilities(mode: { capabilities?: string[] }): string[] {
  return mode?.capabilities || [];
}

export function modeHasCapability(mode: { capabilities?: string[] }, capability: string): boolean {
  return mode?.capabilities?.includes(capability) || false;
}

export { createStandardMode, isStandardMode } from "./standard";
export { createSageMode, isSageMode, getSageType } from "./sage";
export { createFullMode, isFullMode, getAllVendorSkills, getMRSCapabilities } from "./full";