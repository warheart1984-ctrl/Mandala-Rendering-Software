"""Axiom-X Workgroup Benchmark — robust measurement of kernel execution time.

STATUS: **partial** — OpenCL backend implemented; CUDA/HIP/Vulkan declared.

Implements the benchmark loop:
  warmup × N → measure × M → reject outliers → compute robust statistics
"""

from __future__ import annotations

import time
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Callable, Dict, List, Optional, Tuple

import numpy as np


@dataclass
class BenchmarkConfig:
    """Configuration for a benchmark run."""
    warmup_iterations: int = 5
    measure_iterations: int = 20
    outlier_rejection: str = "trimmed_mean"  # "trimmed_mean" | "median" | "none"
    trim_fraction: float = 0.1  # fraction to trim from each end (for trimmed_mean)
    min_measure_iterations: int = 3  # minimum after outlier rejection
    timeout_per_iteration_s: float = 30.0


@dataclass
class BenchmarkResult:
    """Result of benchmarking a single workgroup candidate."""
    workgroup_size: List[int]
    median_ns: float
    mean_ns: float
    min_ns: float
    max_ns: float
    p95_ns: float
    stddev_ns: float
    samples: int
    warmup_samples: int
    outlier_rejected: int
    raw_times_ns: List[float]
    raw_warmup_ns: List[float]
    success: bool
    error: Optional[str] = None


def _trimmed_mean(arr: np.ndarray, trim_fraction: float) -> float:
    """Compute trimmed mean, removing trim_fraction from each end."""
    if len(arr) == 0:
        return 0.0
    sorted_arr = np.sort(arr)
    n_trim = int(len(arr) * trim_fraction)
    if n_trim > 0:
        trimmed = sorted_arr[n_trim:-n_trim]
        if len(trimmed) == 0:
            trimmed = sorted_arr
    else:
        trimmed = sorted_arr
    return float(np.mean(trimmed))


def _reject_outliers_iqr(arr: np.ndarray) -> Tuple[np.ndarray, int]:
    """Reject outliers using IQR method. Returns (cleaned_array, count_rejected)."""
    if len(arr) < 4:
        return arr, 0
    q1 = np.percentile(arr, 25)
    q3 = np.percentile(arr, 75)
    iqr = q3 - q1
    lower = q1 - 1.5 * iqr
    upper = q3 + 1.5 * iqr
    mask = (arr >= lower) & (arr <= upper)
    rejected = int(np.sum(~mask))
    return arr[mask], rejected


def run_benchmark(
    execute_fn: Callable[[List[int]], float],
    workgroup_size: List[int],
    config: BenchmarkConfig,
) -> BenchmarkResult:
    """Run benchmark for a single workgroup size.

    Args:
        execute_fn: Function that takes workgroup_size and returns execution time in nanoseconds.
                   Should handle its own synchronization (queue.finish, etc.).
        workgroup_size: The workgroup size to test (e.g., [64], [16, 16]).
        config: Benchmark configuration.

    Returns:
        BenchmarkResult with robust statistics.
    """
    warmup_times: List[float] = []
    measure_times: List[float] = []

    # Warmup
    for i in range(config.warmup_iterations):
        try:
            t_ns = execute_fn(workgroup_size)
            warmup_times.append(t_ns)
        except Exception as e:
            return BenchmarkResult(
                workgroup_size=workgroup_size,
                median_ns=0.0,
                mean_ns=0.0,
                min_ns=0.0,
                max_ns=0.0,
                p95_ns=0.0,
                stddev_ns=0.0,
                samples=0,
                warmup_samples=i,
                outlier_rejected=0,
                raw_times_ns=[],
                raw_warmup_ns=warmup_times,
                success=False,
                error=f"Warmup iteration {i} failed: {e}",
            )

    # Measurement
    for i in range(config.measure_iterations):
        try:
            t_ns = execute_fn(workgroup_size)
            measure_times.append(t_ns)
        except Exception as e:
            return BenchmarkResult(
                workgroup_size=workgroup_size,
                median_ns=0.0,
                mean_ns=0.0,
                min_ns=0.0,
                max_ns=0.0,
                p95_ns=0.0,
                stddev_ns=0.0,
                samples=len(measure_times),
                warmup_samples=len(warmup_times),
                outlier_rejected=0,
                raw_times_ns=measure_times,
                raw_warmup_ns=warmup_times,
                success=False,
                error=f"Measurement iteration {i} failed: {e}",
            )

    if len(measure_times) < config.min_measure_iterations:
        return BenchmarkResult(
            workgroup_size=workgroup_size,
            median_ns=0.0,
            mean_ns=0.0,
            min_ns=0.0,
            max_ns=0.0,
            p95_ns=0.0,
            stddev_ns=0.0,
            samples=len(measure_times),
            warmup_samples=len(warmup_times),
            outlier_rejected=0,
            raw_times_ns=measure_times,
            raw_warmup_ns=warmup_times,
            success=False,
            error=f"Insufficient measurements: {len(measure_times)} < {config.min_measure_iterations}",
        )

    arr = np.asarray(measure_times, dtype=np.float64)

    # Outlier rejection
    outlier_rejected = 0
    if config.outlier_rejection == "trimmed_mean":
        # For trimmed mean, we don't reject, just trim during statistic computation
        pass
    elif config.outlier_rejection == "median":
        # Median is inherently robust, no rejection needed
        pass
    elif config.outlier_rejection == "iqr":
        arr, outlier_rejected = _reject_outliers_iqr(arr)
    elif config.outlier_rejection == "none":
        pass
    else:
        arr, outlier_rejected = _reject_outliers_iqr(arr)

    if len(arr) < config.min_measure_iterations:
        return BenchmarkResult(
            workgroup_size=workgroup_size,
            median_ns=0.0,
            mean_ns=0.0,
            min_ns=0.0,
            max_ns=0.0,
            p95_ns=0.0,
            stddev_ns=0.0,
            samples=len(arr),
            warmup_samples=len(warmup_times),
            outlier_rejected=outlier_rejected,
            raw_times_ns=measure_times,
            raw_warmup_ns=warmup_times,
            success=False,
            error=f"Insufficient measurements after outlier rejection: {len(arr)} < {config.min_measure_iterations}",
        )

    # Compute statistics
    if config.outlier_rejection == "trimmed_mean":
        mean_ns = _trimmed_mean(arr, config.trim_fraction)
    else:
        mean_ns = float(np.mean(arr))

    median_ns = float(np.median(arr))
    min_ns = float(np.min(arr))
    max_ns = float(np.max(arr))
    p95_ns = float(np.percentile(arr, 95))
    stddev_ns = float(np.std(arr))

    return BenchmarkResult(
        workgroup_size=workgroup_size,
        median_ns=median_ns,
        mean_ns=mean_ns,
        min_ns=min_ns,
        max_ns=max_ns,
        p95_ns=p95_ns,
        stddev_ns=stddev_ns,
        samples=len(arr),
        warmup_samples=len(warmup_times),
        outlier_rejected=outlier_rejected,
        raw_times_ns=measure_times,
        raw_warmup_ns=warmup_times,
        success=True,
    )


