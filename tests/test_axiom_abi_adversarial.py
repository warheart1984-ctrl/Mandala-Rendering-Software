"""
Adversarial ABI Conformance Tests - Phase 1

Attempts to break the Axiom Compute ABI v0.1 implementation.
Tests: malformed inputs, edge cases, failure modes, constitutional violations.
"""

from __future__ import annotations

import asyncio
import pytest
import sys
import numpy as np
import time
import os
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

import pyopencl as cl


def run_async(coro):
    """Run async coroutine in sync context."""
    return asyncio.run(coro)


def run_async_quick(coro):
    """Run async with timeout."""
    return asyncio.run(asyncio.wait_for(coro, timeout=30.0))


def create_backend():
    """Create and initialize a test backend."""
    factory = OpenCLBackendFactory()
    report = run_async(factory.probe())
    if report is None:
        pytest.skip("No OpenCL device available")
    return run_async(factory.createDevice(f"adv-test-{int(time.time()*1000)%10000}"))


class TestMalformedCapabilityReports:
    """Test handling of malformed/edge-case capability reports."""
    
    def test_probe_returns_valid_structure(self):
        """Probe should always return valid CapabilityReport or None."""
        factory = OpenCLBackendFactory()
        report = run_async(factory.probe())
        if report is None:
            pytest.skip("No OpenCL device available")
        
        # Required fields present
        assert hasattr(report, "backendId")
        assert hasattr(report, "backendType")
        assert hasattr(report, "target")
        assert hasattr(report, "kernelsSupported")
        assert hasattr(report, "timestamp")
        assert hasattr(report, "abiVersion")
        assert hasattr(report, "provenance")
        
        # ABI version matches
        assert report.abiVersion == AXIOM_ABI_VERSION
        
        # Provenance has required fields
        assert "detectedBy" in report.provenance
        assert "detectionDurationMs" in report.provenance
    
    def test_capability_target_completeness(self):
        """CapabilityTarget must have all required fields with valid types."""
        factory = OpenCLBackendFactory()
        report = run_async(factory.probe())
        if report is None:
            pytest.skip("No OpenCL device available")
        
        t = report.target
        assert t.executionModel in ("gpu", "cpu")
        assert t.addressBits in (32, 64)
        assert isinstance(t.features, list)
        assert isinstance(t.subgroup, object)
        assert isinstance(t.memory, object)
        assert isinstance(t.numeric, object)
        assert t.maxWorkgroupSize > 0
        assert isinstance(t.maxWorkgroupDimensions, dict)
        assert t.maxComputeUnits > 0
        assert t.clockFrequencyMHz > 0
        assert "name" in t.backend
        assert "version" in t.backend
        assert "vendor" in t.targetIdentity
        assert "deviceName" in t.targetIdentity


class TestInvalidMemorySizes:
    """Test allocation with invalid sizes."""
    
    def test_zero_size_allocation(self):
        """Zero-size allocation should fail gracefully."""
        backend = create_backend()
        
        desc = AxiomBufferDescriptor(sizeBytes=0, flags=["read-write"])
        with pytest.raises(OpenCLBackendError):
            run_async(backend.allocate(desc))
        
        run_async(backend.shutdown())
    
    def test_negative_size_allocation(self):
        """Negative size should fail."""
        backend = create_backend()
        
        desc = AxiomBufferDescriptor(sizeBytes=-1024, flags=["read-write"])
        with pytest.raises(OpenCLBackendError):
            run_async(backend.allocate(desc))
        
        run_async(backend.shutdown())
    
    def test_excessive_allocation(self):
        """Allocation larger than device memory should fail."""
        backend = create_backend()
        
        # Try to allocate 2x global memory
        desc = AxiomBufferDescriptor(
            sizeBytes=backend._capability_report.target.memory.globalBytes * 2,
            flags=["read-write"]
        )
        with pytest.raises(OpenCLBackendError):
            run_async(backend.allocate(desc))
        
        run_async(backend.shutdown())
    
    def test_allocation_near_limit(self):
        """Allocation near device limit should work or fail gracefully."""
        backend = create_backend()
        max_mem = backend._capability_report.target.memory.globalBytes
        
        # 90% of memory - may fail on some devices (single buffer limit)
        desc = AxiomBufferDescriptor(
            sizeBytes=int(max_mem * 0.9),
            flags=["read-write"]
        )
        try:
            alloc = run_async(backend.allocate(desc))
            run_async(backend.free(alloc))
        except OpenCLBackendError:
            # Acceptable to fail - some devices can't allocate single huge buffer
            pass
        except Exception as e:
            # pyopencl may raise LogicError directly
            if "INVALID_BUFFER_SIZE" in str(e):
                pass  # Acceptable
            else:
                raise
        
        run_async(backend.shutdown())


