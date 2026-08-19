/**
 * Axiom-X Convergence Verifier (JS port) — hierarchical equivalence determination.
 *
 * Ported from `axiom_x/verifier/convergence_verifier.py`.
 * Implements the verification pipeline from the Axiom-X spec §6.
 */

import { createHash } from "node:crypto";

export const DeterminismClass = Object.freeze({
  D0_UNSPECIFIED: "D0",
  D1_EXACT: "D1",
  D2_NUMERICAL: "D2",
  D3_SEMANTIC: "D3",
  D4_STATISTICAL: "D4",
});

export const DeterminismClassName = Object.freeze({
  D0_UNSPECIFIED: "D0_UNSPECIFIED",
  D1_EXACT: "D1_EXACT",
  D2_NUMERICAL: "D2_NUMERICAL",
  D3_SEMANTIC: "D3_SEMANTIC",
  D4_STATISTICAL: "D4_STATISTICAL",
});

export const VerificationResult = Object.freeze({
  EXACT_MATCH: "EXACT_MATCH",
  EXACT_MISMATCH: "EXACT_MISMATCH",
  NUMERICALLY_CONVERGENT: "NUMERICALLY_CONVERGENT",
  NUMERICALLY_DIVERGENT: "NUMERICALLY_DIVERGENT",
  SEMANTICALLY_CONVERGENT: "SEMANTICALLY_CONVERGENT",
  SEMANTICALLY_DIVERGENT: "SEMANTICALLY_DIVERGENT",
  STATISTICALLY_CONVERGENT: "STATISTICALLY_CONVERGENT",
  STATISTICALLY_DIVERGENT: "STATISTICALLY_DIVERGENT",
  INSUFFICIENT_EVIDENCE: "INSUFFICIENT_EVIDENCE",
});

export class DeterminismContract {
  constructor(options = {}) {
    this.class_name = options.class_name || DeterminismClass.D2_NUMERICAL;
    this.absolute_epsilon = options.absolute_epsilon ?? 1e-5;
    this.relative_epsilon = options.relative_epsilon ?? 1e-4;
    this.rmse_limit = options.rmse_limit ?? 1e-4;
    this.max_error_limit = options.max_error_limit ?? null;
    this.semantic_invariants = options.semantic_invariants ?? null;
    this.seed_policy = options.seed_policy ?? null;
    this.distribution = options.distribution ?? null;
    this.sample_count = options.sample_count ?? null;
    this.confidence = options.confidence ?? null;
    this.variance_limit = options.variance_limit ?? null;
  }
}

export class ExecutionEvidence {
  constructor(options = {}) {
    this.execution_id = options.execution_id;
    this.job_identity = options.job_identity || {};
    this.backend = options.backend || "python";
    this.device = options.device || {};
    this.output_hash = options.output_hash || "";
    this.pixel_hash = options.pixel_hash || "";
    this.numerical_summary = options.numerical_summary || {};
    this.provenance = options.provenance || {};
    this.raw_output = options.raw_output ?? null;
  }
}

export class VerificationMetrics {
  constructor(options = {}) {
    this.max_absolute_error = options.max_absolute_error ?? 0;
    this.mean_absolute_error = options.mean_absolute_error ?? 0;
    this.rmse = options.rmse ?? 0;
    this.max_relative_error = options.max_relative_error ?? 0;
    this.nan_count_a = options.nan_count_a ?? 0;
    this.nan_count_b = options.nan_count_b ?? 0;
    this.inf_count_a = options.inf_count_a ?? 0;
    this.inf_count_b = options.inf_count_b ?? 0;
    this.hash_match = options.hash_match ?? false;
  }
}

export class SemanticInvariantResult {
  constructor(options = {}) {
    this.invariant_name = options.invariant_name || "unnamed";
    this.passed = options.passed ?? true;
    this.metric_value = options.metric_value ?? 0;
    this.threshold = options.threshold ?? 0;
    this.details = options.details || "";
  }
}

export class VerificationResultRecord {
  constructor(options = {}) {
    this.verification_id = options.verification_id;
    this.job_identity = options.job_identity || {};
    this.execution_a = options.execution_a || {};
    this.execution_b = options.execution_b || {};
    this.determinism_class = options.determinism_class || DeterminismClass.D0_UNSPECIFIED;
    this.comparison_method = options.comparison_method || "hierarchical";
    this.metrics = options.metrics || new VerificationMetrics();
    this.semantic_results = options.semantic_results || [];
    this.thresholds = options.thresholds || {};
    this.passed = options.passed ?? false;
    this.failure_reasons = options.failure_reasons || [];
    this.verifier_version = options.verifier_version || "1.0.0";
    this.verifier_hash = options.verifier_hash || "";
    this.timestamp = options.timestamp || "";
  }

