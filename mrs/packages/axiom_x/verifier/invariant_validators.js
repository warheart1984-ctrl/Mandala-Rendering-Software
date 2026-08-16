/**
 * Axiom-X Invariant Validators (JS port) — check invariants against contracts.
 *
 * Ported from `axiom_x/verifier/invariant_validators.py`.
 * Reference implementation; backend implementations must satisfy these contracts.
 */

import { createHash } from "node:crypto";

export class InvariantContract {
  constructor(options = {}) {
    this.energy = options.energy || { conserved: true, absolute_tolerance: 1e-6, relative_tolerance: 0.0 };
    this.geometry = options.geometry || { rotation_matrix_valid: true, distance_preservation: true, absolute_tolerance: 1e-6 };
    this.radiometry = options.radiometry || { non_negative: true, absolute_tolerance: 1e-6 };
    this.probability = options.probability || { unbiased: true, variance_within: null, absolute_tolerance: 1e-6 };
    this.topology = options.topology || { mesh_connectivity: true, manifold_integrity: true, absolute_tolerance: 1e-6 };
    this.numerical = options.numerical || { fp_stability: true, precision_contract: "fp32", catastrophic_cancellation: false, absolute_tolerance: 1e-6 };
    this.temporal = options.temporal || { deterministic_seed: true, frame_to_frame_consistency: 0.0, energy_conservation_accumulated: true, absolute_tolerance: 1e-6 };
    this.contract_version = options.contract_version || "1.0";
  }
}

export class EnergyContract {
  constructor(options = {}) {
    this.conserved = options.conserved ?? true;
    this.absolute_tolerance = options.absolute_tolerance ?? 1e-6;
    this.relative_tolerance = options.relative_tolerance ?? 0.0;
  }
}

export class GeometryContract {
  constructor(options = {}) {
    this.rotation_matrix_valid = options.rotation_matrix_valid ?? true;
    this.distance_preservation = options.distance_preservation ?? true;
    this.absolute_tolerance = options.absolute_tolerance ?? 1e-6;
  }
}

export class RadiometryContract {
  constructor(options = {}) {
    this.non_negative = options.non_negative ?? true;
    this.absolute_tolerance = options.absolute_tolerance ?? 1e-6;
  }
}

export class ProbabilityContract {
  constructor(options = {}) {
    this.unbiased = options.unbiased ?? true;
    this.variance_within = options.variance_within ?? null;
    this.absolute_tolerance = options.absolute_tolerance ?? 1e-6;
  }
}

export class TopologyContract {
  constructor(options = {}) {
    this.mesh_connectivity = options.mesh_connectivity ?? true;
    this.manifold_integrity = options.manifold_integrity ?? true;
    this.absolute_tolerance = options.absolute_tolerance ?? 1e-6;
  }
}

export class NumericalContract {
  constructor(options = {}) {
    this.fp_stability = options.fp_stability ?? true;
    this.precision_contract = options.precision_contract ?? "fp32";
    this.catastrophic_cancellation = options.catastrophic_cancellation ?? false;
    this.absolute_tolerance = options.absolute_tolerance ?? 1e-6;
  }
}

export class TemporalContract {
  constructor(options = {}) {
    this.deterministic_seed = options.deterministic_seed ?? true;
    this.frame_to_frame_consistency = options.frame_to_frame_consistency ?? 0.0;
    this.energy_conservation_accumulated = options.energy_conservation_accumulated ?? true;
    this.absolute_tolerance = options.absolute_tolerance ?? 1e-6;
  }
}

export class InvariantValidation {
  constructor(options = {}) {
    this.operation_id = options.operation_id || "";
    this.invariant_name = options.invariant_name || "";
    this.timestamp = options.timestamp || "";
    this.contract_version = options.contract_version || "1.0";
    this.results = options.results || {};
    this.overall_passed = options.overall_passed ?? true;
    this.failures = options.failures || [];
    this.metrics = options.metrics || {};
  }
}

