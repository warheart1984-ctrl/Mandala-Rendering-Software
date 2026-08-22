/**
 * CIEMS Governance Validator — runtime frame-level governance validation.
 *
 * Extracted from mrs/packages/renderer-core/src/render/rt4d/holographic/ciems-governance-validation.js
 * and wired into the chamber pipeline as a reusable module.
 *
 * Status: partial — threshold detection functional; runtime enforcement is new (2026-08-21).
 */

export const CIEMS_VALIDATOR_STATUS = "partial";
export const CIEMS_VALIDATOR_CLAIM =
  "Runtime CIEMS governance validator — frame-level conformance/stewardship/intent/evidence thresholds";

const DEFAULT_THRESHOLD = {
  intent: 0.1,
  evidence: 0.1,
  conformance: 0.3,
  stewardship: 0.3,
};

/**
 * CIEMS Governance Validator — processes frames and detects anomalies.
 */
export class CIEMSGovernanceValidator {
  constructor(opts = {}) {
    this.threshold = { ...DEFAULT_THRESHOLD, ...opts.threshold };
    this.frameHistory = [];
    this.anomalies = [];
  }

  /**
   * Process a frame's governance scores and detect anomalies.
   * @returns {{ passed: boolean, violations: string[] }}
   */
  processFrame(frameNum, governance) {
    const { intent = 0, evidence = 0, conformance = 0, stewardship = 0 } = governance;
    const frame = {
      frame: frameNum,
      timestamp: Date.now(),
      governance: { intent, evidence, conformance, stewardship },
    };
    this.frameHistory.push(frame);

    const violations = [];
    if (conformance < this.threshold.conformance) {
      this.anomalies.push({ frame: frameNum, type: "conformance_violation", value: conformance });
      violations.push(`conformance=${conformance.toFixed(3)}<${this.threshold.conformance}`);
    }
    if (stewardship < this.threshold.stewardship) {
      this.anomalies.push({ frame: frameNum, type: "stewardship_violation", value: stewardship });
      violations.push(`stewardship=${stewardship.toFixed(3)}<${this.threshold.stewardship}`);
    }
    if (intent < this.threshold.intent) {
      this.anomalies.push({ frame: frameNum, type: "intent_violation", value: intent });
      violations.push(`intent=${intent.toFixed(3)}<${this.threshold.intent}`);
    }
    if (evidence < this.threshold.evidence) {
      this.anomalies.push({ frame: frameNum, type: "evidence_violation", value: evidence });
      violations.push(`evidence=${evidence.toFixed(3)}<${this.threshold.evidence}`);
    }

    return { passed: violations.length === 0, violations };
  }

  /**
   * Aggregate governance means over all processed frames.
   */
  aggregateGovernance() {
    const n = this.frameHistory.length;
    if (n === 0) return { intent: 0, evidence: 0, conformance: 0, stewardship: 0, count: 0 };
    const sum = this.frameHistory.reduce(
      (acc, frame) => {
        acc.intent += frame.governance.intent;
        acc.evidence += frame.governance.evidence;
        acc.conformance += frame.governance.conformance;
        acc.stewardship += frame.governance.stewardship;
        return acc;
      },
      { intent: 0, evidence: 0, conformance: 0, stewardship: 0 },
    );
    return {
      intent: sum.intent / n,
      evidence: sum.evidence / n,
      conformance: sum.conformance / n,
      stewardship: sum.stewardship / n,
      count: n,
    };
  }

  /**
   * Export constitutional record for receipt / audit.
   */
  exportConstitutionalRecord() {
    return {
      kind: "ciems-governance-validation-record",
      status: CIEMS_VALIDATOR_STATUS,
      claim: CIEMS_VALIDATOR_CLAIM,
      threshold: this.threshold,
      totalFrames: this.frameHistory.length,
      averageGovernance: this.aggregateGovernance(),
      anomalies: this.anomalies,
      anomalyCount: this.anomalies.length,
      recentFrames: this.frameHistory.slice(-10),
    };
  }
}
