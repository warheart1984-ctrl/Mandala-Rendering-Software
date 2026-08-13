#!/usr/bin/env python3
"""
Axiom-X OpenCL Backend — Implements Axiom Compute ABI v0.1
Capability-first, vendor-second. No ROCm dependency.
"""

from __future__ import annotations

import hashlib
import json
import os
import time
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional, Set, Tuple, Union
from dataclasses import dataclass, field

import numpy as np

try:
    import pyopencl as cl
    import pyopencl.array as cl_array
except ImportError:
    cl = None
    cl_array = None

# ABI imports (we'll use local type definitions for standalone operation)
AXIOM_ABI_VERSION = "0.1.0"

@dataclass
class CapabilityFeature:
    name: str
    supported: bool
    version: Optional[str] = None
    details: Dict = field(default_factory=dict)

@dataclass
class SubgroupCapability:
    supported: bool = False
    minSize: Optional[int] = None
    maxSize: Optional[int] = None
    arithmetic: bool = False
    ballot: bool = False
    shuffle: bool = False
    quad: bool = False

@dataclass
class MemoryCapability:
    globalBytes: int
    localBytes: int
    constantBytes: int
    unified: bool
    hostMapping: bool
    atomicSupport: bool
    bufferOffsetAlignment: int

@dataclass
class NumericCapability:
    fp16: bool
    fp32: bool
    fp64: bool
    bf16: bool
    int8: bool
    int16: bool
    int32: bool
    int64: bool
    tf32: bool = False

@dataclass
class CapabilityTarget:
    executionModel: str  # "gpu" | "cpu"
    addressBits: int  # 32 | 64
    features: List[CapabilityFeature]
    subgroup: SubgroupCapability
    memory: MemoryCapability
    numeric: NumericCapability
    maxWorkgroupSize: int
    maxWorkgroupDimensions: Dict[str, int]
    maxComputeUnits: int
    clockFrequencyMHz: float
    backend: Dict[str, str]
    targetIdentity: Dict[str, str]

@dataclass
class CapabilityReport:
    backendId: str
    backendType: str
    target: CapabilityTarget
    kernelsSupported: List[str]
    timestamp: str
    abiVersion: str
    provenance: Dict

@dataclass
class AxiomBufferDescriptor:
    sizeBytes: int
    flags: List[str]
    usage: Optional[str] = None
    name: Optional[str] = None

@dataclass
class AxiomAllocation:
    allocationId: str
    buffer: AxiomBufferDescriptor
    deviceAddress: Optional[int] = None
    hostPointer: Optional[int] = None
    offset: int = 0
    sizeBytes: int = 0
    backendHandle: Any = None

@dataclass
class AxiomIRModule:
    moduleId: str
    format: str  # "spirv" | "llvm-ir" | "hip-clang" | "opencl-c" | "axiom-native"
    abiVersion: str
    binary: bytes
    entryPoints: List[str]
    metadata: Dict

@dataclass
class AxiomExecutable:
    executableId: str
    module: AxiomIRModule
    entryPoint: str
    pipelineLayout: Any
    backendHandle: Any
    compileTimeMs: float
    compileLog: str

@dataclass
class AxiomDispatchArgs:
    workgroupCount: Dict[str, int]
    workgroupSize: Optional[Dict[str, int]] = None
    bindings: List[Dict] = field(default_factory=list)
    pushConstants: Optional[bytes] = None
    specializationConstants: Dict[int, float] = field(default_factory=dict)

@dataclass
class AxiomFuture:
    futureId: str
    status: str  # "pending" | "running" | "completed" | "failed"
    submitTime: float
    startTime: Optional[float] = None
    endTime: Optional[float] = None
    backendHandle: Any = None

@dataclass
class AxiomResult:
    success: bool
    future: AxiomFuture
    outputAllocations: List[AxiomAllocation]
    profiling: Optional[Dict] = None
    error: Optional[Dict] = None

@dataclass
class AxiomProfile:
    durationNs: int
    gpuTimeNs: Optional[int] = None
    memoryThroughputBytes: Optional[float] = None
    computeThroughputFlops: Optional[float] = None
    occupancyPercent: Optional[float] = None
    workgroupCount: Dict[str, int] = field(default_factory=dict)
    workgroupSize: Dict[str, int] = field(default_factory=dict)
    registersUsed: Optional[int] = None
    localMemoryUsedBytes: Optional[int] = None
    spillStoreCount: Optional[int] = None
    spillLoadCount: Optional[int] = None
    customCounters: Dict = field(default_factory=dict)