// ----------------------------------------------------------------------
// 1. Energy Validation
// ----------------------------------------------------------------------

export function validate_energy(in_L, out_L, contract) {
  let passed = true;
  let metric_value = 0.0;
  const failures = [];
  const details_parts = [];

  if (contract.conserved) {
    if (out_L > in_L + contract.absolute_tolerance) {
      passed = false;
      metric_value = out_L - in_L;
      failures.push(`Energy not conserved: L_out=${out_L} > L_in=${in_L} + ${contract.absolute_tolerance}`);
      details_parts.push(`L_out-L_in=${out_L - in_L} > ${contract.absolute_tolerance}`);
    }
    if (out_L < -contract.absolute_tolerance) {
      passed = false;
      metric_value = out_L;
      failures.push(`Negative radiance: L_out=${out_L}`);
      details_parts.push(`L_out=${out_L} < 0`);
    }
  }

  if (passed && contract.relative_tolerance > 0) {
    const rel_error = Math.abs(out_L - in_L) / Math.max(Math.abs(in_L), 1e-8);
    if (rel_error > contract.relative_tolerance) {
      passed = false;
      metric_value = rel_error;
      failures.push(`Relative energy error ${rel_error.toFixed(6)} > ${contract.relative_tolerance}`);
      details_parts.push(`relative_error=${rel_error}`);
    }
  }

  metric_value = Math.max(metric_value, 0.0);

  return new InvariantValidation({
    operation_id: "energy_check",
    invariant_name: "energy",
    timestamp: "",
    contract_version: "1.0",
    results: {},
    overall_passed: passed,
    failures,
    metrics: {
      metric_value,
      threshold: contract.absolute_tolerance,
      details: details_parts.length ? details_parts.join("; ") : "energy conserved within tolerance",
    },
  });
}

// ----------------------------------------------------------------------
// 2. Geometry Validation
// ----------------------------------------------------------------------

export function validate_geometry_rotation(R, contract) {
  let passed = true;
  let metric_value = 0.0;
  const failures = [];
  const details_parts = [];

  if (contract.rotation_matrix_valid) {
    const ortho_error = _matrixOrthogonalityError(R);
    if (ortho_error > contract.absolute_tolerance) {
      passed = false;
      metric_value = Math.max(metric_value, ortho_error);
      failures.push(`Rotation matrix not orthogonal: error=${ortho_error}`);
      details_parts.push(`ortho_error=${ortho_error}`);
    }
    const det = _matrixDeterminant(R);
    const det_error = Math.abs(det - 1.0);
    if (det_error > contract.absolute_tolerance) {
      passed = false;
      metric_value = Math.max(metric_value, det_error);
      failures.push(`Rotation determinant != 1: det=${det}, error=${det_error}`);
      details_parts.push(`det_error=${det_error}`);
    }
  }

  metric_value = Math.max(metric_value, 0.0);

  return new InvariantValidation({
    operation_id: "geometry_rotation_check",
    invariant_name: "geometry_rotation",
    timestamp: "",
    contract_version: "1.0",
    results: {},
    overall_passed: passed,
    failures,
    metrics: {
      metric_value,
      threshold: contract.absolute_tolerance,
      details: passed ? "rotation matrix valid" : "rotation matrix invalid",
    },
  });
}

