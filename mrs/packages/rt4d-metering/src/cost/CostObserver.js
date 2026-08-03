/**
 * Pluggable cost observation for RT4D commercial calibration.
 *
 * Status:
 * - FixtureCostObserver / DeclaredEstimateCostObserver: **partial**
 * - AwsCurCostObserver: **declared** / skeleton until live CUR wiring
 *
 * Never label non-CUR data as measured AWS cost.
 */
import { CostSampleSchema } from "../types.js";

/**
 * @typedef {import("zod").infer<typeof CostSampleSchema>} CostSample
 * @typedef {{
 *   renderId: string;
 *   computeSeconds: number;
 *   storageBytes: number;
 *   awsCostUsd: number | null;
 *   source: "fixture" | "declared_estimate" | "aws_cur";
 *   observerId: string;
 *   status: "partial" | "declared" | "skeleton";
 * }} CostObservation
 */

/**
 * @interface
 */
export class CostObserver {
  /**
   * @param {unknown} sample
   * @returns {CostObservation}
   */
  observe(sample) {
    void sample;
    throw new Error("CostObserver.observe must be implemented");
  }
}

/**
 * Returns fixture-labeled costs as provided (tests / offline calibration).
 */
export class FixtureCostObserver extends CostObserver {
  observe(sample) {
    const parsed = CostSampleSchema.parse(sample);
    if (parsed.source !== "fixture") {
      throw new Error(
        `COST_SOURCE_MISMATCH: FixtureCostObserver requires source=fixture, got ${parsed.source}`,
      );
    }
    return {
      renderId: parsed.renderId,
      computeSeconds: parsed.computeSeconds,
      storageBytes: parsed.storageBytes,
      awsCostUsd: parsed.awsCostUsd ?? null,
      source: "fixture",
      observerId: "fixture-cost-observer",
      status: "partial",
    };
  }
}

/**
 * Declared estimate path — honest non-CUR economics scaffolding.
 */
export class DeclaredEstimateCostObserver extends CostObserver {
  observe(sample) {
    const parsed = CostSampleSchema.parse(sample);
    if (parsed.source !== "declared_estimate") {
      throw new Error(
        `COST_SOURCE_MISMATCH: DeclaredEstimateCostObserver requires source=declared_estimate, got ${parsed.source}`,
      );
    }
    return {
      renderId: parsed.renderId,
      computeSeconds: parsed.computeSeconds,
      storageBytes: parsed.storageBytes,
      awsCostUsd: parsed.awsCostUsd ?? null,
      source: "declared_estimate",
      observerId: "declared-estimate-cost-observer",
      status: "declared",
    };
  }
}

/**
 * AWS CUR adapter stub — does not invent measured costs.
 * Status: **skeleton** until CUR/billing pipeline exists.
 */
export class AwsCurCostObserver extends CostObserver {
  observe(sample) {
    const parsed = CostSampleSchema.parse(sample);
    if (parsed.source !== "aws_cur") {
      throw new Error(
        `COST_SOURCE_MISMATCH: AwsCurCostObserver requires source=aws_cur, got ${parsed.source}`,
      );
    }
    if (parsed.awsCostUsd == null) {
      const err = new Error(
        "AWS_CUR_UNAVAILABLE: no awsCostUsd on sample; live CUR not wired",
      );
      err.code = "AWS_CUR_UNAVAILABLE";
      throw err;
    }
    return {
      renderId: parsed.renderId,
      computeSeconds: parsed.computeSeconds,
      storageBytes: parsed.storageBytes,
      awsCostUsd: parsed.awsCostUsd,
      source: "aws_cur",
      observerId: "aws-cur-cost-observer",
      status: "skeleton",
    };
  }
}

/**
 * Dispatch observer by sample.source.
 * @param {unknown} sample
 * @returns {CostObservation}
 */
export function observeCost(sample) {
  const parsed = CostSampleSchema.parse(sample);
  switch (parsed.source) {
    case "fixture":
      return new FixtureCostObserver().observe(parsed);
    case "declared_estimate":
      return new DeclaredEstimateCostObserver().observe(parsed);
    case "aws_cur":
      return new AwsCurCostObserver().observe(parsed);
    default: {
      const _exhaustive = /** @type {never} */ (parsed.source);
      throw new Error(`COST_SOURCE_UNKNOWN: ${_exhaustive}`);
    }
  }
}