def select_best_candidate(
    results: List[BenchmarkResult],
    policy: str = "MIN_MEDIAN_RUNTIME",
) -> Optional[BenchmarkResult]:
    """Select the best candidate based on selection policy.

    Args:
        results: List of successful benchmark results.
        policy: Selection policy — "MIN_MEDIAN_RUNTIME" | "MIN_MEAN_RUNTIME" | "MIN_P95_RUNTIME"

    Returns:
        Best BenchmarkResult or None if no successful results.
    """
    successful = [r for r in results if r.success]
    if not successful:
        return None

    if policy == "MIN_MEDIAN_RUNTIME":
        return min(successful, key=lambda r: r.median_ns)
    elif policy == "MIN_MEAN_RUNTIME":
        return min(successful, key=lambda r: r.mean_ns)
    elif policy == "MIN_P95_RUNTIME":
        return min(successful, key=lambda r: r.p95_ns)
    else:
        return min(successful, key=lambda r: r.median_ns)


# OpenCL-specific benchmark helper
def create_opencl_benchmark_fn(
    kernel,
    queue,
    global_size: Tuple[int, ...],
    output_buf,
    kernel_args: List[Any],
    local_size_arg_index: int = -1,
) -> Callable[[List[int]], float]:
    """Create an execute_fn for OpenCL kernel benchmarking.

    Args:
        kernel: cl.Kernel object
        queue: cl.CommandQueue with PROFILING_ENABLE
        global_size: Global work size
        output_buf: Output buffer (cl.Buffer)
        kernel_args: List of kernel arguments (buffers, scalars)
        local_size_arg_index: Index in kernel_args where local size should be passed (-1 if not used)

    Returns:
        Function that takes workgroup_size and returns device execution time in nanoseconds.
    """
    def execute_fn(workgroup_size: List[int]) -> float:
        local_size = tuple(workgroup_size)

        # Set kernel arguments
        for i, arg in enumerate(kernel_args):
            kernel.set_arg(i, arg)

        # If local_size is passed as an argument, update it
        if local_size_arg_index >= 0 and local_size_arg_index < len(kernel_args):
            kernel.set_arg(local_size_arg_index, np.int32(workgroup_size[0]))

        evt = kernel.enqueue_nd_range(queue, global_size, local_size)
        evt.wait()

        # Return device time from profiling
        return evt.profile.end - evt.profile.start

    return execute_fn


# Generic timing execute_fn (wall time)
def create_wall_time_benchmark_fn(
    execute_fn: Callable[[List[int]], None],
) -> Callable[[List[int]], float]:
    """Wrap a void execute_fn to return wall time in nanoseconds."""
    def timed_fn(workgroup_size: List[int]) -> float:
        t0 = time.perf_counter_ns()
        execute_fn(workgroup_size)
        return time.perf_counter_ns() - t0
    return timed_fn