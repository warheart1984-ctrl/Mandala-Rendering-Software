"""Axiom-X Runtime — thin execution wrapper over GPU backends.

STATUS: **partial** — OpenCL backend operational on RX 580;
Vulkan/WGSL, CUDA, HIP, Metal, DX12 declared only.

Design:
  - Thin wrapper: IR -> backend -> dispatch -> result
  - No governance, no scene semantics, no policy
  - Returns AxiomXResult for convergence verification
  - Constitutional bridge handled by Sovereign-X bridge (separate module)
  - Workgroup autotuning integrated via WorkgroupTuner
"""

from __future__ import annotations

import hashlib
import json
import os
import time
from dataclasses import dataclass, asdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Callable, Dict, List, Optional, Tuple, Union

import numpy as np
import pyopencl as cl
from PIL import Image

from .workgroup_tuner import WorkgroupTuner, BenchmarkConfig
from .tuning_cache import TuningCache
from .tuning_key import TuningKey
from .kernel_fusion import KernelSpec


@dataclass
class KernelIdentity:
    name: str
    version: str
    hash: str  # sha256:...
    source: str  # opencl | wgsl | cuda | hip | metal | dxil | spirv


@dataclass
class MathIR:
    format: str  # opencl-c | wgsl | spirv-binary | dxil | llvm-ir
    content: str
    hash: str  # sha256:...


@dataclass
class InputSpec:
    name: str
    type: str  # buffer | image | scalar | constant
    shape: List[int]
    dtype: str  # fp32 | fp16 | bf16 | int32 | uint32 | int8 | uint8
    hash: str  # sha256:...


@dataclass
class JobIdentity:
    kernelIdentity: KernelIdentity
    mathIR: MathIR
    inputs: List[InputSpec]
    constants: Dict[str, Any]


@dataclass
class DeviceInfo:
    name: str
    vendor: str
    architecture: Optional[str] = None
    computeUnits: int = 0
    globalMemoryBytes: int = 0
    driverVersion: Optional[str] = None


@dataclass
class DispatchConfig:
    globalSize: List[int]
    localSize: List[int]
    workDimensions: int


@dataclass
class ExecutionIdentity:
    backend: str  # opencl | vulkan | cuda | hip | metal | dx12 | cpu
    device: DeviceInfo
    driver: str
    precision: str  # fp32 | fp16 | bf16 | mixed | fp64
    dispatch: DispatchConfig
    timestamp: str
    elapsedMs: float


@dataclass
class NumericalSummary:
    min: float
    max: float
    mean: float
    stddev: float
    nanCount: int
    infCount: int
    percentiles: Optional[Dict[str, float]] = None


@dataclass
class Provenance:
    intentId: str
    worldId: str
    timelineId: str
    kernelHash: str
    constitutional: bool = False


@dataclass
class ResultIdentity:
    outputHash: str  # sha256:...
    pixelHash: str  # sha256:...
    numericalSummary: NumericalSummary
    provenance: Provenance


@dataclass
class AxiomXResult:
    jobIdentity: JobIdentity
    executionIdentity: ExecutionIdentity
    resultIdentity: ResultIdentity
    outputPath: Optional[str] = None
    rawOutput: Optional[np.ndarray] = None