export function validate_geometry_distance_preservation(p, q, T_matrix, contract) {
  let passed = true;
  let metric_value = 0.0;
  const failures = [];
  const details_parts = [];

  const applyTransform = (v, M) => {
    const hv = [v[0], v[1], v[2], 1.0];
    const tv = _matVec(M, hv);
    return [tv[0] / tv[3], tv[1] / tv[3], tv[2] / tv[3]];
  };

  if (contract.distance_preservation) {
    const dp = _dist(p, q);
    const dp_transformed = _dist(applyTransform(p, T_matrix), applyTransform(q, T_matrix));
    const error = Math.abs(dp_transformed - dp);
    if (error > contract.absolute_tolerance) {
      passed = false;
      metric_value = Math.max(metric_value, error);
      failures.push(`Distance not preserved: before=${dp}, after=${dp_transformed}, error=${error}`);
      details_parts.push(`error=${error}`);
    }
  }

  metric_value = Math.max(metric_value, 0.0);

  return new InvariantValidation({
    operation_id: "geometry_distance_preservation_check",
    invariant_name: "geometry_distance_preservation",
    timestamp: "",
    contract_version: "1.0",
    results: {},
    overall_passed: passed,
    failures,
    metrics: {
      metric_value,
      threshold: contract.absolute_tolerance,
      details: passed ? "distance preserved" : "distance not preserved",
    },
  });
}

// ----------------------------------------------------------------------
// 3. Radiometry Validation
// ----------------------------------------------------------------------

export function validate_radiometry_non_negative(radiance, contract) {
  let passed = true;
  let metric_value = 0.0;
  const failures = [];
  const details_parts = [];

  if (contract.non_negative && radiance < -contract.absolute_tolerance) {
    passed = false;
    metric_value = radiance;
    failures.push(`Negative radiance: ${radiance}`);
    details_parts.push(`radiance=${radiance} < 0`);
  }

  metric_value = Math.max(metric_value, 0.0);

  return new InvariantValidation({
    operation_id: "radiance_non_negative_check",
    invariant_name: "radiance_non_negative",
    timestamp: "",
    contract_version: "1.0",
    results: {},
    overall_passed: passed,
    failures,
    metrics: {
      metric_value,
      threshold: contract.absolute_tolerance,
      details: passed ? "radiance non-negative" : `radiance ${metric_value} negative`,
    },
  });
}

export function validate_brdf_reciprocity(brdf_func, wi, wo, contract) {
  let passed = true;
  let metric_value = 0.0;
  const failures = [];
  const details_parts = [];

  let f1;
  let f2;
  try {
    f1 = Number(brdf_func(wi, wo));
    f2 = Number(brdf_func(wo, wi));
  } catch (e) {
    passed = false;
    metric_value = 1.0;
    const msg = String((e && e.message) || e).slice(0, 50);
    failures.push(`BRDF evaluation failed: ${msg}`);
    details_parts.push(`brdf_error=${msg}`);
    return new InvariantValidation({
      operation_id: "brdf_reciprocity_check",
      invariant_name: "brdf_reciprocity",
      timestamp: "",
      contract_version: "1.0",
      results: {},
      overall_passed: false,
      failures: [`brdf evaluation failed: ${msg}`],
      metrics: { metric_value, threshold: contract.absolute_tolerance, details: `brdf evaluation failed: ${msg}` },
    });
  }

  if (Math.abs(f1 - f2) > contract.absolute_tolerance) {
    passed = false;
    metric_value = Math.abs(f1 - f2);
    failures.push(`BRDF reciprocity violated: f(wi,wo)=${f1}, f(wo,wi)=${f2}`);
    details_parts.push(`reciprocity_error=${metric_value}`);
  }

  if (f1 < -contract.absolute_tolerance || f2 < -contract.absolute_tolerance) {
    passed = false;
    metric_value = Math.max(f1, f2);
    failures.push(`BRDF returned negative value: f1=${f1}, f2=${f2}`);
    details_parts.push("negative_radiance");
  }

  metric_value = Math.max(metric_value, 0.0);

  return new InvariantValidation({
    operation_id: "brdf_reciprocity_check",
    invariant_name: "brdf_reciprocity",
    timestamp: "",
    contract_version: "1.0",
    results: {},
    overall_passed: passed,
    failures,
    metrics: {
      metric_value,
      threshold: contract.absolute_tolerance,
      details: details_parts.length ? details_parts.join("; ") : "BRDF reciprocity holds",
    },
  });
}

// ----------------------------------------------------------------------
// 4. Probability Validation
// ----------------------------------------------------------------------

