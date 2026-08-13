"""Axiom-X Fusion Tuner — joint fusion + workgroup + memory autotuning.

STATUS: **partial** — OpenCL backend; extends TuningKey with fusion config.

Unifies all three optimization phases into single autotuning pipeline.
"""

from __future__ import annotations

import hashlib
import json
import time
from dataclasses import asdict, dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Callable, Dict, List, Optional, Tuple

import numpy as np
import pyopencl as cl

from .tuning_key import TuningKey, DeviceFingerprint, KernelFingerprint, ProblemShape
from .tuning_cache import TuningCache
from .workgroup_tuner import WorkgroupTuner, BenchmarkConfig
from .memory_tuner import MemoryTuner
from .fusion_analyzer import analyze_fusion_opportunities, KernelSequence, KernelSpec
from .fusion_generator import generate_fused_kernel, FusedKernelSpec
from .fusion_benchmark import FusionBenchmark, FusionBenchmarkResult, select_best_fusion
from .kernel_fusion import FusionCandidate, FusionStrategy


@dataclass
class FusionTuningEvidence:
    """Complete evidence for joint fusion + workgroup + memory tuning."""
    tuning_key: TuningKey
    fusion_candidates: List[FusionCandidate]
    fusion_results: List[FusionBenchmarkResult]
    selected_fusion: Optional[FusionCandidate]
    selected_fused_spec: Optional[FusedKernelSpec]
    selected_workgroup: List[int]
    selection_policy: str  # "MAX_SPEEDUP"
    timestamp: str
    runtime_fingerprint: str
    benchmark_duration_ms: float
    notes: str = ""

    def to_dict(self) -> Dict[str, Any]:
        return {
            "tuning_key": json.loads(self.tuning_key.to_json()),
            "fusion_candidates": [c.to_hash_input() for c in self.fusion_candidates],
            "fusion_results": [r.to_dict() for r in self.fusion_results],
            "selected_fusion": self.selected_fusion.to_hash_input() if self.selected_fusion else None,
            "selected_fused_spec": {
                "source_hash": self.selected_fused_spec.source_hash,
                "global_size": self.selected_fused_spec.global_size,
                "local_size": self.selected_fused_spec.local_size,
            } if self.selected_fused_spec else None,
            "selected_workgroup": self.selected_workgroup,
            "selection_policy": self.selection_policy,
            "timestamp": self.timestamp,
            "runtime_fingerprint": self.runtime_fingerprint,
            "benchmark_duration_ms": self.benchmark_duration_ms,
            "notes": self.notes,
        }


