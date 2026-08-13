"""
Axiom IR Cross-Backend Benchmark

Benchmarks the same Axiom IR kernel across CPU and OpenCL backends.
Measures: latency, throughput, determinism.
"""

from __future__ import annotations

import asyncio
import sys
import time
import statistics
from pathlib import Path
from typing import Dict, List, Optional
from dataclasses import dataclass

import numpy as np

sys.path.insert(0, str(Path(__file__).parent.parent / "axiom-x" / "backends" / "opencl"))
sys.path.insert(0, str(Path(__file__).parent.parent / "axiom-x" / "backends" / "cpu"))

from OpenCLBackend import (
    OpenCLBackend,
    OpenCLBackendFactory,
    AxiomBufferDescriptor,
    AxiomIRModule,
    AxiomDispatchArgs,
    AXIOM_ABI_VERSION,
)

from CPURefBackend import (
    CPURefBackend,
    CPURefBackendFactory,
)

import numpy as np


def run_async(coro):
    return asyncio.run(coro)


@dataclass
class BenchmarkResult:
    backend: str
    kernel: str
    iterations: int
    times_ms: List[float]
    mean_ms: float
    median_ms: float
    stdev_ms: float
    min_ms: float
    max_ms: float
    throughput_mpps: float  # megapixels per second


BUILTIN_KERNELS = {
    "legacy_still": """
__kernel void legacy_still(__global uchar *out) {
    int width = 256;
    int height = 256;
    float time_seed = 1.0f;
    int idx = get_global_id(0) + get_global_id(1) * width;
    if (idx >= width * height) return;
    int x = idx % width;
    int y = idx / width;
    int i = idx * 4;
    float u = (2.0f * (x + 0.5f) / width) - 1.0f;
    float v = (2.0f * (y + 0.5f) / height) - 1.0f;
    float r2 = u * u + v * v;
    float sphere = max(0.0f, 1.0f - r2 * 1.35f);
    float shade = sphere * sphere * (0.55f + 0.45f * (1.0f - u * 0.35f));
    float rim;
    if (r2 > 0.92f) rim = 1.0f;
    else if (r2 < 0.55f) rim = 0.0f;
    else rim = (r2 - 0.55f) / (0.92f - 0.55f);
    float red = 0.12f + 0.78f * shade + 0.08f * rim;
    float grn = 0.08f + 0.22f * shade;
    float blu = 0.10f + 0.18f * shade + 0.05f * (1.0f - rim);
    red = clamp(red + 0.02f * time_seed, 0.0f, 1.0f);
    out[i + 0] = (uchar)(red * 255.0f);
    out[i + 1] = (uchar)(grn * 255.0f);
    out[i + 2] = (uchar)(blu * 255.0f);
    out[i + 3] = (uchar)255;
}
""",
}


def create_module(source: str, entry_point: str) -> AxiomIRModule:
    return AxiomIRModule(
        moduleId=f"bench-{entry_point}",
        format="opencl-c",
        abiVersion=AXIOM_ABI_VERSION,
        binary=source.encode('utf-8'),
        entryPoints=[entry_point],
        metadata={"sourceHash": "bench", "compileOptions": [], "requiredFeatures": []}
    )


