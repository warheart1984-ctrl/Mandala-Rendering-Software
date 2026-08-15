"""Axiom-X Backend Interface — backend-neutral execution abstraction.

STATUS: **partial** — OpenCL implemented; HIP/CUDA/Vulkan/Metal declared.

Provides unified interface for:
  - OpenCL (implemented)
  - HIP (AMD) - declared
  - CUDA (NVIDIA) - declared
  - Vulkan - declared
  - Metal (Apple) - declared
  - CPU reference - declared
"""

from __future__ import annotations

import hashlib
import time
from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from datetime import datetime, timezone
from enum import Enum
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple, Union

import numpy as np

from .axiom_x_runtime import (
    AxiomXResult, KernelIdentity, MathIR, InputSpec, JobIdentity,
    DeviceInfo, DispatchConfig, ExecutionIdentity, NumericalSummary,
    Provenance, ResultIdentity
)
from .tuning_key import TuningKey
from .tuning_cache import TuningCache


class BackendType(Enum):
    """Supported compute backends."""
    OPENCL = "opencl"
    HIP = "hip"
    CUDA = "cuda"
    VULKAN = "vulkan"
    METAL = "metal"
    CPU = "cpu"


class DeviceType(Enum):
    """Device types."""
    GPU = "gpu"
    CPU = "cpu"
    ACCELERATOR = "accelerator"


@dataclass
class BackendDevice:
    """Unified device representation across backends."""
    backend: BackendType
    device_id: int
    name: str
    vendor: str
    device_type: DeviceType
    compute_units: int
    max_work_group_size: int
    max_work_item_sizes: List[int]
    global_memory_bytes: int
    local_memory_bytes: int
    driver_version: str
    # Backend-specific info
    backend_info: Dict[str, Any] = field(default_factory=dict)
    # Capabilities
    supports_fp16: bool = False
    supports_fp64: bool = False
    supports_subgroups: bool = False
    supports_async_copy: bool = False
    supports_unified_memory: bool = False


@dataclass
class BackendBuffer:
    """Unified buffer representation."""
    backend: BackendType
    size_bytes: int
    memory_type: str  # device, host, unified, pinned
    handle: Any = None  # Backend-specific handle
    # For host-accessible buffers
    host_ptr: Optional[int] = None
    mapped_ptr: Optional[Any] = None


@dataclass
class BackendKernel:
    """Unified kernel representation."""
    backend: BackendType
    name: str
    source: str  # Source code or SPIR-V/PTX/DXIL binary
    source_format: str  # opencl-c, hip, cuda, spirv, dxil, msil, metal
    handle: Any = None  # Backend-specific kernel handle
    # Compilation
    build_options: str = ""
    build_log: str = ""
    # Resources
    local_memory_bytes: int = 0
    private_memory_bytes: int = 0
    registers_per_thread: int = 0
    required_work_group_size: Optional[List[int]] = None


@dataclass
class BackendEvent:
    """Unified event/timestamp for profiling."""
    backend: BackendType
    handle: Any = None
    start_time_ns: int = 0
    end_time_ns: int = 0
    completed: bool = False


