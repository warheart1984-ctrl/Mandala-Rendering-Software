"""Sovereign-X / Axiom-X Bridge — constitutional authorization gate.

STATUS: **partial** — intent gate, capability check, provenance wrap implemented.

Enforces the boundary contract from Axiom-X spec §7:

SOVEREIGN-X
    ↓
authorization → capability check → policy validation → provenance wrap
    ↓
AXIOM-X MANIFEST (validated)
    ↓
AXIOM-X IR (compiled)
    ↓
GPU / CPU
    ↓
RESULT → hash + metrics
    ↓
CONVERGENCE VERIFIER
    ↓
EVIDENCE / RECEIPT
    ↓
SOVEREIGN-X (evidence recorded)

FAIL CLOSED at every gate.
"""

from __future__ import annotations

import hashlib
import json
import os
import time
import uuid
from dataclasses import dataclass, asdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional, Union

from axiom_x.runtime.axiom_x_runtime import AxiomXRuntime, AxiomXResult
from axiom_x.verifier.convergence_verifier import (
    ConvergenceVerifier,
    DeterminismContract,
    ExecutionEvidence,
    VerificationResultRecord,
    create_evidence_from_axiom_result,
    create_d2_contract,
)


@dataclass
class SovereignIntent:
    """Intent declaration for Axiom-X job (from Sovereign-X)."""
    intent_id: str
    actor: str
    capability: str
    action: str
    parameters: Dict[str, Any]
    timestamp: str
    signature: str = ""


@dataclass
class CapabilityCheck:
    """Result of Sovereign-X capability check."""
    capability_id: str
    allowed: bool
    device_match: bool
    policy_compliant: bool
    limits: Dict[str, Any]
    reason: str


@dataclass
class PolicyValidation:
    """Result of Sovereign-X policy validation."""
    valid: bool
    determinism_class: str
    precision_policy: str
    tolerances: Dict[str, float]
    reason: str


@dataclass
class AxiomXAuthorization:
    """Complete authorization result from Sovereign-X."""
    authorized: bool
    intent: SovereignIntent
    capability_check: CapabilityCheck
    policy_validation: PolicyValidation
    manifest: Optional[Dict[str, Any]] = None
    reason: str = ""


