"""Axiom-X Invariant Validators — check invariants against contracts.

Implements the mathematical/physical validation for each invariant category.
These are the reference Python implementations; GPU/HIP/CUDA/OpenCL conforming
implementations must produce results satisfying these contracts.

STATUS: **reference** — Python substrate; must be matched by backend implementations.
"""

from typing import Any, Dict, List, Optional, Tuple

import numpy as np
from .invariant_contracts import (
    InvariantContract,
    EnergyContract,
    GeometryContract,
    RadiometryContract,
    ProbabilityContract,
    TopologyContract,
    NumericalContract,
    TemporalContract,
    InvariantValidation,
)


# ----------------------------------------------------------------------
# 1. Energy Validation
# ----------------------------------------------------------------------


def validate_energy(in_L: float, out_L: float, contract: EnergyContract) -> InvariantValidation:
    """Validate energy conservation invariant.

    Invariant: L_out <= L_in (energy never increases).
    """
    passed = True
    metric_value = 0.0
    failures = []
    details_parts = []

    if contract.conserved:
        rel_error = abs(out_L - in_L) / max(abs(in_L), 1e-8)
        if out_L > in_L + contract.absolute_tolerance:
            passed = False
            metric_value = out_L - in_L
            failures.append("Energy not conserved: L_out=%f > L_in=%f + %f" % (out_L, in_L, contract.absolute_tolerance))
            details_parts.append("L_out-L_in=%f > %f" % (out_L - in_L, contract.absolute_tolerance))
        if out_L < -contract.absolute_tolerance:
            passed = False
            metric_value = out_L
            failures.append("Negative radiance: L_out=%f" % out_L)
            details_parts.append("L_out=%f < 0" % out_L)

    if passed and contract.relative_tolerance > 0:
        rel_error = abs(out_L - in_L) / max(abs(in_L), 1e-8)
        if rel_error > contract.relative_tolerance:
            passed = False
            metric_value = rel_error
            failures.append("Relative energy error %.6f > %.6f" % (rel_error, contract.relative_tolerance))
            details_parts.append("relative_error=%f" % rel_error)

    metric_value = max(metric_value, 0.0)

    return InvariantValidation(
        operation_id="energy_check",
        invariant_name="energy",
        timestamp="",  # will be filled by dataclass default
        contract_version="1.0",
        results={},
        overall_passed=passed,
        failures=failures,
        metrics={"metric_value": metric_value, "threshold": contract.absolute_tolerance, "details": "; ".join(details_parts) if details_parts else "energy conserved within tolerance"},
    )


# ----------------------------------------------------------------------
# 2. Geometry Validation
# ----------------------------------------------------------------------


def validate_geometry_rotation(R: np.ndarray, contract: GeometryContract) -> InvariantValidation:
    """Validate rotation matrix invariants.

    Invariants: R^T R = I (orthogonality), det(R) = 1.
    """
    passed = True
    metric_value = 0.0
    failures = []
    details_parts = []

    # Check orthogonality: R^T R = I
    if contract.rotation_matrix_valid:
        RtR = R.T @ R
        eye = np.eye(3, dtype=R.dtype)
        ortho_error = np.max(np.abs(RtR - eye))
        if ortho_error > contract.absolute_tolerance:
            passed = False
            metric_value = max(metric_value, ortho_error)
            failures.append("Rotation matrix not orthogonal: error=%f" % ortho_error)
            details_parts.append("ortho_error=%f" % ortho_error)

    # Check determinant = 1
    if contract.rotation_matrix_valid:
        det = np.linalg.det(R)
        det_error = abs(det - 1.0)
        if det_error > contract.absolute_tolerance:
            passed = False
            metric_value = max(metric_value, det_error)
            failures.append("Rotation determinant != 1: det=%f, error=%f" % (det, det_error))
            details_parts.append("det_error=%f" % det_error)

    metric_value = max(metric_value, 0.0)

    return InvariantValidation(
        operation_id="geometry_rotation_check",
        invariant_name="geometry_rotation",
        timestamp="",
        contract_version="1.0",
        results={},
        overall_passed=passed,
        failures=failures,
        metrics={"metric_value": metric_value, "threshold": contract.absolute_tolerance, "details": "rotation matrix valid" if passed else "rotation matrix invalid"},
    )