class AxiomXRuntime:
    """Axiom-X Runtime for OpenCL backend."""

    def __init__(
        self,
        project_root: Optional[Path] = None,
        python_executable: str = "python",
        autotune_cache_dir: Optional[Path] = None,
        benchmark_config: Optional[BenchmarkConfig] = None,
        selection_policy: str = "MIN_MEDIAN_RUNTIME",
    ):
        self.project_root = project_root or Path(__file__).resolve().parents[3]
        self.python_executable = python_executable
        self._cl_context: Optional[cl.Context] = None
        self._cl_queue: Optional[cl.CommandQueue] = None
        self._device: Optional[cl.Device] = None

        # Autotuning
        self._autotune_cache = TuningCache(autotune_cache_dir or Path("tmp/axiom-x-tuning-cache"))
        self._benchmark_config = benchmark_config or BenchmarkConfig()
        self._selection_policy = selection_policy
        self._tuner: Optional[WorkgroupTuner] = None

    def _init_opencl(self, prefer_device: Optional[str] = None, profiling: bool = False) -> Tuple[cl.Context, cl.CommandQueue, cl.Device]:
        """Initialize OpenCL context, preferring specified device."""
        platforms = cl.get_platforms()
        devices = [d for p in platforms for d in p.get_devices()]

        if not devices:
            raise RuntimeError("No OpenCL devices found")

        # Prefer Tonga/R9 380/RX 580
        device = None
        if prefer_device:
            for d in devices:
                if prefer_device.lower() in d.name.lower():
                    device = d
                    break

        if device is None:
            # Fallback: first device
            device = devices[0]

        ctx = cl.Context([device])
        props = cl.command_queue_properties.PROFILING_ENABLE if profiling else 0
        queue = cl.CommandQueue(ctx, properties=props)

        self._cl_context = ctx
        self._cl_queue = queue
        self._device = device

        return ctx, queue, device

    def _hash_sha256(self, data: Union[bytes, str]) -> str:
        if isinstance(data, str):
            data = data.encode("utf-8")
        return f"sha256:{hashlib.sha256(data).hexdigest()}"

    def _hash_array(self, arr: np.ndarray) -> str:
        return self._hash_sha256(arr.tobytes())

    def _compute_numerical_summary(self, arr: np.ndarray) -> Dict[str, Any]:
        flat = arr.astype(np.float64).flatten()
        return {
            "min": float(np.nanmin(flat)),
            "max": float(np.nanmax(flat)),
            "mean": float(np.nanmean(flat)),
            "stddev": float(np.nanstd(flat)),
            "nanCount": int(np.isnan(flat).sum()),
            "infCount": int(np.isinf(flat).sum()),
            "percentiles": {
                "p1": float(np.nanpercentile(flat, 1)),
                "p50": float(np.nanpercentile(flat, 50)),
                "p99": float(np.nanpercentile(flat, 99)),
            }
        }

    def _get_device_info(self, device: cl.Device) -> DeviceInfo:
        return DeviceInfo(
            name=device.name,
            vendor=device.vendor,
            architecture=getattr(device, "board_name_amd", None) or device.name,
            computeUnits=device.max_compute_units,
            globalMemoryBytes=device.global_mem_size,
            driverVersion=device.version,
        )

    def execute_opencl(
        self,
        kernel_name: str,
        kernel_version: str,
        kernel_source: str,
        inputs: List[np.ndarray],
        dispatch: DispatchConfig,
        constants: Optional[Dict[str, Any]] = None,
        prefer_device: Optional[str] = None,
        output_shape: Optional[Tuple[int, int]] = None,
        autotune: bool = False,
    ) -> AxiomXResult:
        """Execute OpenCL kernel and return AxiomXResult.

        If autotune=True, runs workgroup autotuning before execution.
        """
        if autotune:
            return self.execute_opencl_autotuned(
                kernel_name=kernel_name,
                kernel_version=kernel_version,
                kernel_source=kernel_source,
                inputs=inputs,
                dispatch=dispatch,
                constants=constants,
                prefer_device=prefer_device,
                output_shape=output_shape,
            )

        start_time = time.perf_counter()

        # Initialize OpenCL (no profiling needed for regular execution)
        ctx, queue, device = self._init_opencl(prefer_device, profiling=False)

        # Build program
        prg = cl.Program(ctx, kernel_source).build()

        # Prepare inputs
        cl_buffers = []
        input_hashes = []
        for i, inp in enumerate(inputs):
            if not isinstance(inp, np.ndarray):
                inp = np.asarray(inp)
            cl_buf = cl.Buffer(
                ctx,
                cl.mem_flags.READ_ONLY | cl.mem_flags.COPY_HOST_PTR,
                hostbuf=inp,
            )
            cl_buffers.append(cl_buf)
            input_hashes.append(self._hash_array(inp))

        # Prepare output buffer
        if output_shape is None:
            # Default: 2D output from dispatch global size
            h, w = dispatch.globalSize[1], dispatch.globalSize[0]
            output_shape = (h, w, 4)  # RGBA

        output_arr = np.zeros(output_shape, dtype=np.uint8)
        output_buf = cl.Buffer(ctx, cl.mem_flags.WRITE_ONLY, output_arr.nbytes)

        # Build kernel arguments: inputs + output + dispatch params
        kernel_func = getattr(prg, kernel_name)

        # Dispatch
        global_size = tuple(dispatch.globalSize[:dispatch.workDimensions])
        local_size = tuple(dispatch.localSize[:dispatch.workDimensions]) if dispatch.localSize[0] > 0 else None

        # Execute kernel (this assumes a specific signature - customize per kernel)
        # For now, we support the legacy_still and cl_gen_still signatures
        try:
            if kernel_name == "legacy_still":
                prg.legacy_still(
                    queue,
                    (dispatch.globalSize[0], dispatch.globalSize[1]),
                    local_size,
                    output_buf,
                    np.int32(dispatch.globalSize[0]),
                    np.int32(dispatch.globalSize[1]),
                    np.float32(constants.get("seed", 1.0) if constants else 1.0),
                )
            elif kernel_name == "cl_gen_still":
                # Pack scene data for cl_gen_still
                scene_data = constants.get("scene_data", []) if constants else []
                scene_np = np.asarray(scene_data, dtype=np.float32)
                cl_scene = cl.Buffer(
                    ctx,
                    cl.mem_flags.READ_ONLY | cl.mem_flags.COPY_HOST_PTR,
                    hostbuf=scene_np,
                )
                prg.cl_gen_still(
                    queue,
                    (dispatch.globalSize[0], dispatch.globalSize[1]),
                    local_size,
                    output_buf,
                    cl_scene,
                    np.int32(dispatch.globalSize[0]),
                    np.int32(dispatch.globalSize[1]),
                    np.float32(constants.get("seed", 1.0) if constants else 1.0),
                )
            else:
                # Generic: assume (queue, global, local, output, *inputs)
                args = [queue, global_size, local_size, output_buf] + cl_buffers
                kernel_func(*args)
        except Exception as e:
            raise RuntimeError(f"Kernel execution failed: {e}") from e

        # Copy result
        output_arr = np.zeros(output_shape, dtype=np.uint8)
        cl.enqueue_copy(queue, output_arr, output_buf)
        queue.finish()

        elapsed_ms = (time.perf_counter() - start_time) * 1000.0

        # Compute hashes and summaries
        output_hash = self._hash_array(output_arr)
        pixel_hash = self._hash_array(output_arr)
        numerical = self._compute_numerical_summary(output_arr.astype(np.float32))

        # Build identities
        kernel_hash = self._hash_sha256(kernel_source)
        math_ir_hash = kernel_hash  # For OpenCL, IR = source

        job_identity = JobIdentity(
            kernelIdentity=KernelIdentity(
                name=kernel_name,
                version=kernel_version,
                hash=kernel_hash,
                source="opencl",
            ),
            mathIR=MathIR(
                format="opencl-c",
                content=kernel_source,
                hash=math_ir_hash,
            ),
            inputs=[
                InputSpec(
                    name=f"input_{i}",
                    type="buffer",
                    shape=list(arr.shape),
                    dtype=str(arr.dtype),
                    hash=h,
                )
                for i, (arr, h) in enumerate(zip(inputs, input_hashes))
            ],
            constants=constants or {},
        )

        execution_identity = ExecutionIdentity(
            backend="opencl",
            device=self._get_device_info(device),
            driver=device.version,
            precision="fp32",
            dispatch=dispatch,
            timestamp=datetime.now(timezone.utc).replace(microsecond=0).isoformat(),
            elapsedMs=elapsed_ms,
        )

        result_identity = ResultIdentity(
            outputHash=self._hash_sha256(output_arr.tobytes()),
            pixelHash=self._hash_sha256(output_arr.tobytes()),
            numericalSummary=NumericalSummary(**numerical),
            provenance=Provenance(
                intentId=constants.get("intentId", f"intent.{kernel_name}.{int(time.time())}") if constants else f"intent.{kernel_name}.{int(time.time())}",
                worldId=constants.get("worldId", "world.unknown") if constants else "world.unknown",
                timelineId=constants.get("timelineId", "timeline.unknown") if constants else "timeline.unknown",
                kernelHash=kernel_hash,
                constitutional=False,
            ),
        )

        return AxiomXResult(
            jobIdentity=job_identity,
            executionIdentity=execution_identity,
            resultIdentity=result_identity,
            rawOutput=output_arr,
        )

    def execute_opencl_autotuned(
        self,
        kernel_name: str,
        kernel_version: str,
        kernel_source: str,
        inputs: List[np.ndarray],
        dispatch: DispatchConfig,
        constants: Optional[Dict[str, Any]] = None,
        prefer_device: Optional[str] = None,
        output_shape: Optional[Tuple[int, int]] = None,
    ) -> AxiomXResult:
        """Execute OpenCL kernel with workgroup autotuning."""
        start_time = time.perf_counter()

        # Initialize OpenCL with profiling for benchmarking
        ctx, queue, device = self._init_opencl(prefer_device, profiling=True)

        # Build program
        prg = cl.Program(ctx, kernel_source).build()
        kernel = cl.Kernel(prg, kernel_name)

        # Prepare inputs
        cl_buffers = []
        input_hashes = []
        for i, inp in enumerate(inputs):
            if not isinstance(inp, np.ndarray):
                inp = np.asarray(inp)
            cl_buf = cl.Buffer(
                ctx,
                cl.mem_flags.READ_ONLY | cl.mem_flags.COPY_HOST_PTR,
                hostbuf=inp,
            )
            cl_buffers.append(cl_buf)
            input_hashes.append(self._hash_array(inp))

        # Prepare output buffer
        if output_shape is None:
            h, w = dispatch.globalSize[1], dispatch.globalSize[0]
            output_shape = (h, w, 4)  # RGBA

        output_arr = np.zeros(output_shape, dtype=np.uint8)
        output_buf = cl.Buffer(ctx, cl.mem_flags.WRITE_ONLY, output_arr.nbytes)

        # Prepare kernel arguments for benchmarking
        # We need to match the kernel signature for the benchmark function
        # For legacy_still: (output_buf, width, height, seed)
        # For cl_gen_still: (output_buf, scene_buf, width, height, seed)
        kernel_args = []
        local_size_arg_index = -1

        if kernel_name == "legacy_still":
            kernel_args = [
                output_buf,
                np.int32(dispatch.globalSize[0]),
                np.int32(dispatch.globalSize[1]),
                np.float32(constants.get("seed", 1.0) if constants else 1.0),
            ]
        elif kernel_name == "cl_gen_still":
            scene_data = constants.get("scene_data", []) if constants else []
            scene_np = np.asarray(scene_data, dtype=np.float32)
            cl_scene = cl.Buffer(
                ctx,
                cl.mem_flags.READ_ONLY | cl.mem_flags.COPY_HOST_PTR,
                hostbuf=scene_np,
            )
            kernel_args = [
                output_buf,
                cl_scene,
                np.int32(dispatch.globalSize[0]),
                np.int32(dispatch.globalSize[1]),
                np.float32(constants.get("seed", 1.0) if constants else 1.0),
            ]
        else:
            # Generic: output_buf + inputs
            kernel_args = [output_buf] + cl_buffers

        # Initialize tuner if needed
        if self._tuner is None:
            self._tuner = WorkgroupTuner(
                cache=self._autotune_cache,
                benchmark_config=self._benchmark_config,
                selection_policy=self._selection_policy,
                prefer_device=prefer_device,
            )
            # Share the initialized context
            self._tuner._cl_context = ctx
            self._tuner._cl_queue = queue
            self._tuner._device = device
            self._tuner._kernel = kernel
            self._tuner._kernel_source = kernel_source
            self._tuner._kernel_name = kernel_name
            self._tuner._kernel_build_options = ""

        # Run tuning
        evidence = self._tuner.tune(
            kernel_name=kernel_name,
            kernel_version=kernel_version,
            kernel_source=kernel_source,
            kernel_build_options="",
            global_size=list(dispatch.globalSize[:dispatch.workDimensions]),
            work_dimensions=dispatch.workDimensions,
            output_buf=output_buf,
            kernel_args=kernel_args,
            precision="fp32",
            algorithm_variant=kernel_name,
            local_mem_usage=0,
            local_size_arg_index=local_size_arg_index,
        )

        # Execute with optimal workgroup
        optimal_wg = evidence.selected_workgroup
        global_size = tuple(dispatch.globalSize[:dispatch.workDimensions])
        local_size = tuple(optimal_wg[:dispatch.workDimensions])

        # Re-set kernel arguments for final execution
        for i, arg in enumerate(kernel_args):
            kernel.set_arg(i, arg)

        # Execute
        try:
            evt = kernel.enqueue_nd_range(queue, global_size, local_size)
            evt.wait()
        except Exception as e:
            raise RuntimeError(f"Autotuned kernel execution failed: {e}") from e

        # Copy result
        output_arr = np.zeros(output_shape, dtype=np.uint8)
        cl.enqueue_copy(queue, output_arr, output_buf)
        queue.finish()

        elapsed_ms = (time.perf_counter() - start_time) * 1000.0

        # Compute hashes and summaries
        output_hash = self._hash_array(output_arr)
        pixel_hash = self._hash_array(output_arr)
        numerical = self._compute_numerical_summary(output_arr.astype(np.float32))

        # Build identities with autotune info in dispatch
        autotune_dispatch = DispatchConfig(
            globalSize=dispatch.globalSize,
            localSize=list(optimal_wg) + [1] * (3 - len(optimal_wg)),
            workDimensions=dispatch.workDimensions,
        )

        kernel_hash = self._hash_sha256(kernel_source)
        math_ir_hash = kernel_hash

        job_identity = JobIdentity(
            kernelIdentity=KernelIdentity(
                name=kernel_name,
                version=kernel_version,
                hash=kernel_hash,
                source="opencl",
            ),
            mathIR=MathIR(
                format="opencl-c",
                content=kernel_source,
                hash=math_ir_hash,
            ),
            inputs=[
                InputSpec(
                    name=f"input_{i}",
                    type="buffer",
                    shape=list(arr.shape),
                    dtype=str(arr.dtype),
                    hash=h,
                )
                for i, (arr, h) in enumerate(zip(inputs, input_hashes))
            ],
            constants={**(constants or {}), "autotune_evidence": evidence.tuning_key.cache_key()},
        )

        execution_identity = ExecutionIdentity(
            backend="opencl",
            device=self._get_device_info(device),
            driver=device.version,
            precision="fp32",
            dispatch=autotune_dispatch,
            timestamp=datetime.now(timezone.utc).replace(microsecond=0).isoformat(),
            elapsedMs=elapsed_ms,
        )

        result_identity = ResultIdentity(
            outputHash=self._hash_sha256(output_arr.tobytes()),
            pixelHash=self._hash_sha256(output_arr.tobytes()),
            numericalSummary=NumericalSummary(**numerical),
            provenance=Provenance(
                intentId=constants.get("intentId", f"intent.{kernel_name}.{int(time.time())}") if constants else f"intent.{kernel_name}.{int(time.time())}",
                worldId=constants.get("worldId", "world.unknown") if constants else "world.unknown",
                timelineId=constants.get("timelineId", "timeline.unknown") if constants else "timeline.unknown",
                kernelHash=kernel_hash,
                constitutional=False,
            ),
        )

        return AxiomXResult(
            jobIdentity=job_identity,
            executionIdentity=execution_identity,
            resultIdentity=result_identity,
            rawOutput=output_arr,
        )

    def execute_opencl_with_memory_tuning(
        self,
        kernel_name: str,
        kernel_version: str,
        kernel_source: str,
        inputs: List[np.ndarray],
        dispatch: DispatchConfig,
        constants: Optional[Dict[str, Any]] = None,
        prefer_device: Optional[str] = None,
        output_shape: Optional[Tuple[int, int]] = None,
    ) -> AxiomXResult:
        """Execute OpenCL kernel with joint workgroup + memory hierarchy autotuning."""
        start_time = time.perf_counter()

        # Initialize OpenCL with profiling for benchmarking
        ctx, queue, device = self._init_opencl(prefer_device, profiling=True)

        # Build program
        prg = cl.Program(ctx, kernel_source).build()
        kernel = cl.Kernel(prg, kernel_name)

        # Prepare inputs
        cl_buffers = []
        input_hashes = []
        host_data = {}
        for i, inp in enumerate(inputs):
            if not isinstance(inp, np.ndarray):
                inp = np.asarray(inp)
            cl_buf = cl.Buffer(
                ctx,
                cl.mem_flags.READ_ONLY | cl.mem_flags.COPY_HOST_PTR,
                hostbuf=inp,
            )
            cl_buffers.append(cl_buf)
            input_hashes.append(self._hash_array(inp))
            host_data[f"input_{i}"] = inp

        # Prepare output buffer
        if output_shape is None:
            h, w = dispatch.globalSize[1], dispatch.globalSize[0]
            output_shape = (h, w, 4)  # RGBA

        output_arr = np.zeros(output_shape, dtype=np.uint8)
        output_buf = cl.Buffer(ctx, cl.mem_flags.WRITE_ONLY, output_arr.nbytes)
        host_data["output"] = output_arr

        # Prepare kernel arguments function for memory tuner
        def kernel_args_fn(buffers: Dict[str, cl.Buffer]) -> List[Any]:
            # This would need to be customized per kernel
            # For now, use a generic approach
            args = [output_buf] + cl_buffers
            return args

        # Initialize memory tuner if needed
        if not hasattr(self, '_memory_tuner') or self._memory_tuner is None:
            from .memory_tuner import MemoryTuner
            self._memory_tuner = MemoryTuner(
                cache=self._autotune_cache,
                benchmark_config=self._benchmark_config,
                selection_policy="JOINT_MIN_TOTAL_TIME",
                prefer_device=prefer_device,
            )
            self._memory_tuner._cl_context = ctx
            self._memory_tuner._cl_queue = queue
            self._memory_tuner._device = device

        # Run memory hierarchy tuning
        from .memory_hierarchy import BufferSpec, MemorySpace
        evidence = self._memory_tuner.tune(
            kernel_name=kernel_name,
            kernel_version=kernel_version,
            kernel_source=kernel_source,
            kernel_build_options="",
            global_size=list(dispatch.globalSize[:dispatch.workDimensions]),
            work_dimensions=dispatch.workDimensions,
            host_data=host_data,
            kernel_args_fn=kernel_args_fn,
            output_buf_spec=BufferSpec(name="output", size_bytes=output_arr.nbytes, memory_space=MemorySpace.GLOBAL),
            precision="fp32",
            algorithm_variant=kernel_name,
        )

        # Execute with optimal workgroup and memory config
        optimal_wg = evidence.selected_workgroup
        optimal_mem_config = evidence.selected_memory_config
        global_size = tuple(dispatch.globalSize[:dispatch.workDimensions])
        local_size = tuple(optimal_wg[:dispatch.workDimensions])

        # Re-set kernel arguments for final execution
        kernel_args = kernel_args_fn({})
        for i, arg in enumerate(kernel_args):
            kernel.set_arg(i, arg)

        # Execute
        try:
            evt = kernel.enqueue_nd_range(queue, global_size, local_size)
            evt.wait()
        except Exception as e:
            raise RuntimeError(f"Memory-tuned kernel execution failed: {e}") from e

        # Copy result
        output_arr = np.zeros(output_shape, dtype=np.uint8)
        cl.enqueue_copy(queue, output_arr, output_buf)
        queue.finish()

        elapsed_ms = (time.perf_counter() - start_time) * 1000.0

        # Compute hashes and summaries
        output_hash = self._hash_array(output_arr)
        pixel_hash = self._hash_array(output_arr)
        numerical = self._compute_numerical_summary(output_arr.astype(np.float32))

        # Build identities with autotune info in dispatch
        autotune_dispatch = DispatchConfig(
            globalSize=dispatch.globalSize,
            localSize=list(optimal_wg) + [1] * (3 - len(optimal_wg)),
            workDimensions=dispatch.workDimensions,
        )

        kernel_hash = self._hash_sha256(kernel_source)
        math_ir_hash = kernel_hash

        job_identity = JobIdentity(
            kernelIdentity=KernelIdentity(
                name=kernel_name,
                version=kernel_version,
                hash=kernel_hash,
                source="opencl",
            ),
            mathIR=MathIR(
                format="opencl-c",
                content=kernel_source,
                hash=math_ir_hash,
            ),
            inputs=[
                InputSpec(
                    name=f"input_{i}",
                    type="buffer",
                    shape=list(arr.shape),
                    dtype=str(arr.dtype),
                    hash=h,
                )
                for i, (arr, h) in enumerate(zip(inputs, input_hashes))
            ],
            constants={**(constants or {}), "memory_tune_evidence": evidence.tuning_key.cache_key()},
        )

        execution_identity = ExecutionIdentity(
            backend="opencl",
            device=self._get_device_info(device),
            driver=device.version,
            precision="fp32",
            dispatch=autotune_dispatch,
            timestamp=datetime.now(timezone.utc).replace(microsecond=0).isoformat(),
            elapsedMs=elapsed_ms,
        )

        result_identity = ResultIdentity(
            outputHash=self._hash_sha256(output_arr.tobytes()),
            pixelHash=self._hash_sha256(output_arr.tobytes()),
            numericalSummary=NumericalSummary(**numerical),
            provenance=Provenance(
                intentId=constants.get("intentId", f"intent.{kernel_name}.{int(time.time())}") if constants else f"intent.{kernel_name}.{int(time.time())}",
                worldId=constants.get("worldId", "world.unknown") if constants else "world.unknown",
                timelineId=constants.get("timelineId", "timeline.unknown") if constants else "timeline.unknown",
                kernelHash=kernel_hash,
                constitutional=False,
            ),
        )

        return AxiomXResult(
            jobIdentity=job_identity,
            executionIdentity=execution_identity,
            resultIdentity=result_identity,
            rawOutput=output_arr,
        )

    def execute_opencl_with_fusion(
        self,
        kernels: List["KernelSpec"],
        host_data: Dict[str, np.ndarray],
        kernel_args_fns: List[Callable[[Dict[str, cl.Buffer]], List[Any]]],
        global_size: List[int],
        work_dimensions: int,
        constants: Optional[Dict[str, Any]] = None,
        prefer_device: Optional[str] = None,
        output_shape: Optional[Tuple[int, int]] = None,
    ) -> AxiomXResult:
        """Execute multiple kernels with kernel fusion autotuning."""
        from .fusion_tuner import FusionTuner
        from .kernel_fusion import KernelSpec

        start_time = time.perf_counter()

        # Initialize OpenCL with profiling
        ctx, queue, device = self._init_opencl(prefer_device, profiling=True)

        # Build tuning key for the kernel sequence
        combined_source = "\n".join(k.source for k in kernels)
        kernel_hash = self._hash_sha256(combined_source)

        # Prepare output buffer
        if output_shape is None:
            h, w = global_size[1], global_size[0]
            output_shape = (h, w, 4)

        output_arr = np.zeros(output_shape, dtype=np.uint8)
        output_buf = cl.Buffer(ctx, cl.mem_flags.WRITE_ONLY, output_arr.nbytes)

        # Prepare host data with output
        full_host_data = {**host_data, "output": output_arr}

        # Initialize fusion tuner
        if not hasattr(self, '_fusion_tuner') or self._fusion_tuner is None:
            self._fusion_tuner = FusionTuner(
                cache=self._autotune_cache,
                benchmark_config=self._benchmark_config,
                selection_policy=self._selection_policy,
                prefer_device=prefer_device,
            )
            self._fusion_tuner._cl_context = ctx
            self._fusion_tuner._cl_queue = queue
            self._fusion_tuner._device = device

        # Run fusion tuning
        evidence = self._fusion_tuner.tune(
            kernels=kernels,
            host_data=full_host_data,
            kernel_args_fns=kernel_args_fns,
            global_size=global_size,
            work_dimensions=work_dimensions,
            precision="fp32",
        )

        if not evidence.selected_fused_spec or not evidence.selected_workgroup:
            # No beneficial fusion found - fall back to separate execution
            print("  [fusion] No beneficial fusion, executing separately")
            return self._execute_separate_kernels(
                kernels, host_data, kernel_args_fns, global_size, work_dimensions,
                constants, prefer_device, output_shape
            )

        # Execute fused kernel
        fused_spec = evidence.selected_fused_spec
        optimal_wg = evidence.selected_workgroup

        prg = cl.Program(ctx, fused_spec.fused_source).build()
        kernel = cl.Kernel(prg, fused_spec.candidate.fused_name)

        global_size_tuple = tuple(global_size[:work_dimensions])
        local_size_tuple = tuple(optimal_wg[:work_dimensions])

        # Create buffers
        cl_buffers = {}
        for name, arr in full_host_data.items():
            buf = cl.Buffer(ctx, cl.mem_flags.READ_WRITE | cl.mem_flags.COPY_HOST_PTR, hostbuf=arr)
            cl_buffers[name] = buf

        # Get kernel args for fused kernel
        fused_args = kernel_args_fns[0](cl_buffers)  # Use first kernel's arg fn

        for i, arg in enumerate(fused_args):
            kernel.set_arg(i, arg)

        try:
            evt = kernel.enqueue_nd_range(queue, global_size_tuple, local_size_tuple)
            evt.wait()
        except Exception as e:
            raise RuntimeError(f"Fused kernel execution failed: {e}") from e

        # Copy result
        output_arr = np.zeros(output_shape, dtype=np.uint8)
        cl.enqueue_copy(queue, output_arr, output_buf)
        queue.finish()

        elapsed_ms = (time.perf_counter() - start_time) * 1000.0

        # Build result
        output_hash = self._hash_array(output_arr)
        numerical = self._compute_numerical_summary(output_arr.astype(np.float32))

        autotune_dispatch = DispatchConfig(
            globalSize=global_size,
            localSize=list(optimal_wg) + [1] * (3 - len(optimal_wg)),
            workDimensions=work_dimensions,
        )

        job_identity = JobIdentity(
            kernelIdentity=KernelIdentity(
                name=evidence.selected_fusion.fused_name,
                version="1.0.0",
                hash=kernel_hash,
                source="opencl",
            ),
            mathIR=MathIR(
                format="opencl-c",
                content=fused_spec.fused_source,
                hash=kernel_hash,
            ),
            inputs=[
                InputSpec(
                    name=f"input_{i}",
                    type="buffer",
                    shape=list(arr.shape),
                    dtype=str(arr.dtype),
                    hash=self._hash_array(arr),
                )
                for i, arr in enumerate(host_data.values())
            ],
            constants={**(constants or {}), "fusion_tune_evidence": evidence.tuning_key.cache_key()},
        )

        execution_identity = ExecutionIdentity(
            backend="opencl",
            device=self._get_device_info(device),
            driver=device.version,
            precision="fp32",
            dispatch=autotune_dispatch,
            timestamp=datetime.now(timezone.utc).replace(microsecond=0).isoformat(),
            elapsedMs=elapsed_ms,
        )

        result_identity = ResultIdentity(
            outputHash=self._hash_sha256(output_arr.tobytes()),
            pixelHash=self._hash_sha256(output_arr.tobytes()),
            numericalSummary=NumericalSummary(**numerical),
            provenance=Provenance(
                intentId=constants.get("intentId", f"intent.fused.{int(time.time())}") if constants else f"intent.fused.{int(time.time())}",
                worldId=constants.get("worldId", "world.unknown") if constants else "world.unknown",
                timelineId=constants.get("timelineId", "timeline.unknown") if constants else "timeline.unknown",
                kernelHash=kernel_hash,
                constitutional=False,
            ),
        )

        return AxiomXResult(
            jobIdentity=job_identity,
            executionIdentity=execution_identity,
            resultIdentity=result_identity,
            rawOutput=output_arr,
        )

    def _execute_separate_kernels(
        self,
        kernels: List["KernelSpec"],
        host_data: Dict[str, np.ndarray],
        kernel_args_fns: List[Callable[[Dict[str, cl.Buffer]], List[Any]]],
        global_size: List[int],
        work_dimensions: int,
        constants: Optional[Dict[str, Any]] = None,
        prefer_device: Optional[str] = None,
        output_shape: Optional[Tuple[int, int]] = None,
    ) -> AxiomXResult:
        """Fallback: execute kernels separately without fusion."""
        # This would execute each kernel in sequence
        # Simplified for now - just run the first kernel
        return self.execute_opencl(
            kernel_name=kernels[0].name,
            kernel_version="1.0.0",
            kernel_source=kernels[0].source,
            inputs=list(host_data.values()),
            dispatch=DispatchConfig(
                globalSize=global_size,
                localSize=[64] * work_dimensions,
                workDimensions=work_dimensions,
            ),
            constants=constants,
            prefer_device=prefer_device,
            output_shape=output_shape,
        )

    def save_result(self, result: AxiomXResult, out_dir: Path) -> Path:
        """Save result artifacts to directory."""
        out_dir.mkdir(parents=True, exist_ok=True)

        # Save output image
        if result.rawOutput is not None:
            img_path = out_dir / "output.png"
            Image.fromarray(result.rawOutput, mode="RGBA").save(img_path)
            result.outputPath = str(img_path)

        # Save manifest
        manifest = {
            "manifestVersion": "1.0.0",
            "jobIdentity": asdict(result.jobIdentity),
            "executionIdentity": asdict(result.executionIdentity),
            "resultIdentity": asdict(result.resultIdentity),
        }
        manifest_path = out_dir / "manifest.json"
        manifest_path.write_text(json.dumps(manifest, indent=2))

        return manifest_path

    def shutdown(self) -> None:
        """Release OpenCL resources."""
        if self._cl_queue:
            self._cl_queue.finish()
        # PyOpenCL contexts and queues are automatically cleaned up when references are dropped
        self._cl_queue = None
        self._cl_context = None
        self._device = None


# Convenience function for legacy-efficient kernel
def run_legacy_efficient(
    width: int = 256,
    height: int = 256,
    seed: float = 1.0,
    out_dir: Optional[Path] = None,
    autotune: bool = False,
    autotune_cache_dir: Optional[Path] = None,
) -> AxiomXResult:
    """Run the legacy-efficient kernel via AxiomXRuntime."""
    from scripts.legacy_efficient.opencl_tonga_still import KERNEL as LEGACY_KERNEL

    runtime = AxiomXRuntime(autotune_cache_dir=autotune_cache_dir)
    dispatch = DispatchConfig(
        globalSize=[width, height],
        localSize=[16, 16],
        workDimensions=2,
    )

    result = runtime.execute_opencl(
        kernel_name="legacy_still",
        kernel_version="1.0.0",
        kernel_source=LEGACY_KERNEL,
        inputs=[],  # No input buffers
        dispatch=dispatch,
        constants={"seed": seed, "intentId": f"intent.legacy_efficient.{int(time.time())}"},
        prefer_device="Ellesmere",
        autotune=autotune,
    )

    if out_dir:
        runtime.save_result(result, out_dir)

    return result