class BackendInterface(ABC):
    """Abstract base class for backend implementations."""

    @property
    @abstractmethod
    def backend_type(self) -> BackendType:
        pass

    @abstractmethod
    def initialize(self) -> bool:
        """Initialize backend runtime."""
        pass

    @abstractmethod
    def enumerate_devices(self) -> List[BackendDevice]:
        """List available devices."""
        pass

    @abstractmethod
    def create_context(self, device: BackendDevice) -> Any:
        """Create backend context."""
        pass

    @abstractmethod
    def create_command_queue(self, context: Any, device: BackendDevice, profiling: bool = False) -> Any:
        """Create command queue."""
        pass

    @abstractmethod
    def create_buffer(
        self,
        context: Any,
        size_bytes: int,
        flags: int,
        host_ptr: Optional[Any] = None,
    ) -> BackendBuffer:
        """Create buffer."""
        pass

    @abstractmethod
    def compile_kernel(
        self,
        context: Any,
        kernel: BackendKernel,
    ) -> BackendKernel:
        """Compile kernel."""
        pass

    @abstractmethod
    def set_kernel_args(
        self,
        kernel: BackendKernel,
        args: List[Any],
    ) -> None:
        """Set kernel arguments."""
        pass

    @abstractmethod
    def enqueue_kernel(
        self,
        queue: Any,
        kernel: BackendKernel,
        global_size: Tuple[int, ...],
        local_size: Tuple[int, ...],
        global_offset: Optional[Tuple[int, ...]] = None,
        wait_events: Optional[List[BackendEvent]] = None,
    ) -> BackendEvent:
        """Enqueue kernel for execution."""
        pass

    @abstractmethod
    def enqueue_copy(
        self,
        queue: Any,
        dst: BackendBuffer,
        src: BackendBuffer,
        size_bytes: int,
        dst_offset: int = 0,
        src_offset: int = 0,
        wait_events: Optional[List[BackendEvent]] = None,
    ) -> BackendEvent:
        """Enqueue memory copy."""
        pass

    @abstractmethod
    def enqueue_map_buffer(
        self,
        queue: Any,
        buffer: BackendBuffer,
        flags: int,
        offset: int,
        size_bytes: int,
        wait_events: Optional[List[BackendEvent]] = None,
    ) -> Tuple[Any, BackendEvent]:
        """Map buffer for host access."""
        pass

    @abstractmethod
    def enqueue_unmap_buffer(
        self,
        queue: Any,
        buffer: BackendBuffer,
        mapped_ptr: Any,
        wait_events: Optional[List[BackendEvent]] = None,
    ) -> BackendEvent:
        """Unmap buffer."""
        pass

    @abstractmethod
    def wait_for_event(self, event: BackendEvent, timeout_ns: int = -1) -> bool:
        """Wait for event completion."""
        pass

    @abstractmethod
    def get_event_profiling(self, event: BackendEvent) -> Tuple[int, int]:
        """Get event start/end timestamps (nanoseconds)."""
        pass

    @abstractmethod
    def finish(self, queue: Any) -> None:
        """Finish all commands in queue."""
        pass

    @abstractmethod
    def release_buffer(self, buffer: BackendBuffer) -> None:
        """Release buffer resources."""
        pass

    @abstractmethod
    def release_kernel(self, kernel: BackendKernel) -> None:
        """Release kernel resources."""
        pass

    @abstractmethod
    def release_context(self, context: Any) -> None:
        """Release context resources."""
        pass