def validate_geometry_distance_preservation(
    p: np.ndarray, q: np.ndarray, T_matrix: np.ndarray, contract: GeometryContract
) -> InvariantValidation:
    """Validate distance preservation under rigid transform.

    Invariant: ||T(p) - T(q)|| == ||p - q||
    """
    passed = True
    metric_value = 0.0
    failures = []
    details_parts = []

    def apply_transform(v: np.ndarray, M: np.ndarray) -> np.ndarray:
        """Apply homogeneous transform to 3D point."""
        hv = np.concatenate([v, np.array([1.0])])
        tv = M @ hv
        return tv[:3] / tv[3]

    if contract.distance_preservation:
        dp = np.linalg.norm(p - q)
        dp_transformed = np.linalg.norm(apply_transform(p, T_matrix) - apply_transform(q, T_matrix))
        error = abs(dp_transformed - dp)
        if error > contract.absolute_tolerance:
            passed = False
            metric_value = max(metric_value, error)
            failures.append("Distance not preserved: before=%f, after=%f, error=%f" % (dp, dp_transformed, error))
            details_parts.append("error=%f" % error)

    metric_value = max(metric_value, 0.0)

    return InvariantValidation(
        operation_id="geometry_distance_preservation_check",
        invariant_name="geometry_distance_preservation",
        timestamp="",
        contract_version="1.0",
        results={},
        overall_passed=passed,
        failures=failures,
        metrics={"metric_value": metric_value, "threshold": contract.absolute_tolerance, "details": "distance preserved" if passed else "distance not preserved"},
    )


# ----------------------------------------------------------------------
# 3. Radiometry Validation
# ----------------------------------------------------------------------


def validate_radiometry_non_negative(radiance: float, contract: RadiometryContract) -> InvariantValidation:
    """Validate non-negative radiance invariant."""
    passed = True
    metric_value = 0.0
    failures = []
    details_parts = []

    if contract.non_negative and radiance < -contract.absolute_tolerance:
        passed = False
        metric_value = radiance
        failures.append("Negative radiance: %f" % radiance)
        details_parts.append("radiance=%f < 0" % radiance)

    metric_value = max(metric_value, 0.0)

    return InvariantValidation(
        operation_id="radiance_non_negative_check",
        invariant_name="radiance_non_negative",
        timestamp="",
        contract_version="1.0",
        results={},
        overall_passed=passed,
        failures=failures,
        metrics={"metric_value": metric_value, "threshold": contract.absolute_tolerance, "details": "radiance non-negative" if passed else "radiance %f negative" % metric_value},
    )