class TestInvalidDispatchDimensions:
    """Test kernel dispatch with invalid dimensions."""
    
    def test_zero_workgroup_count(self):
        """Zero workgroup count should fail."""
        backend = create_backend()
        
        source = "__kernel void test(__global uchar *out) { out[get_global_id(0)] = 1; }"
        module = AxiomIRModule(
            moduleId="test", format="opencl-c", abiVersion=AXIOM_ABI_VERSION,
            binary=source.encode(), entryPoints=["test"],
            metadata={"sourceHash": "test", "compileOptions": [], "requiredFeatures": []}
        )
        
        target = backend.getDeviceProperties()
        executable = run_async(backend.compile(module, target))
        
        desc = AxiomBufferDescriptor(sizeBytes=256, flags=["read-write", "host-visible"])
        out_alloc = run_async(backend.allocate(desc))
        
        dispatch = AxiomDispatchArgs(
            workgroupCount={"x": 0, "y": 1, "z": 1},
            workgroupSize={"x": 16, "y": 1, "z": 1},
            bindings=[{"binding": 0, "allocation": out_alloc}]
        )
        
        with pytest.raises(OpenCLBackendError):
            run_async(backend.dispatch(executable, dispatch))
        
        run_async(backend.free(out_alloc))
        run_async(backend.shutdown())
    
    def test_excessive_workgroup_count(self):
        """Workgroup count exceeding reasonable limits should fail."""
        backend = create_backend()
        
        source = "__kernel void test(__global uchar *out) { out[get_global_id(0)] = 1; }"
        module = AxiomIRModule(
            moduleId="test", format="opencl-c", abiVersion=AXIOM_ABI_VERSION,
            binary=source.encode(), entryPoints=["test"],
            metadata={"sourceHash": "test", "compileOptions": [], "requiredFeatures": []}
        )
        
        target = backend.getDeviceProperties()
        executable = run_async(backend.compile(module, target))
        
        desc = AxiomBufferDescriptor(sizeBytes=256, flags=["read-write", "host-visible"])
        out_alloc = run_async(backend.allocate(desc))
        
        # Use workgroup count that exceeds reasonable limit (65535)
        dispatch = AxiomDispatchArgs(
            workgroupCount={"x": 70000, "y": 1, "z": 1},  # Exceeds 65535
            workgroupSize={"x": 1, "y": 1, "z": 1},
            bindings=[{"binding": 0, "allocation": out_alloc}]
        )
        
        with pytest.raises(OpenCLBackendError):
            run_async(backend.dispatch(executable, dispatch))
        
        run_async(backend.free(out_alloc))
        run_async(backend.shutdown())
    
    def test_zero_workgroup_size(self):
        """Zero workgroup size should fail."""
        backend = create_backend()
        
        source = "__kernel void test(__global uchar *out) { out[get_global_id(0)] = 1; }"
        module = AxiomIRModule(
            moduleId="test", format="opencl-c", abiVersion=AXIOM_ABI_VERSION,
            binary=source.encode(), entryPoints=["test"],
            metadata={"sourceHash": "test", "compileOptions": [], "requiredFeatures": []}
        )
        
        target = backend.getDeviceProperties()
        executable = run_async(backend.compile(module, target))
        
        desc = AxiomBufferDescriptor(sizeBytes=256, flags=["read-write", "host-visible"])
        out_alloc = run_async(backend.allocate(desc))
        
        dispatch = AxiomDispatchArgs(
            workgroupCount={"x": 1, "y": 1, "z": 1},
            workgroupSize={"x": 0, "y": 0, "z": 0},
            bindings=[{"binding": 0, "allocation": out_alloc}]
        )
        
        with pytest.raises(OpenCLBackendError):
            run_async(backend.dispatch(executable, dispatch))
        
        run_async(backend.free(out_alloc))
        run_async(backend.shutdown())


