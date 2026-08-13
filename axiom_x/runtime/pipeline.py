"""Axiom-X Pipeline — GPU compute ↔ DMA transfer ↔ CPU prep with double/triple buffering.

STATUS: **partial** — OpenCL backend with async copy; declared for CUDA/HIP/Vulkan.

Implements asynchronous pipelining to overlap:
  - GPU kernel execution
  - Host-device memory transfers (DMA)
  - CPU preparation for next frame
"""

from __future__ import annotations

import threading
import time
from collections import deque
from dataclasses import dataclass, field
from enum import Enum
from pathlib import Path
from typing import Any, Callable, Deque, Dict, List, Optional, Tuple
from concurrent.futures import ThreadPoolExecutor, Future

import numpy as np
import pyopencl as cl

from .axiom_x_runtime import AxiomXResult, DispatchConfig
from .tuning_key import TuningKey
from .tuning_cache import TuningCache


class PipelineStage(Enum):
    """Pipeline stages."""
    CPU_PREP = "cpu_prep"       # CPU prepares data for next frame
    HOST_TO_DEVICE = "h2d"      # DMA transfer: host -> device
    GPU_COMPUTE = "gpu_compute" # GPU kernel execution
    DEVICE_TO_HOST = "d2h"      # DMA transfer: device -> host
    CPU_POST = "cpu_post"       # CPU processes results


@dataclass
class PipelineBuffer:
    """A buffer slot in the pipeline (double/triple buffering)."""
    index: int
    # Host-side buffers
    host_input: Optional[np.ndarray] = None
    host_output: Optional[np.ndarray] = None
    # Device-side buffers
    dev_input: Optional[cl.Buffer] = None
    dev_output: Optional[cl.Buffer] = None
    # Synchronization
    h2d_event: Optional[cl.Event] = None
    compute_event: Optional[cl.Event] = None
    d2h_event: Optional[cl.Event] = None
    # State
    in_use: bool = False
    frame_id: int = -1


@dataclass
class PipelineConfig:
    """Pipeline configuration."""
    num_buffers: int = 3                    # 2 = double, 3 = triple buffering
    max_frames_in_flight: int = 3
    # Async copy options
    use_async_copy: bool = True
    pinned_host_memory: bool = True
    # CPU prep/post callbacks
    cpu_prep_fn: Optional[Callable[[int, np.ndarray], None]] = None
    cpu_post_fn: Optional[Callable[[int, np.ndarray], AxiomXResult]] = None
    # Timing
    target_frame_time_ms: float = 16.67     # 60 FPS target
    # Monitoring
    enable_profiling: bool = True


@dataclass
class PipelineFrame:
    """A frame in the pipeline."""
    frame_id: int
    buffer_index: int
    stage: PipelineStage
    submit_time: float
    start_time: float = 0.0
    end_time: float = 0.0
    events: Dict[str, cl.Event] = field(default_factory=dict)
    result: Optional[AxiomXResult] = None
    error: Optional[str] = None


