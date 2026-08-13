"""Axiom-X Memory Tuner — integrates memory hierarchy with autotuning cache.

STATUS: **partial** — OpenCL backend; extends TuningKey with MemoryConfig.

Combines workgroup tuning + memory hierarchy tuning into unified cache key.
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
from .tuning_cache import TuningCache, TuningEvidence, CandidateResult
from .workgroup_tuner import WorkgroupTuner, BenchmarkConfig
from .memory_hierarchy import (
    MemoryConfig,
    BufferSpec,
    MemorySpace,
    AccessPattern,
    create_global_only_config,
    create_local_tiled_config,
    create_pinned_host_config,
    create_persistent_mapping_config,
)
from .memory_analyzer import analyze_kernel_memory_access, BufferAccessSummary
from .memory_benchmark import MemoryBenchmark, MemoryBenchmarkResult, select_best_memory_config
from ..benchmark.benchmark_workgroups import BenchmarkResult, run_benchmark, select_best_candidate, create_opencl_benchmark_fn


@dataclass
class MemoryTuningEvidence:
    """Complete evidence for joint workgroup + memory tuning."""
    tuning_key: TuningKey
    memory_config_hash: str
    workgroup_candidates: List[CandidateResult]
    memory_candidates: List[MemoryBenchmarkResult]
    selected_workgroup: List[int]
    selected_memory_config: MemoryConfig
    selection_policy: str  # "JOINT_MIN_TOTAL_TIME"
    timestamp: str
    runtime_fingerprint: str
    benchmark_duration_ms: float
    notes: str = ""

    def to_dict(self) -> Dict[str, Any]:
        return {
            "tuning_key": json.loads(self.tuning_key.to_json()),
            "memory_config_hash": self.memory_config_hash,
            "workgroup_candidates": [c.__dict__ for c in self.workgroup_candidates],
            "memory_candidates": [c.to_dict() for c in self.memory_candidates],
            "selected_workgroup": self.selected_workgroup,
            "selected_memory_config": self.selected_memory_config.to_hash_input(),
            "selection_policy": self.selection_policy,
            "timestamp": self.timestamp,
            "runtime_fingerprint": self.runtime_fingerprint,
            "benchmark_duration_ms": self.benchmark_duration_ms,
            "notes": self.notes,
        }


class ExtendedTuningKey(TuningKey):
    """TuningKey extended with memory configuration hash."""
    memory_config_hash: str = ""

    def cache_key(self) -> str:
        """Cache key includes memory config."""
        base = super().cache_key()
        if self.memory_config_hash:
            return f"{base}:{self.memory_config_hash[:16]}"
        return base


class MemoryTuner:
    """Joint workgroup + memory hierarchy autotuner."""

    def __init__(
        self,
        cache: Optional[TuningCache] = None,
        benchmark_config: Optional[BenchmarkConfig] = None,
        selection_policy: str = "JOINT_MIN_TOTAL_TIME",
        prefer_device: Optional[str] = None,
    ):
        self.cache = cache or TuningCache(Path("tmp/axiom-x-tuning-cache"))
        self.benchmark_config = benchmark_config or BenchmarkConfig()
        self.selection_policy = selection_policy
        self.prefer_device = prefer_device
        self.workgroup_tuner = WorkgroupTuner(
            cache=cache,
            benchmark_config=benchmark_config,
            selection_policy="MIN_MEDIAN_RUNTIME",  # Workgroup uses median runtime
            prefer_device=prefer_device,
        )
        self._cl_context: Optional[cl.Context] = None
        self._cl_queue: Optional[cl.CommandQueue] = None
        self._device: Optional[cl.Device] = None

    def _init_opencl(self) -> Tuple[cl.Context, cl.CommandQueue, cl.Device]:
        """Initialize OpenCL context."""
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
        return ctx, queue, device

    def _analyze_and_create_configs(
        self,
        kernel_source: str,
        host_data: Dict[str, np.ndarray],
        global_size: List[int],
        work_dimensions: int,
    ) -> Tuple[List[MemoryConfig], List[BufferAccessSummary]]:
        """Analyze kernel and create candidate memory configurations."""
        # Analyze access patterns
        access_summaries = analyze_kernel_memory_access(kernel_source)

        # Convert host_data to buffer specs
        buffer_specs = []
        for name, arr in host_data.items():
            summary = access_summaries.get(name)
            buffer_specs.append({
                "name": name,
                "size_bytes": arr.nbytes,
                "read_only": summary is not None and all(a.access_type.value == "read" for a in summary.accesses) if summary else False,
                "write_only": summary is not None and all(a.access_type.value == "write" for a in summary.accesses) if summary else False,
                "access_pattern": summary.inferred_pattern if summary else "unknown",
            })

        # Generate candidate memory configs
        configs = []

        # 1. Global only (always valid)
        configs.append(create_global_only_config(buffer_specs))

        # 2. Local tiled (for read-only buffers with coalesced/strided access)
        # Determine tile size from workgroup size (will be tuned later)
        # For now, use a reasonable default
        tile_size = [16, 16] if work_dimensions >= 2 else [256]
        local_config = create_local_tiled_config(buffer_specs, tile_size)
        if local_config.total_local_memory() <= self._device.local_mem_size:
            configs.append(local_config)

        # 3. Pinned host memory
        configs.append(create_pinned_host_config(buffer_specs))

        # 4. Persistent mapping
        configs.append(create_persistent_mapping_config(buffer_specs))

        return configs, list(access_summaries.values())

    def tune(
        self,
        kernel_name: str,
        kernel_version: str,
        kernel_source: str,
        kernel_build_options: str,
        global_size: List[int],
        work_dimensions: int,
        host_data: Dict[str, np.ndarray],
        kernel_args_fn: Callable[[Dict[str, cl.Buffer]], List[Any]],
        output_buf_spec: BufferSpec,
        precision: str = "fp32",
        algorithm_variant: str = "default",
    ) -> MemoryTuningEvidence:
        """Run joint workgroup + memory hierarchy tuning."""
        start_time = time.perf_counter()

        # Initialize OpenCL
        ctx, queue, device = self._init_opencl()

        # Build program
        prg = cl.Program(ctx, kernel_source).build(kernel_build_options)
        kernel = cl.Kernel(prg, kernel_name)

        # Build fingerprints (reuse WorkgroupTuner logic)
        device_fp = self.workgroup_tuner._get_device_fingerprint(device)
        kernel_fp = self.workgroup_tuner._get_kernel_fingerprint(
            kernel_name, kernel_version, kernel_source, kernel_build_options,
            precision, algorithm_variant, 0
        )
        problem_shape = ProblemShape(global_size=global_size, work_dimensions=work_dimensions)

        # Analyze and create memory configs
        memory_configs, access_summaries = self._analyze_and_create_configs(
            kernel_source, host_data, global_size, work_dimensions
        )

        print(f"  [mem-tuner] Analyzed {len(access_summaries)} buffers")
        for summary in access_summaries:
            print(f"    {summary.buffer_name}: pattern={summary.inferred_pattern}, "
                  f"coalesced={summary.is_coalesced}, local={summary.workgroup_local}")

        # Create extended tuning key
        ext_key = ExtendedTuningKey(
            backend="opencl",
            device_fingerprint=device_fp,
            kernel_fingerprint=kernel_fp,
            problem_shape=problem_shape,
        )

        best_overall: Optional[Tuple[List[int], MemoryConfig, float]] = None
        best_time = float('inf')
        all_workgroup_candidates: List[CandidateResult] = []
        all_memory_candidates: List[MemoryBenchmarkResult] = []

        # For each memory config, tune workgroup
        for mem_config in memory_configs:
            print(f"  [mem-tuner] Testing memory config: {mem_config.config_hash()}")

            # Update extended key with memory config hash
            ext_key.memory_config_hash = mem_config.config_hash()

            # Check cache
            cached = self.cache.get(ext_key)
            if cached:
                print(f"    Cache hit: {cached.selected_workgroup} + {cached.selected_memory_config.config_hash()}")
                # We'd need to deserialize the cached evidence
                # For now, continue to benchmark

            # Create buffers for this memory config
            # Note: This is simplified - real implementation would create buffers per config
            # For now, we benchmark workgroup sizes with global memory,
            # then estimate memory config impact

            # Generate workgroup candidates
            candidates = self.workgroup_tuner._generate_candidates(device, kernel, global_size, work_dimensions)
            print(f"    Workgroup candidates: {candidates}")

            # Benchmark each workgroup candidate with this memory config
            for wg in candidates:
                local_size = tuple(wg[:work_dimensions])
                global_size_tuple = tuple(global_size[:work_dimensions])

                # Create memory benchmark
                mem_bench = MemoryBenchmark(
                    ctx=ctx,
                    queue=queue,
                    device=device,
                    kernel_source=kernel_source,
                    kernel_name=kernel_name,
                    global_size=global_size_tuple,
                    benchmark_config=self.benchmark_config,
                )
                mem_bench._build_program(kernel_build_options)

                # Benchmark this memory config with this workgroup
                # We need to measure total time (transfer + kernel)
                def exec_fn(wg_size: List[int]) -> float:
                    # Re-create buffers for this config
                    # Simplified: just measure kernel time
                    for i, arg in enumerate(kernel_args_fn({})):
                        kernel.set_arg(i, arg)
                    evt = kernel.enqueue_nd_range(queue, global_size_tuple, tuple(wg_size[:work_dimensions]))
                    evt.wait()
                    return evt.profile.end - evt.profile.start

                bench_result = run_benchmark(exec_fn, wg, self.benchmark_config)
                if bench_result.success:
                    cand = CandidateResult(
                        workgroup_size=wg,
                        median_ns=bench_result.median_ns,
                        mean_ns=bench_result.mean_ns,
                        min_ns=bench_result.min_ns,
                        max_ns=bench_result.max_ns,
                        p95_ns=bench_result.p95_ns,
                        stddev_ns=bench_result.stddev_ns,
                        samples=bench_result.samples,
                        warmup_samples=bench_result.warmup_samples,
                        outlier_rejected=bench_result.outlier_rejected,
                        raw_times_ns=bench_result.raw_times_ns,
                        raw_warmup_ns=bench_result.raw_warmup_ns,
                    )
                    all_workgroup_candidates.append(cand)

                    # Create memory benchmark result
                    mem_result = MemoryBenchmarkResult(
                        config=mem_config,
                        config_hash=mem_config.config_hash(),
                        benchmark_result=bench_result,
                        transfer_time_ns=0,  # Would measure separately
                        kernel_time_ns=bench_result.median_ns,
                        total_time_ns=bench_result.median_ns,
                    )
                    all_memory_candidates.append(mem_result)

                    if bench_result.median_ns < best_time:
                        best_time = bench_result.median_ns
                        best_overall = (wg, mem_config, bench_result.median_ns)

        if best_overall is None:
            raise RuntimeError("No successful tuning candidates")

        selected_wg, selected_mem_config, _ = best_overall

        print(f"  [mem-tuner] Selected: workgroup={selected_wg}, memory={selected_mem_config.config_hash()} (total={best_time/1e6:.3f}ms)")

        # Build evidence
        evidence = MemoryTuningEvidence(
            tuning_key=ext_key,
            memory_config_hash=selected_mem_config.config_hash(),
            workgroup_candidates=all_workgroup_candidates,
            memory_candidates=all_memory_candidates,
            selected_workgroup=selected_wg,
            selected_memory_config=selected_mem_config,
            selection_policy=self.selection_policy,
            timestamp=datetime.now(timezone.utc).replace(microsecond=0).isoformat(),
            runtime_fingerprint="sha256:memtuner_v1",
            benchmark_duration_ms=(time.perf_counter() - start_time) * 1000.0,
        )

        # Cache it
        # Note: TuningCache expects TuningEvidence, we'd need to extend it
        # For now, save separately
        cache_key = ext_key.cache_key()
        cache_path = self.cache.cache_dir / cache_key[:2] / f"{cache_key}_mem.json"
        cache_path.parent.mkdir(parents=True, exist_ok=True)
        cache_path.write_text(json.dumps(evidence.to_dict(), indent=2))
        print(f"  [mem-tuner] Cached: {cache_key}")

        return evidence


def tune_memory_hierarchy(
    kernel_name: str,
    kernel_version: str,
    kernel_source: str,
    global_size: List[int],
    work_dimensions: int,
    host_data: Dict[str, np.ndarray],
    kernel_args_fn: Callable[[Dict[str, cl.Buffer]], List[Any]],
    output_buf: cl.Buffer,
    cache_dir: Optional[Path] = None,
    prefer_device: Optional[str] = None,
) -> Tuple[List[int], MemoryConfig]:
    """One-shot memory hierarchy tuning.

    Returns: (optimal_workgroup, optimal_memory_config)
    """
    cache = TuningCache(cache_dir or Path("tmp/axiom-x-tuning-cache"))
    tuner = MemoryTuner(cache=cache, prefer_device=prefer_device)

    ctx, queue, device = tuner._init_opencl()
    prg = cl.Program(ctx, kernel_source).build()
    kernel = cl.Kernel(prg, kernel_name)

    evidence = tuner.tune(
        kernel_name=kernel_name,
        kernel_version=kernel_version,
        kernel_source=kernel_source,
        kernel_build_options="",
        global_size=global_size,
        work_dimensions=work_dimensions,
        host_data=host_data,
        kernel_args_fn=kernel_args_fn,
        output_buf_spec=BufferSpec(name="output", size_bytes=output_buf.size, memory_space=MemorySpace.GLOBAL),
    )

    return evidence.selected_workgroup, evidence.selected_memory_config