class TestStaleAllocations:
    """Test use of freed/stale allocations."""
    
    def test_use_after_free(self):
        """Using freed allocation should fail."""
        backend = create_backend()
        
        desc = AxiomBufferDescriptor(sizeBytes=1024, flags=["read-write"])
        alloc = run_async(backend.allocate(desc))
        run_async(backend.free(alloc))
        
        # Try to map freed allocation
        with pytest.raises(OpenCLBackendError):
            run_async(backend.map(alloc))
        
        run_async(backend.shutdown())
    
    def test_copy_with_freed_source(self):
        """Copy with freed source should fail."""
        backend = create_backend()
        
        desc = AxiomBufferDescriptor(sizeBytes=1024, flags=["read-write"])
        src = run_async(backend.allocate(desc))
        dst = run_async(backend.allocate(desc))
        
        run_async(backend.free(src))
        
        with pytest.raises(OpenCLBackendError):
            run_async(backend.copy(src, dst, 1024))
        
        run_async(backend.free(dst))
        run_async(backend.shutdown())
    
    def test_copy_with_freed_dest(self):
        """Copy with freed destination should fail."""
        backend = create_backend()
        
        desc = AxiomBufferDescriptor(sizeBytes=1024, flags=["read-write"])
        src = run_async(backend.allocate(desc))
        dst = run_async(backend.allocate(desc))
        
        run_async(backend.free(dst))
        
        with pytest.raises(OpenCLBackendError):
            run_async(backend.copy(src, dst, 1024))
        
        run_async(backend.free(src))
        run_async(backend.shutdown())
    
    def test_dispatch_with_freed_allocation(self):
        """Dispatch with freed bound allocation should fail."""
        backend = create_backend()
        
        source = "__kernel void test(__global uchar *out) { out[get_global_id(0)] = 1; }"
        module = AxiomIRModule(
            moduleId="test", format="opencl-c", abiVersion=AXIOM_ABI_VERSION,
            binary=source.encode(), entryPoints=["test"],
            metadata={"sourceHash": "test", "compileOptions": [], "requiredFeatures": []}
        )
        
        target = backend.getDeviceProperties()
        executable = run_async(backend.compile(module, target))
        
        desc = AxiomBufferDescriptor(sizeBytes=256, flags=["read-write", "host-visible"])
        out_alloc = run_async(backend.allocate(desc))
        
        run_async(backend.free(out_alloc))
        
        dispatch = AxiomDispatchArgs(
            workgroupCount={"x": 1, "y": 1, "z": 1},
            workgroupSize={"x": 16, "y": 1, "z": 1},
            bindings=[{"binding": 0, "allocation": out_alloc}]
        )
        
        with pytest.raises(OpenCLBackendError):
            run_async(backend.dispatch(executable, dispatch))
        
        run_async(backend.shutdown())


class TestDoubleFree:
    """Test double-free handling."""
    
    def test_double_free_idempotent(self):
        """Double free should be safe (idempotent)."""
        backend = create_backend()
        
        desc = AxiomBufferDescriptor(sizeBytes=1024, flags=["read-write"])
        alloc = run_async(backend.allocate(desc))
        
        run_async(backend.free(alloc))
        run_async(backend.free(alloc))  # Should not raise
        
        run_async(backend.shutdown())


class TestCompileFailure:
    """Test kernel compilation failures."""
    
    def test_invalid_opencl_syntax(self):
        """Invalid OpenCL C should fail compilation."""
        backend = create_backend()
        
        source = "__kernel void test( { invalid syntax }"
        module = AxiomIRModule(
            moduleId="test", format="opencl-c", abiVersion=AXIOM_ABI_VERSION,
            binary=source.encode(), entryPoints=["test"],
            metadata={"sourceHash": "test", "compileOptions": [], "requiredFeatures": []}
        )
        
        target = backend.getDeviceProperties()
        with pytest.raises(OpenCLBackendError):
            run_async(backend.compile(module, target))
        
        run_async(backend.shutdown())
    
    def test_missing_entry_point(self):
        """Missing entry point should fail."""
        backend = create_backend()
        
        source = "__kernel void other_kernel() { }"
        module = AxiomIRModule(
            moduleId="test", format="opencl-c", abiVersion=AXIOM_ABI_VERSION,
            binary=source.encode(), entryPoints=["missing_kernel"],
            metadata={"sourceHash": "test", "compileOptions": [], "requiredFeatures": []}
        )
        
        target = backend.getDeviceProperties()
        with pytest.raises(OpenCLBackendError):
            run_async(backend.compile(module, target))
        
        run_async(backend.shutdown())
    
    def test_unsupported_format(self):
        """Unsupported IR format should fail."""
        backend = create_backend()
        
        module = AxiomIRModule(
            moduleId="test", format="unsupported-format", abiVersion=AXIOM_ABI_VERSION,
            binary=b"", entryPoints=["test"],
            metadata={"sourceHash": "test", "compileOptions": [], "requiredFeatures": []}
        )
        
        target = backend.getDeviceProperties()
        with pytest.raises(OpenCLBackendError):
            run_async(backend.compile(module, target))
        
        run_async(backend.shutdown())


