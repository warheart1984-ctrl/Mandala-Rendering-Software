"""
Axiom Compute ABI Conformance Tests

Tests that backends implement the ABI correctly.
"""

from __future__ import annotations

import asyncio
import pytest
import sys
import numpy as np
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent / "axiom-x" / "backends" / "opencl"))

from OpenCLBackend import (
    OpenCLBackend,
    OpenCLBackendFactory,
    OpenCLBackendError,
    CapabilityFeature,
    SubgroupCapability,
    MemoryCapability,
    NumericCapability,
    CapabilityTarget,
    CapabilityReport,
    AxiomBufferDescriptor,
    AxiomAllocation,
    AxiomIRModule,
    AxiomExecutable,
    AxiomDispatchArgs,
    AxiomFuture,
    AxiomResult,
    AxiomProfile,
    AxiomDeviceConfig,
    AxiomInitResult,
    AXIOM_ABI_VERSION,
)

# Create factory instance
opencl_factory = OpenCLBackendFactory()


def run_async(coro):
    """Run async coroutine in sync context."""
    return asyncio.run(coro)


class TestABIVersion:
    """Test ABI version constant."""
    
    def test_abi_version_format(self):
        """ABI version should follow semver."""
        parts = AXIOM_ABI_VERSION.split(".")
        assert len(parts) == 3
        assert all(p.isdigit() for p in parts)


class TestCapabilityReport:
    """Test capability report structure."""
    
    def test_probe_returns_report(self):
        """Factory probe should return CapabilityReport or None."""
        report = run_async(opencl_factory.probe())
        # May be None if no OpenCL device
        if report is not None:
            assert isinstance(report, CapabilityReport)
            assert report.backendType == "opencl"
            assert report.abiVersion == AXIOM_ABI_VERSION
            assert report.backendId
            assert report.timestamp
            assert report.provenance["detectedBy"] == "pyopencl"
    
    def test_report_has_required_fields(self):
        """CapabilityReport must have all required fields."""
        report = run_async(opencl_factory.probe())
        if report is None:
            pytest.skip("No OpenCL device available")
        
        assert hasattr(report, "backendId")
        assert hasattr(report, "backendType")
        assert hasattr(report, "target")
        assert hasattr(report, "kernelsSupported")
        assert hasattr(report, "timestamp")
        assert hasattr(report, "abiVersion")
        assert hasattr(report, "provenance")
        assert report.abiVersion == AXIOM_ABI_VERSION


class TestCapabilityTarget:
    """Test CapabilityTarget structure."""
    
    def test_target_has_required_fields(self):
        """CapabilityTarget must have all required fields."""
        report = run_async(opencl_factory.probe())
        if report is None:
            pytest.skip("No OpenCL device available")
        
        target = report.target
        assert isinstance(target, CapabilityTarget)
        assert target.executionModel in ("gpu", "cpu")
        assert target.addressBits in (32, 64)
        assert isinstance(target.features, list)
        assert isinstance(target.subgroup, SubgroupCapability)
        assert isinstance(target.memory, MemoryCapability)
        assert isinstance(target.numeric, NumericCapability)
        assert isinstance(target.maxWorkgroupSize, int)
        assert isinstance(target.maxWorkgroupDimensions, dict)
        assert isinstance(target.maxComputeUnits, int)
        assert isinstance(target.clockFrequencyMHz, (int, float))
        assert isinstance(target.backend, dict)
        assert "name" in target.backend
        assert "version" in target.backend
        assert isinstance(target.targetIdentity, dict)
        assert "vendor" in target.targetIdentity
        assert "deviceName" in target.targetIdentity


class TestMemoryCapability:
    """Test MemoryCapability structure."""
    
    def test_memory_capability_fields(self):
        """MemoryCapability must have all required fields."""
        report = run_async(opencl_factory.probe())
        if report is None:
            pytest.skip("No OpenCL device available")
        
        mem = report.target.memory
        assert isinstance(mem.globalBytes, int)
        assert isinstance(mem.localBytes, int)
        assert isinstance(mem.constantBytes, int)
        assert isinstance(mem.unified, bool)
        assert isinstance(mem.hostMapping, bool)
        assert isinstance(mem.atomicSupport, bool)
        assert isinstance(mem.bufferOffsetAlignment, int)


