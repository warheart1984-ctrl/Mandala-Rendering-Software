#pragma once

#include "kernels/vulkan/rt4d_pentachoron_diagnostic.h"

#include <cstdint>
#include <string>
#include <vector>

struct RT4DMatvecGpuDiagnosticResult {
    RT4DGpuParityStatus status = RT4DGpuParityStatus::unavailable;
    std::string adapter;
    std::string driverName;
    uint32_t vendorId = 0;
    uint32_t deviceId = 0;
    uint32_t driverVersion = 0;
    uint32_t deviceType = 0;
    uint32_t driverId = 0;
    uint32_t rows = 0;
    uint32_t cols = 0;
    float maximumAbsDelta = 0.0f;
    uint32_t validationWarnings = 0;
    uint32_t validationErrors = 0;
    std::string detail;
};

// y = A x with A row-major M x N. CPU oracle is the source of truth.
// GPU comparison uses an absolute tolerance, not exact equality.
RT4DMatvecGpuDiagnosticResult rt4dDiagnoseMatvecGpu(
    const std::vector<float>& A,
    const std::vector<float>& x,
    int M,
    int N,
    const std::string& spirvPath);