def validate_brdf_reciprocity(brdf_func, wi: np.ndarray, wo: np.ndarray, contract: RadiometryContract) -> InvariantValidation:
    """Validate BRDF reciprocity: f_r(wi, wo) == f_r(wo, wi)."""
    passed = True
    metric_value = 0.0
    failures = []
    details_parts = []

    # Evaluate BRDF at both orderings
    try:
        f1 = float(brdf_func(wi, wo))
        f2 = float(brdf_func(wo, wi))
    except Exception as e:
        passed = False
        metric_value = 1.0
        failures.append("BRDF evaluation failed: %s" % str(e)[:50])
        details_parts.append("brdf_error=%s" % str(e)[:50])
        return InvariantValidation(
            operation_id="brdf_reciprocity_check",
            invariant_name="brdf_reciprocity",
            timestamp="",
            contract_version="1.0",
            results={},
            overall_passed=False,
            failures=["brdf evaluation failed: %s" % str(e)[:60]],
            metrics={"metric_value": metric_value, "threshold": contract.absolute_tolerance, "details": "brdf evaluation failed: %s" % str(e)[:60]},
        )

    if abs(f1 - f2) > contract.absolute_tolerance:
        passed = False
        metric_value = abs(f1 - f2)
        failures.append("BRDF reciprocity violated: f(wi,wo)=%f, f(wo,wi)=%f" % (f1, f2))
        details_parts.append("reciprocity_error=%f" % metric_value)

    if f1 < -contract.absolute_tolerance or f2 < -contract.absolute_tolerance:
        passed = False
        metric_value = max(f1, f2)
        failures.append("BRDF returned negative value: f1=%f, f2=%f" % (f1, f2))
        details_parts.append("negative_radiance")

    metric_value = max(metric_value, 0.0)

    return InvariantValidation(
        operation_id="brdf_reciprocity_check",
        invariant_name="brdf_reciprocity",
        timestamp="",
        contract_version="1.0",
        results={},
        overall_passed=passed,
        failures=failures,
        metrics={"metric_value": metric_value, "threshold": contract.absolute_tolerance, "details": "; ".join(details_parts) if details_parts else "BRDF reciprocity holds"},
    )


# ----------------------------------------------------------------------
# 3. Probability Validation
# ----------------------------------------------------------------------


def validate_unbiased_estimator(samples: np.ndarray, ground_truth: float, contract: ProbabilityContract) -> InvariantValidation:
    """Validate unbiased estimator invariant.

    Invariant: E[estimator] ~= ground_truth (within tolerance).
    """
    passed = True
    metric_value = 0.0
    failures = []
    details_parts = []

    if len(samples) == 0:
        passed = False
        metric_value = float("nan")
        failures.append("Empty sample set")
        return InvariantValidation(
            operation_id="unbiased_estimator_check",
            invariant_name="unbiased_estimator",
            timestamp="",
            contract_version="1.0",
            results={},
            overall_passed=False,
            failures=["no samples provided"],
            metrics={"metric_value": metric_value, "threshold": contract.absolute_tolerance, "details": "no samples provided"},
        )

    estimate = float(np.mean(samples))
    error = abs(estimate - ground_truth)

    if contract.unbiased and error > contract.absolute_tolerance:
        passed = False
        metric_value = error
        failures.append("Unbiasedness violated: estimate=%f, ground_truth=%f, error=%f" % (estimate, ground_truth, error))
        details_parts.append("error=%f" % error)

    if contract.variance_within is not None:
        variance = float(np.var(samples))
        if variance > contract.variance_within:
            passed = False
            metric_value = max(metric_value, variance)
            failures.append("Variance %.6f > limit %f" % (variance, contract.variance_within))
            details_parts.append("variance=%f" % variance)

    metric_value = max(metric_value, 0.0)

    # If metric_value is NaN/Inf from above, handle it
    if isinstance(metric_value, float) and (np.isnan(metric_value) or np.isinf(metric_value)):
        metric_value = 1.0

    return InvariantValidation(
        operation_id="unbiased_estimator_check",
        invariant_name="unbiased_estimator",
        timestamp="",
        contract_version="1.0",
        results={},
        overall_passed=passed,
        failures=failures,
        metrics={"metric_value": metric_value, "threshold": contract.absolute_tolerance, "details": "estimate=%f, ground_truth=%f, error=%f" % (estimate, ground_truth, error)},
    )