  to_dict() {
    return { ...this };
  }
}

export class ConvergenceVerifier {
  static VERIFIER_VERSION = "1.0.0";

  constructor(verifier_hash = "") {
    this.verifier_hash = verifier_hash || this._compute_self_hash();
  }

  _compute_self_hash() {
    return "sha256:" + createHash("sha256").update(ConvergenceVerifier.toString()).digest("hex");
  }

  verify(evidence_a, evidence_b, contract) {
    const verification_id =
      "verify-" +
      createHash("sha256")
        .update(`${evidence_a.execution_id}${evidence_b.execution_id}`)
        .digest("hex")
        .slice(0, 8);

    const hash_match = evidence_a.output_hash === evidence_b.output_hash;
    const metrics = this._calculate_metrics(evidence_a, evidence_b);

    if (contract.class_name === DeterminismClass.D1_EXACT) {
      const passed = hash_match;
      return this._build_result(
        verification_id, evidence_a, evidence_b, contract,
        passed ? VerificationResult.EXACT_MATCH : VerificationResult.EXACT_MISMATCH,
        metrics, [], passed
      );
    }

    if (contract.class_name === DeterminismClass.D2_NUMERICAL) {
      const { passed, failure_reasons } = this._check_numerical(metrics, contract);
      return this._build_result(
        verification_id, evidence_a, evidence_b, contract,
        passed ? VerificationResult.NUMERICALLY_CONVERGENT : VerificationResult.NUMERICALLY_DIVERGENT,
        metrics, [], passed, failure_reasons
      );
    }

    if (contract.class_name === DeterminismClass.D3_SEMANTIC) {
      const semantic_results = this._check_semantic(evidence_a, evidence_b, contract);
      let passed = semantic_results.length === 0 || semantic_results.every((r) => r.passed);
      let failure_reasons = [];
      if (contract.absolute_epsilon > 0 || contract.rmse_limit > 0) {
        const num = this._check_numerical(metrics, contract);
        if (!num.passed) {
          passed = false;
          failure_reasons = num.failure_reasons;
        }
      }
      return this._build_result(
        verification_id, evidence_a, evidence_b, contract,
        passed ? VerificationResult.SEMANTICALLY_CONVERGENT : VerificationResult.SEMANTICALLY_DIVERGENT,
        metrics, semantic_results, passed, failure_reasons
      );
    }

    if (contract.class_name === DeterminismClass.D4_STATISTICAL) {
      return this._build_result(
        verification_id, evidence_a, evidence_b, contract,
        VerificationResult.STATISTICALLY_DIVERGENT,
        metrics, [], false, ["D4 statistical comparison requires batch sampling"]
      );
    }

    return this._build_result(
      verification_id, evidence_a, evidence_b, contract,
      VerificationResult.INSUFFICIENT_EVIDENCE,
      metrics, [], false, ["D0: unspecified determinism class"]
    );
  }

  _build_result(verification_id, evidence_a, evidence_b, contract, result, metrics, semantic_results, passed, failure_reasons = []) {
    return new VerificationResultRecord({
      verification_id,
      job_identity: evidence_a.job_identity,
      execution_a: { id: evidence_a.execution_id, backend: evidence_a.backend, device: evidence_a.device },
      execution_b: { id: evidence_b.execution_id, backend: evidence_b.backend, device: evidence_b.device },
      determinism_class: contract.class_name,
      comparison_method: "hierarchical",
      metrics,
      semantic_results: semantic_results.map((r) => (r instanceof SemanticInvariantResult ? { ...r } : r)),
      thresholds: {
        absolute_epsilon: contract.absolute_epsilon,
        relative_epsilon: contract.relative_epsilon,
        rmse_limit: contract.rmse_limit,
        max_error_limit: contract.max_error_limit,
      },
      passed,
      failure_reasons,
      verifier_version: ConvergenceVerifier.VERIFIER_VERSION,
      verifier_hash: this.verifier_hash,
      timestamp: "1970-01-01T00:00:00+00:00",
    });
  }

