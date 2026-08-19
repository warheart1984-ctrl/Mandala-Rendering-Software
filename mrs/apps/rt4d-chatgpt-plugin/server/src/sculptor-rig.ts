/**
 * Bridge to Sovereign Sculptor rig factories (SoT).
 * Relative import so the plugin can run via tsx without a built sculptor dist.
 */
export {
  createAnthroRig,
  createFoxQuadrupedRig,
  createHumanRig,
  characterRigHash,
  assertValidCharacterRig,
} from "../../../../packages/sovereign-sculptor/src/rigs.js";
export type { CharacterRigSchema, Species } from "../../../../packages/sovereign-sculptor/src/types.js";
