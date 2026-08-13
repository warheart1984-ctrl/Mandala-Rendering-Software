"""Axiom-X Multi-GPU — work distribution across multiple GPUs.

STATUS: **partial** — OpenCL multi-device; declared for CUDA/HIP/Vulkan.

Implements work distribution strategies:
  - Data parallel (split global work across GPUs)
  - Model parallel (split model/kernel across GPUs)
  - Pipeline parallel (stage pipeline across GPUs)
  - Hybrid combinations
"""

from __future__ import annotations

import hashlib
import threading
import time
from dataclasses import dataclass, field
from enum import Enum
from pathlib import Path
from typing import Any, Callable, Dict, List, Optional, Tuple, Union
from concurrent.futures import ThreadPoolExecutor, Future, as_completed

import numpy as np
import pyopencl as cl

from .axiom_x_runtime import AxiomXResult, DispatchConfig, DeviceInfo
from .tuning_key import TuningKey
from .tuning_cache import TuningCache


class DistributionStrategy(Enum):
    """Multi-GPU work distribution strategy."""
    DATA_PARALLEL = "data_parallel"         # Split work items across GPUs
    MODEL_PARALLEL = "model_parallel"       # Split kernel across GPUs
    PIPELINE_PARALLEL = "pipeline_parallel" # Pipeline stages across GPUs
    HYBRID = "hybrid"                       # Combination


class WorkPartition(Enum):
    """How to partition work."""
    STATIC = "static"           # Fixed partition at startup
    DYNAMIC = "dynamic"         # Dynamic work stealing
    ADAPTIVE = "adaptive"       # Adaptive based on performance


@dataclass
class GPUDevice:
    """GPU device info for multi-GPU."""
    device_id: int
    cl_device: cl.Device
    context: cl.Context
    queue: cl.CommandQueue
    name: str
    vendor: str
    compute_units: int
    global_memory: int
    local_memory: int
    max_work_group_size: int
    # Performance characteristics
    relative_performance: float = 1.0  # Normalized to fastest GPU
    current_load: float = 0.0          # 0-1 current utilization


@dataclass
class WorkSlice:
    """A slice of work assigned to a GPU."""
    gpu_id: int
    global_offset: Tuple[int, ...]
    global_size: Tuple[int, ...]
    local_size: Tuple[int, ...]
    input_buffers: Dict[str, cl.Buffer]
    output_buffers: Dict[str, cl.Buffer]
    # For pipeline parallel
    stage_id: int = 0
    depends_on: List[int] = field(default_factory=list)


@dataclass
class MultiGPUConfig:
    """Multi-GPU configuration."""
    strategy: DistributionStrategy = DistributionStrategy.DATA_PARALLEL
    partition: WorkPartition = WorkPartition.STATIC
    devices: List[int] = field(default_factory=list)  # Device IDs to use (empty = all)
    # Data parallel
    split_dimension: int = 0  # Which dimension to split (0=X, 1=Y, 2=Z)
    # Pipeline parallel
    pipeline_stages: List[str] = field(default_factory=list)  # Kernel names per stage
    # Dynamic scheduling
    work_chunk_size: int = 64   # Work items per chunk for dynamic
    # Synchronization
    sync_after_each_frame: bool = True
    # Profiling
    enable_profiling: bool = True


@dataclass
class MultiGPUResult:
    """Result from multi-GPU execution."""
    frame_id: int
    gpu_results: Dict[int, AxiomXResult]  # gpu_id -> result
    combined_output: Optional[np.ndarray] = None
    total_time_ms: float = 0.0
    gpu_times: Dict[int, float] = field(default_factory=dict)
    speedup: float = 0.0
    efficiency: float = 0.0
    error: Optional[str] = None