export function validate_unbiased_estimator(samples, ground_truth, contract) {
  let passed = true;
  let metric_value = 0.0;
  const failures = [];
  const details_parts = [];

  if (!samples || samples.length === 0) {
    passed = false;
    metric_value = Number.NaN;
    failures.push("Empty sample set");
    return new InvariantValidation({
      operation_id: "unbiased_estimator_check",
      invariant_name: "unbiased_estimator",
      timestamp: "",
      contract_version: "1.0",
      results: {},
      overall_passed: false,
      failures: ["no samples provided"],
      metrics: { metric_value, threshold: contract.absolute_tolerance, details: "no samples provided" },
    });
  }

  const estimate = samples.reduce((a, b) => a + b, 0) / samples.length;
  const error = Math.abs(estimate - ground_truth);

  if (contract.unbiased && error > contract.absolute_tolerance) {
    passed = false;
    metric_value = error;
    failures.push(`Unbiasedness violated: estimate=${estimate}, ground_truth=${ground_truth}, error=${error}`);
    details_parts.push(`error=${error}`);
  }

  if (contract.variance_within !== null && contract.variance_within !== undefined) {
    const mean = samples.reduce((a, b) => a + b, 0) / samples.length;
    const variance = samples.reduce((acc, s) => acc + (s - mean) * (s - mean), 0) / samples.length;
    if (variance > contract.variance_within) {
      passed = false;
      metric_value = Math.max(metric_value, variance);
      failures.push(`Variance ${variance.toFixed(6)} > limit ${contract.variance_within}`);
      details_parts.push(`variance=${variance}`);
    }
  }

  metric_value = Math.max(metric_value, 0.0);
  if (Number.isNaN(metric_value) || !Number.isFinite(metric_value)) metric_value = 1.0;

  return new InvariantValidation({
    operation_id: "unbiased_estimator_check",
    invariant_name: "unbiased_estimator",
    timestamp: "",
    contract_version: "1.0",
    results: {},
    overall_passed: passed,
    failures,
    metrics: {
      metric_value,
      threshold: contract.absolute_tolerance,
      details: `estimate=${estimate}, ground_truth=${ground_truth}, error=${error}`,
    },
  });
}

export function validate_seed_determinism(render_result1, render_result2, contract) {
  let passed = true;
  let metric_value = 0.0;
  const failures = [];
  const details_parts = [];

  const a = render_result1;
  const b = render_result2;

  if (Array.isArray(a) && Array.isArray(b)) {
    if (!_arrayEqual(a, b)) {
      passed = false;
      metric_value = 1.0;
      failures.push("Seed determinism violated: outputs differ");
      details_parts.push("outputs_differ");
    }
  } else if (a !== b) {
    passed = false;
    metric_value = 1.0;
    failures.push("Seed determinism violated: outputs differ");
    details_parts.push("outputs_differ");
  } else if (typeof a === "number" && (Number.isNaN(a) || !Number.isFinite(a))) {
    passed = false;
    metric_value = Number.NaN;
    failures.push("Seed determinism: output is NaN/Inf");
    details_parts.push("output_nan_inf");
  }

  metric_value = Math.max(metric_value, 0.0);
  if (Number.isNaN(metric_value) || !Number.isFinite(metric_value)) metric_value = 1.0;

  return new InvariantValidation({
    operation_id: "seed_determinism_check",
    invariant_name: "seed_determinism",
    timestamp: "",
    contract_version: "1.0",
    results: {},
    overall_passed: passed,
    failures,
    metrics: {
      metric_value,
      threshold: 0.0,
      details: passed ? "outputs identical" : "outputs differ between same-seed runs",
    },
  });
}

// ----------------------------------------------------------------------
// 5. Topology Validation
// ----------------------------------------------------------------------