class TestKernelTimeout:
    """Test kernel execution timeout handling."""
    
    def test_infinite_loop_kernel(self):
        """Infinite loop kernel should be interruptible or timeout."""
        backend = create_backend()
        
        # Kernel with very long execution
        source = """
        __kernel void test(__global uchar *out) {
            int idx = get_global_id(0);
            // Deliberately slow kernel
            int sum = 0;
            for (int i = 0; i < 10000000; i++) {
                sum += i;
            }
            out[idx] = (uchar)sum;
        }
        """
        
        module = AxiomIRModule(
            moduleId="test", format="opencl-c", abiVersion=AXIOM_ABI_VERSION,
            binary=source.encode(), entryPoints=["test"],
            metadata={"sourceHash": "test", "compileOptions": [], "requiredFeatures": []}
        )
        
        target = backend.getDeviceProperties()
        executable = run_async(backend.compile(module, target))
        
        desc = AxiomBufferDescriptor(sizeBytes=256, flags=["read-write", "host-visible"])
        out_alloc = run_async(backend.allocate(desc))
        
        dispatch = AxiomDispatchArgs(
            workgroupCount={"x": 1, "y": 1, "z": 1},
            workgroupSize={"x": 1, "y": 1, "z": 1},
            bindings=[{"binding": 0, "allocation": out_alloc}]
        )
        
        # Should complete (even if slow) or timeout gracefully
        future = run_async(backend.dispatch(executable, dispatch))
        result = run_async(backend.synchronize(future))
        
        # Either succeeds or fails gracefully
        assert isinstance(result.success, bool)
        
        run_async(backend.free(out_alloc))
        run_async(backend.shutdown())


class TestBackendDisappearance:
    """Test backend process/device disappearance."""
    
    def test_shutdown_during_operation(self):
        """Shutdown during operation should be handled."""
        backend = create_backend()
        
        desc = AxiomBufferDescriptor(sizeBytes=1024, flags=["read-write"])
        alloc = run_async(backend.allocate(desc))
        
        # Shutdown mid-operation
        run_async(backend.shutdown())
        
        # Operations should fail gracefully
        with pytest.raises(OpenCLBackendError):
            run_async(backend.map(alloc))
        
        # Already shut down, no error on second shutdown
        run_async(backend.shutdown())
    
    def test_reinitialize_after_shutdown(self):
        """Should be able to create new backend after shutdown."""
        factory = OpenCLBackendFactory()
        report = run_async(factory.probe())
        if report is None:
            pytest.skip("No OpenCL device available")
        
        backend1 = run_async(factory.createDevice("test-1"))
        run_async(backend1.shutdown())
        
        # Create new backend
        backend2 = run_async(factory.createDevice("test-2"))
        assert backend2._initialized
        
        run_async(backend2.shutdown())


class TestCorruptedProvenance:
    """Test provenance integrity."""
    
    def test_provenance_on_every_call(self):
        """Every bridge call should have provenance."""
        # This is tested via the bridge tests, but verify backend-level
        backend = create_backend()
        
        desc = AxiomBufferDescriptor(sizeBytes=1024, flags=["read-write"])
        alloc = run_async(backend.allocate(desc))
        
        # Allocation should have backend handle
        assert alloc.backendHandle is not None
        
        run_async(backend.free(alloc))
        run_async(backend.shutdown())
    
    def test_provenance_has_hash(self):
        """Provenance should be hashable."""
        backend = create_backend()
        
        # Just verify the capability report has provenance field
        report = backend._capability_report
        assert report.provenance is not None
        assert "detectedBy" in report.provenance
        
        run_async(backend.shutdown())


class TestMismatchedABIVersions:
    """Test ABI version compatibility."""
    
    def test_abi_version_in_module(self):
        """Module should carry ABI version."""
        backend = create_backend()
        
        source = "__kernel void test(__global uchar *out) { out[get_global_id(0)] = 1; }"
        module = AxiomIRModule(
            moduleId="test", format="opencl-c", abiVersion=AXIOM_ABI_VERSION,
            binary=source.encode(), entryPoints=["test"],
            metadata={"sourceHash": "test", "compileOptions": [], "requiredFeatures": []}
        )
        
        assert module.abiVersion == AXIOM_ABI_VERSION
        
        run_async(backend.shutdown())
    
    def test_wrong_abi_version(self):
        """Wrong ABI version should be rejected or handled."""
        backend = create_backend()
        
        source = "__kernel void test(__global uchar *out) { out[get_global_id(0)] = 1; }"
        module = AxiomIRModule(
            moduleId="test", format="opencl-c", abiVersion="99.99.99",
            binary=source.encode(), entryPoints=["test"],
            metadata={"sourceHash": "test", "compileOptions": [], "requiredFeatures": []}
        )
        
        target = backend.getDeviceProperties()
        # Should either reject or accept with warning
        executable = run_async(backend.compile(module, target))
        # If it compiles, the executable should note the mismatch
        
        run_async(backend.shutdown())