@dataclass
class AxiomDeviceConfig:
    enableValidation: bool = False
    enableProfiling: bool = False
    preferredWorkgroupSize: Optional[Dict[str, int]] = None
    maxInFlightCommands: int = 32
    logLevel: str = "info"

@dataclass
class AxiomInitResult:
    success: bool
    deviceId: str
    capability: CapabilityReport
    message: Optional[str] = None


class OpenCLBackendError(Exception):
    """OpenCL backend specific error."""
    def __init__(self, code: str, message: str, details: Any = None):
        self.code = code
        self.details = details
        super().__init__(f"[{code}] {message}")


class OpenCLAllocation:
    """Wrapper for OpenCL buffer with ABI metadata."""
    def __init__(self, allocation: AxiomAllocation, cl_buffer: Any, context: Any):
        self.allocation = allocation
        self.cl_buffer = cl_buffer
        self.context = context
        self.queue = None  # Set by backend when mapping
        self._map_context = None
        self._mapped_array = None

    def __enter__(self) -> np.ndarray:
        """Map buffer for host access (context manager)."""
        result = cl.enqueue_map_buffer(
            self.queue, self.cl_buffer, cl.map_flags.READ | cl.map_flags.WRITE,
            0, (self.allocation.sizeBytes,), np.uint8
        )
        # Handle tuple return (numpy_array, Event) or just numpy_array
        if isinstance(result, tuple) and len(result) == 2:
            # result = (mapped_array, event)
            mapped_array, event = result
            self._map_context = event  # Event for waiting/unmapping
            self._mapped_array = mapped_array
        else:
            self._map_context = result
            self._mapped_array = result
        return self._mapped_array

    def __exit__(self, exc_type, exc_val, exc_tb):
        """Unmap buffer."""
        if self._map_context is not None:
            # Wait for the map event to complete
            if hasattr(self._map_context, 'wait'):
                self._map_context.wait()
            self._map_context = None
            self._mapped_array = None

    def map(self, queue: Any) -> np.ndarray:
        """Map buffer for host access (legacy - use context manager instead)."""
        if self._mapped_array is None:
            result = cl.enqueue_map_buffer(
                queue, self.cl_buffer, cl.map_flags.READ | cl.map_flags.WRITE,
                0, (self.allocation.sizeBytes,), np.uint8
            )
            if isinstance(result, tuple) and len(result) == 2:
                mapped_array, event = result
                self._map_context = event
                self._mapped_array = mapped_array
            else:
                self._map_context = result
                self._mapped_array = result
        return self._mapped_array

    def unmap(self, queue: Any):
        """Unmap buffer."""
        if self._map_context is not None:
            if hasattr(self._map_context, 'wait'):
                self._map_context.wait()
            self._map_context = None
            self._mapped_array = None


