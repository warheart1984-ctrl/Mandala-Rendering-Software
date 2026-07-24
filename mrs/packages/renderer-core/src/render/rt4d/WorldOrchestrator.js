/**
 * World orchestrator — Phase C **skeleton** (Drive-G-1).
 * PLP validate then bindWorld. Not a production host runtime.
 */
import { validateWorldDocumentV2 } from "./plp/PlpValidator.js";
import { bindWorld } from "./world/WorldBinding.js";

/**
 * @param {object} worldDoc
 * @returns {import("./world/WorldBinding.js").WorldContext}
 */
export function prepareWorld(worldDoc) {
  validateWorldDocumentV2(worldDoc);
  return bindWorld(worldDoc);
}

export { bindWorld } from "./world/WorldBinding.js";
export { validateWorldDocumentV2, PlpValidator } from "./plp/PlpValidator.js";
