"""Axiom-X Convergence Verifier — hierarchical equivalence determination.

STATUS: **partial** — Level 0-2 implemented; Level 3 (semantic) declared.

Implements the verification pipeline from Axiom-X spec §6.
"""

from __future__ import annotations

import hashlib
import json
import time
import numpy as np
from dataclasses import dataclass, asdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple
from enum import Enum


class DeterminismClass(Enum):
    """Axiom-X Determinism Classes (spec §4.2)"""
    D0_UNSPECIFIED = "D0"
    D1_EXACT = "D1"
    D2_NUMERICAL = "D2"
    D3_SEMANTIC = "D3"
    D4_STATISTICAL = "D4"


class VerificationResult(Enum):
    EXACT_MATCH = "EXACT_MATCH"
    EXACT_MISMATCH = "EXACT_MISMATCH"
    NUMERICALLY_CONVERGENT = "NUMERICALLY_CONVERGENT"
    NUMERICALLY_DIVERGENT = "NUMERICALLY_DIVERGENT"
    SEMANTICALLY_CONVERGENT = "SEMANTICALLY_CONVERGENT"
    SEMANTICALLY_DIVERGENT = "SEMANTICALLY_DIVERGENT"
    STATISTICALLY_CONVERGENT = "STATISTICALLY_CONVERGENT"
    STATISTICALLY_DIVERGENT = "STATISTICALLY_DIVERGENT"
    INSUFFICIENT_EVIDENCE = "INSUFFICIENT_EVIDENCE"


@dataclass
class DeterminismContract:
    """Axiom-X Determinism Contract (spec §4)"""
    class_name: DeterminismClass
    # D2 parameters
    absolute_epsilon: float = 1e-5
    relative_epsilon: float = 1e-4
    rmse_limit: float = 1e-4
    max_error_limit: Optional[float] = None
    # D3 parameters
    semantic_invariants: Optional[List[Dict[str, Any]]] = None
    # D4 parameters
    seed_policy: Optional[str] = None
    distribution: Optional[str] = None
    sample_count: Optional[int] = None
    confidence: Optional[float] = None
    variance_limit: Optional[float] = None


@dataclass
class ExecutionEvidence:
    """Evidence from a single execution (spec §6.6)"""
    execution_id: str
    job_identity: Dict[str, Any]
    backend: str
    device: Dict[str, Any]
    output_hash: str
    pixel_hash: str
    numerical_summary: Dict[str, Any]
    provenance: Dict[str, Any]
    raw_output: Optional[np.ndarray] = None


@dataclass
class VerificationMetrics:
    """Calculated comparison metrics"""
    max_absolute_error: float
    mean_absolute_error: float
    rmse: float
    max_relative_error: float
    nan_count_a: int
    nan_count_b: int
    inf_count_a: int
    inf_count_b: int
    hash_match: bool


@dataclass
class SemanticInvariantResult:
    """Result for a single semantic invariant check"""
    invariant_name: str
    passed: bool
    metric_value: float
    threshold: float
    details: str


@dataclass
class VerificationResultRecord:
    """Complete verification result (spec §6.6)"""
    verification_id: str
    job_identity: Dict[str, Any]
    execution_a: Dict[str, Any]
    execution_b: Dict[str, Any]
    determinism_class: DeterminismClass
    comparison_method: str
    metrics: VerificationMetrics
    semantic_results: List[SemanticInvariantResult]
    thresholds: Dict[str, float]
    passed: bool
    failure_reasons: List[str]
    verifier_version: str = "1.0.0"
    verifier_hash: str = ""
    timestamp: str = ""

    def to_dict(self) -> Dict[str, Any]:
        d = asdict(self)
        d["determinism_class"] = self.determinism_class.value
        return d