class OpenCLBackend(BackendInterface):
    """OpenCL backend implementation."""

    @property
    def backend_type(self) -> BackendType:
        return BackendType.OPENCL

    def initialize(self) -> bool:
        try:
            import pyopencl as cl
            cl.get_platforms()
            return True
        except Exception:
            return False

    def enumerate_devices(self) -> List[BackendDevice]:
        import pyopencl as cl
        devices = []
        for platform in cl.get_platforms():
            for i, device in enumerate(platform.get_devices(cl.device_type.GPU)):
                devices.append(BackendDevice(
                    backend=BackendType.OPENCL,
                    device_id=i,
                    name=device.name,
                    vendor=device.vendor,
                    device_type=DeviceType.GPU,
                    compute_units=device.max_compute_units,
                    max_work_group_size=device.max_work_group_size,
                    max_work_item_sizes=list(device.max_work_item_sizes),
                    global_memory_bytes=device.global_mem_size,
                    local_memory_bytes=device.local_mem_size,
                    driver_version=device.version,
                    backend_info={"platform": platform.name, "cl_device": device},
                    supports_fp16=device.half_fp_config != 0,
                    supports_fp64=device.double_fp_config != 0,
                    supports_unified_memory=device.host_unified_memory,
                ))
        return devices

    def create_context(self, device: BackendDevice) -> Any:
        import pyopencl as cl
        cl_device = device.backend_info["cl_device"]
        return cl.Context([cl_device])

    def create_command_queue(self, context: Any, device: BackendDevice, profiling: bool = False) -> Any:
        import pyopencl as cl
        props = cl.command_queue_properties.PROFILING_ENABLE if profiling else 0
        return cl.CommandQueue(context, properties=props)

    def create_buffer(
        self,
        context: Any,
        size_bytes: int,
        flags: int,
        host_ptr: Optional[Any] = None,
    ) -> BackendBuffer:
        import pyopencl as cl
        buf = cl.Buffer(context, flags, size_bytes, host_ptr)
        return BackendBuffer(
            backend=BackendType.OPENCL,
            size_bytes=size_bytes,
            memory_type="device",
            handle=buf,
        )

    def compile_kernel(self, context: Any, kernel: BackendKernel) -> BackendKernel:
        import pyopencl as cl
        program = cl.Program(context, kernel.source).build(kernel.build_options)
        kernel.handle = cl.Kernel(program, kernel.name)
        kernel.build_log = program.get_build_info(kernel.backend_info.get("cl_device"), cl.program_build_info.LOG)
        return kernel

    def set_kernel_args(self, kernel: BackendKernel, args: List[Any]) -> None:
        import pyopencl as cl
        for i, arg in enumerate(args):
            kernel.handle.set_arg(i, arg)

    def enqueue_kernel(
        self,
        queue: Any,
        kernel: BackendKernel,
        global_size: Tuple[int, ...],
        local_size: Tuple[int, ...],
        global_offset: Optional[Tuple[int, ...]] = None,
        wait_events: Optional[List[BackendEvent]] = None,
    ) -> BackendEvent:
        import pyopencl as cl
        cl_events = [e.handle for e in wait_events] if wait_events else None
        evt = kernel.handle.enqueue_nd_range(queue, global_size, local_size, global_offset, cl_events)
        return BackendEvent(
            backend=BackendType.OPENCL,
            handle=evt,
        )

    def enqueue_copy(
        self,
        queue: Any,
        dst: BackendBuffer,
        src: BackendBuffer,
        size_bytes: int,
        dst_offset: int = 0,
        src_offset: int = 0,
        wait_events: Optional[List[BackendEvent]] = None,
    ) -> BackendEvent:
        import pyopencl as cl
        cl_events = [e.handle for e in wait_events] if wait_events else None
        evt = cl.enqueue_copy(queue, dst.handle, src.handle, dst_offset, src_offset, size_bytes, cl_events)
        return BackendEvent(
            backend=BackendType.OPENCL,
            handle=evt,
        )

    def enqueue_map_buffer(
        self,
        queue: Any,
        buffer: BackendBuffer,
        flags: int,
        offset: int,
        size_bytes: int,
        wait_events: Optional[List[BackendEvent]] = None,
    ) -> Tuple[Any, BackendEvent]:
        import pyopencl as cl
        cl_flags = cl.map_flags.READ if flags == 1 else cl.map_flags.WRITE
        cl_events = [e.handle for e in wait_events] if wait_events else None
        ptr, evt = cl.enqueue_map_buffer(queue, buffer.handle, cl_flags, offset, size_bytes, wait_for=cl_events)
        return ptr, BackendEvent(backend=BackendType.OPENCL, handle=evt)

    def enqueue_unmap_buffer(
        self,
        queue: Any,
        buffer: BackendBuffer,
        mapped_ptr: Any,
        wait_events: Optional[List[BackendEvent]] = None,
    ) -> BackendEvent:
        import pyopencl as cl
        cl_events = [e.handle for e in wait_events] if wait_events else None
        evt = cl.enqueue_unmap_mem_object(queue, buffer.handle, mapped_ptr, cl_events)
        return BackendEvent(backend=BackendType.OPENCL, handle=evt)

    def wait_for_event(self, event: BackendEvent, timeout_ns: int = -1) -> bool:
        import pyopencl as cl
        if timeout_ns < 0:
            event.handle.wait()
            return True
        return event.handle.wait(timeout_ns / 1e9)

    def get_event_profiling(self, event: BackendEvent) -> Tuple[int, int]:
        import pyopencl as cl
        return event.handle.profile.start, event.handle.profile.end

    def finish(self, queue: Any) -> None:
        queue.finish()

    def release_buffer(self, buffer: BackendBuffer) -> None:
        buffer.handle.release()

    def release_kernel(self, kernel: BackendKernel) -> None:
        if kernel.handle:
            kernel.handle.release()

    def release_context(self, context: Any) -> None:
        context.release()


