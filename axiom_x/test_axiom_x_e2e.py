#!/usr/bin/env python3
"""
Axiom-X End-to-End Test — Constitutional Pipeline

Runs: Sovereign-X intent → Axiom-X OpenCL execution → CPU reference → Convergence verifier → Evidence package

Usage:
  python test_axiom_x_e2e.py --out-dir tmp/axiom-x-e2e --kernel legacy_still --width 256 --height 256
"""

import sys
from pathlib import Path

# Add project root to path (parent of axiom_x package) — MUST BE FIRST
PROJECT_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(PROJECT_ROOT))

import argparse
from dataclasses import asdict
import hashlib
import json
import os
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional

import numpy as np

# Import scripts module after path insertion
from scripts.legacy_efficient.opencl_tonga_still import KERNEL as LEGACY_KERNEL_SOURCE

from axiom_x.runtime.axiom_x_runtime import (
    AxiomXRuntime,
    run_legacy_efficient,
    DispatchConfig,
)
from axiom_x.reference.cpu_reference import run_cpu_reference, CPUReferenceExecutor
from axiom_x.verifier.convergence_verifier import (
    ConvergenceVerifier,
    DeterminismContract,
    create_evidence_from_axiom_result,
    create_d2_contract,
    ExecutionEvidence,
)
from axiom_x.bridge.sovereign_x_bridge import (
    SovereignXBridge,
    SovereignIntent,
)


def run_with_retry(fn, max_retries=3, backoff=2.0, *args, **kwargs):
    """Execute function with exponential backoff retry."""
    last_err = None
    for attempt in range(1, max_retries + 1):
        try:
            return fn(*args, **kwargs)
        except Exception as e:
            last_err = e
            if attempt < max_retries:
                wait = backoff * (2 ** (attempt - 1))
                print(f"  Attempt {attempt} failed: {e}; retrying in {wait}s...")
                time.sleep(wait)
            else:
                print(f"  All {max_retries} attempts failed")
                raise last_err


def run_stage(name: str, fn, *args, **kwargs):
    """Run a pipeline stage with retry and logging."""
    print(f"\n[{name}]")
    try:
        result = run_with_retry(fn)
        print(f"  {name}: PASS")
        return result
    except Exception as e:
        print(f"  {name}: FAIL — {e}")
        raise


