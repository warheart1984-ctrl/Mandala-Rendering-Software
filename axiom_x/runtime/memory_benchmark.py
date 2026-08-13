"""Axiom-X Memory Hierarchy Benchmark — benchmark different memory configurations.

STATUS: **partial** — OpenCL backend implemented.

Benchmarks memory configurations:
  - Global only (baseline)
  - Local tiled (shared memory)
  - Pinned host memory
  - Persistent mapping (zero-copy)
  - SVM fine-grain / coarse-grain
"""

from __future__ import annotations

import time
from dataclasses import dataclass, asdict
from pathlib import Path
from typing import Any, Callable, Dict, List, Optional, Tuple

import numpy as np
import pyopencl as cl

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
from ..benchmark.benchmark_workgroups import BenchmarkConfig, BenchmarkResult, run_benchmark, select_best_candidate


@dataclass
class MemoryBenchmarkResult:
    """Result of benchmarking a memory configuration."""
    config: MemoryConfig
    config_hash: str
    benchmark_result: BenchmarkResult
    transfer_time_ns: float = 0.0  # Host-device transfer time
    kernel_time_ns: float = 0.0    # Kernel execution time
    total_time_ns: float = 0.0     # Total (transfer + kernel)

    def to_dict(self) -> Dict[str, Any]:
        d = asdict(self)
        d["config"] = self.config.to_hash_input()
        d["benchmark_result"] = self.benchmark_result.__dict__
        return d


