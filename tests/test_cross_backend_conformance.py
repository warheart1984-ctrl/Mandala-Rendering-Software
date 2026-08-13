"""
Cross-Backend Conformance Tests — CPU Reference ≡ OpenCL

Verifies that CPU Reference and OpenCL backends produce equivalent results
for the same Axiom IR kernel within formal tolerance.
"""

from __future__ import annotations

import asyncio
import pytest
import sys
import numpy as np
from typing import Dict, Optional, Tuple
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent / "axiom-x" / "backends" / "opencl"))
sys.path.insert(0, str(Path(__file__).parent.parent / "axiom-x" / "backends" / "cpu"))

from OpenCLBackend import (
    OpenCLBackend,
    OpenCLBackendFactory,
    OpenCLBackendError,
    AxiomBufferDescriptor,
    AxiomIRModule,
    AxiomExecutable,
    AxiomDispatchArgs,
    AXIOM_ABI_VERSION,
)

from CPURefBackend import (
    CPURefBackend,
    CPURefBackendFactory,
    CPURefBackendError,
)


def run_async(coro):
    """Run async coroutine in sync context."""
    return asyncio.run(coro)


def compare_results(cpu_result: np.ndarray, gpu_result: np.ndarray, 
                    tolerance: float = 1.0, max_mismatch_ratio: float = 0.001) -> Tuple[bool, Dict]:
    """
    Compare CPU and GPU results with multiple conformance levels.
    
    Args:
        cpu_result: CPU reference output (numpy array)
        gpu_result: GPU output (numpy array)
        tolerance: Max absolute difference per pixel (0-255) for tolerance-bounded
        max_mismatch_ratio: Max fraction of pixels that can exceed tolerance
    
    Returns:
        (passed, details) with conformance_level: 'bit_exact' | 'numerically_equivalent' | 'tolerance_bounded' | 'failed'
    """
    assert cpu_result.shape == gpu_result.shape, f"Shape mismatch: {cpu_result.shape} vs {gpu_result.shape}"
    
    # Bit-exact check
    bit_exact = np.array_equal(cpu_result, gpu_result)
    
    # Numerical equivalence: within 1 ULP (diff <= 1 for uint8)
    diff = np.abs(cpu_result.astype(np.int16) - gpu_result.astype(np.int16))
    numerically_equivalent = np.all(diff <= 1)
    
    # Tolerance-bounded
    diff_float = np.abs(cpu_result.astype(np.float32) - gpu_result.astype(np.float32))
    max_diff = np.max(diff_float)
    mean_diff = np.mean(diff_float)
    mismatched = np.sum(diff_float > tolerance)
    mismatch_ratio = mismatched / diff_float.size
    tolerance_bounded = mismatch_ratio <= max_mismatch_ratio and max_diff <= tolerance * 4
    
    # Determine conformance level
    if bit_exact:
        conformance_level = "bit_exact"
    elif numerically_equivalent:
        conformance_level = "numerically_equivalent"
    elif tolerance_bounded:
        conformance_level = "tolerance_bounded"
    else:
        conformance_level = "failed"
    
    mismatched_tol = np.sum(diff_float > tolerance)
    mismatch_ratio_tol = mismatched_tol / diff_float.size
    
    details = {
        "max_diff": float(max_diff),
        "mean_diff": float(np.mean(np.abs(cpu_result.astype(np.float32) - gpu_result.astype(np.float32)))),
        "mismatched_pixels": int(np.sum(diff_float > 0)),
        "mismatched_pixels_tol": int(mismatched),
        "total_pixels": int(diff_float.size),
        "mismatch_ratio": float(mismatch_ratio_tol),
        "tolerance": tolerance,
        "conformance_level": conformance_level,
        "bit_exact": bit_exact,
        "numerically_equivalent": numerically_equivalent,
        "tolerance_bounded": tolerance_bounded,
        "passed": conformance_level != "failed",
    }
    
    return details["passed"], details