  _calculate_metrics(evidence_a, evidence_b) {
    const sum_a = evidence_a.numerical_summary || {};
    const sum_b = evidence_b.numerical_summary || {};
    const max_abs_error = Math.abs((sum_a.max || 0) - (sum_b.max || 0));
    const mean_abs_error = Math.abs((sum_a.mean || 0) - (sum_b.mean || 0));
    const rmse = Math.abs((sum_a.stddev || 0) - (sum_b.stddev || 0));
    let max_rel_error = 0;
    if (sum_a.max) max_rel_error = max_abs_error / Math.abs(sum_a.max || 1);
    return new VerificationMetrics({
      max_absolute_error: max_abs_error,
      mean_absolute_error: mean_abs_error,
      rmse,
      max_relative_error: max_rel_error,
      nan_count_a: sum_a.nanCount || 0,
      nan_count_b: sum_b.nanCount || 0,
      inf_count_a: sum_a.infCount || 0,
      inf_count_b: sum_b.infCount || 0,
      hash_match: evidence_a.output_hash === evidence_b.output_hash,
    });
  }

  _check_numerical(metrics, contract) {
    const failure_reasons = [];
    if (contract.absolute_epsilon > 0 && metrics.max_absolute_error > contract.absolute_epsilon) {
      failure_reasons.push(`max_absolute_error ${metrics.max_absolute_error.toFixed(6)} > ${contract.absolute_epsilon}`);
    }
    if (contract.relative_epsilon > 0 && metrics.max_relative_error > contract.relative_epsilon) {
      failure_reasons.push(`max_relative_error ${metrics.max_relative_error.toFixed(6)} > ${contract.relative_epsilon}`);
    }
    if (contract.rmse_limit > 0 && metrics.rmse > contract.rmse_limit) {
      failure_reasons.push(`rmse ${metrics.rmse.toFixed(6)} > ${contract.rmse_limit}`);
    }
    if (contract.max_error_limit && metrics.max_absolute_error > contract.max_error_limit) {
      failure_reasons.push(`max_absolute_error ${metrics.max_absolute_error.toFixed(6)} > ${contract.max_error_limit}`);
    }
    return { passed: failure_reasons.length === 0, failure_reasons };
  }

  _check_semantic(evidence_a, evidence_b, contract) {
    const results = [];
    const invariants = contract.semantic_invariants || [];
    const sum_a = evidence_a.numerical_summary || {};
    const sum_b = evidence_b.numerical_summary || {};
    for (const inv of invariants) {
      const name = inv.name || "unnamed";
      const threshold = inv.threshold || 0.0;
      const inv_type = inv.type || "mean_difference";
      let metric_value = 0.0;
      let passed = true;
      const parts = [];
      if (inv_type === "mean_difference") {
        metric_value = Math.abs((sum_a.mean || 0) - (sum_b.mean || 0));
        passed = metric_value <= threshold;
        parts.push(`mean_diff=${metric_value.toFixed(6)} <= ${threshold}`);
      } else if (inv_type === "max_error") {
        metric_value = Math.abs((sum_a.max || 0) - (sum_b.max || 0));
        passed = metric_value <= threshold;
        parts.push(`max_error=${metric_value.toFixed(6)} <= ${threshold}`);
      } else if (inv_type === "rmse") {
        metric_value = Math.abs((sum_a.stddev || 0) - (sum_b.stddev || 0));
        passed = metric_value <= threshold;
        parts.push(`rmse=${metric_value.toFixed(6)} <= ${threshold}`);
      } else if (inv_type === "hash_match") {
        metric_value = evidence_a.output_hash === evidence_b.output_hash ? 0 : 1;
        passed = metric_value === 0;
        parts.push(`hash_match=${passed}`);
      } else {
        parts.push(`unknown_type:${inv_type}`);
      }
      results.push(new SemanticInvariantResult({
        invariant_name: name,
        passed,
        metric_value,
        threshold,
        details: parts.join("; "),
      }));
    }
    return results;
  }
}

export function create_d2_contract(absolute_epsilon = 1e-3, relative_epsilon = 1e-2, rmse_limit = 2e-2, max_error_limit = null) {
  return new DeterminismContract({
    class_name: DeterminismClass.D2_NUMERICAL,
    absolute_epsilon,
    relative_epsilon,
    rmse_limit,
    max_error_limit,
  });
}

export function create_d3_contract(absolute_epsilon = 1e-4, relative_epsilon = 1e-3, rmse_limit = 1e-3, semantic_invariants = null) {
  return new DeterminismContract({
    class_name: DeterminismClass.D3_SEMANTIC,
    absolute_epsilon,
    relative_epsilon,
    rmse_limit,
    semantic_invariants,
  });
}
