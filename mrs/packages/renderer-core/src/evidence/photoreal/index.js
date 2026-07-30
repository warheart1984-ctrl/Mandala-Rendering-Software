/**
 * Constitutional photoreal evidence (PEP / SPR / CEC).
 * Specs: declared · Emitters: partial · Drive-G-1 honesty.
 */

export {
  isFilled,
  scorePaths,
  scoreSprCompleteness,
  scorePepCompleteness,
  evaluateFullPhotorealEligibility,
  promotionEligibilityFromScores,
  levelFromScore,
} from "./completeness.js";

export { emitSpr } from "./emitSpr.js";
export { emitPep } from "./emitPep.js";
export { emitCec } from "./emitCec.js";
export {
  emitPhotorealEvidenceFromRun,
  resolveRunInputs,
} from "./emitFromRun.js";
export { runPhotorealPromotionChecklist } from "./checklistT01T08.js";
export { runPhotorealPromotionPipeline } from "./promotionPipeline.js";
export { evaluateCertification } from "./evaluateCertification.js";
export {
  runConformanceSuite,
  discoverDefaultRunDirs,
} from "./conformanceSuite.js";
export { createDashboardServer } from "./dashboardServer.js";
export {
  validateAgainstSchema,
  validateCiemsDoc,
  loadCiemsSchema,
  resolveCiemsSchemaDir,
} from "./schemaValidate.js";