class TestNumericCapability:
    """Test NumericCapability structure."""
    
    def test_numeric_capability_fields(self):
        """NumericCapability must have all required fields."""
        report = run_async(opencl_factory.probe())
        if report is None:
            pytest.skip("No OpenCL device available")
        
        num = report.target.numeric
        assert isinstance(num.fp16, bool)
        assert isinstance(num.fp32, bool)
        assert isinstance(num.fp64, bool)
        assert isinstance(num.bf16, bool)
        assert isinstance(num.int8, bool)
        assert isinstance(num.int16, bool)
        assert isinstance(num.int32, bool)
        assert isinstance(num.int64, bool)


class TestBackendLifecycle:
    """Test backend initialize/shutdown lifecycle."""
    
    def test_initialize_shutdown(self):
        """Backend should initialize and shutdown cleanly."""
        factory = OpenCLBackendFactory()
        report = run_async(factory.probe())
        if report is None:
            pytest.skip("No OpenCL device available")
        
        backend = run_async(factory.createDevice("test-device"))
        assert backend._initialized
        
        run_async(backend.shutdown())
        assert not backend._initialized
    
    def test_initialize_idempotent(self):
        """Multiple initialize calls should be safe."""
        factory = OpenCLBackendFactory()
        report = run_async(factory.probe())
        if report is None:
            pytest.skip("No OpenCL device available")
        
        backend = run_async(factory.createDevice("test-device"))
        result1 = run_async(backend.initialize())
        result2 = run_async(backend.initialize())
        assert result1.success
        assert result2.success
        
        run_async(backend.shutdown())


class TestMemoryManagement:
    """Test memory allocation/free/map/unmap."""
    
    def test_allocate_free(self):
        """Allocate and free should work."""
        factory = OpenCLBackendFactory()
        report = run_async(factory.probe())
        if report is None:
            pytest.skip("No OpenCL device available")
        
        backend = run_async(factory.createDevice("test-mem"))
        
        desc = AxiomBufferDescriptor(sizeBytes=4096, flags=["read-write"])
        alloc = run_async(backend.allocate(desc))
        
        assert alloc.allocationId
        assert alloc.sizeBytes == 4096
        assert alloc.backendHandle is not None
        
        run_async(backend.free(alloc))
        # Second free should be safe
        run_async(backend.free(alloc))
        
        run_async(backend.shutdown())
    
    def test_allocate_with_flags(self):
        """Allocate with various flags."""
        factory = OpenCLBackendFactory()
        report = run_async(factory.probe())
        if report is None:
            pytest.skip("No OpenCL device available")
        
        backend = run_async(factory.createDevice("test-flags"))
        
        # Read-write, host-visible
        desc = AxiomBufferDescriptor(sizeBytes=1024, flags=["read-write", "host-visible"])
        alloc1 = run_async(backend.allocate(desc))
        assert alloc1.sizeBytes == 1024
        run_async(backend.free(alloc1))
        
        # Read-only
        desc = AxiomBufferDescriptor(sizeBytes=1024, flags=["read-only"])
        alloc2 = run_async(backend.allocate(desc))
        assert alloc2.sizeBytes == 1024
        run_async(backend.free(alloc2))
        
        run_async(backend.shutdown())
    
    def test_map_unmap(self):
        """Map and unmap should work."""
        factory = OpenCLBackendFactory()
        report = run_async(factory.probe())
        if report is None:
            pytest.skip("No OpenCL device available")
        
        backend = run_async(factory.createDevice("test-map"))
        
        desc = AxiomBufferDescriptor(sizeBytes=1024, flags=["read-write", "host-visible"])
        alloc = run_async(backend.allocate(desc))
        
        mapped = run_async(backend.map(alloc))
        assert mapped is not None
        assert len(mapped) == 1024
        
        # Write test data
        mapped[:4] = [0xde, 0xad, 0xbe, 0xef]
        
        run_async(backend.unmap(alloc))
        
        run_async(backend.free(alloc))
        run_async(backend.shutdown())
    
    def test_copy(self):
        """Copy between allocations."""
        factory = OpenCLBackendFactory()
        report = run_async(factory.probe())
        if report is None:
            pytest.skip("No OpenCL device available")
        
        backend = run_async(factory.createDevice("test-copy"))
        
        desc = AxiomBufferDescriptor(sizeBytes=1024, flags=["read-write"])
        src = run_async(backend.allocate(desc))
        dst = run_async(backend.allocate(desc))
        
        # Write to src using explicit write buffer
        import pyopencl as cl
        src_data = np.array([0xde, 0xad, 0xbe, 0xef] + [0]*1020, dtype=np.uint8)
        cl._enqueue_write_buffer(backend.queue, src.backendHandle, src_data, 0).wait()
        
        # Copy src -> dst
        run_async(backend.copy(src, dst, 1024))
        
        # Verify dst
        result = np.empty(1024, dtype=np.uint8)
        cl._enqueue_read_buffer(backend.queue, dst.backendHandle, result, 0).wait()
        assert result[0] == 0xde
        assert result[1] == 0xad
        assert result[2] == 0xbe
        assert result[3] == 0xef
        
        run_async(backend.free(src))
        run_async(backend.free(dst))
        run_async(backend.shutdown())