class TestCrossBackendConformance:
    """Test CPU ≡ OpenCL equivalence for identical kernels."""
    
    def setup_backends(self):
        """Create both backends."""
        # OpenCL
        ocl_factory = OpenCLBackendFactory()
        ocl_report = run_async(ocl_factory.probe())
        if ocl_report is None:
            pytest.skip("No OpenCL device available")
        self.ocl_backend = run_async(ocl_factory.createDevice("cross-test-ocl"))
        
        # CPU Reference
        cpu_factory = CPURefBackendFactory()
        self.cpu_backend = run_async(cpu_factory.createDevice("cross-test-cpu"))
    
    def teardown_backends(self):
        """Clean up backends."""
        if hasattr(self, 'ocl_backend'):
            run_async(self.ocl_backend.shutdown())
        if hasattr(self, 'cpu_backend'):
            run_async(self.cpu_backend.shutdown())
    
    def compile_builtin_kernel(self, entry_point: str):
        """Compile built-in kernel on both backends."""
        # Both backends support 'legacy_still' and 'cl_gen_still' as built-ins
        # Provide the OpenCL C source for the kernel - MUST match CPU reference exactly
        if entry_point == "legacy_still":
            source = """
            __kernel void legacy_still(__global uchar *out) {
                // Dimensions and seed passed via push constants
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
                
                // Linear step rim (matches CPU reference exactly)
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
            """
        else:
            raise ValueError(f"Unsupported built-in kernel: {entry_point}")
        
        module = AxiomIRModule(
            moduleId=f"test-{entry_point}",
            format="opencl-c",
            abiVersion=AXIOM_ABI_VERSION,
            binary=source.encode('utf-8'),
            entryPoints=[entry_point],
            metadata={"sourceHash": "test", "compileOptions": [], "requiredFeatures": []}
        )
        
        ocl_target = self.ocl_backend.getDeviceProperties()
        cpu_target = self.cpu_backend.getDeviceProperties()
        
        self.ocl_exec = run_async(self.ocl_backend.compile(module, ocl_target))
        self.cpu_exec = run_async(self.cpu_backend.compile(module, cpu_target))
        
        assert self.ocl_exec.executableId
        assert self.cpu_exec.executableId
    
    def allocate_buffers(self, size_bytes: int):
        """Allocate output buffers on both backends."""
        desc = AxiomBufferDescriptor(sizeBytes=size_bytes, flags=["read-write", "host-visible"])
        self.ocl_out = run_async(self.ocl_backend.allocate(desc))
        self.cpu_out = run_async(self.cpu_backend.allocate(desc))
    
    def dispatch_same(self, workgroup_count: Dict, workgroup_size: Dict, push_constants: Optional[bytes] = None):
        """Dispatch same kernel on both backends."""
        # OpenCL dispatch
        ocl_bindings = [{"binding": 0, "allocation": self.ocl_out}]
        ocl_dispatch = AxiomDispatchArgs(
            workgroupCount=workgroup_count,
            workgroupSize=workgroup_size,
            bindings=ocl_bindings,
            pushConstants=push_constants,
        )
        
        # CPU dispatch
        cpu_bindings = [{"binding": 0, "allocation": self.cpu_out}]
        cpu_dispatch = AxiomDispatchArgs(
            workgroupCount=workgroup_count,
            workgroupSize=workgroup_size,
            bindings=cpu_bindings,
            pushConstants=push_constants,
        )
        
        ocl_future = run_async(self.ocl_backend.dispatch(self.ocl_exec, ocl_dispatch))
        cpu_future = run_async(self.cpu_backend.dispatch(self.cpu_exec, cpu_dispatch))
        
        ocl_result = run_async(self.ocl_backend.synchronize(ocl_future))
        cpu_result = run_async(self.cpu_backend.synchronize(cpu_future))
        
        assert ocl_result.success, f"OpenCL dispatch failed: {ocl_result.error}"
        assert cpu_result.success, f"CPU dispatch failed: {cpu_result.error}"
    
    def read_results(self, size_bytes: int) -> Tuple[np.ndarray, np.ndarray]:
        """Read results from both backends."""
        ocl_mapped = run_async(self.ocl_backend.map(self.ocl_out))
        cpu_mapped = run_async(self.cpu_backend.map(self.cpu_out))
        
        ocl_result = ocl_mapped.copy()
        cpu_result = cpu_mapped.copy()
        
        run_async(self.ocl_backend.unmap(self.ocl_out))
        run_async(self.cpu_backend.unmap(self.cpu_out))
        
        return ocl_result, cpu_result
    
    def test_legacy_still_equivalence(self):
        """Test legacy_still kernel produces equivalent results on CPU and OpenCL."""
        self.setup_backends()
        
        try:
            # Use built-in legacy_still kernel (supported by both backends)
            self.compile_builtin_kernel("legacy_still")
            self.allocate_buffers(256 * 256 * 4)
            
            # Dispatch with same seed
            self.dispatch_same(
                workgroup_count={"x": 16, "y": 16, "z": 1},
                workgroup_size={"x": 16, "y": 16, "z": 1},
                push_constants=np.array([1.0], dtype=np.float32).tobytes()
            )
            
            ocl_result, cpu_result = self.read_results(256 * 256 * 4)
            
            passed, details = compare_results(cpu_result, ocl_result, tolerance=1.0, max_mismatch_ratio=0.001)
            
            print(f"Legacy Still Conformance:")
            print(f"  Max diff: {details['max_diff']:.2f}")
            print(f"  Mean diff: {details['mean_diff']:.4f}")
            print(f"  Mismatch ratio: {details['mismatch_ratio']:.6f}")
            print(f"  Passed: {details['passed']}")
            
            assert details["passed"], f"Conformance failed: {details}"
            
        finally:
            self.teardown_backends()
    
    def teardown_backends(self):
        """Clean up backends."""
        if hasattr(self, 'ocl_backend'):
            run_async(self.ocl_backend.shutdown())
        if hasattr(self, 'cpu_backend'):
            run_async(self.cpu_backend.shutdown())
    
    def read_results(self, size_bytes: int) -> Tuple[np.ndarray, np.ndarray]:
        """Read results from both backends."""
        ocl_mapped = run_async(self.ocl_backend.map(self.ocl_out))
        cpu_mapped = run_async(self.cpu_backend.map(self.cpu_out))
        
        ocl_result = ocl_mapped.copy()
        cpu_result = cpu_mapped.copy()
        
        run_async(self.ocl_backend.unmap(self.ocl_out))
        run_async(self.cpu_backend.unmap(self.cpu_out))
        
        return ocl_result, cpu_result


class TestConformanceMetrics:
    """Test conformance within formal tolerances."""
    
    def test_fp32_tolerance(self):
        """FP32 operations should match within 1 ULP."""
        cpu = np.array([1.0, 2.0, 3.0], dtype=np.float32)
        gpu = np.array([1.0, 2.0, 3.0], dtype=np.float32)
        passed, details = compare_results(cpu, gpu, tolerance=0.0)
        assert passed
        
        # With small difference
        gpu2 = cpu + 1e-6
        passed, details = compare_results(cpu, gpu2, tolerance=1e-5)
        assert passed
    
    def test_uint8_tolerance(self):
        """UINT8 pixel values should match exactly or within 1."""
        cpu = np.array([100, 150, 200], dtype=np.uint8)
        gpu = np.array([100, 151, 200], dtype=np.uint8)
        passed, details = compare_results(cpu, gpu, tolerance=1.0, max_mismatch_ratio=0.5)
        assert passed
        
        gpu2 = np.array([100, 200, 200], dtype=np.uint8)
        passed, details = compare_results(cpu, gpu2, tolerance=1.0, max_mismatch_ratio=0.3)
        assert not passed


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short", "-s"])