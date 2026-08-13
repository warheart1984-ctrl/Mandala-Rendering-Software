"""Axiom-X Fused Kernel Benchmark — benchmarks fused vs separate kernels.

STATUS: **partial** — OpenCL backend implemented.

Compares execution time of:
  - Separate kernels (baseline)
  - Fused kernel (horizontal/vertical/tile-based)
"""

from __future__ import annotations

import time
from dataclasses import dataclass, asdict
from pathlib import Path
from typing import Any, Callable, Dict, List, Optional, Tuple

import numpy as np
import pyopencl as cl

from .kernel_fusion import (
    KernelSpec,
    KernelArg,
    FusionCandidate,
    FusionStrategy,
    FusedKernelSpec,
)
from .fusion_analyzer import analyze_fusion_opportunities, KernelSequence
from .fusion_generator import generate_fused_kernel
from ..benchmark.benchmark_workgroups import BenchmarkConfig, BenchmarkResult, run_benchmark, select_best_candidate
from .workgroup_tuner import WorkgroupTuner


@dataclass
class FusionBenchmarkResult:
    """Result of comparing fused vs separate kernels."""
    candidate: FusionCandidate
    fused_spec: FusedKernelSpec
    separate_times_ns: List[float]       # Time for each separate kernel (ns)
    separate_total_ns: float              # Sum of separate kernel times
    fused_time_ns: float                  # Fused kernel time
    speedup: float                        # separate_total / fused_time
    launch_overhead_saved_ns: float       # Estimated launch overhead saved
    workgroup_size: List[int]
    success: bool
    error: Optional[str] = None

    def to_dict(self) -> Dict[str, Any]:
        d = asdict(self)
        d["candidate"] = self.candidate.to_hash_input()
        d["fused_spec"] = {
            "source_hash": self.fused_spec.source_hash,
            "global_size": self.fused_spec.global_size,
            "local_size": self.fused_spec.local_size,
            "local_mem_bytes": self.fused_spec.local_mem_bytes,
        }
        return d


