"""Axiom-X Benchmark — measured GPU vs CPU for kernel verification.

STATUS: **partial** — OpenCL GPU vs CPU reference implemented.

Exports:
  - BenchmarkConfig: benchmark configuration
  - BenchmarkResult: benchmark result with robust statistics
  - run_benchmark: benchmark a single workgroup candidate
  - select_best_candidate: select best variant via policy
"""

from .benchmark_workgroups import (
    BenchmarkConfig,
    BenchmarkResult,
    run_benchmark,
    select_best_candidate,
    create_opencl_benchmark_fn,
    create_wall_time_benchmark_fn,
)

__all__ = [
    "BenchmarkConfig",
    "BenchmarkResult",
    "run_benchmark",
    "select_best_candidate",
    "create_opencl_benchmark_fn",
    "create_wall_time_benchmark_fn",
]