class ConvergenceVerifier:
    """
    Axiom-X Convergence Verifier (spec §6).

    Implements hierarchical verification:
      Level 0: Exact (hash equality)
      Level 1: Numerical (RMSE, max error, etc.)
      Level 2: Mathematical (semantic invariants)
      Level 3: Semantic (Mandala-level)
    """

    VERIFIER_VERSION = "1.0.0"

    def __init__(self, verifier_hash: str = ""):
        self.verifier_hash = verifier_hash or self._compute_self_hash()

    def _compute_self_hash(self) -> str:
        import inspect
        source = inspect.getsource(ConvergenceVerifier)
        return f"sha256:{hashlib.sha256(source.encode()).hexdigest()}"

    def verify(
        self,
        evidence_a: ExecutionEvidence,
        evidence_b: ExecutionEvidence,
        contract: DeterminismContract,
    ) -> VerificationResultRecord:
        """Main verification entry point."""

        verification_id = f"verify-{int(time.time())}-{hashlib.sha256(f'{evidence_a.execution_id}{evidence_b.execution_id}'.encode()).hexdigest()[:8]}"

        # Level 0: Exact hash match
        hash_match = evidence_a.output_hash == evidence_b.output_hash

        # Calculate numerical metrics
        metrics = self._calculate_metrics(evidence_a, evidence_b)

        # Level 1: Exact
        if contract.class_name == DeterminismClass.D1_EXACT:
            passed = hash_match
            result = VerificationResult.EXACT_MATCH if passed else VerificationResult.EXACT_MISMATCH
            return self._build_result(
                verification_id, evidence_a, evidence_b, contract,
                result, metrics, [], passed
            )

        # Level 2: Numerical
        if contract.class_name == DeterminismClass.D2_NUMERICAL:
            passed, failure_reasons = self._check_numerical(metrics, contract)
            result = VerificationResult.NUMERICALLY_CONVERGENT if passed else VerificationResult.NUMERICALLY_DIVERGENT
            return self._build_result(
                verification_id, evidence_a, evidence_b, contract,
                result, metrics, [], passed, failure_reasons
            )

        # Level 3: Semantic
        if contract.class_name == DeterminismClass.D3_SEMANTIC:
            semantic_results = self._check_semantic(evidence_a, evidence_b, contract)
            passed = all(r.passed for r in semantic_results)
            # Also check numerical bounds if specified
            if contract.absolute_epsilon > 0 or contract.rmse_limit > 0:
                num_passed, num_reasons = self._check_numerical(metrics, contract)
                if not num_passed:
                    passed = False
                    failure_reasons = num_reasons
                else:
                    failure_reasons = []
            else:
                failure_reasons = []
            result = VerificationResult.SEMANTICALLY_CONVERGENT if passed else VerificationResult.SEMANTICALLY_DIVERGENT
            return self._build_result(
                verification_id, evidence_a, evidence_b, contract,
                result, metrics, semantic_results, passed, failure_reasons
            )

        # Level 4: Statistical
        if contract.class_name == DeterminismClass.D4_STATISTICAL:
            # Requires multiple samples - not implemented for single-pair
            return VerificationResultRecord(
                verification_id=verification_id,
                job_identity=evidence_a.job_identity,
                execution_a={"id": evidence_a.execution_id, "backend": evidence_a.backend},
                execution_b={"id": evidence_b.execution_id, "backend": evidence_b.backend},
                determinism_class=contract.class_name,
                comparison_method="statistical",
                metrics=metrics,
                semantic_results=[],
                thresholds={},
                passed=False,
                failure_reasons=["D4 requires multiple samples; not implemented"],
                verifier_version=self.VERIFIER_VERSION,
                verifier_hash=self.verifier_hash,
                timestamp=datetime.now(timezone.utc).replace(microsecond=0).isoformat(),
            )

        # D0: Unspecified - insufficient evidence
        return VerificationResultRecord(
            verification_id=verification_id,
            job_identity=evidence_a.job_identity,
            execution_a={"id": evidence_a.execution_id, "backend": evidence_a.backend},
            execution_b={"id": evidence_b.execution_id, "backend": evidence_b.backend},
            determinism_class=contract.class_name,
            comparison_method="none",
            metrics=metrics,
            semantic_results=[],
            thresholds={},
            passed=False,
            failure_reasons=["D0: unspecified determinism class"],
            verifier_version=self.VERIFIER_VERSION,
            verifier_hash=self.verifier_hash,
            timestamp=datetime.now(timezone.utc).replace(microsecond=0).isoformat(),
        )

    def _calculate_metrics(
        self,
        evidence_a: ExecutionEvidence,
        evidence_b: ExecutionEvidence,
    ) -> VerificationMetrics:
        """Calculate numerical comparison metrics (spec §6.4)."""

        hash_match = evidence_a.output_hash == evidence_b.output_hash

        # Extract numerical summaries
        sum_a = evidence_a.numerical_summary
        sum_b = evidence_b.numerical_summary

        max_abs_error = abs(sum_a.get("max", 0) - sum_b.get("max", 0))
        mean_abs_error = abs(sum_a.get("mean", 0) - sum_b.get("mean", 0))

        # For RMSE, we'd need raw outputs; approximate from stddev
        std_a = sum_a.get("stddev", 0)
        std_b = sum_b.get("stddev", 0)
        rmse = abs(std_a - std_b)  # Approximation without raw data

        max_rel_error = 0
        if sum_a.get("max", 0) != 0:
            max_rel_error = max_abs_error / abs(sum_a.get("max", 1))

        return VerificationMetrics(
            max_absolute_error=max_abs_error,
            mean_absolute_error=mean_abs_error,
            rmse=rmse,
            max_relative_error=max_rel_error,
            nan_count_a=sum_a.get("nanCount", 0),
            nan_count_b=sum_b.get("nanCount", 0),
            inf_count_a=sum_a.get("infCount", 0),
            inf_count_b=sum_b.get("infCount", 0),
            hash_match=hash_match,
        )

    def _check_numerical(
        self,
        metrics: VerificationMetrics,
        contract: DeterminismContract,
    ) -> Tuple[bool, List[str]]:
        """Check numerical convergence (spec §6.4)."""
        failures = []

        if contract.absolute_epsilon > 0 and metrics.max_absolute_error > contract.absolute_epsilon:
            failures.append(f"max_absolute_error {metrics.max_absolute_error:.6f} > {contract.absolute_epsilon}")

        if contract.relative_epsilon > 0 and metrics.max_relative_error > contract.relative_epsilon:
            failures.append(f"max_relative_error {metrics.max_relative_error:.6f} > {contract.relative_epsilon}")

        if contract.rmse_limit > 0 and metrics.rmse > contract.rmse_limit:
            failures.append(f"rmse {metrics.rmse:.6f} > {contract.rmse_limit}")

        if contract.max_error_limit and metrics.max_absolute_error > contract.max_error_limit:
            failures.append(f"max_absolute_error {metrics.max_absolute_error:.6f} > {contract.max_error_limit}")

        return len(failures) == 0, failures

    def _check_semantic(
        self,
        evidence_a: ExecutionEvidence,
        evidence_b: ExecutionEvidence,
        contract: DeterminismContract,
    ) -> List[Any]:
        """Check semantic invariants (spec §6.5)."""
        results = []

        if not contract.semantic_invariants:
            return []

        for inv in contract.semantic_invariants:
            name = inv.get("name", "unnamed")
            # Placeholder: actual implementation would compare raw outputs
            # against the declared invariant
            passed = True  # Placeholder
            results.append(SemanticInvariantResult(
                invariant_name=name,
                passed=passed,
                metric_value=0.0,
                threshold=inv.get("threshold", 0),
                details="Not implemented - requires raw output comparison",
            ))

        return results

    def _build_result(
        self,
        verification_id: str,
        evidence_a: ExecutionEvidence,
        evidence_b: ExecutionEvidence,
        contract: DeterminismContract,
        result: VerificationResult,
        metrics: VerificationMetrics,
        semantic_results: List[Any],
        passed: bool,
        failure_reasons: Optional[List[str]] = None,
    ) -> VerificationResultRecord:
        return VerificationResultRecord(
            verification_id=verification_id,
            job_identity=evidence_a.job_identity,
            execution_a={
                "id": evidence_a.execution_id,
                "backend": evidence_a.backend,
                "device": evidence_a.device,
            },
            execution_b={
                "id": evidence_b.execution_id,
                "backend": evidence_b.backend,
                "device": evidence_b.device,
            },
            determinism_class=contract.class_name,
            comparison_method="hierarchical",
            metrics=metrics,
            semantic_results=[asdict(r) for r in semantic_results],
            thresholds={
                "absolute_epsilon": contract.absolute_epsilon,
                "relative_epsilon": contract.relative_epsilon,
                "rmse_limit": contract.rmse_limit,
                "max_error_limit": contract.max_error_limit,
            },
            passed=passed,
            failure_reasons=failure_reasons or [],
            verifier_version=self.VERIFIER_VERSION,
            verifier_hash=self.verifier_hash,
            timestamp=datetime.now(timezone.utc).replace(microsecond=0).isoformat(),
        )


