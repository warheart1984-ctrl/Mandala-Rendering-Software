/**
 * Deterministic credit derivation from verified engine receipts.
 *
 * Formula status: **declared** until cost-calibrated against real unit economics.
 * Do NOT invent credits from wall-clock alone outside receipt fields.
 *
 * creditsUsed = max(1, ceil(
 *   workUnits / WORK_UNITS_PER_CREDIT
 *   + computeSeconds * CREDITS_PER_COMPUTE_SECOND
 *   + storageBytes / BYTES_PER_CREDIT
 * ))
 *
 * workUnits = width * height * samplesPerPixel * maxDepth
 * (defaults used only when receipt omits dimension fields — still deterministic)
 */
import { EngineReceiptSchema, METERABLE_EVIDENCE_STATUSES } from "./types.js";
import { getCreditSchedule } from "./creditSchedule.js";

/** @typedef {import("zod").infer<typeof EngineReceiptSchema>} EngineReceipt */

/** @deprecated Prefer getCreditSchedule().status — kept for P6 callers. */
export const CREDIT_FORMULA_STATUS = "declared";

/**
 * Snapshot of default coefficients (immutable baseline).
 * Runtime derivation reads getCreditSchedule() so calibration can retarget.
 */
export const CREDIT_FORMULA = Object.freeze({
  WORK_UNITS_PER_CREDIT: 250_000,
  CREDITS_PER_COMPUTE_SECOND: 0.5,
  BYTES_PER_CREDIT: 256 * 1024,
  DEFAULT_WIDTH: 512,
  DEFAULT_HEIGHT: 512,
  DEFAULT_SPP: 1,
  DEFAULT_MAX_DEPTH: 4,
});

/**
 * @param {unknown} engineReceipt
 * @returns {{
 *   creditsUsed: number;
 *   computeSeconds: number;
 *   storageBytes: number;
 *   formulaStatus: string;
 *   scheduleVersion: string;
 * }}
 */
export function deriveCreditsFromReceipt(engineReceipt) {
  const receipt = EngineReceiptSchema.parse(engineReceipt);
  const schedule = getCreditSchedule();

  if (!METERABLE_EVIDENCE_STATUSES.includes(receipt.evidenceStatus)) {
    const err = new Error(
      `ENGINE_EVIDENCE_INCOMPLETE: evidenceStatus=${receipt.evidenceStatus} is not meterable`,
    );
    err.code = "ENGINE_EVIDENCE_INCOMPLETE";
    throw err;
  }

  const width = receipt.width ?? schedule.DEFAULT_WIDTH;
  const height = receipt.height ?? schedule.DEFAULT_HEIGHT;
  const spp = receipt.samplesPerPixel ?? schedule.DEFAULT_SPP;
  const maxDepth = receipt.maxDepth ?? schedule.DEFAULT_MAX_DEPTH;
  const computeSeconds = receipt.computeSeconds ?? 0;
  const storageBytes = receipt.storageBytes ?? 0;

  const workUnits = width * height * spp * maxDepth;
  const raw =
    workUnits / schedule.WORK_UNITS_PER_CREDIT +
    computeSeconds * schedule.CREDITS_PER_COMPUTE_SECOND +
    storageBytes / schedule.BYTES_PER_CREDIT;

  const creditsUsed = Math.max(1, Math.ceil(raw));

  return {
    creditsUsed,
    computeSeconds,
    storageBytes,
    formulaStatus: schedule.status,
    scheduleVersion: schedule.version,
  };
}