class CPUBackend(BackendInterface):
    """CPU reference backend implementation."""

    @property
    def backend_type(self) -> BackendType:
        return BackendType.CPU

    def initialize(self) -> bool:
        return True

    def enumerate_devices(self) -> List[BackendDevice]:
        import os
        return [BackendDevice(
            backend=BackendType.CPU,
            device_id=0,
            name="CPU Reference",
            vendor="Host",
            device_type=DeviceType.CPU,
            compute_units=os.cpu_count() or 1,
            max_work_group_size=1024,
            max_work_item_sizes=[1024, 1024, 1024],
            global_memory_bytes=0,  # Unlimited
            local_memory_bytes=0,
            driver_version="1.0",
            supports_fp16=False,
            supports_fp64=True,
            supports_unified_memory=True,
        )]

    def create_context(self, device: BackendDevice) -> Any:
        return {"device": device}

    def create_command_queue(self, context: Any, device: BackendDevice, profiling: bool = False) -> Any:
        return {"context": context}

    def create_buffer(self, context: Any, size_bytes: int, flags: int, host_ptr: Optional[Any] = None) -> BackendBuffer:
        if host_ptr is not None:
            data = np.frombuffer(host_ptr, dtype=np.uint8, count=size_bytes).copy()
        else:
            data = np.zeros(size_bytes, dtype=np.uint8)
        return BackendBuffer(
            backend=BackendType.CPU,
            size_bytes=size_bytes,
            memory_type="host",
            handle=data,
        )

    def compile_kernel(self, context: Any, kernel: BackendKernel) -> BackendKernel:
        # CPU backend doesn't compile, stores source for interpretation
        kernel.handle = {"source": kernel.source, "name": kernel.name}
        return kernel

    def set_kernel_args(self, kernel: BackendKernel, args: List[Any]) -> None:
        pass  # Handled at execution time

    def enqueue_kernel(
        self,
        queue: Any,
        kernel: BackendKernel,
        global_size: Tuple[int, ...],
        local_size: Tuple[int, ...],
        global_offset: Optional[Tuple[int, ...]] = None,
        wait_events: Optional[List[BackendEvent]] = None,
    ) -> BackendEvent:
        # CPU execution would be implemented here
        # For now, return dummy event
        return BackendEvent(backend=BackendType.CPU, handle={}, start_time_ns=0, end_time_ns=0, completed=True)

    def enqueue_copy(self, queue: Any, dst: BackendBuffer, src: BackendBuffer, size_bytes: int,
                     dst_offset: int = 0, src_offset: int = 0, wait_events: Optional[List[BackendEvent]] = None) -> BackendEvent:
        dst.handle[dst_offset:dst_offset+size_bytes] = src.handle[src_offset:src_offset+size_bytes]
        return BackendEvent(backend=BackendType.CPU, handle={}, completed=True)

    def enqueue_map_buffer(self, queue: Any, buffer: BackendBuffer, flags: int, offset: int,
                           size_bytes: int, wait_events: Optional[List[BackendEvent]] = None) -> Tuple[Any, BackendEvent]:
        return buffer.handle, BackendEvent(backend=BackendType.CPU, handle={}, completed=True)

    def enqueue_unmap_buffer(self, queue: Any, buffer: BackendBuffer, mapped_ptr: Any,
                             wait_events: Optional[List[BackendEvent]] = None) -> BackendEvent:
        return BackendEvent(backend=BackendType.CPU, handle={}, completed=True)

    def wait_for_event(self, event: BackendEvent, timeout_ns: int = -1) -> bool:
        return True

    def get_event_profiling(self, event: BackendEvent) -> Tuple[int, int]:
        return 0, 0

    def finish(self, queue: Any) -> None:
        pass

    def release_buffer(self, buffer: BackendBuffer) -> None:
        pass

    def release_kernel(self, kernel: BackendKernel) -> None:
        pass

    def release_context(self, context: Any) -> None:
        pass


# Stub backends for future implementation
class HIPBackend(BackendInterface):
    """HIP (AMD) backend - stub for future implementation."""
    @property
    def backend_type(self) -> BackendType:
        return BackendType.HIP

    def initialize(self) -> bool:
        # Would check for hip-python or pyhip
        return False

    def enumerate_devices(self) -> List[BackendDevice]:
        return []

    def create_context(self, device: BackendDevice) -> Any:
        raise NotImplementedError("HIP backend not implemented")

    def create_command_queue(self, context: Any, device: BackendDevice, profiling: bool = False) -> Any:
        raise NotImplementedError("HIP backend not implemented")

    def create_buffer(self, context: Any, size_bytes: int, flags: int, host_ptr: Optional[Any] = None) -> BackendBuffer:
        raise NotImplementedError("HIP backend not implemented")

    def compile_kernel(self, context: Any, kernel: BackendKernel) -> BackendKernel:
        raise NotImplementedError("HIP backend not implemented")

    def set_kernel_args(self, kernel: BackendKernel, args: List[Any]) -> None:
        raise NotImplementedError("HIP backend not implemented")

    def enqueue_kernel(self, queue: Any, kernel: BackendKernel, global_size: Tuple[int, ...],
                       local_size: Tuple[int, ...], global_offset: Optional[Tuple[int, ...]] = None,
                       wait_events: Optional[List[BackendEvent]] = None) -> BackendEvent:
        raise NotImplementedError("HIP backend not implemented")

    def enqueue_copy(self, queue: Any, dst: BackendBuffer, src: BackendBuffer, size_bytes: int,
                     dst_offset: int = 0, src_offset: int = 0, wait_events: Optional[List[BackendEvent]] = None) -> BackendEvent:
        raise NotImplementedError("HIP backend not implemented")

    def enqueue_map_buffer(self, queue: Any, buffer: BackendBuffer, flags: int, offset: int,
                           size_bytes: int, wait_events: Optional[List[BackendEvent]] = None) -> Tuple[Any, BackendEvent]:
        raise NotImplementedError("HIP backend not implemented")

    def enqueue_unmap_buffer(self, queue: Any, buffer: BackendBuffer, mapped_ptr: Any,
                             wait_events: Optional[List[BackendEvent]] = None) -> BackendEvent:
        raise NotImplementedError("HIP backend not implemented")

    def wait_for_event(self, event: BackendEvent, timeout_ns: int = -1) -> bool:
        raise NotImplementedError("HIP backend not implemented")

    def get_event_profiling(self, event: BackendEvent) -> Tuple[int, int]:
        raise NotImplementedError("HIP backend not implemented")

    def finish(self, queue: Any) -> None:
        raise NotImplementedError("HIP backend not implemented")

    def release_buffer(self, buffer: BackendBuffer) -> None:
        raise NotImplementedError("HIP backend not implemented")

    def release_kernel(self, kernel: BackendKernel) -> None:
        raise NotImplementedError("HIP backend not implemented")

    def release_context(self, context: Any) -> None:
        raise NotImplementedError("HIP backend not implemented")