class OpenCLBackend:
    """
    OpenCL implementation of Axiom Compute ABI.
    
    Capability-first: reports what the substrate CAN do, not vendor.
    Works on R9 380 (GCN/Tonga) via AMD OpenCL driver.
    """
    
    def __init__(self, config: Optional[AxiomDeviceConfig] = None):
        if cl is None:
            raise OpenCLBackendError("PYOPENCL_MISSING", "pyopencl not installed. pip install pyopencl")
        
        self.config = config or AxiomDeviceConfig()
        self.deviceId = f"opencl-{uuid.uuid4().hex[:8]}"
        self.backendType = "opencl"
        self.abiVersion = AXIOM_ABI_VERSION
        self._initialized = False
        
        # OpenCL objects
        self.platform: Any = None
        self.device: Any = None
        self.context: Any = None
        self.queue: Any = None
        self.program_cache: Dict[str, Any] = {}
        self.kernel_cache: Dict[str, Any] = {}
        
        # Capability cache
        self._capability_report: Optional[CapabilityReport] = None
        
        # Allocation tracking
        self._allocations: Dict[str, OpenCLAllocation] = {}
        self._futures: Dict[str, AxiomFuture] = {}
        
        # Profiling
        self._enable_profiling = self.config.enableProfiling
        
    def _log(self, level: str, message: str):
        """Internal logging."""
        levels = {"none": 0, "error": 1, "warn": 2, "info": 3, "debug": 4}
        if levels.get(level, 3) <= levels.get(self.config.logLevel, 3):
            print(f"[OpenCLBackend:{self.deviceId}] {level.upper()}: {message}")

    # =========================================================================
    # CAPABILITY DISCOVERY
    # =========================================================================
    
    def _get_device_attr(self, device: Any, attr: str, default: Any = None) -> Any:
        """Safely get device attribute, handling INVALID_VALUE errors."""
        try:
            return getattr(device, attr, default)
        except cl.RuntimeError as e:
            if "INVALID_VALUE" in str(e):
                return default
            raise
        except Exception:
            return default
    
    async def probe(self) -> Optional[CapabilityReport]:
        """Probe OpenCL platform and device capabilities."""
        if self._capability_report:
            return self._capability_report
            
        start_time = time.time()
        
        try:
            # Get platforms
            platforms = cl.get_platforms()
            if not platforms:
                return None
                
            # Prefer AMD platform, fallback to first available
            self.platform = None
            for p in platforms:
                if "AMD" in p.vendor.upper():
                    self.platform = p
                    break
            if self.platform is None:
                self.platform = platforms[0]
                
            # Get devices - prefer GPU
            devices = self.platform.get_devices(device_type=cl.device_type.GPU)
            if not devices:
                devices = self.platform.get_devices(device_type=cl.device_type.CPU)
            if not devices:
                return None
                
            # Prefer discrete GPU
            self.device = None
            for d in devices:
                if d.type == cl.device_type.GPU:
                    self.device = d
                    break
            if self.device is None:
                self.device = devices[0]
                
            # Create context and queue
            self.context = cl.Context([self.device])
            props = cl.command_queue_properties.PROFILING_ENABLE if self._enable_profiling else 0
            self.queue = cl.CommandQueue(self.context, self.device, properties=props)
            
            # Build capability report
            self._capability_report = self._build_capability_report(time.time() - start_time)
            return self._capability_report
            
        except Exception as e:
            self._log("error", f"Probe failed: {e}")
            return None
    
    def _build_capability_report(self, detection_duration: float) -> CapabilityReport:
        """Build capability report from OpenCL device queries."""
        d = self.device
        
        def get_attr(attr: str, default: Any = None) -> Any:
            return self._get_device_attr(d, attr, default)
        
        # Features
        features = [
            CapabilityFeature("opencl", True, version=d.version),
            CapabilityFeature("images", d.image_support),
            CapabilityFeature("unified_memory", get_attr("host_unified_memory", False)),
            CapabilityFeature("double_fp64", get_attr("double_fp_config", 0) != 0),
            CapabilityFeature("half_fp16", get_attr("half_fp_config", 0) != 0),
            CapabilityFeature("subgroups", hasattr(d, "sub_group_sizes_intel") or hasattr(d, "sub_group_sizes")),
            CapabilityFeature("atomics", get_attr("atomic_memory_capabilities", 0) != 0 or get_attr("atomic_fence_capabilities", 0) != 0),
        ]
        
        # Subgroup capability
        subgroup = SubgroupCapability()
        if hasattr(d, "sub_group_sizes"):
            sizes = d.sub_group_sizes
            subgroup.supported = True
            subgroup.minSize = min(sizes)
            subgroup.maxSize = max(sizes)
            subgroup.arithmetic = True
            subgroup.shuffle = True
        elif hasattr(d, "sub_group_sizes_intel"):
            sizes = d.sub_group_sizes_intel
            subgroup.supported = True
            subgroup.minSize = min(sizes)
            subgroup.maxSize = max(sizes)
        
        # Memory capability
        memory = MemoryCapability(
            globalBytes=get_attr("global_mem_size", 0),
            localBytes=get_attr("local_mem_size", 0),
            constantBytes=get_attr("max_constant_buffer_size", 0),
            unified=bool(get_attr("host_unified_memory", False)),
            hostMapping=bool(get_attr("host_unified_memory", False)),
            atomicSupport=bool(get_attr("atomic_memory_capabilities", 0)) != 0,
            bufferOffsetAlignment=get_attr("mem_base_addr_align", 512) // 8,
        )
        
        # Numeric capability
        numeric = NumericCapability(
            fp16=get_attr("half_fp_config", 0) != 0,
            fp32=True,
            fp64=get_attr("double_fp_config", 0) != 0,
            bf16=False,
            int8=True,
            int16=True,
            int32=True,
            int64=True,
            tf32=False,
        )
        
        # Determine ISA
        device_name = d.name
        isa = "unknown"
        if "Tonga" in device_name or "R9 380" in device_name:
            isa = "gcn"
        elif "RDNA" in device_name.upper() or "RX 6" in device_name:
            isa = "rdna"
        elif "CDNA" in device_name.upper():
            isa = "cdna"
        elif "GCN" in device_name.upper():
            isa = "gcn"
            
        # Execution model
        execution_model = "gpu" if d.type == cl.device_type.GPU else "cpu"
        
        target = CapabilityTarget(
            executionModel=execution_model,
            addressBits=d.address_bits,
            features=features,
            subgroup=subgroup,
            memory=memory,
            numeric=numeric,
            maxWorkgroupSize=d.max_work_group_size,
            maxWorkgroupDimensions={
                "x": d.max_work_item_sizes[0] if d.max_work_item_sizes else 256,
                "y": d.max_work_item_sizes[1] if len(d.max_work_item_sizes) > 1 else 256,
                "z": d.max_work_item_sizes[2] if len(d.max_work_item_sizes) > 2 else 256,
            },
            maxComputeUnits=d.max_compute_units,
            clockFrequencyMHz=d.max_clock_frequency,
            backend={"name": "pyopencl", "version": cl.VERSION_TEXT},
            targetIdentity={
                "vendor": d.vendor,
                "architecture": isa,
                "isa": isa,
                "deviceName": device_name,
                "driverVersion": d.driver_version,
                "runtimeVersion": cl.VERSION_TEXT,
            }
        )
        
        report = CapabilityReport(
            backendId=self.deviceId,
            backendType="opencl",
            target=target,
            kernelsSupported=["legacy_still", "axiom_ir"],
            timestamp=datetime.now(timezone.utc).isoformat(),
            abiVersion=AXIOM_ABI_VERSION,
            provenance={
                "detectedBy": "pyopencl",
                "detectionDurationMs": detection_duration * 1000,
            }
        )
        
        return report

    # =========================================================================
    # LIFECYCLE
    # =========================================================================
    
    async def initialize(self, config: Optional[AxiomDeviceConfig] = None) -> AxiomInitResult:
        """Initialize the OpenCL backend."""
        if config:
            self.config = config
            self._enable_profiling = config.enableProfiling
            
        if self._initialized:
            return AxiomInitResult(
                success=True,
                deviceId=self.deviceId,
                capability=self._capability_report,
                message="Already initialized"
            )
        
        report = await self.probe()
        if not report:
            return AxiomInitResult(
                success=False,
                deviceId=self.deviceId,
                capability=None,
                message="No OpenCL device found"
            )
        
        self._initialized = True
        return AxiomInitResult(
            success=True,
            deviceId=self.deviceId,
            capability=report,
            message=f"Initialized {report.target.targetIdentity['deviceName']} via OpenCL"
        )
    
    async def shutdown(self):
        """Shutdown the backend."""
        # Release all allocations
        for alloc in self._allocations.values():
            try:
                alloc.cl_buffer.release()
            except:
                pass
        self._allocations.clear()
        self._futures.clear()
        self.program_cache.clear()
        self.kernel_cache.clear()
        
        if self.queue:
            self.queue.finish()
        
        self._initialized = False
        self._log("info", "Shutdown complete")

    # =========================================================================
    # MEMORY MANAGEMENT
    # =========================================================================
    
    def _flags_to_cl(self, flags: List[str]) -> int:
        """Convert ABI memory flags to OpenCL flags."""
        cl_flags = 0
        flag_map = {
            "read-write": cl.mem_flags.READ_WRITE,
            "read-only": cl.mem_flags.READ_ONLY,
            "write-only": cl.mem_flags.WRITE_ONLY,
            "host-visible": cl.mem_flags.ALLOC_HOST_PTR,
            "host-coherent": 0,  # OpenCL handles this implicitly
            "device-local": cl.mem_flags.COPY_HOST_PTR,  # Best effort
            "atomic": 0,  # No explicit flag in OpenCL
        }
        for f in flags:
            cl_flags |= flag_map.get(f, 0)
        if cl_flags == 0:
            cl_flags = cl.mem_flags.READ_WRITE
        return cl_flags
    
    async def allocate(self, descriptor: AxiomBufferDescriptor) -> AxiomAllocation:
        """Allocate device memory."""
        if not self._initialized:
            raise OpenCLBackendError("NOT_INITIALIZED", "Backend not initialized")
        
        # Validate size
        if descriptor.sizeBytes <= 0:
            raise OpenCLBackendError("INVALID_SIZE", f"Buffer size must be positive, got {descriptor.sizeBytes}")
        
        max_size = self._capability_report.target.memory.globalBytes
        if descriptor.sizeBytes > max_size:
            raise OpenCLBackendError("SIZE_EXCEEDS_LIMIT", 
                f"Requested size {descriptor.sizeBytes} exceeds device memory {max_size}")
        
        allocation_id = f"alloc-{uuid.uuid4().hex[:12]}"
        cl_flags = self._flags_to_cl(descriptor.flags)
        
        # Create buffer
        try:
            cl_buffer = cl.Buffer(self.context, cl_flags, descriptor.sizeBytes)
        except cl.RuntimeError as e:
            raise OpenCLBackendError("ALLOCATION_FAILED", f"OpenCL buffer creation failed: {e}") from e
        
        allocation = AxiomAllocation(
            allocationId=allocation_id,
            buffer=descriptor,
            offset=0,
            sizeBytes=descriptor.sizeBytes,
            backendHandle=cl_buffer,
        )
        
        ocl_alloc = OpenCLAllocation(allocation, cl_buffer, self.context)
        self._allocations[allocation_id] = ocl_alloc
        
        self._log("debug", f"Allocated {descriptor.sizeBytes} bytes ({allocation_id})")
        return allocation
    
    async def free(self, allocation: AxiomAllocation):
        """Free device memory."""
        ocl_alloc = self._allocations.pop(allocation.allocationId, None)
        if ocl_alloc:
            try:
                ocl_alloc.unmap(self.queue) if ocl_alloc._mapped_ptr else None
                ocl_alloc.cl_buffer.release()
            except:
                pass
            self._log("debug", f"Freed allocation {allocation.allocationId}")
    
    async def map(self, allocation: AxiomAllocation) -> np.ndarray:
        """Map device memory to host."""
        ocl_alloc = self._allocations.get(allocation.allocationId)
        if not ocl_alloc:
            raise OpenCLBackendError("ALLOCATION_NOT_FOUND", f"Allocation {allocation.allocationId} not found")
        
        # Store queue reference for context manager
        ocl_alloc.queue = self.queue
        return ocl_alloc.map(self.queue)
    
    async def unmap(self, allocation: AxiomAllocation):
        """Unmap device memory."""
        ocl_alloc = self._allocations.get(allocation.allocationId)
        if not ocl_alloc:
            raise OpenCLBackendError("ALLOCATION_NOT_FOUND", f"Allocation {allocation.allocationId} not found")
        ocl_alloc.unmap(self.queue)
    
    async def copy(self, src: AxiomAllocation, dst: AxiomAllocation, size: int, srcOffset: int = 0, dstOffset: int = 0):
        """Copy between device allocations."""
        ocl_src = self._allocations.get(src.allocationId)
        ocl_dst = self._allocations.get(dst.allocationId)
        if not ocl_src or not ocl_dst:
            raise OpenCLBackendError("ALLOCATION_NOT_FOUND", "Source or destination allocation not found")
        
        cl.enqueue_copy(self.queue, ocl_dst.cl_buffer, ocl_src.cl_buffer,
                       byte_count=size, src_offset=srcOffset, dst_offset=dstOffset)
        self.queue.finish()
    
    async def fill(self, allocation: AxiomAllocation, pattern: bytes, offset: int = 0, size: Optional[int] = None):
        """Fill device memory with pattern."""
        ocl_alloc = self._allocations.get(allocation.allocationId)
        if not ocl_alloc:
            raise OpenCLBackendError("ALLOCATION_NOT_FOUND", f"Allocation {allocation.allocationId} not found")
        
        fill_size = size or (allocation.sizeBytes - offset)
        # Use simple fill for small patterns, or custom kernel for complex
        if len(pattern) == 1:
            cl.enqueue_fill_buffer(self.queue, ocl_alloc.cl_buffer, pattern, offset, fill_size)
        else:
            # Upload pattern to temp buffer and copy
            pattern_buf = cl.Buffer(self.context, cl.mem_flags.READ_ONLY | cl.mem_flags.COPY_HOST_PTR, hostbuf=pattern)
            cl.enqueue_copy(self.queue, ocl_alloc.cl_buffer, pattern_buf, src_offset=0, dst_offset=offset, size=fill_size)
        if self._enable_profiling:
            self.queue.finish()

    # =========================================================================
    # KERNEL COMPILATION
    # =========================================================================
    
    def _compile_opencl_c(self, source: str, options: List[str]) -> Any:
        """Compile OpenCL C source to program."""
        cache_key = hashlib.sha256((source + " ".join(options)).encode()).hexdigest()[:16]
        if cache_key in self.program_cache:
            return self.program_cache[cache_key]
        
        program = cl.Program(self.context, source)
        try:
            program.build(options=options)
        except cl.RuntimeError as e:
            log = program.get_build_info(self.device, cl.program_build_info.LOG)
            raise OpenCLBackendError("COMPILATION_FAILED", f"OpenCL build failed: {log}") from e
        
        self.program_cache[cache_key] = program
        return program
    
    async def compile(self, module: AxiomIRModule, target: CapabilityTarget) -> AxiomExecutable:
        """Compile Axiom IR module to executable."""
        if not self._initialized:
            raise OpenCLBackendError("NOT_INITIALIZED", "Backend not initialized")
        
        start_time = time.time()
        
        if module.format == "opencl-c":
            # Direct OpenCL C source
            source = module.binary.decode('utf-8')
            options = module.metadata.get("compileOptions", [])
            program = self._compile_opencl_c(source, options)
        elif module.format == "spirv":
            # SPIR-V - need to convert via clCreateProgramWithIL (OpenCL 2.1+)
            raise OpenCLBackendError("UNSUPPORTED_FORMAT", "SPIR-V not yet supported in this backend")
        elif module.format == "llvm-ir":
            raise OpenCLBackendError("UNSUPPORTED_FORMAT", "LLVM-IR not supported; use OpenCL C or SPIR-V")
        else:
            raise OpenCLBackendError("UNSUPPORTED_FORMAT", f"Format {module.format} not supported")
        
        # Get kernel for entry point
        entry_point = module.entryPoints[0] if module.entryPoints else "kernel"
        if not hasattr(program, entry_point):
            raise OpenCLBackendError("ENTRY_POINT_NOT_FOUND", f"Entry point '{entry_point}' not found in program")
        
        kernel = getattr(program, entry_point)
        self.kernel_cache[entry_point] = kernel
        
        # Build pipeline layout from bindings metadata
        bindings_meta = module.metadata.get("pipelineLayout", {}).get("bindings", [])
        pipeline_layout = {
            "bindings": bindings_meta,
            "pushConstantRanges": module.metadata.get("pipelineLayout", {}).get("pushConstantRanges", []),
        }
        
        executable = AxiomExecutable(
            executableId=f"exec-{uuid.uuid4().hex[:12]}",
            module=module,
            entryPoint=entry_point,
            pipelineLayout=pipeline_layout,
            backendHandle=kernel,
            compileTimeMs=(time.time() - start_time) * 1000,
            compileLog=program.get_build_info(self.device, cl.program_build_info.LOG),
        )
        
        return executable
    
    async def createPipelineLayout(self, layout: Any) -> Any:
        """Create pipeline layout (OpenCL uses implicit layout from kernel args)."""
        return layout  # No-op for OpenCL

    # =========================================================================
    # DISPATCH
    # =========================================================================
    
    def _bind_kernel_args(self, kernel: Any, args: AxiomDispatchArgs):
        """Bind kernel arguments from dispatch args."""
        for binding in args.bindings:
            allocation = binding.get("allocation")
            if not allocation:
                continue
            ocl_alloc = self._allocations.get(allocation.allocationId)
            if not ocl_alloc:
                raise OpenCLBackendError("ALLOCATION_NOT_FOUND", f"Allocation {allocation.allocationId} not found for binding {binding['binding']}")
            
            # OpenCL kernel args are set by index
            # binding["binding"] corresponds to kernel arg index
            arg_index = binding["binding"]
            offset = binding.get("offset", 0)
            if offset > 0:
                # Create sub-buffer
                sub_buffer = cl.Buffer(self.context, cl.mem_flags.READ_WRITE, 
                                      size=binding.get("size", allocation.sizeBytes),
                                      origin=ocl_alloc.cl_buffer, offset=offset)
                kernel.set_arg(arg_index, sub_buffer)
            else:
                kernel.set_arg(arg_index, ocl_alloc.cl_buffer)
        
        # Push constants - pass as additional kernel args at the end
        if args.pushConstants:
            # This would need kernel signature awareness
            pass
    
    async def dispatch(self, executable: AxiomExecutable, args: AxiomDispatchArgs) -> AxiomFuture:
        """Dispatch kernel for execution."""
        if not self._initialized:
            raise OpenCLBackendError("NOT_INITIALIZED", "Backend not initialized")
        
        kernel = executable.backendHandle
        if kernel is None:
            raise OpenCLBackendError("INVALID_EXECUTABLE", "Executable has no kernel handle")
        
        # Validate workgroup count (global workgroups)
        wc = args.workgroupCount
        if not all(isinstance(wc.get(k, 0), int) and wc.get(k, 0) > 0 for k in ("x", "y", "z")):
            raise OpenCLBackendError("INVALID_WORKGROUP_COUNT", 
                f"Workgroup count must have positive x,y,z values, got {wc}")
        
        # Check global workgroup count against reasonable limits
        total_global_wg = wc["x"] * wc["y"] * wc["z"]
        if total_global_wg > 65535:  # Reasonable upper bound
            raise OpenCLBackendError("EXCESSIVE_GLOBAL_WORKGROUPS",
                f"Total global workgroups {total_global_wg} exceeds reasonable limit 65535")
        
        # Validate workgroup size (local workgroup size)
        ws = args.workgroupSize or {"x": 16, "y": 16, "z": 1}
        if not all(isinstance(ws.get(k, 0), int) and ws.get(k, 0) > 0 for k in ("x", "y", "z")):
            raise OpenCLBackendError("INVALID_WORKGROUP_SIZE",
                f"Workgroup size must have positive x,y,z values, got {ws}")
        
        # Check against device limits
        max_wg = self._capability_report.target.maxWorkgroupSize
        if ws["x"] * ws["y"] * ws["z"] > max_wg:
            raise OpenCLBackendError("WORKGROUP_SIZE_EXCEEDED",
                f"Workgroup size {ws['x']*ws['y']*ws['z']} exceeds device max {max_wg}")
        
        max_dims = self._capability_report.target.maxWorkgroupDimensions
        if ws["x"] > max_dims["x"] or ws["y"] > max_dims["y"] or ws["z"] > max_dims["z"]:
            raise OpenCLBackendError("WORKGROUP_DIM_EXCEEDED",
                f"Workgroup dimensions {ws} exceed device max {max_dims}")
        
        future_id = f"future-{uuid.uuid4().hex[:12]}"
        submit_time = time.time()
        
        # Bind arguments
        self._bind_kernel_args(kernel, args)
        
        # Calculate global size
        global_size = (
            args.workgroupCount["x"] * ws["x"],
            args.workgroupCount["y"] * ws["y"],
            args.workgroupCount["z"] * ws["z"],
        )
        local_size = (ws["x"], ws["y"], ws["z"])
        
        # Enqueue kernel
        if self._enable_profiling:
            event = cl.enqueue_nd_range_kernel(self.queue, kernel, global_size, local_size)
            event.wait()
            # Get profiling info
            start = event.profile.start
            end = event.profile.end
            gpu_time_ns = end - start
        else:
            cl.enqueue_nd_range_kernel(self.queue, kernel, global_size, local_size)
            gpu_time_ns = None
        
        end_time = time.time()
        
        future = AxiomFuture(
            futureId=future_id,
            status="completed",
            submitTime=submit_time,
            startTime=submit_time,
            endTime=end_time,
            backendHandle=None,
        )
        
        self._futures[future_id] = future
        self._log("debug", f"Dispatched {executable.entryPoint} ({global_size}/{local_size})")
        
        return future
    
    async def synchronize(self, future: AxiomFuture, timeoutMs: Optional[int] = None) -> AxiomResult:
        """Synchronize and get result."""
        if future.status == "completed":
            return AxiomResult(
                success=True,
                future=future,
                outputAllocations=[],  # Outputs are in the bound allocations
            )
        
        # Wait for completion
        self.queue.finish()
        future.status = "completed"
        future.endTime = time.time()
        
        return AxiomResult(
            success=True,
            future=future,
            outputAllocations=[],
        )
    
    async def profile(self, future: AxiomFuture) -> AxiomProfile:
        """Get profiling info for a completed future."""
        duration_ns = int((future.endTime - future.startTime) * 1e9) if future.endTime and future.startTime else 0
        
        return AxiomProfile(
            durationNs=duration_ns,
            gpuTimeNs=None,
            workgroupCount={},
            workgroupSize={},
        )

    # =========================================================================
    # UTILITIES
    # =========================================================================
    
    async def queryTimestamp(self) -> int:
        """Query device timestamp."""
        # OpenCL doesn't have a direct device timestamp query
        # Return host time as fallback
        return int(time.time() * 1e9)
    
    def getDeviceProperties(self) -> CapabilityTarget:
        """Get device properties."""
        if self._capability_report:
            return self._capability_report.target
        raise OpenCLBackendError("NOT_INITIALIZED", "Backend not initialized")