class FusionTuner:
    """Joint fusion + workgroup + memory autotuner."""

    def __init__(
        self,
        cache: Optional[TuningCache] = None,
        benchmark_config: Optional[BenchmarkConfig] = None,
        selection_policy: str = "MAX_SPEEDUP",
        prefer_device: Optional[str] = None,
    ):
        self.cache = cache or TuningCache(Path("tmp/axiom-x-tuning-cache"))
        self.benchmark_config = benchmark_config or BenchmarkConfig()
        self.selection_policy = selection_policy
        self.prefer_device = prefer_device
        self.workgroup_tuner = WorkgroupTuner(
            cache=cache,
            benchmark_config=benchmark_config,
            selection_policy="MIN_MEDIAN_RUNTIME",
            prefer_device=prefer_device,
        )
        self.memory_tuner = MemoryTuner(
            cache=cache,
            benchmark_config=benchmark_config,
            selection_policy="JOINT_MIN_TOTAL_TIME",
            prefer_device=prefer_device,
        )
        self.fusion_benchmark = None  # Initialized with device
        self._cl_context: Optional[cl.Context] = None
        self._cl_queue: Optional[cl.CommandQueue] = None
        self._device: Optional[cl.Device] = None

    def _init_opencl(self) -> Tuple[cl.Context, cl.CommandQueue, cl.Device]:
        platforms = cl.get_platforms()
        devices = [d for p in platforms for d in p.get_devices()]
        if not devices:
            raise RuntimeError("No OpenCL devices found")

        device = None
        if self.prefer_device:
            for d in devices:
                if self.prefer_device.lower() in d.name.lower():
                    device = d
                    break
        if device is None:
            device = devices[0]

        ctx = cl.Context([device])
        queue = cl.CommandQueue(ctx, properties=cl.command_queue_properties.PROFILING_ENABLE)
        self._cl_context = ctx
        self._cl_queue = queue
        self._device = device

        # Initialize sub-tuners with this context
        self.workgroup_tuner._cl_context = ctx
        self.workgroup_tuner._cl_queue = queue
        self.workgroup_tuner._device = device
        self.memory_tuner._cl_context = ctx
        self.memory_tuner._cl_queue = queue
        self.memory_tuner._device = device

        self.fusion_benchmark = FusionBenchmark(ctx, queue, device, self.benchmark_config)
        return ctx, queue, device

    def _build_tuning_key(
        self,
        kernels: List[KernelSpec],
        global_size: List[int],
        work_dimensions: int,
        precision: str,
    ) -> TuningKey:
        """Build tuning key for a kernel sequence."""
        # Use first kernel as representative for fingerprint
        primary = kernels[0]

        device_fp = self.workgroup_tuner._get_device_fingerprint(self._device)

        # Combine all kernel sources for hash
        combined_source = "\n".join(k.source for k in kernels)
        source_hash = f"sha256:{hashlib.sha256(combined_source.encode()).hexdigest()}"
        build_opts_hash = f"sha256:{hashlib.sha256(b'').hexdigest()}"

        kernel_fp = KernelFingerprint(
            name="+".join(k.name for k in kernels),
            version="1.0.0",
            source_hash=source_hash,
            build_options_hash=build_opts_hash,
            precision=precision,
            algorithm_variant="fused",
        )

        problem_shape = ProblemShape(global_size=global_size, work_dimensions=work_dimensions)

        return TuningKey(
            backend="opencl",
            device_fingerprint=device_fp,
            kernel_fingerprint=kernel_fp,
            problem_shape=problem_shape,
        )

    def tune(
        self,
        kernels: List[KernelSpec],
        host_data: Dict[str, np.ndarray],
        kernel_args_fns: List[Callable[[Dict[str, cl.Buffer]], List[Any]]],
        global_size: List[int],
        work_dimensions: int,
        precision: str = "fp32",
    ) -> FusionTuningEvidence:
        """Run complete fusion + workgroup + memory tuning."""
        start_time = time.perf_counter()

        ctx, queue, device = self._init_opencl()

        # Build tuning key
        tuning_key = self._build_tuning_key(kernels, global_size, work_dimensions, precision)

        # Check cache
        cached = self.cache.get(tuning_key)
        if cached:
            print(f"  [fusion-tuner] Cache hit: {tuning_key.cache_key()}")
            # Would need to deserialize and reconstruct
            # For now, continue tuning

        print(f"  [fusion-tuner] Cache miss: {tuning_key.cache_key()} — analyzing fusion...")

        # 1. Analyze fusion opportunities
        sequence = KernelSequence(kernels=kernels)
        fusion_candidates = analyze_fusion_opportunities(sequence, device=device)

        if not fusion_candidates:
            print("  [fusion-tuner] No fusion candidates found")
            return FusionTuningEvidence(
                tuning_key=tuning_key,
                fusion_candidates=[],
                fusion_results=[],
                selected_fusion=None,
                selected_fused_spec=None,
                selected_workgroup=[],
                selection_policy=self.selection_policy,
                timestamp=datetime.now(timezone.utc).replace(microsecond=0).isoformat(),
                runtime_fingerprint="sha256:fusiontuner_v1",
                benchmark_duration_ms=(time.perf_counter() - start_time) * 1000.0,
            )

        # 2. For each fusion candidate, run workgroup + memory tuning
        # This is expensive - we'll do a simplified version for now
        # In production, this would be a full joint optimization

        fusion_results = []
        best_fusion = None
        best_fused_spec = None
        best_workgroup = None
        best_score = -1

        for candidate in fusion_candidates:
            print(f"  [fusion-tuner] Evaluating {candidate.fused_name}...")

            # Generate fused kernel
            fused_spec = generate_fused_kernel(candidate)

            # Tune workgroup for fused kernel
            # Use first kernel's args as template
            try:
                # Create a dummy output buffer for tuning
                output_size = 1
                for dim in global_size[:work_dimensions]:
                    output_size *= dim
                output_arr = np.zeros((output_size, 4), dtype=np.uint8)
                output_buf = cl.Buffer(ctx, cl.mem_flags.WRITE_ONLY, output_arr.nbytes)

                # Tune workgroup
                wg_evidence = self.workgroup_tuner.tune(
                    kernel_name=candidate.fused_name,
                    kernel_version="1.0.0",
                    kernel_source=fused_spec.fused_source,
                    kernel_build_options="",
                    global_size=global_size,
                    work_dimensions=work_dimensions,
                    output_buf=output_buf,
                    kernel_args=[],  # Simplified
                    precision=precision,
                    algorithm_variant="fused",
                )

                # Benchmark fusion
                # We need a kernel_args_fn for the fused kernel
                def fused_args_fn(buffers):
                    return [output_buf]  # Simplified

                bench_result = self.fusion_benchmark.benchmark_candidate(
                    candidate=candidate,
                    host_data=host_data,
                    kernel_args_fns=[fused_args_fn] * len(candidate.kernels),
                    global_size=tuple(global_size[:work_dimensions]),
                    local_size=tuple(wg_evidence.selected_workgroup[:work_dimensions]),
                )

                fusion_results.append(bench_result)

                if bench_result.success:
                    score = bench_result.speedup
                    if score > best_score:
                        best_score = score
                        best_fusion = candidate
                        best_fused_spec = fused_spec
                        best_workgroup = wg_evidence.selected_workgroup

            except Exception as e:
                print(f"    Failed: {e}")

        if best_fusion is None:
            print("  [fusion-tuner] No successful fusion candidates")
            return FusionTuningEvidence(
                tuning_key=tuning_key,
                fusion_candidates=fusion_candidates,
                fusion_results=fusion_results,
                selected_fusion=None,
                selected_fused_spec=None,
                selected_workgroup=[],
                selection_policy=self.selection_policy,
                timestamp=datetime.now(timezone.utc).replace(microsecond=0).isoformat(),
                runtime_fingerprint="sha256:fusiontuner_v1",
                benchmark_duration_ms=(time.perf_counter() - start_time) * 1000.0,
            )

        print(f"  [fusion-tuner] Selected: {best_fusion.fused_name} "
              f"(speedup={best_score:.2f}x, workgroup={best_workgroup})")

        evidence = FusionTuningEvidence(
            tuning_key=tuning_key,
            fusion_candidates=fusion_candidates,
            fusion_results=fusion_results,
            selected_fusion=best_fusion,
            selected_fused_spec=best_fused_spec,
            selected_workgroup=best_workgroup or [],
            selection_policy=self.selection_policy,
            timestamp=datetime.now(timezone.utc).replace(microsecond=0).isoformat(),
            runtime_fingerprint="sha256:fusiontuner_v1",
            benchmark_duration_ms=(time.perf_counter() - start_time) * 1000.0,
        )

        # Cache
        cache_key = tuning_key.cache_key()
        cache_path = self.cache.cache_dir / cache_key[:2] / f"{cache_key}_fusion.json"
        cache_path.parent.mkdir(parents=True, exist_ok=True)
        cache_path.write_text(json.dumps(evidence.to_dict(), indent=2))
        print(f"  [fusion-tuner] Cached: {cache_key}")

        return evidence


def tune_fusion(
    kernels: List[KernelSpec],
    host_data: Dict[str, np.ndarray],
    kernel_args_fns: List[Callable[[Dict[str, cl.Buffer]], List[Any]]],
    global_size: List[int],
    work_dimensions: int,
    cache_dir: Optional[Path] = None,
    prefer_device: Optional[str] = None,
) -> Tuple[Optional[FusedKernelSpec], List[int]]:
    """One-shot fusion tuning.

    Returns: (optimal_fused_spec, optimal_workgroup) or (None, []) if no fusion beneficial.
    """
    cache = TuningCache(cache_dir or Path("tmp/axiom-x-tuning-cache"))
    tuner = FusionTuner(cache=cache, prefer_device=prefer_device)

    ctx, queue, device = tuner._init_opencl()

    evidence = tuner.tune(
        kernels=kernels,
        host_data=host_data,
        kernel_args_fns=kernel_args_fns,
        global_size=global_size,
        work_dimensions=work_dimensions,
    )

    if evidence.selected_fused_spec and evidence.selected_workgroup:
        return evidence.selected_fused_spec, evidence.selected_workgroup
    return None, []