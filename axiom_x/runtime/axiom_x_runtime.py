"""Axiom-X Runtime — thin execution wrapper over GPU backends.

STATUS: **partial** — OpenCL backend operational on RX 580;
Vulkan/WGSL, CUDA, HIP, Metal, DX12 declared only.

Design:
  - Thin wrapper: IR -> backend -> dispatch -> result
  - No governance, no scene semantics, no policy
  - Returns AxiomXResult for convergence verification
  - Constitutional bridge handled by Sovereign-X bridge (separate module)
"""

from __future__ import annotations

import hashlib
import json
import os
import time
from dataclasses import dataclass, asdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple, Union

import numpy as np
import pyopencl as cl
from PIL import Image


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
    ):
        self.project_root = project_root or Path(__file__).resolve().parents[3]
        self.python_executable = python_executable
        self._cl_context: Optional[cl.Context] = None
        self._cl_queue: Optional[cl.CommandQueue] = None
        self._device: Optional[cl.Device] = None

    def _init_opencl(self, prefer_device: Optional[str] = None) -> Tuple[cl.Context, cl.CommandQueue, cl.Device]:
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
        queue = cl.CommandQueue(ctx)

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
    ) -> AxiomXResult:
        """Execute OpenCL kernel and return AxiomXResult."""
        start_time = time.perf_counter()

        # Initialize OpenCL
        ctx, queue, device = self._init_opencl(prefer_device)

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


# Convenience function for legacy-efficient kernel
def run_legacy_efficient(
    width: int = 256,
    height: int = 256,
    seed: float = 1.0,
    out_dir: Optional[Path] = None,
) -> AxiomXResult:
    """Run the legacy-efficient kernel via AxiomXRuntime."""
    from scripts.legacy_efficient.opencl_tonga_still import KERNEL as LEGACY_KERNEL

    runtime = AxiomXRuntime()
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
    )

    if out_dir:
        runtime.save_result(result, out_dir)

    return result