class TestContextManager:
    """Test context manager pattern for mapping."""
    
    def test_context_manager(self):
        """Context manager should map/unmap automatically."""
        factory = OpenCLBackendFactory()
        report = run_async(factory.probe())
        if report is None:
            pytest.skip("No OpenCL device available")
        
        backend = run_async(factory.createDevice("test-cm"))
        
        desc = AxiomBufferDescriptor(sizeBytes=1024, flags=["read-write", "host-visible"])
        alloc = run_async(backend.allocate(desc))
        
        # Get the internal allocation object
        ocl_alloc = backend._allocations[alloc.allocationId]
        ocl_alloc.queue = backend.queue
        
        # Use context manager
        with ocl_alloc as mapped:
            assert mapped is not None
            mapped[:4] = [0xde, 0xad, 0xbe, 0xef]
        
        # Should be unmapped automatically
        run_async(backend.free(alloc))
        run_async(backend.shutdown())


class TestDispatch:
    """Test kernel dispatch (requires compilable kernel)."""
    
    def test_dispatch_simple(self):
        """Dispatch a simple kernel."""
        factory = OpenCLBackendFactory()
        report = run_async(factory.probe())
        if report is None:
            pytest.skip("No OpenCL device available")
        
        backend = run_async(factory.createDevice("test-dispatch"))
        
        # Create a simple OpenCL C module - use only 1 arg (output buffer)
        source = """
        __kernel void test_kernel(__global uchar *out) {
            int idx = get_global_id(0);
            out[idx] = (uchar)(idx & 0xFF);
        }
        """
        
        module = AxiomIRModule(
            moduleId="test-module",
            format="opencl-c",
            abiVersion=AXIOM_ABI_VERSION,
            binary=source.encode('utf-8'),
            entryPoints=["test_kernel"],
            metadata={
                "sourceHash": "test",
                "compileOptions": [],
                "requiredFeatures": [],
            }
        )
        
        target = backend.getDeviceProperties()
        executable = run_async(backend.compile(module, target))
        assert executable.executableId
        assert executable.backendHandle is not None
        
        # Allocate output buffer
        desc = AxiomBufferDescriptor(sizeBytes=256, flags=["read-write", "host-visible"])
        out_alloc = run_async(backend.allocate(desc))
        
        # Dispatch
        dispatch_args = AxiomDispatchArgs(
            workgroupCount={"x": 1, "y": 1, "z": 1},
            workgroupSize={"x": 256, "y": 1, "z": 1},
            bindings=[
                {"binding": 0, "allocation": out_alloc},
            ],
        )
        
        future = run_async(backend.dispatch(executable, dispatch_args))
        assert future.futureId
        
        result = run_async(backend.synchronize(future))
        assert result.success
        
        # Verify output
        mapped = run_async(backend.map(out_alloc))
        for i in range(256):
            assert mapped[i] == (i & 0xFF), f"Byte {i} = {mapped[i]}, expected {i & 0xFF}"
        
        run_async(backend.unmap(out_alloc))
        run_async(backend.free(out_alloc))
        run_async(backend.shutdown())


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])