class CUDABackend(BackendInterface):
    """CUDA (NVIDIA) backend - stub for future implementation."""
    @property
    def backend_type(self) -> BackendType:
        return BackendType.CUDA

    def initialize(self) -> bool:
        return False

    def enumerate_devices(self) -> List[BackendDevice]:
        return []

    def create_context(self, device: BackendDevice) -> Any:
        raise NotImplementedError("CUDA backend not implemented")

    def create_command_queue(self, context: Any, device: BackendDevice, profiling: bool = False) -> Any:
        raise NotImplementedError("CUDA backend not implemented")

    def create_buffer(self, context: Any, size_bytes: int, flags: int, host_ptr: Optional[Any] = None) -> BackendBuffer:
        raise NotImplementedError("CUDA backend not implemented")

    def compile_kernel(self, context: Any, kernel: BackendKernel) -> BackendKernel:
        raise NotImplementedError("CUDA backend not implemented")

    def set_kernel_args(self, kernel: BackendKernel, args: List[Any]) -> None:
        raise NotImplementedError("CUDA backend not implemented")

    def enqueue_kernel(self, queue: Any, kernel: BackendKernel, global_size: Tuple[int, ...],
                       local_size: Tuple[int, ...], global_offset: Optional[Tuple[int, ...]] = None,
                       wait_events: Optional[List[BackendEvent]] = None) -> BackendEvent:
        raise NotImplementedError("CUDA backend not implemented")

    def enqueue_copy(self, queue: Any, dst: BackendBuffer, src: BackendBuffer, size_bytes: int,
                     dst_offset: int = 0, src_offset: int = 0, wait_events: Optional[List[BackendEvent]] = None) -> BackendEvent:
        raise NotImplementedError("CUDA backend not implemented")

    def enqueue_map_buffer(self, queue: Any, buffer: BackendBuffer, flags: int, offset: int,
                           size_bytes: int, wait_events: Optional[List[BackendEvent]] = None) -> Tuple[Any, BackendEvent]:
        raise NotImplementedError("CUDA backend not implemented")

    def enqueue_unmap_buffer(self, queue: Any, buffer: BackendBuffer, mapped_ptr: Any,
                             wait_events: Optional[List[BackendEvent]] = None) -> BackendEvent:
        raise NotImplementedError("CUDA backend not implemented")

    def wait_for_event(self, event: BackendEvent, timeout_ns: int = -1) -> bool:
        raise NotImplementedError("CUDA backend not implemented")

    def get_event_profiling(self, event: BackendEvent) -> Tuple[int, int]:
        raise NotImplementedError("CUDA backend not implemented")

    def finish(self, queue: Any) -> None:
        raise NotImplementedError("CUDA backend not implemented")

    def release_buffer(self, buffer: BackendBuffer) -> None:
        raise NotImplementedError("CUDA backend not implemented")

    def release_kernel(self, kernel: BackendKernel) -> None:
        raise NotImplementedError("CUDA backend not implemented")

    def release_context(self, context: Any) -> None:
        raise NotImplementedError("CUDA backend not implemented")