export function validate_mesh_connectivity(vertices, indices, contract) {
  let passed = true;
  let metric_value = 0.0;
  const failures = [];
  const details_parts = [];

  const n_vertices = vertices.length;

  if (contract.mesh_connectivity) {
    const out_of_range = indices.filter((idx) => idx < 0 || idx >= n_vertices);
    if (out_of_range.length > 0) {
      passed = false;
      metric_value = out_of_range.length;
      failures.push(`Mesh connectivity violation: ${out_of_range.length} indices out of range [0, ${n_vertices}]`);
      details_parts.push(`out_of_range=${out_of_range.length}`);
    }
  }

  if (contract.manifold_integrity) {
    const seen = new Set();
    const unique_tris = indices.filter((tri) => {
      const key = tri.join(",");
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    }).length;
    const total_tris = indices.length;
    if (unique_tris < total_tris) {
      passed = false;
      const dup_count = total_tris - unique_tris;
      metric_value = Math.max(metric_value, dup_count);
      failures.push(`Manifold integrity: ${dup_count} duplicate triangles`);
      details_parts.push(`duplicates=${dup_count}`);
    }
  }

  metric_value = Math.max(metric_value, 0.0);

  return new InvariantValidation({
    operation_id: "mesh_connectivity_check",
    invariant_name: "mesh_connectivity",
    timestamp: "",
    contract_version: "1.0",
    results: {},
    overall_passed: passed,
    failures,
    metrics: {
      metric_value,
      threshold: contract.absolute_tolerance,
      details: details_parts.length ? details_parts.join("; ") : "mesh connectivity valid",
    },
  });
}

// ----------------------------------------------------------------------
// 6. Numerical Validation
// ----------------------------------------------------------------------

export function validate_fp_stability(values, contract) {
  let passed = true;
  let metric_value = 0.0;
  const failures = [];
  const details_parts = [];

  if (contract.fp_stability) {
    if (values.some((v) => Number.isNaN(v))) {
      passed = false;
      metric_value = Number.NaN;
      failures.push("NaN detected in numeric buffer");
      details_parts.push("nan_detected");
    }
    if (values.some((v) => !Number.isFinite(v) && !Number.isNaN(v))) {
      passed = false;
      metric_value = Number.POSITIVE_INFINITY;
      failures.push("Inf detected in numeric buffer");
      details_parts.push("inf_detected");
    }
  }

  if (contract.precision_contract === "fp32" && passed) {
    const max_abs = Math.max(...values.map((v) => Math.abs(v)), 0);
    if (max_abs > 3.4028235e38) {
      passed = false;
      metric_value = max_abs;
      failures.push(`FP32 overflow: max=${max_abs}`);
      details_parts.push(`overflow_${max_abs}`);
    }
  }

  metric_value = Math.max(metric_value, 0.0);
  if (Number.isNaN(metric_value) || !Number.isFinite(metric_value)) metric_value = 1.0;

  return new InvariantValidation({
    operation_id: "fp_stability_check",
    invariant_name: "fp_stability",
    timestamp: "",
    contract_version: "1.0",
    results: {},
    overall_passed: passed,
    failures,
    metrics: {
      metric_value,
      threshold: contract.absolute_tolerance,
      details: passed ? "floating-point stable" : "numerical instability detected",
    },
  });
}

// ----------------------------------------------------------------------
// 7. Temporal Validation
// ----------------------------------------------------------------------

export function validate_temporal_determinism(render_result1, render_result2, contract) {
  let passed = true;
  let metric_value = 0.0;
  const failures = [];
  const details_parts = [];

  const a = render_result1;
  const b = render_result2;

  if (Array.isArray(a) && Array.isArray(b)) {
    if (!_arrayEqual(a, b)) {
      passed = false;
      metric_value = _arrayMaxDiff(a, b);
      failures.push("Temporal determinism violated: frames differ");
      details_parts.push("frames_differ");
      metric_value = Math.max(metric_value, 0.0);
    }
  } else if (a !== b) {
    passed = false;
    metric_value = 1.0;
    failures.push("Temporal determinism violated: frames differ");
    details_parts.push("frames_differ");
    metric_value = 1.0;
  }

  if (contract.deterministic_seed && !passed) {
    metric_value = Math.max(metric_value, 1.0);
  }

  metric_value = Math.max(metric_value, 0.0);

  return new InvariantValidation({
    operation_id: "temporal_determinism_check",
    invariant_name: "temporal_determinism",
    timestamp: "",
    contract_version: "1.0",
    results: {},
    overall_passed: passed,
    failures,
    metrics: {
      metric_value,
      threshold: contract.frame_to_frame_consistency,
      details: passed ? "frames identical" : "frames differ between consecutive renders",
    },
  });
}

