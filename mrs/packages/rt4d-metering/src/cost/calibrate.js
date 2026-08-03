/**
 * Cost → versioned credit schedule calibration.
 *
 * Does NOT mint render credits from cost alone. Produces a proposed schedule
 * that deriveCreditsFromReceipt may consume after applyCreditSchedule().
 *
 * Status: **partial** for fixture/declared_estimate; **declared** for aws_cur.
 */
import { CostSampleSchema } from "../types.js";
import { observeCost } from "./CostObserver.js";
import {
  getCreditSchedule,
  applyCreditSchedule,
  DEFAULT_CREDIT_SCHEDULE,
} from "../creditSchedule.js";

/**
 * @typedef {import("zod").infer<typeof CostSampleSchema>} CostSample
 */

/**
 * Propose credits implied by labeled cost given USD_PER_CREDIT.
 * @param {number} awsCostUsd
 * @param {number} usdPerCredit
 * @returns {number}
 */
export function creditsFromCostUsd(awsCostUsd, usdPerCredit) {
  if (!(usdPerCredit > 0)) {
    throw new Error("CALIBRATION_INVALID: USD_PER_CREDIT must be > 0");
  }
  return Math.max(1, Math.ceil(awsCostUsd / usdPerCredit));
}

/**
 * Calibrate schedule coefficients from a labeled CostSample.
 *
 * Strategy (declared economics):
 * - Observe cost with honest source labeling
 * - Scale CREDITS_PER_COMPUTE_SECOND so receipt-shaped samples approach cost-implied credits
 * - Bump schedule version; keep status declared unless source=aws_cur (still declared until enforced ops)
 *
 * @param {unknown} sample
 * @param {{ apply?: boolean; schedule?: ReturnType<typeof getCreditSchedule> }} [opts]
 * @returns {{
 *   observation: ReturnType<typeof observeCost>;
 *   recommendedCredits: number | null;
 *   proposedSchedule: ReturnType<typeof getCreditSchedule>;
 *   applied: boolean;
 *   formulaStatus: string;
 * }}
 */
export function calibrateCredits(sample, opts = {}) {
  const parsed = CostSampleSchema.parse(sample);
  const observation = observeCost(parsed);
  const current = opts.schedule ?? getCreditSchedule();

  let recommendedCredits = null;
  /** @type {typeof DEFAULT_CREDIT_SCHEDULE} */
  let proposed = { ...current };

  if (observation.awsCostUsd != null) {
    recommendedCredits = creditsFromCostUsd(
      observation.awsCostUsd,
      current.USD_PER_CREDIT,
    );

    // Scale compute coefficient toward cost-implied credits for this sample shape.
    // work/storage terms omitted from scale (compute-dominant fixture path).
    const computeSeconds = Math.max(observation.computeSeconds, 1e-9);
    const targetComputeCredits = Math.max(0.5, recommendedCredits * 0.6);
    const nextCompute = targetComputeCredits / computeSeconds;

    const patch = observation.source === "aws_cur" ? "cur" : observation.source;
    proposed = {
      ...current,
      version: bumpVersion(current.version, patch),
      status: "declared",
      CREDITS_PER_COMPUTE_SECOND: clamp(nextCompute, 0.01, 50),
      calibratedFrom: observation.source,
    };
  } else {
    proposed = {
      ...current,
      version: bumpVersion(current.version, "nocost"),
      status: "declared",
      calibratedFrom: observation.source,
    };
  }

  let applied = false;
  if (opts.apply) {
    applyCreditSchedule(proposed);
    applied = true;
  }

  return {
    observation,
    recommendedCredits,
    proposedSchedule: Object.freeze({ ...proposed }),
    applied,
    formulaStatus: proposed.status,
  };
}

/**
 * @param {string} version
 * @param {string} tag
 * @returns {string}
 */
function bumpVersion(version, tag) {
  const base = version.replace(/-cal-[a-z0-9.]+$/i, "");
  const stamp = `${tag}.${hashTiny(`${version}:${tag}`)}`;
  return `${base}-cal-${stamp}`;
}

/**
 * @param {string} s
 * @returns {string}
 */
function hashTiny(s) {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  }
  return (h >>> 0).toString(16).slice(0, 6);
}

/**
 * @param {number} n
 * @param {number} lo
 * @param {number} hi
 */
function clamp(n, lo, hi) {
  return Math.min(hi, Math.max(lo, n));
}