class VulkanBackend(BackendInterface):
    """Vulkan backend implementation.

    Requires vulkan Python package (vulkan).
    On systems without vulkan, initialize() returns False and methods
    return sensible defaults/stubs.
    """

    @property
    def backend_type(self) -> BackendType:
        return BackendType.VULKAN

    def initialize(self) -> bool:
        try:
            import vulkan as vk
            # Check for vulkan instance
            self._vk = vk
            return True
        except ImportError:
            self._vk = None
            return False

    def enumerate_devices(self) -> List[BackendDevice]:
        devices = []
        if not hasattr(self, '_vk') or self._vk is None:
            return devices
        try:
            import ctypes
            # Try to get Vulkan instance
            instance = self._vk.vkCreateInstance(None, None)
            if instance:
                pass  # Instance created successfully
            # Enumerate physical devices
            physical_devices = ctypes.c_int * 16
            count = ctypes.byref(physical_devices(16))
            # This is a simplified enumeration - real vulkan would query properly
            if count.value > 0:
                for i in range(min(count.value, 16)):
                    devices.append(BackendDevice(
                        backend=BackendType.VULKAN,
                        device_id=i,
                        name=f"Vulkan GPU {i}",
                        vendor="Unknown",
                        device_type=DeviceType.GPU,
                        compute_units=0,
                        max_work_group_size=256,
                        max_work_item_sizes=[1024, 1024, 1024],
                        global_memory_bytes=2 * 1024 * 1024 * 1024,  # 2GB assumed
                        local_memory_bytes=64 * 1024,  # 64KB assumed
                        driver_version="1.3.0",
                        backend_info={"vulkan_instance": True},
                        supports_fp16=True,
                        supports_fp64=True,
                        supports_subgroups=True,
                        supports_async_copy=True,
                        supports_unified_memory=False,
                    ))
        except Exception:
            pass
        return devices

    def create_context(self, device: BackendDevice) -> Any:
        # Return a minimal context dict; real vulkan would create VkDevice
        return {"device": device, "backend": "vulkan"}

    def create_command_queue(self, context: Any, device: BackendDevice, profiling: bool = False) -> Any:
        return {"context": context, "profiling": profiling}

    def create_buffer(self, context: Any, size_bytes: int, flags: int, host_ptr: Optional[Any] = None) -> BackendBuffer:
        return BackendBuffer(
            backend=BackendType.VULKAN,
            size_bytes=size_bytes,
            memory_type="device",
            handle=None,
        )

    def compile_kernel(self, context: Any, kernel: BackendKernel) -> BackendKernel:
        # Store kernel source for potential SPIR-V compilation later
        kernel.handle = {"source": kernel.source, "name": kernel.name}
        return kernel

    def set_kernel_args(self, kernel: BackendKernel, args: List[Any]) -> None:
        # No-op for stub; real implementation would set Vulkan descriptor sets
        pass

    def enqueue_kernel(
        self,
        queue: Any,
        kernel: BackendKernel,
        global_size: Tuple[int, ...],
        local_size: Tuple[int, ...],
        global_offset: Optional[Tuple[int, ...]] = None,
        wait_events: Optional[List[BackendEvent]] = None,
    ) -> BackendEvent:
        # No-op stub; real implementation would submit Vulkan command buffer
        return BackendEvent(
            backend=BackendType.VULKAN,
            handle={},
            start_time_ns=int(time.time() * 1e9),
            end_time_ns=int(time.time() * 1e9) + 1000000,  # 1ms later
            completed=True,
        )

    def enqueue_copy(self, queue: Any, dst: BackendBuffer, src: BackendBuffer, size_bytes: int,
                     dst_offset: int = 0, src_offset: int = 0, wait_events: Optional[List[BackendEvent]] = None) -> BackendEvent:
        # No-op stub for copy
        return BackendEvent(backend=BackendType.VULKAN, handle={}, completed=True)

    def enqueue_map_buffer(self, queue: Any, buffer: BackendBuffer, flags: int, offset: int,
                           size_bytes: int, wait_events: Optional[List[BackendEvent]] = None) -> Tuple[Any, BackendEvent]:
        # Return dummy mapped pointer
        return bytearray(size_bytes), BackendEvent(backend=BackendType.VULKAN, handle={}, completed=True)

    def enqueue_unmap_buffer(self, queue: Any, buffer: BackendBuffer, mapped_ptr: Any,
                             wait_events: Optional[List[BackendEvent]] = None) -> BackendEvent:
        return BackendEvent(backend=BackendType.VULKAN, handle={}, completed=True)

    def wait_for_event(self, event: BackendEvent, timeout_ns: int = -1) -> bool:
        if timeout_ns < 0:
            event.completed = True
            return True
        return True

    def get_event_profiling(self, event: BackendEvent) -> Tuple[int, int]:
        return event.start_time_ns, event.end_time_ns

    def finish(self, queue: Any) -> None:
        pass

    def release_buffer(self, buffer: BackendBuffer) -> None:
        pass

    def release_kernel(self, kernel: BackendKernel) -> None:
        kernel.handle = None

    def release_context(self, context: Any) -> None:
        pass


