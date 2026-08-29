#include "kernels/vulkan/rt4d_matvec_diagnostic.h"

#include "kernels/cpu/rt4d_matvec.h"
#include "kernels/vulkan/rt4d_diagnostic_dispatcher.h"

#include <algorithm>
#include <cmath>
#include <cstdio>

namespace {

struct MatvecPushConstants {
    uint32_t M;
    uint32_t N;
    uint32_t pad0;
    uint32_t pad1;
};
static_assert(sizeof(MatvecPushConstants) == 16,
              "matvec push constants must match GLSL");

}  // namespace

RT4DMatvecGpuDiagnosticResult rt4dDiagnoseMatvecGpu(
    const std::vector<float>& A, const std::vector<float>& x, int M, int N,
    const std::string& spirvPath) {
    RT4DMatvecGpuDiagnosticResult result;
    result.rows = M > 0 ? static_cast<uint32_t>(M) : 0;
    result.cols = N > 0 ? static_cast<uint32_t>(N) : 0;
    if (M <= 0 || N <= 0 ||
        A.size() != static_cast<size_t>(M) * static_cast<size_t>(N) ||
        x.size() != static_cast<size_t>(N) || spirvPath.empty()) {
        result.status = RT4DGpuParityStatus::failed;
        result.detail = "invalid matvec diagnostic inputs";
        return result;
    }

    std::vector<float> expected(static_cast<size_t>(M), 0.0f);
    std::string error;
    if (!rt4dMatvecClean(A.data(), x.data(), expected.data(), M, N, &error)) {
        result.status = RT4DGpuParityStatus::failed;
        result.detail = error.empty() ? "CPU matvec oracle failed" : error;
        return result;
    }

    RT4DDiagnosticDispatcher dispatcher;
    if (!dispatcher.init() || !dispatcher.available()) {
        result.status = RT4DGpuParityStatus::unavailable;
        result.detail = dispatcher.lastError().empty()
                             ? "Vulkan compute device unavailable"
                             : dispatcher.lastError();
        return result;
    }
    result.adapter = dispatcher.adapter().name;
    result.driverName = dispatcher.adapter().driverName;
    result.vendorId = dispatcher.adapter().vendorId;
    result.deviceId = dispatcher.adapter().deviceId;
    result.driverVersion = dispatcher.adapter().driverVersion;
    result.deviceType = dispatcher.adapter().deviceType;
    result.driverId = dispatcher.adapter().driverId;

    std::vector<float> zero(static_cast<size_t>(M), 0.0f);
    RT4DDiagnosticBuffer aBuffer(dispatcher);
    RT4DDiagnosticBuffer xBuffer(dispatcher);
    RT4DDiagnosticBuffer yBuffer(dispatcher);
    if (!rt4dInitializeDiagnosticBuffer(aBuffer, A) ||
        !rt4dInitializeDiagnosticBuffer(xBuffer, x) ||
        !rt4dInitializeDiagnosticBuffer(yBuffer, zero)) {
        result.status = RT4DGpuParityStatus::failed;
        result.detail = "host buffer upload failed";
        result.validationWarnings = dispatcher.validation().warnings;
        result.validationErrors = dispatcher.validation().errors;
        return result;
    }

    const MatvecPushConstants push{static_cast<uint32_t>(M),
                                  static_cast<uint32_t>(N), 0u, 0u};
    std::vector<RT4DDiagnosticBuffer*> bindings = {&aBuffer, &xBuffer,
                                                    &yBuffer};
    const uint32_t groups = static_cast<uint32_t>((M + 63) / 64);
    if (!dispatcher.dispatchStorage(spirvPath.c_str(), bindings, &push,
                                     sizeof(push), groups)) {
        result.status = RT4DGpuParityStatus::failed;
        result.detail = dispatcher.lastError().empty()
                             ? "compute dispatch failed"
                             : dispatcher.lastError();
        result.validationWarnings = dispatcher.validation().warnings;
        result.validationErrors = dispatcher.validation().errors;
        return result;
    }

    std::vector<float> actual(static_cast<size_t>(M), 0.0f);
    if (!yBuffer.read(actual.data(), actual.size() * sizeof(float))) {
        result.status = RT4DGpuParityStatus::failed;
        result.detail = "matvec readback failed";
        result.validationWarnings = dispatcher.validation().warnings;
        result.validationErrors = dispatcher.validation().errors;
        return result;
    }

    float maxDelta = 0.0f;
    constexpr float kAbsTolerance = 1.0e-5f;
    for (int i = 0; i < M; ++i) {
        const float cpu = expected[static_cast<size_t>(i)];
        const float gpu = actual[static_cast<size_t>(i)];
        const float delta = std::fabs(gpu - cpu);
        maxDelta = std::max(maxDelta, delta);
        if (!std::isfinite(cpu) || !std::isfinite(gpu) ||
            !std::isfinite(delta) || delta > kAbsTolerance) {
            result.status = RT4DGpuParityStatus::failed;
            result.detail = "CPU/GPU matvec delta is non-finite or exceeded 1e-5";
            result.maximumAbsDelta = maxDelta;
            result.validationWarnings = dispatcher.validation().warnings;
            result.validationErrors = dispatcher.validation().errors;
            return result;
        }
    }
    result.maximumAbsDelta = maxDelta;
    result.validationWarnings = dispatcher.validation().warnings;
    result.validationErrors = dispatcher.validation().errors;
    if (dispatcher.validation().errors != 0 ||
        dispatcher.validation().warnings != 0) {
        result.status = RT4DGpuParityStatus::failed;
        result.detail = "Vulkan validation warnings or errors";
        return result;
    }
    result.status = RT4DGpuParityStatus::passed;
    result.detail = "CPU/GPU matvec parity";
    std::fprintf(stderr,
                 "[rt4d-diagnostic] matvec %s: M=%d N=%d maxAbsDelta=%g "
                 "validation warnings=%u errors=%u\n",
                 result.status == RT4DGpuParityStatus::passed ? "passed"
                                                             : "failed",
                 M, N, result.maximumAbsDelta, result.validationWarnings,
                 result.validationErrors);
    return result;
}