class MemoryBenchmark:
    """Benchmark different memory hierarchy configurations."""

    def __init__(
        self,
        ctx: cl.Context,
        queue: cl.CommandQueue,
        device: cl.Device,
        kernel_source: str,
        kernel_name: str,
        global_size: Tuple[int, ...],
        benchmark_config: BenchmarkConfig,
    ):
        self.ctx = ctx
        self.queue = queue
        self.device = device
        self.kernel_source = kernel_source
        self.kernel_name = kernel_name
        self.global_size = global_size
        self.benchmark_config = benchmark_config
        self._prg: Optional[cl.Program] = None
        self._kernel: Optional[cl.Kernel] = None

    def _build_program(self, build_options: str = "") -> cl.Program:
        if self._prg is None:
            self._prg = cl.Program(self.ctx, self.kernel_source).build(build_options)
            self._kernel = cl.Kernel(self._prg, self.kernel_name)
        return self._prg

    def _create_buffers(self, config: MemoryConfig, host_data: Dict[str, np.ndarray]) -> Dict[str, cl.Buffer]:
        """Create OpenCL buffers according to memory configuration."""
        buffers = {}
        for spec in config.buffers:
            host_arr = host_data.get(spec.name)
            if host_arr is None:
                # Allocate zero-filled
                host_arr = np.zeros(spec.size_bytes, dtype=np.uint8)

            flags = cl.mem_flags.READ_WRITE
            if spec.read_only:
                flags = cl.mem_flags.READ_ONLY
            elif spec.write_only:
                flags = cl.mem_flags.WRITE_ONLY

            if spec.memory_space == MemorySpace.GLOBAL:
                buf = cl.Buffer(self.ctx, flags | cl.mem_flags.COPY_HOST_PTR, hostbuf=host_arr)
            elif spec.memory_space == MemorySpace.LOCAL:
                # Local memory allocated at kernel launch, not here
                buf = None
            elif spec.memory_space == MemorySpace.CONSTANT:
                buf = cl.Buffer(self.ctx, flags | cl.mem_flags.COPY_HOST_PTR, hostbuf=host_arr)
            elif spec.memory_space == MemorySpace.HOST_PINNED:
                # Pinned host memory
                buf = cl.Buffer(self.ctx, flags | cl.mem_flags.ALLOC_HOST_PTR, host_arr.nbytes)
                # Map and copy
                mapped = cl.enqueue_map_buffer(self.queue, buf, cl.map_flags.WRITE, 0, host_arr.shape, host_arr.dtype)
                mapped[:] = host_arr[:]
                cl.enqueue_unmap_mem_object(self.queue, buf, mapped)
                self.queue.finish()
            elif spec.memory_space == MemorySpace.PERSISTENT:
                # Persistent mapping (SVM or mapped buffer)
                buf = cl.Buffer(self.ctx, flags | cl.mem_flags.ALLOC_HOST_PTR, host_arr.nbytes)
            else:
                buf = cl.Buffer(self.ctx, flags | cl.mem_flags.COPY_HOST_PTR, hostbuf=host_arr)

            buffers[spec.name] = buf
        return buffers

    def _measure_transfer_time(
        self,
        buffers: Dict[str, cl.Buffer],
        host_data: Dict[str, np.ndarray],
        config: MemoryConfig,
    ) -> float:
        """Measure host-to-device transfer time for buffers that need it."""
        t0 = time.perf_counter_ns()
        for spec in config.buffers:
            buf = buffers.get(spec.name)
            host_arr = host_data.get(spec.name)
            if buf is None or host_arr is None:
                continue
            if spec.memory_space in (MemorySpace.HOST_PINNED, MemorySpace.PERSISTENT):
                # Already mapped, just sync
                self.queue.finish()
            else:
                cl.enqueue_copy(self.queue, buf, host_arr)
        self.queue.finish()
        return time.perf_counter_ns() - t0

    def _measure_kernel_time(
        self,
        kernel: cl.Kernel,
        global_size: Tuple[int, ...],
        local_size: Tuple[int, ...],
        kernel_args: List[Any],
    ) -> float:
        """Measure kernel execution time using event profiling."""
        for i, arg in enumerate(kernel_args):
            kernel.set_arg(i, arg)
        evt = kernel.enqueue_nd_range(self.queue, global_size, local_size)
        evt.wait()
        return evt.profile.end - evt.profile.start

    def benchmark_config(
        self,
        config: MemoryConfig,
        host_data: Dict[str, np.ndarray],
        kernel_args_fn: Callable[[Dict[str, cl.Buffer]], List[Any]],
        local_size: Tuple[int, ...],
    ) -> MemoryBenchmarkResult:
        """Benchmark a single memory configuration."""
        # Create buffers
        buffers = self._create_buffers(config, host_data)

        # Build kernel args
        kernel_args = kernel_args_fn(buffers)

        # Warmup
        for _ in range(self.benchmark_config.warmup_iterations):
            self._measure_kernel_time(self._kernel, self.global_size, local_size, kernel_args)

        # Measure transfer time (separate from kernel)
        transfer_times = []
        for _ in range(self.benchmark_config.measure_iterations):
            t = self._measure_transfer_time(buffers, host_data, config)
            transfer_times.append(t)

        # Measure kernel time
        kernel_times = []
        for _ in range(self.benchmark_config.measure_iterations):
            t = self._measure_kernel_time(self._kernel, self.global_size, local_size, kernel_args)
            kernel_times.append(t)

        # Total time (transfer + kernel)
        total_times = [t + k for t, k in zip(transfer_times, kernel_times)]

        # Create benchmark result from total times
        # We'll use a custom execute_fn that returns total time
        def total_time_fn(wg_size: List[int]) -> float:
            # For memory benchmark, we just return the pre-measured times
            # This is a simplification - in reality we'd re-run
            return total_times.pop(0) if total_times else 0

        # Use the existing benchmark infrastructure for statistics
        arr = np.asarray(total_times, dtype=np.float64)
        median_ns = float(np.median(arr))
        mean_ns = float(np.mean(arr))
        min_ns = float(np.min(arr))
        max_ns = float(np.max(arr))
        p95_ns = float(np.percentile(arr, 95))
        stddev_ns = float(np.std(arr))

        bench_result = BenchmarkResult(
            workgroup_size=list(local_size),
            median_ns=median_ns,
            mean_ns=mean_ns,
            min_ns=min_ns,
            max_ns=max_ns,
            p95_ns=p95_ns,
            stddev_ns=stddev_ns,
            samples=len(arr),
            warmup_samples=self.benchmark_config.warmup_iterations,
            outlier_rejected=0,
            raw_times_ns=total_times,
            raw_warmup_ns=[],
            success=True,
        )

        return MemoryBenchmarkResult(
            config=config,
            config_hash=config.config_hash(),
            benchmark_result=bench_result,
            transfer_time_ns=float(np.mean(transfer_times)),
            kernel_time_ns=float(np.mean(kernel_times)),
            total_time_ns=median_ns,
        )

    def benchmark_all(
        self,
        host_data: Dict[str, np.ndarray],
        kernel_args_fn: Callable[[Dict[str, cl.Buffer]], List[Any]],
        local_size: Tuple[int, ...],
        tile_size: Optional[List[int]] = None,
    ) -> List[MemoryBenchmarkResult]:
        """Benchmark all standard memory configurations."""
        results = []

        # 1. Global only (baseline)
        print("  [mem-bench] Global only...")
        global_config = create_global_only_config([
            {"name": name, "size_bytes": spec.size_bytes, "read_only": spec.read_only, "write_only": spec.write_only}
            for name, spec in host_data.items()
        ])
        # We need to convert host_data dict to list of buffer specs
        # Simplified for now
        buffer_specs = []
        for name, arr in host_data.items():
            buffer_specs.append({
                "name": name,
                "size_bytes": arr.nbytes,
                "read_only": False,
                "write_only": False,
            })
        global_config = create_global_only_config(buffer_specs)
        result = self.benchmark_config(global_config, host_data, kernel_args_fn, local_size)
        results.append(result)
        print(f"    total: {result.total_time_ns/1e6:.3f}ms  transfer: {result.transfer_time_ns/1e6:.3f}ms  kernel: {result.kernel_time_ns/1e6:.3f}ms")

        # 2. Local tiled (if tile_size provided)
        if tile_size:
            print("  [mem-bench] Local tiled...")
            local_config = create_local_tiled_config(buffer_specs, tile_size)
            if local_config.total_local_memory() <= self.device.local_mem_size:
                result = self.benchmark_config(local_config, host_data, kernel_args_fn, local_size)
                results.append(result)
                print(f"    total: {result.total_time_ns/1e6:.3f}ms  transfer: {result.transfer_time_ns/1e6:.3f}ms  kernel: {result.kernel_time_ns/1e6:.3f}ms")
            else:
                print(f"    SKIPPED: local memory {local_config.total_local_memory()} > device limit {self.device.local_mem_size}")

        # 3. Pinned host memory
        if self.device.get_info(cl.device_info.HOST_UNIFIED_MEMORY) or True:  # Try anyway
            print("  [mem-bench] Pinned host memory...")
            pinned_config = create_pinned_host_config(buffer_specs)
            result = self.benchmark_config(pinned_config, host_data, kernel_args_fn, local_size)
            results.append(result)
            print(f"    total: {result.total_time_ns/1e6:.3f}ms  transfer: {result.transfer_time_ns/1e6:.3f}ms  kernel: {result.kernel_time_ns/1e6:.3f}ms")

        # 4. Persistent mapping
        print("  [mem-bench] Persistent mapping...")
        persistent_config = create_persistent_mapping_config(buffer_specs)
        result = self.benchmark_config(persistent_config, host_data, kernel_args_fn, local_size)
        results.append(result)
        print(f"    total: {result.total_time_ns/1e6:.3f}ms  transfer: {result.transfer_time_ns/1e6:.3f}ms  kernel: {result.kernel_time_ns/1e6:.3f}ms")

        return results


def select_best_memory_config(
    results: List[MemoryBenchmarkResult],
    policy: str = "MIN_TOTAL_TIME",
) -> Optional[MemoryBenchmarkResult]:
    """Select best memory configuration."""
    successful = [r for r in results if r.benchmark_result.success]
    if not successful:
        return None

    if policy == "MIN_TOTAL_TIME":
        return min(successful, key=lambda r: r.total_time_ns)
    elif policy == "MIN_KERNEL_TIME":
        return min(successful, key=lambda r: r.kernel_time_ns)
    elif policy == "MIN_TRANSFER_TIME":
        return min(successful, key=lambda r: r.transfer_time_ns)
    return min(successful, key=lambda r: r.total_time_ns)