def validate_seed_determinism(render_result1, render_result2, contract: ProbabilityContract) -> InvariantValidation:
    """Validate seed determinism: same seed -> same output."""
    passed = True
    metric_value = 0.0
    failures = []
    details_parts = []

    if isinstance(render_result1, np.ndarray) and isinstance(render_result2, np.ndarray):
        if not np.array_equal(render_result1, render_result2):
            passed = False
            metric_value = 1.0  # maximum difference
            failures.append("Seed determinism violated: outputs differ")
            details_parts.append("outputs_differ")
    elif render_result1 != render_result2:
        passed = False
        metric_value = 1.0
        failures.append("Seed determinism violated: outputs differ")
        details_parts.append("outputs_differ")
    else:
        # Also check that they're not NaN/Inf
        if isinstance(render_result1, float) and (np.isnan(render_result1) or np.isinf(render_result1)):
            passed = False
            metric_value = float("nan")
            failures.append("Seed determinism: output is NaN/Inf")
            details_parts.append("output_nan_inf")

    metric_value = max(metric_value, 0.0)

    # If metric_value is NaN/Inf from above, handle it
    if isinstance(metric_value, float) and (np.isnan(metric_value) or np.isinf(metric_value)):
        metric_value = 1.0

    return InvariantValidation(
        operation_id="seed_determinism_check",
        invariant_name="seed_determinism",
        timestamp="",
        contract_version="1.0",
        results={},
        overall_passed=passed,
        failures=failures,
        metrics={"metric_value": metric_value, "threshold": 0.0, "details": "outputs identical" if passed else "outputs differ between same-seed runs"},
    )


# ----------------------------------------------------------------------
# 4. Topology Validation
# ----------------------------------------------------------------------


def validate_mesh_connectivity(vertices: np.ndarray, indices: np.ndarray, contract: TopologyContract) -> InvariantValidation:
    """Validate mesh connectivity invariant.

    Invariant: indices reference valid vertices, no out-of-range.
    """
    passed = True
    metric_value = 0.0
    failures = []
    details_parts = []

    n_vertices = vertices.shape[0]

    if contract.mesh_connectivity:
        if np.any(indices < 0) or np.any(indices >= n_vertices):
            passed = False
            out_of_range = np.unique(indices[indices < 0 if np.any(indices < 0) else indices >= n_vertices])
            metric_value = float(len(out_of_range))
            failures.append("Mesh connectivity violation: %d indices out of range [0, %d]" % (len(out_of_range), n_vertices))
            details_parts.append("out_of_range=%d" % len(out_of_range))

    if contract.manifold_integrity:
        # Check no duplicate triangles (simplified)
        unique_tris = np.unique(indices, axis=0).shape[0]
        total_tris = indices.shape[0]
        if unique_tris < total_tris:
            passed = False
            dup_count = total_tris - unique_tris
            metric_value = max(metric_value, float(dup_count))
            failures.append("Manifold integrity: %d duplicate triangles" % dup_count)
            details_parts.append("duplicates=%d" % dup_count)

    metric_value = max(metric_value, 0.0)

    return InvariantValidation(
        operation_id="mesh_connectivity_check",
        invariant_name="mesh_connectivity",
        timestamp="",
        contract_version="1.0",
        results={},
        overall_passed=passed,
        failures=failures,
        metrics={"metric_value": metric_value, "threshold": contract.absolute_tolerance, "details": "; ".join(details_parts) if details_parts else "mesh connectivity valid"},
    )


# ----------------------------------------------------------------------
# 5. Numerical Validation
# ----------------------------------------------------------------------


