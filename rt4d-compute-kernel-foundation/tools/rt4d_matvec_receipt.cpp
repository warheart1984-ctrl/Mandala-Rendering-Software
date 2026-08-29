#include "kernels/cpu/rt4d_matvec.h"
#include "kernels/vulkan/rt4d_matvec_diagnostic.h"

#include <cstdio>
#include <filesystem>
#include <fstream>
#include <string>
#include <vector>

namespace {

const char* parityName(RT4DGpuParityStatus status) {
    switch (status) {
        case RT4DGpuParityStatus::passed:
            return "passed";
        case RT4DGpuParityStatus::failed:
            return "failed";
        case RT4DGpuParityStatus::unavailable:
        default:
            return "unavailable";
    }
}

}  // namespace

int main(int argc, char** argv) {
    if (argc != 3) {
        std::fprintf(stderr,
                     "usage: rt4d_matvec_receipt <matvec.comp.spv> <receipt.json>\n");
        return 1;
    }
    const std::filesystem::path destination(argv[2]);
    if (destination.empty() || std::filesystem::exists(destination) ||
        std::filesystem::exists(std::string(argv[2]) + ".partial"))
        return 1;
    constexpr int M = 257;
    constexpr int N = 64;
    std::vector<float> A(static_cast<size_t>(M) * static_cast<size_t>(N));
    std::vector<float> x(static_cast<size_t>(N));
    for (int i = 0; i < M; ++i)
        for (int j = 0; j < N; ++j)
            A[static_cast<size_t>(i) * static_cast<size_t>(N) +
              static_cast<size_t>(j)] =
                static_cast<float>(i + 1) * 0.01f +
                static_cast<float>(j + 1) * 0.001f;
    for (int j = 0; j < N; ++j)
        x[static_cast<size_t>(j)] = static_cast<float>(j + 1) * 0.1f;
    const RT4DMatvecGpuDiagnosticResult gpu =
        rt4dDiagnoseMatvecGpu(A, x, M, N, argv[1]);
    const std::string temporary = std::string(argv[2]) + ".partial";
    std::ofstream output(temporary, std::ios::binary | std::ios::trunc);
    if (!output) return 1;
    output << "{\n"
           << "  \"schema\": \"rt4d-matvec-receipt/0.1\",\n"
           << "  \"mode\": \"diagnostic_only\",\n"
           << "  \"creationTool\": \"rt4d-diagnostic-cli\",\n"
           << "  \"gpuParity\": \"" << parityName(gpu.status) << "\",\n"
           << "  \"gpuAdapter\": \"" << gpu.adapter << "\",\n"
           << "  \"vendorId\": " << gpu.vendorId << ",\n"
           << "  \"deviceId\": " << gpu.deviceId << ",\n"
           << "  \"driverVersion\": " << gpu.driverVersion << ",\n"
           << "  \"M\": " << gpu.rows << ",\n"
           << "  \"N\": " << gpu.cols << ",\n"
           << "  \"maximumAbsDelta\": " << gpu.maximumAbsDelta << ",\n"
           << "  \"gpuDetail\": \"" << gpu.detail << "\",\n"
           << "  \"rendererPixelAuthority\": false\n"
           << "}\n";
    output.close();
    if (!output) {
        std::filesystem::remove(temporary);
        return 1;
    }
    std::error_code error;
    std::filesystem::rename(temporary, destination, error);
    if (error) {
        std::filesystem::remove(temporary);
        return 1;
    }
    std::fprintf(stderr, "[rt4d-matvec] %s receipt=%s maxAbsDelta=%g\n",
                 parityName(gpu.status), argv[2], gpu.maximumAbsDelta);
    return gpu.status == RT4DGpuParityStatus::passed ? 0 : 1;
}