class AsyncPipeline:
    """Asynchronous compute pipeline with double/triple buffering."""

    def __init__(
        self,
        ctx: cl.Context,
        queue: cl.CommandQueue,
        device: cl.Device,
        kernel_name: str,
        kernel_source: str,
        global_size: Tuple[int, ...],
        local_size: Tuple[int, ...],
        input_shape: Tuple[int, ...],
        output_shape: Tuple[int, ...],
        input_dtype: np.dtype,
        output_dtype: np.dtype,
        config: PipelineConfig,
        cache: Optional[TuningCache] = None,
    ):
        self.ctx = ctx
        self.queue = queue
        self.device = device
        self.kernel_name = kernel_name
        self.kernel_source = kernel_source
        self.global_size = global_size
        self.local_size = local_size
        self.input_shape = input_shape
        self.output_shape = output_shape
        self.input_dtype = input_dtype
        self.output_dtype = output_dtype
        self.config = config
        self.cache = cache

        # Validate buffer count
        if config.num_buffers < 2:
            raise ValueError("num_buffers must be >= 2 (double buffering minimum)")
        if config.num_buffers > 4:
            raise ValueError("num_buffers > 4 not supported")

        # Build program
        self.program = cl.Program(ctx, kernel_source).build()
        self.kernel = cl.Kernel(self.program, kernel_name)

        # Create pipeline buffers
        self.buffers: List[PipelineBuffer] = []
        self._create_pipeline_buffers()

        # Pipeline state
        self.frame_counter = 0
        self.frames_in_flight: Dict[int, PipelineFrame] = {}
        self.completed_frames: Deque[PipelineFrame] = deque(maxlen=100)
        self._lock = threading.Lock()

        # Thread pool for CPU prep/post
        self.executor = ThreadPoolExecutor(max_workers=2)
        self.cpu_futures: Dict[int, Future] = {}

        # Profiling
        self.stage_times: Dict[PipelineStage, List[float]] = {
            stage: [] for stage in PipelineStage
        }

    def _create_pipeline_buffers(self) -> None:
        """Create host and device buffers for pipeline."""
        input_bytes = np.prod(self.input_shape) * np.dtype(self.input_dtype).itemsize
        output_bytes = np.prod(self.output_shape) * np.dtype(self.output_dtype).itemsize

        flags = cl.mem_flags.READ_WRITE
        if self.config.pinned_host_memory:
            flags |= cl.mem_flags.ALLOC_HOST_PTR

        for i in range(self.config.num_buffers):
            # Host buffers (pinned if enabled)
            if self.config.pinned_host_memory:
                host_input = cl.enqueue_map_buffer(
                    self.queue,
                    cl.Buffer(self.ctx, cl.mem_flags.READ_ONLY | cl.mem_flags.ALLOC_HOST_PTR, input_bytes),
                    cl.map_flags.WRITE, 0, self.input_shape, self.input_dtype
                )[0]
                host_output = cl.enqueue_map_buffer(
                    self.queue,
                    cl.Buffer(self.ctx, cl.mem_flags.WRITE_ONLY | cl.mem_flags.ALLOC_HOST_PTR, output_bytes),
                    cl.map_flags.READ, 0, self.output_shape, self.output_dtype
                )[0]
            else:
                host_input = np.zeros(self.input_shape, dtype=self.input_dtype)
                host_output = np.zeros(self.output_shape, dtype=self.output_dtype)

            # Device buffers
            dev_input = cl.Buffer(self.ctx, cl.mem_flags.READ_ONLY, input_bytes)
            dev_output = cl.Buffer(self.ctx, cl.mem_flags.WRITE_ONLY, output_bytes)

            self.buffers.append(PipelineBuffer(
                index=i,
                host_input=host_input,
                host_output=host_output,
                dev_input=dev_input,
                dev_output=dev_output,
            ))

        self.queue.finish()

    def _get_free_buffer(self) -> Optional[PipelineBuffer]:
        """Get a free buffer slot."""
        for buf in self.buffers:
            if not buf.in_use:
                return buf
        return None

    def submit_frame(self, frame_id: int, input_data: np.ndarray) -> bool:
        """Submit a new frame to the pipeline."""
        # Get free buffer
        buf = self._get_free_buffer()
        if buf is None:
            return False  # Pipeline full

        buf.in_use = True
        buf.frame_id = frame_id

        # Copy input to host buffer
        np.copyto(buf.host_input, input_data)

        # Create frame record
        frame = PipelineFrame(
            frame_id=frame_id,
            buffer_index=buf.index,
            stage=PipelineStage.CPU_PREP,
            submit_time=time.perf_counter(),
        )
        self.frames_in_flight[frame_id] = frame

        # Start async pipeline
        self._process_frame(frame, buf)

        return True

    def _process_frame(self, frame: PipelineFrame, buf: PipelineBuffer) -> None:
        """Process a frame through the pipeline stages."""
        try:
            # Stage 1: CPU Prep (if callback provided)
            if self.config.cpu_prep_fn:
                frame.stage = PipelineStage.CPU_PREP
                frame.start_time = time.perf_counter()
                future = self.executor.submit(self.config.cpu_prep_fn, frame.frame_id, buf.host_input)
                self.cpu_futures[frame.frame_id] = future
                # Continue to H2D after CPU prep completes
                future.add_done_callback(lambda f: self._stage_h2d(frame, buf))
            else:
                self._stage_h2d(frame, buf)

        except Exception as e:
            frame.error = str(e)
            self._complete_frame(frame, buf)

    def _stage_h2d(self, frame: PipelineFrame, buf: PipelineBuffer) -> None:
        """Stage 2: Host to Device transfer."""
        try:
            frame.stage = PipelineStage.HOST_TO_DEVICE
            frame.start_time = time.perf_counter()

            if self.config.use_async_copy:
                buf.h2d_event = cl.enqueue_copy(
                    self.queue, buf.dev_input, buf.host_input, is_blocking=False
                )
                # Chain to compute when H2D completes
                buf.h2d_event.set_callback(cl.command_execution_status.COMPLETE,
                    lambda evt, status: self._stage_compute(frame, buf))
            else:
                cl.enqueue_copy(self.queue, buf.dev_input, buf.host_input)
                self.queue.finish()
                self._stage_compute(frame, buf)

        except Exception as e:
            frame.error = f"H2D: {e}"
            self._complete_frame(frame, buf)

    def _stage_compute(self, frame: PipelineFrame, buf: PipelineBuffer) -> None:
        """Stage 3: GPU Compute."""
        try:
            frame.stage = PipelineStage.GPU_COMPUTE
            frame.start_time = time.perf_counter()

            # Set kernel arguments
            self.kernel.set_arg(0, buf.dev_output)
            self.kernel.set_arg(1, buf.dev_input)
            # Additional args would be set here based on kernel signature

            if self.config.enable_profiling:
                buf.compute_event = self.kernel.enqueue_nd_range(
                    self.queue, self.global_size, self.local_size
                )
                buf.compute_event.set_callback(cl.command_execution_status.COMPLETE,
                    lambda evt, status: self._stage_d2h(frame, buf))
            else:
                evt = self.kernel.enqueue_nd_range(self.queue, self.global_size, self.local_size)
                evt.wait()
                self._stage_d2h(frame, buf)

        except Exception as e:
            frame.error = f"Compute: {e}"
            self._complete_frame(frame, buf)

    def _stage_d2h(self, frame: PipelineFrame, buf: PipelineBuffer) -> None:
        """Stage 4: Device to Host transfer."""
        try:
            frame.stage = PipelineStage.DEVICE_TO_HOST
            frame.start_time = time.perf_counter()

            if self.config.use_async_copy:
                buf.d2h_event = cl.enqueue_copy(
                    self.queue, buf.host_output, buf.dev_output, is_blocking=False
                )
                buf.d2h_event.set_callback(cl.command_execution_status.COMPLETE,
                    lambda evt, status: self._stage_cpu_post(frame, buf))
            else:
                cl.enqueue_copy(self.queue, buf.host_output, buf.dev_output)
                self.queue.finish()
                self._stage_cpu_post(frame, buf)

        except Exception as e:
            frame.error = f"D2H: {e}"
            self._complete_frame(frame, buf)

    def _stage_cpu_post(self, frame: PipelineFrame, buf: PipelineBuffer) -> None:
        """Stage 5: CPU Post-processing."""
        try:
            frame.stage = PipelineStage.CPU_POST
            frame.start_time = time.perf_counter()

            if self.config.cpu_post_fn:
                future = self.executor.submit(self.config.cpu_post_fn, frame.frame_id, buf.host_output)
                self.cpu_futures[frame.frame_id] = future
                future.add_done_callback(lambda f: self._finalize_frame(frame, buf, f))
            else:
                self._finalize_frame(frame, buf, None)

        except Exception as e:
            frame.error = f"CPU Post: {e}"
            self._complete_frame(frame, buf)

    def _finalize_frame(self, frame: PipelineFrame, buf: PipelineBuffer, future: Optional[Future]) -> None:
        """Finalize frame after CPU post."""
        if future and future.exception():
            frame.error = f"CPU Post: {future.exception()}"
        elif future:
            frame.result = future.result()

        frame.end_time = time.perf_counter()
        self._complete_frame(frame, buf)

    def _complete_frame(self, frame: PipelineFrame, buf: PipelineBuffer) -> None:
        """Mark frame complete and release buffer."""
        with self._lock:
            frame.end_time = time.perf_counter()
            self.completed_frames.append(frame)
            del self.frames_in_flight[frame.frame_id]
            if frame.frame_id in self.cpu_futures:
                del self.cpu_futures[frame.frame_id]

            # Release buffer
            buf.in_use = False
            buf.frame_id = -1
            buf.h2d_event = None
            buf.compute_event = None
            buf.d2h_event = None

    def get_completed_frame(self) -> Optional[PipelineFrame]:
        """Get next completed frame (blocking)."""
        while not self.completed_frames:
            time.sleep(0.001)  # 1ms poll
        return self.completed_frames.popleft()

    def get_completed_frame_nowait(self) -> Optional[PipelineFrame]:
        """Get next completed frame (non-blocking)."""
        if self.completed_frames:
            return self.completed_frames.popleft()
        return None

    def wait_for_frame(self, frame_id: int, timeout: float = 30.0) -> Optional[PipelineFrame]:
        """Wait for a specific frame to complete."""
        start = time.perf_counter()
        while time.perf_counter() - start < timeout:
            # Check completed frames
            for frame in list(self.completed_frames):
                if frame.frame_id == frame_id:
                    self.completed_frames.remove(frame)
                    return frame
            # Check in-flight
            if frame_id in self.frames_in_flight:
                time.sleep(0.001)
                continue
            return None
        return None

    def get_pipeline_stats(self) -> Dict[str, Any]:
        """Get pipeline performance statistics."""
        with self._lock:
            completed = list(self.completed_frames)
            if not completed:
                return {"frames_completed": 0}

            total_time = sum(f.end_time - f.submit_time for f in completed)
            avg_latency = total_time / len(completed)

            # Calculate throughput
            if len(completed) >= 2:
                time_span = completed[-1].end_time - completed[0].submit_time
                throughput = len(completed) / time_span if time_span > 0 else 0
            else:
                throughput = 0

            return {
                "frames_completed": len(completed),
                "avg_latency_ms": avg_latency * 1000,
                "throughput_fps": throughput,
                "frames_in_flight": len(self.frames_in_flight),
                "buffer_utilization": sum(1 for b in self.buffers if b.in_use) / len(self.buffers),
                "stage_times_ms": {
                    stage.value: (sum(times) / len(times) * 1000) if times else 0
                    for stage, times in self.stage_times.items()
                },
            }

    def shutdown(self) -> None:
        """Shutdown pipeline and release resources."""
        # Wait for all in-flight frames
        while self.frames_in_flight:
            time.sleep(0.01)

        self.executor.shutdown(wait=True)

        # Release buffers
        for buf in self.buffers:
            if buf.dev_input:
                buf.dev_input.release()
            if buf.dev_output:
                buf.dev_output.release()

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc_val, exc_tb):
        self.shutdown()