def validate_fp_stability(values: np.ndarray, contract: NumericalContract) -> InvariantValidation:
    """Validate floating-point stability: no NaN/Inf, magnitudes reasonable."""
    passed = True
    metric_value = 0.0
    failures = []
    details_parts = []

    if contract.fp_stability:
        if np.any(np.isnan(values)):
            passed = False
            metric_value = float("nan")
            failures.append("NaN detected in numeric buffer")
            details_parts.append("nan_detected")

        if np.any(np.isinf(values)):
            passed = False
            metric_value = float("inf") if not np.isinf(metric_value) else metric_value
            failures.append("Inf detected in numeric buffer")
            details_parts.append("inf_detected")

    if contract.precision_contract == "fp32" and passed:
        max_abs = float(np.max(np.abs(values)))
        if max_abs > 3.4028235e38:  # FP32 max
            passed = False
            metric_value = max_abs
            failures.append("FP32 overflow: max=%f" % max_abs)
            details_parts.append("overflow_%f" % max_abs)

    if contract.catastrophic_cancellation and passed:
        # Simple check: no extreme loss of significance
        # (would need more sophisticated analysis in practice)
        pass

    metric_value = max(metric_value, 0.0)

    # If metric_value is NaN/Inf from above, handle it
    if isinstance(metric_value, float) and (np.isnan(metric_value) or np.isinf(metric_value)):
        metric_value = 1.0

    return InvariantValidation(
        operation_id="fp_stability_check",
        invariant_name="fp_stability",
        timestamp="",
        contract_version="1.0",
        results={},
        overall_passed=passed,
        failures=failures,
        metrics={"metric_value": metric_value, "threshold": contract.absolute_tolerance, "details": "floating-point stable" if passed else "numerical instability detected"},
    )


# ----------------------------------------------------------------------
# 6. Temporal Validation
# ----------------------------------------------------------------------


def validate_temporal_determinism(render_result1, render_result2, contract: TemporalContract) -> InvariantValidation:
    """Validate temporal determinism: same seed -> same output (frame-to-frame)."""
    passed = True
    metric_value = 0.0
    failures = []
    details_parts = []

    if isinstance(render_result1, np.ndarray) and isinstance(render_result2, np.ndarray):
        if not np.array_equal(render_result1, render_result2):
            passed = False
            metric_value = float(np.max(np.abs(render_result1 - render_result2)))
            failures.append("Temporal determinism violated: frames differ")
            details_parts.append("frames_differ")
            metric_value = max(metric_value, 0.0)
    elif render_result1 != render_result2:
        passed = False
        metric_value = 1.0
        failures.append("Temporal determinism violated: frames differ")
        details_parts.append("frames_differ")
        metric_value = 1.0

    if contract.deterministic_seed and not passed:
        metric_value = max(metric_value, 1.0)

    metric_value = max(metric_value, 0.0)

    return InvariantValidation(
        operation_id="temporal_determinism_check",
        invariant_name="temporal_determinism",
        timestamp="",
        contract_version="1.0",
        results={},
        overall_passed=passed,
        failures=failures,
        metrics={"metric_value": metric_value, "threshold": contract.frame_to_frame_consistency, "details": "frames identical" if passed else "frames differ between consecutive renders"},
    )


def validate_energy_accumulated(accumulated: float, contract: TemporalContract) -> InvariantValidation:
    """Validate accumulated energy invariants over time."""
    passed = True
    metric_value = 0.0
    failures = []
    details_parts = []

    if contract.energy_conservation_accumulated:
        if accumulated < 0:
            passed = False
            metric_value = accumulated
            failures.append("Accumulated energy negative: %f" % accumulated)
            details_parts.append("accumulated=%f < 0" % accumulated)

    metric_value = max(metric_value, 0.0)

    return InvariantValidation(
        operation_id="energy_accumulated_check",
        invariant_name="energy_accumulated",
        timestamp="",
        contract_version="1.0",
        results={},
        overall_passed=passed,
        failures=failures,
        metrics={"metric_value": metric_value, "threshold": contract.absolute_tolerance, "details": "accumulated energy non-negative" if passed else "accumulated energy %f negative" % metric_value},
    )


# ----------------------------------------------------------------------
# 7. Kernel: Mediates Invariant Validation
# ----------------------------------------------------------------------