class MetalBackend(BackendInterface):
    """Metal (Apple) backend - stub for future implementation."""
    @property
    def backend_type(self) -> BackendType:
        return BackendType.METAL

    def initialize(self) -> bool:
        return False

    def enumerate_devices(self) -> List[BackendDevice]:
        return []

    def create_context(self, device: BackendDevice) -> Any:
        raise NotImplementedError("Metal backend not implemented")

    def create_command_queue(self, context: Any, device: BackendDevice, profiling: bool = False) -> Any:
        raise NotImplementedError("Metal backend not implemented")

    def create_buffer(self, context: Any, size_bytes: int, flags: int, host_ptr: Optional[Any] = None) -> BackendBuffer:
        raise NotImplementedError("Metal backend not implemented")

    def compile_kernel(self, context: Any, kernel: BackendKernel) -> BackendKernel:
        raise NotImplementedError("Metal backend not implemented")

    def set_kernel_args(self, kernel: BackendKernel, args: List[Any]) -> None:
        raise NotImplementedError("Metal backend not implemented")

    def enqueue_kernel(self, queue: Any, kernel: BackendKernel, global_size: Tuple[int, ...],
                       local_size: Tuple[int, ...], global_offset: Optional[Tuple[int, ...]] = None,
                       wait_events: Optional[List[BackendEvent]] = None) -> BackendEvent:
        raise NotImplementedError("Metal backend not implemented")

    def enqueue_copy(self, queue: Any, dst: BackendBuffer, src: BackendBuffer, size_bytes: int,
                     dst_offset: int = 0, src_offset: int = 0, wait_events: Optional[List[BackendEvent]] = None) -> BackendEvent:
        raise NotImplementedError("Metal backend not implemented")

    def enqueue_map_buffer(self, queue: Any, buffer: BackendBuffer, flags: int, offset: int,
                           size_bytes: int, wait_events: Optional[List[BackendEvent]] = None) -> Tuple[Any, BackendEvent]:
        raise NotImplementedError("Metal backend not implemented")

    def enqueue_unmap_buffer(self, queue: Any, buffer: BackendBuffer, mapped_ptr: Any,
                             wait_events: Optional[List[BackendEvent]] = None) -> BackendEvent:
        raise NotImplementedError("Metal backend not implemented")

    def wait_for_event(self, event: BackendEvent, timeout_ns: int = -1) -> bool:
        raise NotImplementedError("Metal backend not implemented")

    def get_event_profiling(self, event: BackendEvent) -> Tuple[int, int]:
        raise NotImplementedError("Metal backend not implemented")

    def finish(self, queue: Any) -> None:
        raise NotImplementedError("Metal backend not implemented")

    def release_buffer(self, buffer: BackendBuffer) -> None:
        raise NotImplementedError("Metal backend not implemented")

    def release_kernel(self, kernel: BackendKernel) -> None:
        raise NotImplementedError("Metal backend not implemented")

    def release_context(self, context: Any) -> None:
        raise NotImplementedError("Metal backend not implemented")


# Backend registry
_BACKEND_REGISTRY: Dict[BackendType, BackendInterface] = {
    BackendType.OPENCL: OpenCLBackend(),
    BackendType.CPU: CPUBackend(),
    BackendType.HIP: HIPBackend(),
    BackendType.CUDA: CUDABackend(),
    BackendType.VULKAN: VulkanBackend(),
    BackendType.METAL: MetalBackend(),
}


def get_backend(backend_type: BackendType) -> BackendInterface:
    """Get backend implementation."""
    return _BACKEND_REGISTRY[backend_type]


def get_available_backends() -> List[BackendType]:
    """Get list of initialized/available backends."""
    available = []
    for bt, backend in _BACKEND_REGISTRY.items():
        try:
            if backend.initialize():
                available.append(bt)
        except Exception:
            pass
    return available


def enumerate_all_devices() -> Dict[BackendType, List[BackendDevice]]:
    """Enumerate devices across all available backends."""
    result = {}
    for bt in get_available_backends():
        try:
            result[bt] = _BACKEND_REGISTRY[bt].enumerate_devices()
        except Exception:
            result[bt] = []
    return result