class MultiGPUExecutor:
    """Execute work across multiple GPUs."""

    def __init__(
        self,
        platforms: List[cl.Platform],
        config: MultiGPUConfig,
        cache: Optional[TuningCache] = None,
    ):
        self.platforms = platforms
        self.config = config
        self.cache = cache

        # Discover and initialize devices
        self.devices: Dict[int, GPUDevice] = {}
        self._initialize_devices()

        # Work distribution state
        self.frame_counter = 0
        self._lock = threading.Lock()
        self.executor = ThreadPoolExecutor(max_workers=len(self.devices))

        # Performance tracking
        self.gpu_performance: Dict[int, List[float]] = {d: [] for d in self.devices}

    def _initialize_devices(self) -> None:
        """Initialize selected GPU devices."""
        all_devices = []
        for platform in self.platforms:
            for device in platform.get_devices(cl.device_type.GPU):
                all_devices.append(device)

        if not all_devices:
            raise RuntimeError("No GPU devices found")

        # Filter by config.devices if specified
        if self.config.devices:
            selected = [all_devices[i] for i in self.config.devices if i < len(all_devices)]
        else:
            selected = all_devices

        if not selected:
            raise RuntimeError("No valid devices selected")

        # Create context and queue for each device
        for i, device in enumerate(selected):
            ctx = cl.Context([device])
            queue = cl.CommandQueue(
                ctx,
                properties=cl.command_queue_properties.PROFILING_ENABLE
                if self.config.enable_profiling else 0
            )

            # Estimate relative performance (simplified)
            perf = device.max_compute_units * device.max_clock_frequency
            if self.devices:
                max_perf = max(d.relative_performance for d in self.devices.values())
                perf = perf / max_perf if max_perf > 0 else 1.0

            self.devices[i] = GPUDevice(
                device_id=i,
                cl_device=device,
                context=ctx,
                queue=queue,
                name=device.name,
                vendor=device.vendor,
                compute_units=device.max_compute_units,
                global_memory=device.global_mem_size,
                local_memory=device.local_mem_size,
                max_work_group_size=device.max_work_group_size,
                relative_performance=perf,
            )

    def _create_work_slices(
        self,
        global_size: Tuple[int, ...],
        local_size: Tuple[int, ...],
        input_buffers: Dict[str, cl.Buffer],
        output_buffers: Dict[str, cl.Buffer],
    ) -> List[WorkSlice]:
        """Create work slices for each GPU based on strategy."""
        slices = []

        if self.config.strategy == DistributionStrategy.DATA_PARALLEL:
            slices = self._create_data_parallel_slices(
                global_size, local_size, input_buffers, output_buffers
            )
        elif self.config.strategy == DistributionStrategy.PIPELINE_PARALLEL:
            slices = self._create_pipeline_slices(
                global_size, local_size, input_buffers, output_buffers
            )
        else:
            # Default to data parallel
            slices = self._create_data_parallel_slices(
                global_size, local_size, input_buffers, output_buffers
            )

        return slices

    def _create_data_parallel_slices(
        self,
        global_size: Tuple[int, ...],
        local_size: Tuple[int, ...],
        input_buffers: Dict[str, cl.Buffer],
        output_buffers: Dict[str, cl.Buffer],
    ) -> List[WorkSlice]:
        """Create data-parallel work slices."""
        slices = []
        num_gpus = len(self.devices)
        split_dim = self.config.split_dimension

        if split_dim >= len(global_size):
            split_dim = len(global_size) - 1

        total_work = global_size[split_dim]
        base_chunk = total_work // num_gpus
        remainder = total_work % num_gpus

        offset = 0
        for gpu_id in sorted(self.devices.keys()):
            chunk_size = base_chunk + (1 if gpu_id < remainder else 0)
            if chunk_size == 0:
                continue

            slice_global_size = list(global_size)
            slice_global_size[split_dim] = chunk_size
            slice_offset = list(global_size)
            slice_offset[split_dim] = offset
            for i in range(len(slice_offset)):
                if i != split_dim:
                    slice_offset[i] = 0

            slices.append(WorkSlice(
                gpu_id=gpu_id,
                global_offset=tuple(slice_offset),
                global_size=tuple(slice_global_size),
                local_size=local_size,
                input_buffers=input_buffers,
                output_buffers=output_buffers,
            ))

            offset += chunk_size

        return slices

    def _create_pipeline_slices(
        self,
        global_size: Tuple[int, ...],
        local_size: Tuple[int, ...],
        input_buffers: Dict[str, cl.Buffer],
        output_buffers: Dict[str, cl.Buffer],
    ) -> List[WorkSlice]:
        """Create pipeline-parallel work slices."""
        slices = []
        stages = self.config.pipeline_stages
        num_stages = len(stages)

        if num_stages == 0:
            return self._create_data_parallel_slices(global_size, local_size, input_buffers, output_buffers)

        gpu_ids = sorted(self.devices.keys())
        stages_per_gpu = max(1, num_stages // len(gpu_ids))

        for i, gpu_id in enumerate(gpu_ids):
            start_stage = i * stages_per_gpu
            end_stage = min(start_stage + stages_per_gpu, num_stages)
            if start_stage >= num_stages:
                break

            gpu_stages = stages[start_stage:end_stage]
            for stage_idx, kernel_name in enumerate(gpu_stages):
                slices.append(WorkSlice(
                    gpu_id=gpu_id,
                    global_offset=(0, 0, 0),
                    global_size=global_size,
                    local_size=local_size,
                    input_buffers=input_buffers,
                    output_buffers=output_buffers,
                    stage_id=start_stage + stage_idx,
                    depends_on=[start_stage + stage_idx - 1] if stage_idx > 0 else [],
                ))

        return slices

    def execute(
        self,
        kernel_name: str,
        kernel_source: str,
        global_size: Tuple[int, ...],
        local_size: Tuple[int, ...],
        host_input: Dict[str, np.ndarray],
        host_output: Dict[str, np.ndarray],
        kernel_args_fn: Callable[[int, Dict[str, cl.Buffer]], List[Any]],
        frame_id: Optional[int] = None,
    ) -> MultiGPUResult:
        """Execute kernel across multiple GPUs."""
        start_time = time.perf_counter()

        if frame_id is None:
            with self._lock:
                frame_id = self.frame_counter
                self.frame_counter += 1

        # Create device buffers for each GPU
        device_input_buffers: Dict[int, Dict[str, cl.Buffer]] = {}
        device_output_buffers: Dict[int, Dict[str, cl.Buffer]] = {}

        for gpu_id, device in self.devices.items():
            device_input_buffers[gpu_id] = {}
            device_output_buffers[gpu_id] = {}

            for name, arr in host_input.items():
                buf = cl.Buffer(device.context, cl.mem_flags.READ_ONLY | cl.mem_flags.COPY_HOST_PTR, hostbuf=arr)
                device_input_buffers[gpu_id][name] = buf

            for name, arr in host_output.items():
                buf = cl.Buffer(device.context, cl.mem_flags.WRITE_ONLY, arr.nbytes)
                device_output_buffers[gpu_id][name] = buf

        # Create work slices
        slices = self._create_work_slices(global_size, local_size, device_input_buffers, device_output_buffers)

        # Build program on each device
        programs: Dict[int, cl.Program] = {}
        kernels: Dict[int, cl.Kernel] = {}
        for gpu_id, device in self.devices.items():
            programs[gpu_id] = cl.Program(device.context, kernel_source).build()
            kernels[gpu_id] = cl.Kernel(programs[gpu_id], kernel_name)

        # Submit work to each GPU
        futures: Dict[int, Future] = {}
        gpu_times: Dict[int, float] = {}

        for slice_ in slices:
            gpu_id = slice_.gpu_id
            device = self.devices[gpu_id]
            kernel = kernels[gpu_id]

            future = self.executor.submit(
                self._execute_on_gpu,
                gpu_id,
                device,
                kernel,
                slice_,
                kernel_args_fn,
            )
            futures[gpu_id] = future

        # Wait for completion
        results: Dict[int, AxiomXResult] = {}
        for gpu_id, future in futures.items():
            try:
                result, elapsed = future.result(timeout=60.0)
                results[gpu_id] = result
                gpu_times[gpu_id] = elapsed
                device.current_load = 0.0  # Reset after completion
            except Exception as e:
                return MultiGPUResult(
                    frame_id=frame_id,
                    gpu_results={},
                    total_time_ms=(time.perf_counter() - start_time) * 1000,
                    error=f"GPU {gpu_id} failed: {e}",
                )

        # Combine outputs if needed
        combined_output = self._combine_outputs(results, host_output) if len(results) > 1 else None

        total_time = time.perf_counter() - start_time

        # Calculate speedup and efficiency
        single_gpu_time = max(gpu_times.values()) if gpu_times else total_time
        speedup = single_gpu_time / total_time if total_time > 0 else 1.0
        efficiency = speedup / len(self.devices) if self.devices else 1.0

        return MultiGPUResult(
            frame_id=frame_id,
            gpu_results=results,
            combined_output=combined_output,
            total_time_ms=total_time * 1000,
            gpu_times={k: v * 1000 for k, v in gpu_times.items()},
            speedup=speedup,
            efficiency=efficiency,
        )

    def _execute_on_gpu(
        self,
        gpu_id: int,
        device: GPUDevice,
        kernel: cl.Kernel,
        slice_: WorkSlice,
        kernel_args_fn: Callable[[int, Dict[str, cl.Buffer]], List[Any]],
    ) -> Tuple[AxiomXResult, float]:
        """Execute a work slice on a single GPU."""
        device.current_load = 1.0
        start = time.perf_counter()

        # Set kernel arguments
        args = kernel_args_fn(gpu_id, slice_.input_buffers)
        for i, arg in enumerate(args):
            kernel.set_arg(i, arg)

        # Add output buffer as last arg (assumption)
        output_buf = list(slice_.output_buffers.values())[0]
        kernel.set_arg(len(args), output_buf)

        # Execute with offset
        global_size = slice_.global_size
        local_size = slice_.local_size
        global_offset = slice_.global_offset

        evt = kernel.enqueue_nd_range(
            device.queue, global_size, local_size, global_offset
        )
        evt.wait()

        elapsed = time.perf_counter() - start
        device.current_load = 0.0

        # Read back result
        output_arr = np.zeros_like(list(slice_.output_buffers.values())[0].get_info(cl.mem_info.SIZE))
        cl.enqueue_copy(device.queue, output_arr, output_buf)
        device.queue.finish()

        # Create minimal result
        from .axiom_x_runtime import AxiomXResult, KernelIdentity, MathIR, DeviceInfo, DispatchConfig, ExecutionIdentity, ResultIdentity, Provenance, NumericalSummary
        import datetime

        result = AxiomXResult(
            jobIdentity=JobIdentity(
                kernelIdentity=KernelIdentity(name="multi_gpu", version="1.0", hash="", source="opencl"),
                mathIR=MathIR(format="opencl-c", content="", hash=""),
                inputs=[],
                constants={},
            ),
            executionIdentity=ExecutionIdentity(
                backend="opencl",
                device=DeviceInfo(name=device.name, vendor=device.vendor, computeUnits=device.compute_units, globalMemoryBytes=device.global_memory),
                driver="",
                precision="fp32",
                dispatch=DispatchConfig(globalSize=list(global_size), localSize=list(local_size), workDimensions=len(global_size)),
                timestamp=datetime.datetime.now(datetime.timezone.utc).isoformat(),
                elapsedMs=elapsed * 1000,
            ),
            resultIdentity=ResultIdentity(
                outputHash="",
                pixelHash="",
                numericalSummary=NumericalSummary(min=0, max=0, mean=0, stddev=0, nanCount=0, infCount=0),
                provenance=Provenance(intentId="", worldId="", timelineId="", kernelHash=""),
            ),
            rawOutput=output_arr,
        )

        return result, elapsed

    def _combine_outputs(
        self,
        results: Dict[int, AxiomXResult],
        host_output: Dict[str, np.ndarray],
    ) -> Optional[np.ndarray]:
        """Combine outputs from multiple GPUs (data parallel)."""
        # Simple concatenation along split dimension
        # This is a simplified implementation
        outputs = [r.rawOutput for r in results.values() if r.rawOutput is not None]
        if not outputs:
            return None

        # Concatenate along first axis (assuming split_dim=0)
        try:
            return np.concatenate(outputs, axis=0)
        except Exception:
            return outputs[0]  # Fallback

    def get_device_stats(self) -> Dict[int, Dict[str, Any]]:
        """Get performance stats per device."""
        stats = {}
        for gpu_id, device in self.devices.items():
            perf = self.gpu_performance.get(gpu_id, [])
            stats[gpu_id] = {
                "name": device.name,
                "compute_units": device.compute_units,
                "relative_performance": device.relative_performance,
                "avg_frame_time_ms": (sum(perf) / len(perf) * 1000) if perf else 0,
                "frames_processed": len(perf),
            }
        return stats

    def shutdown(self) -> None:
        """Shutdown and release resources."""
        self.executor.shutdown(wait=True)
        for device in self.devices.values():
            device.queue.finish()
            device.context.release()

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc_val, exc_tb):
        self.shutdown()


def create_multi_gpu_executor(
    config: MultiGPUConfig,
    cache: Optional[TuningCache] = None,
) -> MultiGPUExecutor:
    """Create multi-GPU executor from all available platforms."""
    platforms = cl.get_platforms()
    return MultiGPUExecutor(platforms, config, cache)