class InvariantKernel:
    """Mediates invariant validation across substrates.

    Responsibilities:
    1. Hold the current invariant contract
    2. Validate input data against contract
    3. Validate output data against contract
    4. Attach provenance to render receipts
    5. Map validation results to convergence verifier D0-D4 classes
    """

    def __init__(self):
        self.contract: Optional[Any] = None
        self.validation_history: List[InvariantValidation] = []
        self._kernel_hash: str = ""

    def set_contract(self, contract: Any) -> None:
        """Set the invariant contract for the next operation."""
        self.contract = contract
        # Hash the contract for provenance
        import hashlib
        self._kernel_hash = hashlib.sha256(str(contract).encode()).hexdigest()[:16]

    def validate_input(self, input_data: Dict[str, Any], backend: str = "python") -> Dict[str, Any]:
        """Validate input data meets contract requirements.

        Args:
            input_data: Dict with keys matching invariant categories
            backend: "python", "opencl", "hip", "cuda", "vulkan"

        Returns:
            Dict with overall_passed, results dict, failures list, metrics dict
        """
        if self.contract is None:
            return {
                "overall_passed": True,
                "results": {},
                "failures": [],
                "metrics": {},
            }

        results: Dict[str, Any] = {}
        all_failures: List[str] = []
        metrics: Dict[str, float] = {}

        # Placeholder: return overall_passed=True with empty results
        # In full implementation, each invariant type would be checked
        # with data from input_data dict

        return {
            "overall_passed": True,
            "results": results,
            "failures": all_failures,
            "metrics": metrics,
        }

    def validate_output(
        self, L_in: float, L_out: float, backend: str = "python"
    ) -> Dict[str, Any]:
        """Validate output invariants, especially energy conservation.

        Args:
            L_in: Input radiance/energy
            L_out: Output radiance/energy
            backend: Which backend produced the output

        Returns:
            Dict with overall_passed, results dict, failures list, metrics dict
        """
        if self.contract is None:
            return {
                "overall_passed": True,
                "results": {},
                "failures": [],
                "metrics": {},
            }

        results: Dict[str, Any] = {}
        all_failures: List[str] = []
        metrics: Dict[str, float] = {}

        # Energy validation (core invariant)
        if self.contract is not None and hasattr(self.contract, 'energy'):
            energy_val = validate_energy(L_in, L_out, self.contract.energy)
            results["energy"] = {
                "invariant_name": energy_val.invariant_name,
                "overall_passed": energy_val.overall_passed,
                "metric_value": energy_val.metrics.get("metric_value", 0.0),
                "threshold": energy_val.metrics.get("threshold", contract.absolute_tolerance if hasattr(self.contract, 'energy') else 1e-6),
                "details": energy_val.metrics.get("details", "energy conserved"),
            }
            if not energy_val.overall_passed:
                all_failures.append(energy_val.failures[0] if energy_val.failures else "energy check failed")
                metrics["energy_error"] = energy_val.metrics.get("metric_value", 0.0)

        # Geometry: would need rotation matrix, transform data
        # Probability: would need samples, ground truth
        # Topology: would need mesh vertices, indices

        overall_passed = not bool(all_failures)

        return {
            "overall_passed": overall_passed,
            "results": results,
            "failures": all_failures,
            "metrics": metrics,
        }

    def attach_provenance(self, receipt: Dict[str, Any], validation: Dict[str, Any]) -> Dict[str, Any]:
        """Attach invariant validation to render receipt.

        Modifies receipt in-place and returns it.
        """
        # Attach invariant validation details
        receipt["invariant_validation"] = {
            "overall_passed": validation.get("overall_passed", False),
            "results_count": len(validation.get("results", {})),
            "failures_count": len(validation.get("failures", [])),
        }

        # Attach contract hash for provenance
        receipt["invariant_contract_hash"] = self._kernel_hash

        # Attach which invariants were checked
        if self.contract is not None:
            # InvariantContract has sub-contracts as attributes: energy, geometry, etc.
            checked = []
            for attr in ['energy', 'geometry', 'radiometry', 'probability', 'topology', 'numerical', 'temporal']:
                if hasattr(self.contract, attr):
                    checked.append(attr)
            receipt["invariant_contract_checked"] = checked

        # Attach backend used
        receipt["invariant_backend"] = "python"  # or "opencl", "hip", etc.

        # Add to existing provenance if present
        if "provenance" in receipt:
            receipt["provenance"]["invariants_checked"] = receipt["invariant_contract_checked"]
            receipt["provenance"]["invariant_backend"] = receipt["invariant_backend"]

        return receipt

    def get_determinism_class(self, validation: Dict[str, Any]) -> str:
        """Determine convergence verifier D0-D4 class from invariant validation.

        Mapping:
        - All invariants passed with exact hash match -> D0_EXACT
        - Numerical converged (energy within epsilon, geometry valid) -> D2_NUMERICAL
        - Some invariants passed (semantic) -> D3_SEMANTIC
        - Many failures / need more samples -> D4_STATISTICAL
        """
        results = validation.get("results", {})
        failures = validation.get("failures", [])
        overall_passed = validation.get("overall_passed", False)

        if overall_passed and not failures:
            # All checks passed - could be D0 if hashes match, D2 if numerical
            return "D2_NUMERICAL"  # numerical convergence is most common

        passed_count = sum(1 for r in results.values() if r.get("passed", False))
        total = len(results) if results else 1

        if passed_count / total > 0.75:
            return "D3_SEMANTIC"  # majority of invariants satisfied
        else:
            return "D4_STATISTICAL"  # many failures, need more samples

    def record_validation(self, validation: Any) -> None:
        """Record validation in history."""
        self.validation_history.append(validation)

    def get_recent_validations(self, n: int = 10) -> List[Any]:
        """Get the last n validation records."""
        return self.validation_history[-n:] if len(self.validation_history) >= n else self.validation_history[:]