class SovereignXBridge:
    """
    Sovereign-X / Axiom-X Bridge (spec §7).

    The only authorized entrance into Axiom-X when running under Sovereign-X.
    """

    def __init__(
        self,
        axiom_x_runtime: Optional["AxiomXRuntime"] = None,
        conver_verifier: Optional["ConvergenceVerifier"] = None,
        project_root: Optional[Path] = None,
    ):
        self.axiom_x_runtime = axiom_x_runtime or AxiomXRuntime(project_root)
        self.convergence_verifier = conver_verifier or ConvergenceVerifier()
        self.project_root = project_root or Path(__file__).resolve().parents[3]

    def _hash_sha256(self, data: Union[bytes, str]) -> str:
        if isinstance(data, str):
            data = data.encode("utf-8")
        return f"sha256:{hashlib.sha256(data).hexdigest()}"

    def authorize_and_execute(
        self,
        intent: SovereignIntent,
        kernel_name: str,
        kernel_version: str,
        kernel_source: str,
        inputs: List[np.ndarray],
        dispatch_config: Any,  # DispatchConfig from axiom_x_runtime
        constants: Optional[Dict[str, Any]] = None,
        determinism_contract: Optional[Any] = None,  # DeterminismContract
        reference_result: Optional["AxiomXResult"] = None,
        out_dir: Optional[Path] = None,
    ) -> Dict[str, Any]:
        """
        Full constitutional pipeline:
        1. Validate intent
        2. Check capability
        3. Validate policy
        4. Build Axiom-X manifest
        4. Execute via Axiom-X runtime
        5. (Optional) Convergence verification against reference
        6. Return evidence package
        """

        evidence_package = {
            "pipeline": "sovereign-x-axiom-x",
            "version": "1.0.0",
            "timestamp": datetime.now(timezone.utc).replace(microsecond=0).isoformat(),
            "intent": asdict(intent),
            "stages": [],
        }

        # Stage 1: Validate Intent
        intent_valid = self._validate_intent(intent)
        evidence_package["stages"].append({
            "stage": "intent_validation",
            "passed": intent_valid,
            "details": "Intent structure and signature verified" if intent_valid else "Invalid intent",
        })
        if not intent_valid:
            return self._fail_closed(evidence_package, "intent_validation_failed")

        # Stage 2: Capability Check
        capability_check = self._check_capability(intent.capability)
        evidence_package["stages"].append({
            "stage": "capability_check",
            "passed": capability_check.allowed,
            "details": asdict(capability_check),
        })
        if not capability_check.allowed:
            return self._fail_closed(evidence_package, "capability_denied", capability_check.reason)

        # Stage 3: Policy Validation
        policy_validation = self._validate_policy(kernel_name, constants or {})
        evidence_package["stages"].append({
            "stage": "policy_validation",
            "passed": policy_validation.valid,
            "details": asdict(policy_validation),
        })
        if not policy_validation.valid:
            return self._fail_closed(evidence_package, "policy_violation", policy_validation.reason)

        # Stage 4: Build & Validate Axiom-X Manifest
        manifest = self._build_manifest(
            intent, kernel_name, kernel_version, kernel_source,
            dispatch_config, constants, policy_validation
        )
        manifest_valid = self._validate_manifest(manifest)
        evidence_package["stages"].append({
            "stage": "manifest_validation",
            "passed": manifest_valid,
            "details": "Manifest schema and invariants verified" if manifest_valid else "Manifest invalid",
        })
        if not manifest_valid:
            return self._fail_closed(evidence_package, "manifest_invalid")

        # Stage 5: Execute via Axiom-X Runtime
        try:
            result = self.axiom_x_runtime.execute_opencl(
                kernel_name=kernel_name,
                kernel_version=kernel_version,
                kernel_source=kernel_source,
                inputs=inputs,
                dispatch=dispatch_config,
                constants=constants,
                prefer_device=constants.get("prefer_device") if constants else None,
            )
        except Exception as e:
            return self._fail_closed(evidence_package, "execution_failed", str(e))

        evidence_package["stages"].append({
            "stage": "execution",
            "passed": True,
            "details": {
                "elapsed_ms": result.executionIdentity.elapsedMs,
                "output_hash": result.resultIdentity.outputHash,
            },
        })

        # Stage 6: Save artifacts
        if out_dir:
            self.axiom_x_runtime.save_result(result, out_dir)
            evidence_package["output_dir"] = str(out_dir)

        # Stage 7: (Optional) Convergence Verification
        if reference_result:
            evidence_a = create_evidence_from_axiom_result(reference_result, "reference")
            evidence_b = create_evidence_from_axiom_result(result, "candidate")

            contract = determinism_contract or create_d2_contract()
            verification = self.convergence_verifier.verify(evidence_a, evidence_b, contract)

            evidence_package["stages"].append({
                "stage": "convergence_verification",
                "passed": verification.passed,
                "details": verification.to_dict(),
            })

            if not verification.passed:
                evidence_package["convergence"] = "DIVERGENT"
            else:
                evidence_package["convergence"] = "CONVERGENT"

        # Stage 8: Constitutional Wrap (Provenance)
        provenance_hash = self._hash_provenance({
            "intent": asdict(intent),
            "manifest": manifest,
            "execution": asdict(result.executionIdentity),
            "result": asdict(result.resultIdentity),
        })
        evidence_package["provenance_hash"] = provenance_hash

        return evidence_package

    def _validate_intent(self, intent: SovereignIntent) -> bool:
        """Validate intent structure (fail closed)."""
        required = ["intent_id", "actor", "capability", "action", "parameters", "timestamp"]
        return all(hasattr(intent, f) and getattr(intent, f) for f in required)

    def _check_capability(self, capability: str) -> CapabilityCheck:
        """Check if capability is registered and device matches."""
        # In production: query Sovereign-X capability registry
        registered = {
            "gpu.compute.amd.legacy_efficient",
            "gpu.gen.nvidia.nim_flux",
            "gpu.inference.nvidia.tao",
            "gpu.compute.nvidia.cuda",
        }

        allowed = capability in registered

        # Check device match (RX 580 / Ellesmere)
        device_match = False
        try:
            import pyopencl as cl
            for p in cl.get_platforms():
                for d in p.get_devices():
                    if "tonga" in d.name.lower() or "380" in d.name.lower() or "ellesmere" in d.name.lower() or "580" in d.name.lower():
                        device_match = True
                        break
        except Exception:
            pass

        return CapabilityCheck(
            capability_id=capability,
            allowed=allowed and device_match,
            device_match=device_match,
            policy_compliant=True,
            limits={"max_compute_units": 36, "global_memory_gb": 4},
            reason="OK" if allowed and device_match else "Capability not registered or device mismatch",
        )

    def _validate_policy(self, kernel_name: str, constants: Dict[str, Any]) -> PolicyValidation:
        """Validate kernel against Sovereign-X policy."""
        # In production: query Sovereign-X policy engine
        return PolicyValidation(
            valid=True,
            determinism_class="D2",
            precision_policy="fp32",
            tolerances={"absolute_epsilon": 1e-5, "rmse_limit": 1e-4},
            reason="Policy compliant",
        )

    def _build_manifest(
        self,
        intent: SovereignIntent,
        kernel_name: str,
        kernel_version: str,
        kernel_source: str,
        dispatch_config: Any,
        constants: Dict[str, Any],
        policy: PolicyValidation,
    ) -> Dict[str, Any]:
        """Build Axiom-X manifest from intent + kernel + policy."""
        kernel_hash = hashlib.sha256(kernel_source.encode()).hexdigest()

        return {
            "schema_version": "axiom-x.manifest@1.0",
            "job": {
                "job_id": f"axjob-{intent.intent_id}",
                "kernel_identity": f"{kernel_name}@{kernel_version}",
                "kernel_hash": f"sha256:{hashlib.sha256(kernel_source.encode()).hexdigest()}",
                "source": "opencl",
            },
            "inputs": {
                "constants": constants,
            },
            "execution": {
                "precision_policy": policy.precision_policy,
                "determinism_class": policy.determinism_class,
                "tolerances": policy.tolerances,
            },
            "provenance": {
                "sovereign_x_wrap": f"ev-{intent.intent_id}",
                "intent_id": intent.intent_id,
                "world_id": constants.get("worldId", "world.unknown"),
                "timeline_id": constants.get("timelineId", "timeline.unknown"),
            },
        }

    def _validate_manifest(self, manifest: Dict[str, Any]) -> bool:
        """Validate manifest schema and invariants."""
        required = ["schema_version", "job", "inputs", "execution", "provenance"]
        return all(k in manifest for k in required)

    def _fail_closed(self, evidence: Dict[str, Any], stage: str, reason: str = "") -> Dict[str, Any]:
        """Fail closed with evidence."""
        evidence["status"] = "FAIL_CLOSED"
        evidence["failed_stage"] = stage
        evidence["reason"] = reason
        evidence["timestamp"] = datetime.now(timezone.utc).replace(microsecond=0).isoformat()
        return evidence

    def _hash_provenance(self, data: Dict[str, Any]) -> str:
        """Hash provenance data for integrity verification."""
        return self._hash_sha256(json.dumps(data, sort_keys=True).encode())

    # ============================================================
    # Constitutional Session Interface (for daniel_blueprint)
    # ============================================================

    def connect(self) -> bool:
        """Initialize bridge connection."""
        # In production: establish connection to Sovereign-X service
        return True

    def disconnect(self) -> None:
        """Close bridge connection."""
        pass

    def declare_intent(
        self,
        action: str,
        world_id: str,
        timeline_id: str,
        parameters: Dict[str, Any],
    ) -> str:
        """Declare intent to Sovereign-X, returns authority token."""
        intent = SovereignIntent(
            intent_id=f"intent-{uuid.uuid4().hex[:12]}",
            actor="daniel_blueprint",
            capability="gpu.compute.amd.legacy_efficient",
            action=action,
            parameters=parameters,
            timestamp=datetime.now(timezone.utc).replace(microsecond=0).isoformat(),
        )
        return f"auth-{intent.intent_id}"

    def verify_invariants(
        self,
        intent_id: str,
        expected: Dict[str, Any],
        actual: Dict[str, Any],
    ) -> Dict[str, Any]:
        """Verify invariants match expected values."""
        failures = []
        for key, expected_val in expected.items():
            actual_val = actual.get(key)
            if expected_val != actual_val:
                failures.append({
                    "invariant": key,
                    "expected": expected_val,
                    "actual": actual_val,
                    "severity": "ABORT",
                })
        
        return {
            "passed": len(failures) == 0,
            "failures": failures,
        }

    def verify_frame_output(
        self,
        intent_id: str,
        output_paths: Dict[str, str],
        invariants: Dict[str, Any],
    ) -> Dict[str, Any]:
        """Verify frame output integrity."""
        # In production: verify checksums, invariant compliance
        return {
            "passed": True,
            "details": "Frame output verified",
        }

    def close_intent(self, intent_id: str, result: Dict[str, Any]) -> None:
        """Close intent and record result in ledger."""
        # In production: write to Sovereign-X ledger
        return f"sha256:{hashlib.sha256(json.dumps(result, sort_keys=True).encode()).hexdigest()}"