async def run_benchmark(
    backend,
    kernel_name: str,
    source: str,
    workgroup_count: Dict,
    workgroup_size: Dict,
    iterations: int = 10,
    warmup: int = 2
) -> BenchmarkResult:
    """Run benchmark on a single backend."""
    
    # Create module and compile
    module = create_module(source, kernel_name)
    target = backend.getDeviceProperties()
    executable = await backend.compile(module, target)
    
    # Determine buffer size
    if kernel_name == "legacy_still":
        size_bytes = 256 * 256 * 4
    else:
        size_bytes = 256
    
    desc = AxiomBufferDescriptor(sizeBytes=size_bytes, flags=["read-write", "host-visible"])
    out_alloc = await backend.allocate(desc)
    
    # Prepare dispatch
    bindings = [{"binding": 0, "allocation": out_alloc}]
    push_constants = np.array([1.0], dtype=np.float32).tobytes() if kernel_name == "legacy_still" else np.array([3], dtype=np.uint32).tobytes()
    
    dispatch = AxiomDispatchArgs(
        workgroupCount=workgroup_count,
        workgroupSize=workgroup_size,
        bindings=bindings,
        pushConstants=push_constants,
    )
    
    # Warmup
    for _ in range(warmup):
        future = await backend.dispatch(executable, dispatch)
        await backend.synchronize(future)
    
    # Benchmark
    times = []
    for i in range(iterations):
        start = time.perf_counter()
        future = await backend.dispatch(executable, dispatch)
        await backend.synchronize(future)
        end = time.perf_counter()
        times.append((end - start) * 1000)  # ms
    
    await backend.free(out_alloc)
    
    # Calculate stats
    mean_ms = statistics.mean(times)
    median_ms = statistics.median(times)
    stdev_ms = statistics.stdev(times) if len(times) > 1 else 0.0
    min_ms = min(times)
    max_ms = max(times)
    
    # Throughput
    if kernel_name == "legacy_still":
        pixels = 256 * 256
    else:
        pixels = 256
    throughput_mpps = (pixels / 1_000_000) / (mean_ms / 1000)
    
    return BenchmarkResult(
        backend="",  # filled by caller
        kernel=kernel_name,
        iterations=iterations,
        times_ms=times,
        mean_ms=mean_ms,
        median_ms=median_ms,
        stdev_ms=stdev_ms,
        min_ms=min_ms,
        max_ms=max_ms,
        throughput_mpps=throughput_mpps
    )


async def main():
    print("=== Axiom IR Cross-Backend Benchmark ===\n")
    
    # Initialize backends
    print("Initializing backends...")
    
    ocl_factory = OpenCLBackendFactory()
    ocl_report = await OpenCLBackendFactory().probe()
    if ocl_report is None:
        print("No OpenCL device available, skipping OpenCL benchmarks")
        ocl_backend = None
    else:
        ocl_backend = await OpenCLBackendFactory().createDevice("bench-ocl")
    
    cpu_backend = await CPURefBackendFactory().createDevice("bench-cpu")
    
    backends = []
    if ocl_backend:
        backends.append(("OpenCL", ocl_backend))
    backends.append(("CPU Reference", cpu_backend))
    
    # Benchmark configurations
    benchmarks = [
        {
            "name": "legacy_still",
            "source": BUILTIN_KERNELS["legacy_still"],
            "workgroup_count": {"x": 16, "y": 16, "z": 1},
            "workgroup_size": {"x": 16, "y": 16, "z": 1},
        },
    ]
    
    results: Dict[str, List[BenchmarkResult]] = {b["name"]: [] for b in benchmarks}
    
    for kernel_name, b in zip([b["name"] for b in benchmarks], benchmarks):
        print(f"\n=== Benchmarking {kernel_name} ===")
        
        for name, backend in backends:
            print(f"  Running on {name}...", end=" ", flush=True)
            try:
                result = await run_benchmark(
                    backend, kernel_name, b["source"],
                    b["workgroup_count"], b["workgroup_size"],
                    iterations=10, warmup=2
                )
                result.backend = name
                results[kernel_name].append(result)
                print(f"  {result.mean_ms:.2f} ms (σ={result.stdev_ms:.2f}) | {result.throughput_mpps:.2f} MP/s")
            except Exception as e:
                print(f"  FAILED: {e}")
    
    # Print summary
    print("\n" + "=" * 80)
    print("BENCHMARK SUMMARY")
    print("=" * 80)
    
    for kernel_name in results:
        print(f"\n{kernel_name}:")
        for r in results[kernel_name]:
            print(f"  {r.backend:20s} | mean={r.mean_ms:7.2f}ms median={r.median_ms:7.2f}ms std={r.stdev_ms:5.2f}ms | {r.throughput_mpps:6.1f} MP/s")
        
        # Cross-backend comparison
        if len(results[kernel_name]) == 2:
            cpu_r = next(r for r in results[kernel_name] if r.backend == "CPU Reference")
            ocl_r = next((r for r in results[kernel_name] if r.backend == "OpenCL"), None)
            if ocl_r:
                speedup = cpu_r.mean_ms / ocl_r.mean_ms
                print(f"  Speedup (CPU/OpenCL): {speedup:.2f}x")
    
    # Cleanup
    for _, backend in backends:
        await backend.shutdown()
    
    print("\nDone.")


if __name__ == "__main__":
    asyncio.run(main())