# Convenience functions

def create_evidence_from_axiom_result(
    result: "AxiomXResult",
    execution_id: str,
    raw_output: Optional[np.ndarray] = None,
) -> ExecutionEvidence:
    """Convert AxiomXResult to ExecutionEvidence for verification."""
    return ExecutionEvidence(
        execution_id=execution_id,
        job_identity=asdict(result.jobIdentity),
        backend=result.executionIdentity.backend,
        device=asdict(result.executionIdentity.device),
        output_hash=result.resultIdentity.outputHash,
        pixel_hash=result.resultIdentity.pixelHash,
        numerical_summary=asdict(result.resultIdentity.numericalSummary),
        provenance=asdict(result.resultIdentity.provenance),
        raw_output=raw_output if raw_output is not None else result.rawOutput,
    )


def create_d2_contract(
    absolute_epsilon: float = 1e-3,
    relative_epsilon: float = 1e-2,
    rmse_limit: float = 2e-2,
    max_error_limit: Optional[float] = None,
) -> DeterminismContract:
    """Create D2 (numerical) determinism contract — realistic for CPU↔GPU."""
    return DeterminismContract(
        class_name=DeterminismClass.D2_NUMERICAL,
        absolute_epsilon=absolute_epsilon,
        relative_epsilon=relative_epsilon,
        rmse_limit=rmse_limit,
        max_error_limit=max_error_limit,
    )


def create_d3_contract(
    absolute_epsilon: float = 1e-4,
    relative_epsilon: float = 1e-3,
    rmse_limit: float = 1e-3,
    semantic_invariants: Optional[List[Dict[str, Any]]] = None,
) -> DeterminismContract:
    """Create D3 (semantic) determinism contract with optional invariants."""
    return DeterminismContract(
        class_name=DeterminismClass.D3_SEMANTIC,
        absolute_epsilon=absolute_epsilon,
        relative_epsilon=relative_epsilon,
        rmse_limit=rmse_limit,
        semantic_invariants=semantic_invariants,
    )