class PipelineBuilder:
    """Builder for creating configured pipelines."""

    def __init__(self, ctx: cl.Context, queue: cl.CommandQueue, device: cl.Device):
        self.ctx = ctx
        self.queue = queue
        self.device = device
        self._config = PipelineConfig()
        self._kernel_name = ""
        self._kernel_source = ""
        self._global_size = (256, 256)
        self._local_size = (16, 16)
        self._input_shape = (256, 256, 4)
        self._output_shape = (256, 256, 4)
        self._input_dtype = np.uint8
        self._output_dtype = np.uint8
        self._cache: Optional[TuningCache] = None

    def with_kernel(self, name: str, source: str) -> "PipelineBuilder":
        self._kernel_name = name
        self._kernel_source = source
        return self

    def with_work_size(self, global_size: Tuple[int, ...], local_size: Tuple[int, ...]) -> "PipelineBuilder":
        self._global_size = global_size
        self._local_size = local_size
        return self

    def with_shapes(
        self,
        input_shape: Tuple[int, ...],
        output_shape: Tuple[int, ...],
        input_dtype: np.dtype = np.uint8,
        output_dtype: np.dtype = np.uint8,
    ) -> "PipelineBuilder":
        self._input_shape = input_shape
        self._output_shape = output_shape
        self._input_dtype = input_dtype
        self._output_dtype = output_dtype
        return self

    def with_config(self, config: PipelineConfig) -> "PipelineBuilder":
        self._config = config
        return self

    def with_cache(self, cache: TuningCache) -> "PipelineBuilder":
        self._cache = cache
        return self

    def with_cpu_callbacks(
        self,
        prep_fn: Optional[Callable[[int, np.ndarray], None]] = None,
        post_fn: Optional[Callable[[int, np.ndarray], AxiomXResult]] = None,
    ) -> "PipelineBuilder":
        self._config.cpu_prep_fn = prep_fn
        self._config.cpu_post_fn = post_fn
        return self

    def with_buffering(self, num_buffers: int) -> "PipelineBuilder":
        self._config.num_buffers = num_buffers
        return self

    def build(self) -> AsyncPipeline:
        return AsyncPipeline(
            ctx=self.ctx,
            queue=self.queue,
            device=self.device,
            kernel_name=self._kernel_name,
            kernel_source=self._kernel_source,
            global_size=self._global_size,
            local_size=self._local_size,
            input_shape=self._input_shape,
            output_shape=self._output_shape,
            input_dtype=self._input_dtype,
            output_dtype=self._output_dtype,
            config=self._config,
            cache=self._cache,
        )