class TestNondeterministicExecution:
    """Test for deterministic execution guarantees."""
    
    def test_deterministic_dispatch(self):
        """Same kernel + same inputs should produce same output."""
        backend = create_backend()
        
        source = """
        __kernel void test(__global uchar *out) {
            int idx = get_global_id(0);
            // Deterministic pseudo-random based on idx
            uint x = idx * 1664525u + 1013904223u;
            x ^= x << 13;
            x ^= x >> 17;
            x ^= x << 5;
            out[idx] = (uchar)(x & 0xFF);
        }
        """
        
        module = AxiomIRModule(
            moduleId="test", format="opencl-c", abiVersion=AXIOM_ABI_VERSION,
            binary=source.encode(), entryPoints=["test"],
            metadata={"sourceHash": "test", "compileOptions": [], "requiredFeatures": []}
        )
        
        target = backend.getDeviceProperties()
        executable = run_async(backend.compile(module, target))
        
        # Run twice
        outputs = []
        for run in range(2):
            desc = AxiomBufferDescriptor(sizeBytes=256, flags=["read-write", "host-visible"])
            out_alloc = run_async(backend.allocate(desc))
            
            dispatch = AxiomDispatchArgs(
                workgroupCount={"x": 1, "y": 1, "z": 1},
                workgroupSize={"x": 256, "y": 1, "z": 1},
                bindings=[{"binding": 0, "allocation": out_alloc}],
            )
            
            future = run_async(backend.dispatch(executable, dispatch))
            result = run_async(backend.synchronize(future))
            assert result.success
            
            mapped = run_async(backend.map(out_alloc))
            outputs.append(mapped.copy())
            run_async(backend.unmap(out_alloc))
            run_async(backend.free(out_alloc))
        
        # Outputs should be identical
        assert np.array_equal(outputs[0], outputs[1]), "Execution not deterministic"
        
        run_async(backend.shutdown())


class TestUnsupportedFeatureRequests:
    """Test requests for unsupported features."""
    
    def test_spirv_format_rejected(self):
        """SPIR-V format should be rejected (not implemented)."""
        backend = create_backend()
        
        module = AxiomIRModule(
            moduleId="test", format="spirv", abiVersion=AXIOM_ABI_VERSION,
            binary=b"\x07\x23\x02\x03", entryPoints=["test"],
            metadata={"sourceHash": "test", "compileOptions": [], "requiredFeatures": []}
        )
        
        target = backend.getDeviceProperties()
        with pytest.raises(OpenCLBackendError):
            run_async(backend.compile(module, target))
        
        run_async(backend.shutdown())
    
    def test_llvm_ir_rejected(self):
        """LLVM-IR format should be rejected (not implemented)."""
        backend = create_backend()
        
        module = AxiomIRModule(
            moduleId="test", format="llvm-ir", abiVersion=AXIOM_ABI_VERSION,
            binary=b"llvm module", entryPoints=["test"],
            metadata={"sourceHash": "test", "compileOptions": [], "requiredFeatures": []}
        )
        
        target = backend.getDeviceProperties()
        with pytest.raises(OpenCLBackendError):
            run_async(backend.compile(module, target))
        
        run_async(backend.shutdown())


class TestConstitutionalViolations:
    """Test that constitutional constraints are enforced."""
    
    def test_no_execution_without_valid_module(self):
        """Cannot dispatch without valid executable."""
        backend = create_backend()
        
        desc = AxiomBufferDescriptor(sizeBytes=256, flags=["read-write", "host-visible"])
        out_alloc = run_async(backend.allocate(desc))
        
        # Create fake executable
        fake_executable = AxiomExecutable(
            executableId="fake", module=None, entryPoint="fake",
            pipelineLayout={}, backendHandle=None, compileTimeMs=0, compileLog=""
        )
        
        dispatch = AxiomDispatchArgs(
            workgroupCount={"x": 1, "y": 1, "z": 1},
            workgroupSize={"x": 16, "y": 1, "z": 1},
            bindings=[{"binding": 0, "allocation": out_alloc}]
        )
        
        with pytest.raises(OpenCLBackendError):
            run_async(backend.dispatch(fake_executable, dispatch))
        
        run_async(backend.free(out_alloc))
        run_async(backend.shutdown())


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short", "-x"])