class OpenCLBackendFactory:
    """Factory for creating OpenCL backend instances."""
    
    def __init__(self):
        self.backendType = "opencl"
        self.name = "Axiom OpenCL Backend"
        self.version = "0.1.0"
    
    async def probe(self) -> Optional[CapabilityReport]:
        """Probe for OpenCL devices."""
        backend = OpenCLBackend()
        return await backend.probe()
    
    async def createDevice(self, deviceId: str, config: Optional[AxiomDeviceConfig] = None) -> OpenCLBackend:
        """Create and initialize a device."""
        backend = OpenCLBackend(config)
        backend.deviceId = deviceId
        result = await backend.initialize(config)
        if not result.success:
            raise OpenCLBackendError("INIT_FAILED", result.message or "Initialization failed")
        return backend
    
    def getSupportedISAs(self) -> List[str]:
        return ["gcn", "rdna", "cdna", "unknown"]


# =============================================================================
# STANDALONE TEST
# =============================================================================

async def main():
    """Test the OpenCL backend."""
    print("=== Axiom-X OpenCL Backend Test ===")
    
    factory = OpenCLBackendFactory()
    
    # Probe
    print("\n--- Probing ---")
    report = await factory.probe()
    if not report:
        print("No OpenCL device found")
        return
    
    print(f"Backend: {report.backendId}")
    print(f"Device: {report.target.targetIdentity['deviceName']}")
    print(f"ISA: {report.target.targetIdentity['isa']}")
    print(f"Compute Units: {report.target.maxComputeUnits}")
    print(f"Max Workgroup: {report.target.maxWorkgroupSize}")
    print(f"Global Memory: {report.target.memory.globalBytes / (1024**3):.2f} GB")
    print(f"Local Memory: {report.target.memory.localBytes / 1024:.0f} KB")
    print(f"FP64: {report.target.numeric.fp64}")
    print(f"FP16: {report.target.numeric.fp16}")
    print(f"Subgroups: {report.target.subgroup.supported}")
    
    # Initialize
    print("\n--- Initializing ---")
    backend = OpenCLBackend()
    result = await backend.initialize()
    print(f"Success: {result.success}")
    print(f"Message: {result.message}")
    
    # Test allocation
    print("\n--- Allocation Test ---")
    desc = AxiomBufferDescriptor(sizeBytes=1024, flags=["read-write", "host-visible"])
    alloc = await backend.allocate(desc)
    print(f"Allocated: {alloc.allocationId} ({alloc.sizeBytes} bytes)")
    
    # Map and write
    mapped = await backend.map(alloc)
    if hasattr(mapped, 'tobytes'):
        mapped[:4] = np.frombuffer(b"test", dtype=np.uint8)
    else:
        mapped[:4] = b"test"
    await backend.unmap(alloc)
    print("Mapped, wrote, unmapped")
    
    # Free
    await backend.free(alloc)
    print("Freed")
    
    # Shutdown
    print("\n--- Shutdown ---")
    await backend.shutdown()
    print("Done")


if __name__ == "__main__":
    import asyncio
    asyncio.run(main())