class FusionBenchmark:
    """Benchmark fused kernels against separate execution."""

    def __init__(
        self,
        ctx: cl.Context,
        queue: cl.CommandQueue,
        device: cl.Device,
        benchmark_config: BenchmarkConfig,
    ):
        self.ctx = ctx
        self.queue = queue
        self.device = device
        self.benchmark_config = benchmark_config

    def _build_program(self, source: str, build_options: str = "") -> cl.Program:
        return cl.Program(self.ctx, source).build(build_options)

    def _create_kernel(self, prg: cl.Program, name: str) -> cl.Kernel:
        return cl.Kernel(prg, name)

    def _measure_kernel_time(
        self,
        kernel: cl.Kernel,
        global_size: Tuple[int, ...],
        local_size: Tuple[int, ...],
        args: List[Any],
    ) -> float:
        """Measure single kernel execution time."""
        for i, arg in enumerate(args):
            kernel.set_arg(i, arg)
        evt = kernel.enqueue_nd_range(self.queue, global_size, local_size)
        evt.wait()
        return evt.profile.end - evt.profile.start

    def benchmark_separate_kernels(
        self,
        kernels: List[KernelSpec],
        host_data: Dict[str, np.ndarray],
        kernel_args_fns: List[Callable[[Dict[str, cl.Buffer]], List[Any]]],
        global_size: Tuple[int, ...],
        local_size: Tuple[int, ...],
    ) -> List[float]:
        """Benchmark each kernel separately."""
        times = []

        for i, kernel_spec in enumerate(kernels):
            prg = self._build_program(kernel_spec.source)
            kernel = self._create_kernel(prg, kernel_spec.name)

            # Create buffers for this kernel
            buffers = {}
            for name, arr in host_data.items():
                if name not in buffers:
                    buf = cl.Buffer(self.ctx, cl.mem_flags.READ_WRITE | cl.mem_flags.COPY_HOST_PTR, hostbuf=arr)
                    buffers[name] = buf

            # Get kernel args
            args = kernel_args_fns[i](buffers)

            # Warmup
            for _ in range(self.benchmark_config.warmup_iterations):
                self._measure_kernel_time(kernel, global_size, local_size, args)

            # Measure
            kernel_times = []
            for _ in range(self.benchmark_config.measure_iterations):
                t = self._measure_kernel_time(kernel, global_size, local_size, args)
                kernel_times.append(t)

            median_time = float(np.median(kernel_times))
            times.append(median_time)

        return times

    def benchmark_fused_kernel(
        self,
        fused_spec: FusedKernelSpec,
        host_data: Dict[str, np.ndarray],
        kernel_args_fn: Callable[[Dict[str, cl.Buffer]], List[Any]],
        global_size: Tuple[int, ...],
        local_size: Tuple[int, ...],
    ) -> float:
        """Benchmark fused kernel."""
        prg = self._build_program(fused_spec.fused_source)
        kernel = self._create_kernel(prg, fused_spec.candidate.fused_name)

        # Create buffers
        buffers = {}
        for name, arr in host_data.items():
            if name not in buffers:
                buf = cl.Buffer(self.ctx, cl.mem_flags.READ_WRITE | cl.mem_flags.COPY_HOST_PTR, hostbuf=arr)
                buffers[name] = buf

        # Get kernel args
        args = kernel_args_fn(buffers)

        # Warmup
        for _ in range(self.benchmark_config.warmup_iterations):
            self._measure_kernel_time(kernel, global_size, local_size, args)

        # Measure
        kernel_times = []
        for _ in range(self.benchmark_config.measure_iterations):
            t = self._measure_kernel_time(kernel, global_size, local_size, args)
            kernel_times.append(t)

        return float(np.median(kernel_times))

    def benchmark_candidate(
        self,
        candidate: FusionCandidate,
        host_data: Dict[str, np.ndarray],
        kernel_args_fns: List[Callable[[Dict[str, cl.Buffer]], List[Any]]],
        global_size: Tuple[int, ...],
        local_size: Tuple[int, ...],
    ) -> FusionBenchmarkResult:
        """Benchmark a fusion candidate."""
        try:
            # Generate fused kernel
            fused_spec = generate_fused_kernel(candidate)

            # Benchmark separate kernels
            separate_times = self.benchmark_separate_kernels(
                candidate.kernels,
                host_data,
                kernel_args_fns,
                global_size,
                local_size,
            )
            separate_total = sum(separate_times)

            # Benchmark fused kernel
            fused_time = self.benchmark_fused_kernel(
                fused_spec,
                host_data,
                kernel_args_fns[0],  # Use first kernel's arg fn for fused
                global_size,
                local_size,
            )

            speedup = separate_total / fused_time if fused_time > 0 else 0.0
            # Estimate launch overhead: ~5-20 microseconds per kernel launch
            launch_overhead = (len(candidate.kernels) - 1) * 10000  # 10us estimate

            return FusionBenchmarkResult(
                candidate=candidate,
                fused_spec=fused_spec,
                separate_times_ns=separate_times,
                separate_total_ns=separate_total,
                fused_time_ns=fused_time,
                speedup=speedup,
                launch_overhead_saved_ns=launch_overhead,
                workgroup_size=list(local_size),
                success=True,
            )

        except Exception as e:
            return FusionBenchmarkResult(
                candidate=candidate,
                fused_spec=None,
                separate_times_ns=[],
                separate_total_ns=0,
                fused_time_ns=0,
                speedup=0,
                launch_overhead_saved_ns=0,
                workgroup_size=list(local_size),
                success=False,
                error=str(e),
            )

    def benchmark_all_candidates(
        self,
        candidates: List[FusionCandidate],
        host_data: Dict[str, np.ndarray],
        kernel_args_fns: List[Callable[[Dict[str, cl.Buffer]], List[Any]]],
        global_size: Tuple[int, ...],
        local_size: Tuple[int, ...],
    ) -> List[FusionBenchmarkResult]:
        """Benchmark all fusion candidates."""
        results = []
        for candidate in candidates:
            print(f"  [fusion-bench] Testing {candidate.fused_name} ({candidate.strategy.value})...")
            result = self.benchmark_candidate(
                candidate, host_data, kernel_args_fns, global_size, local_size
            )
            if result.success:
                print(f"    Speedup: {result.speedup:.2f}x  "
                      f"Separate: {result.separate_total_ns/1e6:.3f}ms  "
                      f"Fused: {result.fused_time_ns/1e6:.3f}ms")
            else:
                print(f"    FAILED: {result.error}")
            results.append(result)
        return results


def select_best_fusion(
    results: List[FusionBenchmarkResult],
    policy: str = "MAX_SPEEDUP",
) -> Optional[FusionBenchmarkResult]:
    """Select best fusion candidate."""
    successful = [r for r in results if r.success]
    if not successful:
        return None

    if policy == "MAX_SPEEDUP":
        return max(successful, key=lambda r: r.speedup)
    elif policy == "MIN_FUSED_TIME":
        return min(successful, key=lambda r: r.fused_time_ns)
    return max(successful, key=lambda r: r.speedup)


def analyze_and_benchmark_fusion(
    kernels: List[KernelSpec],
    host_data: Dict[str, np.ndarray],
    kernel_args_fns: List[Callable[[Dict[str, cl.Buffer]], List[Any]]],
    ctx: cl.Context,
    queue: cl.CommandQueue,
    device: cl.Device,
    global_size: Tuple[int, ...],
    local_size: Tuple[int, ...],
    benchmark_config: Optional[BenchmarkConfig] = None,
) -> List[FusionBenchmarkResult]:
    """Complete fusion analysis and benchmark pipeline."""
    # Analyze fusion opportunities
    sequence = KernelSequence(kernels=kernels)
    candidates = analyze_fusion_opportunities(sequence, device=device)

    print(f"[fusion] Found {len(candidates)} fusion candidates:")
    for c in candidates:
        print(f"  {c.fused_name}: {c.strategy.value}, eliminates={c.eliminates_global_memory}, "
              f"reduces_launches={c.reduces_launches}")

    # Benchmark
    bench = FusionBenchmark(ctx, queue, device, benchmark_config or BenchmarkConfig())
    return bench.benchmark_all_candidates(candidates, host_data, kernel_args_fns, global_size, local_size)