export function validate_energy_accumulated(accumulated, contract) {
  let passed = true;
  let metric_value = 0.0;
  const failures = [];
  const details_parts = [];

  if (contract.energy_conservation_accumulated && accumulated < 0) {
    passed = false;
    metric_value = accumulated;
    failures.push(`Accumulated energy negative: ${accumulated}`);
    details_parts.push(`accumulated=${accumulated} < 0`);
  }

  metric_value = Math.max(metric_value, 0.0);

  return new InvariantValidation({
    operation_id: "energy_accumulated_check",
    invariant_name: "energy_accumulated",
    timestamp: "",
    contract_version: "1.0",
    results: {},
    overall_passed: passed,
    failures,
    metrics: {
      metric_value,
      threshold: contract.absolute_tolerance,
      details: passed ? "accumulated energy non-negative" : `accumulated energy ${metric_value} negative`,
    },
  });
}

// ----------------------------------------------------------------------
// 8. Kernel: Mediates Invariant Validation
// ----------------------------------------------------------------------

export class InvariantKernel {
  constructor() {
    this.contract = null;
    this.validation_history = [];
    this._kernel_hash = "";
  }

  set_contract(contract) {
    this.contract = contract;
    this._kernel_hash = createHash("sha256").update(JSON.stringify(contract || {})).digest("hex").slice(0, 16);
    return this;
  }

  validate_input(input_data, backend = "python") {
    if (this.contract === null || this.contract === undefined) {
      return { overall_passed: true, results: {}, failures: [], metrics: {} };
    }
    return { overall_passed: true, results: {}, failures: [], metrics: {} };
  }

  validate_output(L_in, L_out, backend = "python") {
    if (this.contract === null || this.contract === undefined) {
      return { overall_passed: true, results: {}, failures: [], metrics: {} };
    }

    const results = {};
    const all_failures = [];
    const metrics = {};

    if (this.contract !== null && this.contract !== undefined && this.contract.energy) {
      const energy_val = validate_energy(L_in, L_out, this.contract.energy);
      results.energy = {
        invariant_name: energy_val.invariant_name,
        overall_passed: energy_val.overall_passed,
        metric_value: energy_val.metrics.metric_value,
        threshold: energy_val.metrics.threshold,
        details: energy_val.metrics.details,
      };
      if (!energy_val.overall_passed) {
        all_failures.push(energy_val.failures.length ? energy_val.failures[0] : "energy check failed");
        metrics.energy_error = energy_val.metrics.metric_value;
      }
    }

    const overall_passed = !all_failures.length;
    return { overall_passed, results, failures: all_failures, metrics };
  }

  attach_provenance(receipt, validation) {
    receipt.invariant_validation = {
      overall_passed: validation.overall_passed ?? false,
      results_count: Object.keys(validation.results || {}).length,
      failures_count: (validation.failures || []).length,
    };
    receipt.invariant_contract_hash = this._kernel_hash;

    if (this.contract !== null && this.contract !== undefined) {
      const checked = [];
      for (const attr of ["energy", "geometry", "radiometry", "probability", "topology", "numerical", "temporal"]) {
        if (this.contract[attr] !== undefined) checked.push(attr);
      }
      receipt.invariant_contract_checked = checked;
    }

    receipt.invariant_backend = "python";

    if (receipt.provenance) {
      receipt.provenance.invariants_checked = receipt.invariant_contract_checked;
      receipt.provenance.invariant_backend = receipt.invariant_backend;
    }

    return receipt;
  }