def main():
    ap = argparse.ArgumentParser(description="Axiom-X E2E Constitutional Pipeline Test")
    ap.add_argument("--out-dir", type=Path, default=Path("tmp/axiom-x-e2e"))
    ap.add_argument("--kernel", default="legacy_still", choices=["legacy_still"])
    ap.add_argument("--width", type=int, default=256)
    ap.add_argument("--height", type=int, default=256)
    ap.add_argument("--seed", type=float, default=1.0)
    ap.add_argument("--intent-id", default=None)
    ap.add_argument("--capability", default="gpu.compute.amd.legacy_efficient")
    ap.add_argument("--determinism-class", default="D2", choices=["D1", "D2", "D3"])
    args = ap.parse_args()

    out_dir = args.out_dir
    out_dir.mkdir(parents=True, exist_ok=True)

    print(f"[{datetime.now(timezone.utc).isoformat()}] Axiom-X E2E Test")
    print(f"  Kernel: {args.kernel}")
    print(f"  Resolution: {args.width}x{args.height}")
    print(f"  Out dir: {out_dir}")
    print(f"  Determinism: {args.determinism_class}")

    # Load kernel source
    if args.kernel == "legacy_still":
        KERNEL_SOURCE = LEGACY_KERNEL_SOURCE
        KERNEL_NAME = "legacy_still"
        KERNEL_VERSION = "1.0.0"
    else:
        raise ValueError(f"Unknown kernel: {args.kernel}")

    intent_id = args.intent_id or f"intent.{args.kernel}.{int(time.time())}"

    # ============================================================
    # STAGE 1: Sovereign-X Intent
    # ============================================================
    print("\n[1/6] Sovereign-X Intent Declaration")
    intent = SovereignIntent(
        intent_id=intent_id,
        actor="test-harness",
        capability=args.capability,
        action="execute_kernel",
        parameters={
            "kernel": args.kernel,
            "width": args.width,
            "height": args.height,
            "seed": args.seed,
        },
        timestamp=datetime.now(timezone.utc).replace(microsecond=0).isoformat(),
    )
    print(f"  Intent ID: {intent.intent_id}")

    # ============================================================
    # STAGE 2: Axiom-X GPU Execution (via Sovereign-X Bridge)
    # ============================================================
    print("\n[2/6] Axiom-X GPU Execution (RX 580 via OpenCL)")
    runtime = AxiomXRuntime()
    bridge = SovereignXBridge()

    dispatch = DispatchConfig(
        globalSize=[args.width, args.height],
        localSize=[16, 16],
        workDimensions=2,
    )

    constants = {
        "seed": args.seed,
        "intentId": intent.intent_id,
        "worldId": "world.test",
        "timelineId": "timeline.test",
    }

    try:
        gpu_result = run_legacy_efficient(
            width=args.width,
            height=args.height,
            seed=args.seed,
            out_dir=out_dir / "gpu",
        )
        print(f"  GPU execution: {gpu_result.executionIdentity.elapsedMs:.2f}ms")
        print(f"  Output hash: {gpu_result.resultIdentity.outputHash}")
    except Exception as e:
        print(f"  GPU execution FAILED: {e}")
        return 1

    # ============================================================
    # STAGE 3: CPU Reference Execution
    # ============================================================
    print("\n[3/6] CPU Reference Execution")
    cpu_result = run_cpu_reference(
        kernel_name=args.kernel,
        width=args.width,
        height=args.height,
        seed=args.seed,
        out_dir=out_dir / "cpu",
    )
    print(f"  CPU execution: {cpu_result.elapsed_ms:.2f}ms")
    print(f"  Output hash: {cpu_result.output_hash}")

    # ============================================================
    # STAGE 4: Convergence Verification
    # ============================================================
    print("\n[4/6] Convergence Verification")

    # Create evidence from both executions
    gpu_evidence = create_evidence_from_axiom_result(gpu_result, "gpu-rx580", gpu_result.rawOutput)
    cpu_evidence = ExecutionEvidence(
        execution_id="cpu-reference",
        job_identity=asdict(gpu_result.jobIdentity),
        backend="cpu",
        device={'name': 'CPU Reference', 'vendor': 'AMD', 'computeUnits': 16, 'globalMemoryBytes': 0, 'driverVersion': 'python'},
        output_hash=cpu_result.output_hash,
        pixel_hash=cpu_result.pixel_hash,
        numerical_summary=cpu_result.numerical_summary,
        provenance={'intentId': intent.intent_id, 'worldId': 'world.test', 'timelineId': 'timeline.test', 'kernelHash': 'test', 'constitutional': False},
        raw_output=cpu_result.output,
    )

    # Determinism contract
    if args.determinism_class == "D1":
        contract = DeterminismContract(class_name="D1")
    elif args.determinism_class == "D2":
        contract = create_d2_contract()
    elif args.determinism_class == "D3":
        contract = DeterminismContract(class_name="D3", absolute_epsilon=1e-4, rmse_limit=1e-3)
    else:
        contract = create_d2_contract()

    verifier = ConvergenceVerifier()
    verification = verifier.verify(gpu_evidence, cpu_evidence, contract)

    print(f"  Determinism class: {contract.class_name.value}")
    print(f"  Hash match: {verification.metrics.hash_match}")
    print(f"  Max abs error: {verification.metrics.max_absolute_error:.6f}")
    print(f"  RMSE: {verification.metrics.rmse:.6f}")
    print(f"  Result: {'PASS' if verification.passed else 'FAIL'}")
    if not verification.passed:
        print(f"  Failures: {verification.failure_reasons}")

    # ============================================================
    # STAGE 5: Sovereign-X Bridge (Full Pipeline)
    # ============================================================
    print("\n[5/6] Sovereign-X Bridge Pipeline")
    bridge = SovereignXBridge()

    sx_intent = SovereignIntent(
        intent_id=intent_id,
        actor="test-harness",
        capability=args.capability,
        action="execute_kernel",
        parameters={
            "kernel": args.kernel,
            "width": args.width,
            "height": args.height,
            "seed": args.seed,
        },
        timestamp=datetime.now(timezone.utc).replace(microsecond=0).isoformat(),
    )

    # Mock CPU result for bridge
    class MockCPUResult:
        pass

    mock_cpu = MockCPUResult()
    mock_cpu.jobIdentity = gpu_result.jobIdentity
    mock_cpu.executionIdentity = gpu_result.executionIdentity
    mock_cpu.resultIdentity = gpu_result.resultIdentity
    mock_cpu.rawOutput = gpu_result.rawOutput

    full_evidence = bridge.authorize_and_execute(
        intent=sx_intent,
        kernel_name=KERNEL_NAME,
        kernel_version=KERNEL_VERSION,
        kernel_source=KERNEL_SOURCE,
        inputs=[],
        dispatch_config=DispatchConfig(
            globalSize=[args.width, args.height],
            localSize=[16, 16],
            workDimensions=2,
        ),
        constants=constants,
        determinism_contract=contract,
        reference_result=mock_cpu,
        out_dir=out_dir / "bridge",
    )

    print(f"  Bridge status: {full_evidence.get('status', 'OK')}")
    for stage in full_evidence.get('stages', []):
        status = "PASS" if stage['passed'] else "FAIL"
        print(f"    {status} {stage['stage']}")

    # ============================================================
    # STAGE 6: Evidence Package Output
    # ============================================================
    print("\n[6/6] Evidence Package")

    evidence_package = {
        "pipeline": "axiom-x-e2e",
        "version": "1.0.0",
        "timestamp": datetime.now(timezone.utc).replace(microsecond=0).isoformat(),
        "kernel": {
            "name": args.kernel,
            "version": KERNEL_VERSION,
            "hash": f"sha256:{hashlib.sha256(KERNEL_SOURCE.encode()).hexdigest()}",
        },
        "gpu": {
            "backend": "opencl",
            "device": "RX 580 (Ellesmere)",
            "elapsed_ms": gpu_result.executionIdentity.elapsedMs,
            "output_hash": gpu_result.resultIdentity.outputHash,
            "numerical_summary": asdict(gpu_result.resultIdentity.numericalSummary) if hasattr(gpu_result.resultIdentity.numericalSummary, '__dataclass_fields__') else gpu_result.resultIdentity.numericalSummary,
        },
        "cpu": {
            "backend": "cpu-reference",
            "device": "CPU (Python/NumPy)",
            "elapsed_ms": cpu_result.elapsed_ms,
            "output_hash": cpu_result.output_hash,
            "numerical_summary": asdict(cpu_result.numerical_summary) if hasattr(cpu_result.numerical_summary, '__dataclass_fields__') else cpu_result.numerical_summary,
        },
        "verification": verification.to_dict(),
        "bridge": full_evidence,
        "provenance": {
            "intent_id": intent.intent_id,
            "kernel_hash": f"sha256:{hashlib.sha256(KERNEL_SOURCE.encode()).hexdigest()}",
            "determinism_class": args.determinism_class,
        },
    }

    evidence_path = out_dir / "evidence.json"
    evidence_path.write_text(json.dumps(evidence_package, indent=2))
    print(f"  Evidence written: {evidence_path}")

    # Final summary
    print("\n" + "="*60)
    print("AXIOM-X E2E TEST COMPLETE")
    print("="*60)
    print(f"GPU Output:  {gpu_result.resultIdentity.outputHash}")
    print(f"CPU Output:  {cpu_result.output_hash}")
    print(f"Hash Match:  {verification.metrics.hash_match}")
    print(f"Max Error:   {verification.metrics.max_absolute_error:.6f}")
    print(f"RMSE:        {verification.metrics.rmse:.6f}")
    print(f"Verification: {'CONVERGENT' if verification.passed else 'DIVERGENT'}")
    print(f"Evidence:    {evidence_path}")

    return 0 if verification.passed else 1


if __name__ == "__main__":
    sys.exit(main())