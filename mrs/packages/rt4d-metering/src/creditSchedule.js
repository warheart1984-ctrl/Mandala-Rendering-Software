/**
 * Versioned credit schedule consumed by deriveCreditsFromReceipt.
 * Calibration updates this schedule — it does not mint credits from cost alone.
 *
 * Status: schedule mechanism **partial**; economic coefficients **declared**
 * until aws_cur-backed calibration exists.
 */

/**
 * @typedef {{
 *   version: string;
 *   status: "declared" | "partial" | "enforced";
 *   WORK_UNITS_PER_CREDIT: number;
 *   CREDITS_PER_COMPUTE_SECOND: number;
 *   BYTES_PER_CREDIT: number;
 *   USD_PER_CREDIT: number;
 *   DEFAULT_WIDTH: number;
 *   DEFAULT_HEIGHT: number;
 *   DEFAULT_SPP: number;
 *   DEFAULT_MAX_DEPTH: number;
 *   calibratedFrom?: string;
 * }} CreditSchedule
 */

/** Frozen baseline coefficients (v1 declared). */
export const DEFAULT_CREDIT_SCHEDULE = Object.freeze({
  version: "v1.0.0-declared",
  status: /** @type {"declared"} */ ("declared"),
  WORK_UNITS_PER_CREDIT: 250_000,
  CREDITS_PER_COMPUTE_SECOND: 0.5,
  BYTES_PER_CREDIT: 256 * 1024,
  /** Declared target economics for calibration proposals — not live billing. */
  USD_PER_CREDIT: 0.002,
  DEFAULT_WIDTH: 512,
  DEFAULT_HEIGHT: 512,
  DEFAULT_SPP: 1,
  DEFAULT_MAX_DEPTH: 4,
  calibratedFrom: undefined,
});

/** @type {CreditSchedule} */
let activeSchedule = { ...DEFAULT_CREDIT_SCHEDULE };

/**
 * @returns {Readonly<CreditSchedule>}
 */
export function getCreditSchedule() {
  return Object.freeze({ ...activeSchedule });
}

/**
 * Replace active schedule (explicit apply — calibration proposes, caller applies).
 * @param {Partial<CreditSchedule> & { version: string }} schedule
 * @returns {Readonly<CreditSchedule>}
 */
export function applyCreditSchedule(schedule) {
  if (!schedule || typeof schedule.version !== "string") {
    throw new Error("CREDIT_SCHEDULE_INVALID: version required");
  }
  activeSchedule = {
    ...DEFAULT_CREDIT_SCHEDULE,
    ...schedule,
    version: schedule.version,
    status: schedule.status ?? "declared",
  };
  return getCreditSchedule();
}

/**
 * Reset to package default (tests).
 */
export function resetCreditSchedule() {
  activeSchedule = { ...DEFAULT_CREDIT_SCHEDULE };
}