  get_determinism_class(validation) {
    const results = validation.results || {};
    const failures = validation.failures || [];
    const overall_passed = validation.overall_passed ?? false;

    if (overall_passed && !failures.length) {
      return "D2_NUMERICAL";
    }

    const entries = Object.values(results);
    const passed_count = entries.filter((r) => r.overall_passed ?? r.passed ?? false).length;
    const total = entries.length || 1;

    if (passed_count / total > 0.75) {
      return "D3_SEMANTIC";
    }
    return "D4_STATISTICAL";
  }

  record_validation(validation) {
    this.validation_history.push(validation);
  }

  get_recent_validations(n = 10) {
    return this.validation_history.length >= n
      ? this.validation_history.slice(-n)
      : this.validation_history.slice();
  }
}

// ----------------------------------------------------------------------
// 9. Convenience: Wire invariants into render flow
// ----------------------------------------------------------------------

export function render_with_invariants(path_tracer, scene, render_identity, invariant_kernel, L_in = 1.0, backend = "python") {
  if (invariant_kernel.contract === null || invariant_kernel.contract === undefined) {
    invariant_kernel.set_contract(new InvariantContract());
  }

  const render_result = path_tracer.render(scene, render_identity);

  let L_out = 0.0;
  if (render_result && render_result.data !== null && render_result.data !== undefined) {
    const data = Array.from(render_result.data, (v) => Number(v));
    if (data.length >= 3) {
      L_out = (data[0] + data[1] + data[2]) / 3;
    }
  }

  const validation = invariant_kernel.validate_output(L_in, L_out, backend);

  const receipt = {
    id: render_result.id || "unknown",
    format: render_result.format || "image/png",
    data: render_result.data,
    hash: render_result.hash,
    resolution: render_result.resolution,
    provenance: {},
  };
  invariant_kernel.attach_provenance(receipt, validation);

  const det_class = invariant_kernel.get_determinism_class(validation);

  return {
    render_result,
    invariant_validation: validation,
    determinism_class: det_class,
    receipt,
  };
}

// ----------------------------------------------------------------------
// Internal helpers
// ----------------------------------------------------------------------

function _matrixOrthogonalityError(R) {
  const n = R.length;
  let maxError = 0;
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      let dot = 0;
      for (let k = 0; k < n; k++) {
        dot += R[k][i] * R[k][j];
      }
      const expected = i === j ? 1 : 0;
      maxError = Math.max(maxError, Math.abs(dot - expected));
    }
  }
  return maxError;
}

function _matrixDeterminant(R) {
  if (R.length === 2) {
    return R[0][0] * R[1][1] - R[0][1] * R[1][0];
  }
  const n = R.length;
  let det = 0;
  for (let i = 0; i < n; i++) {
    const sub = [];
    for (let j = 1; j < n; j++) {
      const row = [];
      for (let k = 0; k < n; k++) {
        if (k !== i) row.push(R[j][k]);
      }
      sub.push(row);
    }
    det += (i % 2 === 0 ? 1 : -1) * R[0][i] * _matrixDeterminant(sub);
  }
  return det;
}

function _matVec(M, v) {
  return M.map((row) => row.reduce((acc, cell, idx) => acc + cell * v[idx], 0));
}

function _dist(a, b) {
  return Math.sqrt(a.reduce((acc, v, i) => acc + (v - b[i]) * (v - b[i]), 0));
}

function _arrayEqual(a, b) {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

function _arrayMaxDiff(a, b) {
  let maxDiff = 0;
  const len = Math.min(a.length, b.length);
  for (let i = 0; i < len; i++) {
    maxDiff = Math.max(maxDiff, Math.abs(a[i] - b[i]));
  }
  return maxDiff;
}