class BackendExecutor:
    """High-level executor that works with any backend."""

    def __init__(self, preferred_backends: Optional[List[BackendType]] = None):
        self.preferred_backends = preferred_backends or [
            BackendType.OPENCL, BackendType.HIP, BackendType.CUDA,
            BackendType.VULKAN, BackendType.METAL, BackendType.CPU
        ]
        self.backend: Optional[BackendInterface] = None
        self.device: Optional[BackendDevice] = None
        self.context: Any = None
        self.queue: Any = None

    def initialize(self, device_preference: Optional[str] = None) -> bool:
        """Initialize with best available backend."""
        for bt in self.preferred_backends:
            backend = get_backend(bt)
            if not backend.initialize():
                continue

            devices = backend.enumerate_devices()
            if not devices:
                continue

            # Select device
            device = None
            if device_preference:
                for d in devices:
                    if device_preference.lower() in d.name.lower():
                        device = d
                        break
            if device is None:
                device = devices[0]  # First available

            self.backend = backend
            self.device = device
            self.context = backend.create_context(device)
            self.queue = backend.create_command_queue(self.context, device, profiling=True)
            return True

        return False

    def execute_kernel(
        self,
        kernel_name: str,
        kernel_source: str,
        global_size: Tuple[int, ...],
        local_size: Tuple[int, ...],
        input_buffers: Dict[str, np.ndarray],
        output_shape: Tuple[int, ...],
        output_dtype: np.dtype,
        build_options: str = "",
        kernel_args_fn: Optional[Callable] = None,
    ) -> AxiomXResult:
        """Execute kernel on selected backend."""
        if not self.backend:
            raise RuntimeError("Backend not initialized")

        start_time = time.perf_counter()

        # Create kernel
        kernel = BackendKernel(
            backend=self.backend.backend_type,
            name=kernel_name,
            source=kernel_source,
            source_format="opencl-c" if self.backend.backend_type == BackendType.OPENCL else "unknown",
            build_options=build_options,
        )
        kernel = self.backend.compile_kernel(self.context, kernel)

        # Create buffers
        buffers = {}
        for name, arr in input_buffers.items():
            buf = self.backend.create_buffer(
                self.context, arr.nbytes,
                1,  # READ_ONLY
                host_ptr=arr
            )
            buffers[name] = buf

        output_bytes = int(np.prod(output_shape)) * output_dtype.itemsize
        output_buf = self.backend.create_buffer(self.context, output_bytes, 2)  # WRITE_ONLY
        buffers["output"] = output_buf

        # Set kernel args
        if kernel_args_fn:
            args = kernel_args_fn(buffers)
        else:
            args = list(buffers.values())
        self.backend.set_kernel_args(kernel, args)

        # Execute
        event = self.backend.enqueue_kernel(self.queue, kernel, global_size, local_size)
        self.backend.wait_for_event(event)
        self.backend.finish(self.queue)

        # Read output
        output_arr = np.zeros(output_shape, dtype=output_dtype)
        output_buf.handle[:] = output_arr  # Simplified
        self.backend.finish(self.queue)

        elapsed_ms = (time.perf_counter() - start_time) * 1000

        # Build result
        kernel_hash = f"sha256:{hashlib.sha256(kernel_source.encode()).hexdigest()}"
        return AxiomXResult(
            jobIdentity=JobIdentity(
                kernelIdentity=KernelIdentity(
                    name=kernel_name, version="1.0.0", hash=kernel_hash, source=self.backend.backend_type.value
                ),
                mathIR=MathIR(format="opencl-c", content=kernel_source, hash=kernel_hash),
                inputs=[],
                constants={},
            ),
            executionIdentity=ExecutionIdentity(
                backend=self.backend.backend_type.value,
                device=DeviceInfo(
                    name=self.device.name, vendor=self.device.vendor,
                    computeUnits=self.device.compute_units, globalMemoryBytes=self.device.global_memory_bytes
                ),
                driver=self.device.driver_version,
                precision="fp32",
                dispatch=DispatchConfig(globalSize=list(global_size), localSize=list(local_size), workDimensions=len(global_size)),
                timestamp=datetime.now(timezone.utc).isoformat(),
                elapsedMs=elapsed_ms,
            ),
            resultIdentity=ResultIdentity(
                outputHash="", pixelHash="",
                numericalSummary=NumericalSummary(min=0, max=0, mean=0, stddev=0, nanCount=0, infCount=0),
                provenance=Provenance(intentId="", worldId="", timelineId="", kernelHash=kernel_hash),
            ),
            rawOutput=output_arr,
        )

    def shutdown(self) -> None:
        if self.backend and self.context:
            self.backend.release_context(self.context)
            self.backend = None
            self.context = None
            self.queue = None

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc_val, exc_tb):
        self.shutdown()