"""Axiom-X Workgroup Tuner — query→benchmark→select→cache loop.

STATUS: **partial** — OpenCL backend operational; CUDA/HIP/Vulkan/Metal declared.

Implements the full autotuning pipeline:
  1. Query device/kernel limits
  2. Generate legal workgroup candidates
  3. Benchmark each candidate (warmup → measure → statistics)
  4. Select best variant via robust policy
  5. Cache result with full evidence
"""

from __future__ import annotations

import hashlib
import time
from dataclasses import asdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Callable, Dict, List, Optional, Tuple, Union

import numpy as np
import pyopencl as cl

from .tuning_key import TuningKey, DeviceFingerprint, KernelFingerprint, ProblemShape
from .tuning_cache import TuningCache, TuningEvidence, CandidateResult, compute_runtime_fingerprint
from ..benchmark.benchmark_workgroups import (
    BenchmarkConfig,
    BenchmarkResult,
    run_benchmark,
    select_best_candidate,
    create_opencl_benchmark_fn,
)


class WorkgroupTuner:
    """Workgroup autotuner for GPU kernels."""

    def __init__(
        self,
        cache: Optional[TuningCache] = None,
        benchmark_config: Optional[BenchmarkConfig] = None,
        selection_policy: str = "MIN_MEDIAN_RUNTIME",
        prefer_device: Optional[str] = None,
    ):
        self.cache = cache or TuningCache(Path("tmp/axiom-x-tuning-cache"))
        self.benchmark_config = benchmark_config or BenchmarkConfig()
        self.selection_policy = selection_policy
        self.prefer_device = prefer_device
        self._cl_context: Optional[cl.Context] = None
        self._cl_queue: Optional[cl.CommandQueue] = None
        self._device: Optional[cl.Device] = None
        self._kernel: Optional[cl.Kernel] = None
        self._kernel_source: str = ""
        self._kernel_name: str = ""
        self._kernel_build_options: str = ""

    def _init_opencl(self) -> Tuple[cl.Context, cl.CommandQueue, cl.Device]:
        """Initialize OpenCL context and device."""
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

    def _get_device_fingerprint(self, device: cl.Device) -> DeviceFingerprint:
        """Extract device fingerprint for cache key."""
        # Query device limits
        max_wg_size = device.max_work_group_size
        max_work_item_sizes = list(device.max_work_item_sizes)
        max_local_mem = device.local_mem_size

        return DeviceFingerprint(
            vendor=device.vendor,
            name=device.name,
            architecture=getattr(device, "board_name_amd", None) or device.name,
            compute_units=device.max_compute_units,
            global_memory_bytes=device.global_mem_size,
            driver_version=device.version,
            max_work_group_size=max_wg_size,
            max_work_item_sizes=max_work_item_sizes,
            max_local_mem_size=max_local_mem,
        )

    def _get_kernel_fingerprint(
        self,
        kernel_name: str,
        kernel_version: str,
        kernel_source: str,
        build_options: str,
        precision: str,
        algorithm_variant: str,
        local_mem_usage: int = 0,
    ) -> KernelFingerprint:
        """Extract kernel fingerprint for cache key."""
        source_hash = f"sha256:{hashlib.sha256(kernel_source.encode('utf-8')).hexdigest()}"
        build_opts_hash = f"sha256:{hashlib.sha256(build_options.encode('utf-8')).hexdigest()}"

        return KernelFingerprint(
            name=kernel_name,
            version=kernel_version,
            source_hash=source_hash,
            build_options_hash=build_opts_hash,
            precision=precision,
            algorithm_variant=algorithm_variant,
            local_mem_usage_bytes=local_mem_usage,
        )

    def _generate_candidates(
        self,
        device: cl.Device,
        kernel: cl.Kernel,
        global_size: List[int],
        work_dimensions: int,
    ) -> List[List[int]]:
        """Generate legal workgroup size candidates.

        Constraints:
        - CL_KERNEL_WORK_GROUP_SIZE (kernel-specific max)
        - CL_DEVICE_MAX_WORK_GROUP_SIZE (device max)
        - CL_DEVICE_MAX_WORK_ITEM_SIZES (per-dimension max)
        - CL_KERNEL_LOCAL_MEM_SIZE (local memory usage)
        - Global size must be divisible by local size (for simplicity)
        """
        # Query kernel limits
        kernel_max_wg = kernel.get_work_group_info(
            cl.kernel_work_group_info.WORK_GROUP_SIZE, device
        )
        kernel_local_mem = kernel.get_work_group_info(
            cl.kernel_work_group_info.LOCAL_MEM_SIZE, device
        )

        device_max_wg = device.max_work_group_size
        device_max_work_item_sizes = list(device.max_work_item_sizes)

        # Effective limits
        max_wg = min(kernel_max_wg, device_max_wg)
        max_per_dim = device_max_work_item_sizes[:work_dimensions]

        # Generate candidate workgroup sizes
        candidates = []

        # 1D candidates (powers of 2)
        for wg in [32, 64, 128, 256, 512, 1024]:
            if wg <= max_wg and (work_dimensions == 1 or wg <= max_per_dim[0]):
                if global_size[0] % wg == 0:
                    candidates.append([wg])

        # 2D candidates (square-ish)
        if work_dimensions >= 2:
            for wg_x in [8, 16, 32, 64]:
                for wg_y in [8, 16, 32, 64]:
                    total = wg_x * wg_y
                    if total <= max_wg and wg_x <= max_per_dim[0] and wg_y <= max_per_dim[1]:
                        if global_size[0] % wg_x == 0 and global_size[1] % wg_y == 0:
                            candidates.append([wg_x, wg_y])

        # 3D candidates
        if work_dimensions >= 3:
            for wg_x in [4, 8, 16]:
                for wg_y in [4, 8, 16]:
                    for wg_z in [4, 8]:
                        total = wg_x * wg_y * wg_z
                        if total <= max_wg and wg_x <= max_per_dim[0] and wg_y <= max_per_dim[1] and wg_z <= max_per_dim[2]:
                            if (global_size[0] % wg_x == 0 and
                                global_size[1] % wg_y == 0 and
                                global_size[2] % wg_z == 0):
                                candidates.append([wg_x, wg_y, wg_z])

        # Deduplicate
        seen = set()
        unique = []
        for c in candidates:
            key = tuple(c)
            if key not in seen:
                seen.add(key)
                unique.append(c)

        # Sort by total workgroup size (smaller first for faster warmup)
        unique.sort(key=lambda c: np.prod(c))

        return unique

    def tune(
        self,
        kernel_name: str,
        kernel_version: str,
        kernel_source: str,
        kernel_build_options: str,
        global_size: List[int],
        work_dimensions: int,
        output_buf: cl.Buffer,
        kernel_args: List[Any],
        precision: str = "fp32",
        algorithm_variant: str = "default",
        local_mem_usage: int = 0,
        local_size_arg_index: int = -1,
    ) -> TuningEvidence:
        """Run the full tuning pipeline.

        Returns:
            TuningEvidence with selected workgroup and full benchmark data.
        """
        start_time = time.perf_counter()

        # Initialize OpenCL
        ctx, queue, device = self._init_opencl()

        # Build program
        prg = cl.Program(ctx, kernel_source).build(kernel_build_options)
        kernel = cl.Kernel(prg, kernel_name)

        self._kernel = kernel
        self._kernel_source = kernel_source
        self._kernel_name = kernel_name
        self._kernel_build_options = kernel_build_options

        # Build fingerprints
        device_fp = self._get_device_fingerprint(device)
        kernel_fp = self._get_kernel_fingerprint(
            kernel_name, kernel_version, kernel_source, kernel_build_options,
            precision, algorithm_variant, local_mem_usage
        )
        problem_shape = ProblemShape(global_size=global_size, work_dimensions=work_dimensions)

        tuning_key = TuningKey(
            backend="opencl",
            device_fingerprint=device_fp,
            kernel_fingerprint=kernel_fp,
            problem_shape=problem_shape,
        )

        # Check cache
        cached = self.cache.get(tuning_key)
        if cached:
            # Verify the cached entry is still valid (same kernel, same device)
            cached_key = cached.tuning_key.cache_key()
            current_key = tuning_key.cache_key()
            if cached_key == current_key:
                print(f"  [tuner] Cache hit: {cached_key} -> workgroup={cached.selected_workgroup}")
                return cached

        print(f"  [tuner] Cache miss: {tuning_key.cache_key()} — benchmarking...")

        # Generate candidates
        candidates = self._generate_candidates(device, kernel, global_size, work_dimensions)
        print(f"  [tuner] Generated {len(candidates)} legal candidates: {candidates}")

        if not candidates:
            raise RuntimeError("No legal workgroup candidates found")

        # Create benchmark function
        bench_fn = create_opencl_benchmark_fn(
            kernel=kernel,
            queue=queue,
            global_size=tuple(global_size),
            output_buf=output_buf,
            kernel_args=kernel_args,
            local_size_arg_index=local_size_arg_index,
        )

        # Benchmark each candidate
        results: List[BenchmarkResult] = []
        for wg in candidates:
            print(f"  [tuner] Benchmarking workgroup={wg}...")
            result = run_benchmark(bench_fn, wg, self.benchmark_config)
            if result.success:
                print(f"    median={result.median_ns/1e6:.3f}ms  mean={result.mean_ns/1e6:.3f}ms  "
                      f"p95={result.p95_ns/1e6:.3f}ms  samples={result.samples}  outliers={result.outlier_rejected}")
            else:
                print(f"    FAILED: {result.error}")
            results.append(result)

        # Select best
        best = select_best_candidate(results, self.selection_policy)
        if best is None:
            raise RuntimeError("All candidates failed benchmarking")

        print(f"  [tuner] Selected workgroup={best.workgroup_size} "
              f"(policy={self.selection_policy}, median={best.median_ns/1e6:.3f}ms)")

        # Build evidence
        candidate_results = [
            CandidateResult(
                workgroup_size=r.workgroup_size,
                median_ns=r.median_ns,
                mean_ns=r.mean_ns,
                min_ns=r.min_ns,
                max_ns=r.max_ns,
                p95_ns=r.p95_ns,
                stddev_ns=r.stddev_ns,
                samples=r.samples,
                warmup_samples=r.warmup_samples,
                outlier_rejected=r.outlier_rejected,
                raw_times_ns=r.raw_times_ns,
                raw_warmup_ns=r.raw_warmup_ns,
            )
            for r in results if r.success
        ]

        evidence = TuningEvidence(
            tuning_key=tuning_key,
            candidates=candidate_results,
            selected_workgroup=best.workgroup_size,
            selection_policy=self.selection_policy,
            timestamp=datetime.now(timezone.utc).replace(microsecond=0).isoformat(),
            runtime_fingerprint=compute_runtime_fingerprint(),
            benchmark_duration_ms=(time.perf_counter() - start_time) * 1000.0,
        )

        # Cache it
        self.cache.put(evidence)
        print(f"  [tuner] Cached evidence: {evidence.tuning_key.cache_key()}")

        return evidence

    def get_optimal_workgroup(self, evidence: TuningEvidence) -> List[int]:
        """Extract optimal workgroup from tuning evidence."""
        return evidence.selected_workgroup


# Convenience function for simple tuning
def tune_workgroup(
    kernel_name: str,
    kernel_version: str,
    kernel_source: str,
    global_size: List[int],
    work_dimensions: int,
    output_buf: cl.Buffer,
    kernel_args: List[Any],
    cache_dir: Optional[Path] = None,
    prefer_device: Optional[str] = None,
    benchmark_config: Optional[BenchmarkConfig] = None,
    selection_policy: str = "MIN_MEDIAN_RUNTIME",
) -> List[int]:
    """One-shot workgroup tuning.

    Returns optimal workgroup size.
    """
    cache = TuningCache(cache_dir or Path("tmp/axiom-x-tuning-cache"))
    tuner = WorkgroupTuner(
        cache=cache,
        benchmark_config=benchmark_config,
        selection_policy=selection_policy,
        prefer_device=prefer_device,
    )

    # For simple tuning, we need to init OpenCL first to get a context/queue
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
        output_buf=output_buf,
        kernel_args=kernel_args,
        local_size_arg_index=-1,
    )

    return evidence.selected_workgroup