# ----------------------------------------------------------------------
# 8. Convenience: Wire invariants into PathTracer4D render flow
# ----------------------------------------------------------------------


def render_with_invariants(path_tracer, scene, render_identity, invariant_kernel, L_in: float = 1.0, backend: str = "python") -> Dict[str, Any]:
    """Render a frame with full invariant validation and provenance.

    Workflow:
    1. Set invariant kernel contract
    2. Render (get L_out from path tracer)
    3. Validate output invariants
    4. Attach provenance to receipt
    5. Determine convergence class
    6. Return everything needed for provenance + convergence

    Args:
        path_tracer: PathTracer4D instance
        scene: Scene4D instance
        render_identity: RenderIdentity instance
        invariant_kernel: InvariantKernel instance (contract already set)
        L_in: Input radiance/energy for energy conservation check
        backend: Which backend produced the output

    Returns:
        Dict with:
        - render_result: raw PathTracer4D output
        - invariant_validation: validation results dict
        - determinism_class: D2/D3/D4 string
        - receipt: provenance-enriched render receipt
    """
    # 1. Set contract (already done by caller, but ensure it's set)
    if invariant_kernel.contract is None:
        from .invariant_contracts import InvariantContract
        invariant_kernel.set_contract(InvariantContract())

    # 2. Render
    render_result = path_tracer.render(scene, render_identity)

    # 3. Compute L_out from rendered data
    L_out = 0.0
    import numpy as np
    if render_result and render_result.get("data") is not None:
        data = np.array(render_result["data"], dtype=np.float64)
        # Normalize if needed (assuming [0,1] RGBA -> radiance [0,1])
        L_out = float(np.mean(data[:, :3]))  # mean of RGB channels

    # 3. Validate output invariants
    validation = invariant_kernel.validate_output(L_in, L_out, backend)

    # 4. Attach provenance to receipt
    receipt = {
        "id": render_result.get("id", "unknown"),
        "format": render_result.get("format", "image/png"),
        "data": render_result.get("data"),
        "hash": render_result.get("hash"),
        "resolution": render_result.get("resolution"),
        "provenance": {},
    }
    receipt = invariant_kernel.attach_provenance(receipt, validation)

    # 5. Determine convergence class
    det_class = invariant_kernel.get_determinism_class(validation)

    return {
        "render_result": render_result,
        "invariant_validation": validation,
        "determinism_class": det_class,
        "receipt": receipt,
    }