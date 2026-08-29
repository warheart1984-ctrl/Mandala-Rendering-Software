#pragma once

#include "kernels/cpu/rt4d_kernel_contract.h"

#include <cstdint>
#include <string>

// Narrow diagnostic result. This is intentionally independent of renderer
// command buffers, GLB intake, materials, shadows, and pixel authority.
enum class RT4DGpuParityStatus { passed, failed, unavailable };

struct RT4DPentachoronGpuDiagnosticResult {
    RT4DGpuParityStatus status = RT4DGpuParityStatus::unavailable;
    std::string adapter;
    uint32_t vendorId = 0;
    uint32_t deviceId = 0;
    uint32_t driverVersion = 0;
    uint32_t rayCount = 0;
    uint32_t cpuHitCount = 0;
    uint32_t gpuHitCount = 0;
    float maximumWitnessDelta = 0.0f;
    uint32_t validationWarnings = 0;
    uint32_t validationErrors = 0;
    std::string detail;
};

// The concrete Vulkan implementation is intentionally isolated behind this
// result contract. Callers must treat unavailable and failed as non-success.
RT4DPentachoronGpuDiagnosticResult rt4dDiagnosePentachoronBvhGpu(
    const RT4DPentachoronBvh4D& bvh,
    const std::vector<RT4DVec4>& origins,
    const std::vector<RT4DVec4>& directions,
    const std::vector<RT4DRayRange>& ranges,
    const std::string& spirvPath);
