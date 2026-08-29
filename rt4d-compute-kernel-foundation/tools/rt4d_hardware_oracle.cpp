#include "kernels/cpu/rt4d_adapter_class.h"
#include "kernels/cpu/rt4d_evidence.h"
#include "kernels/cpu/rt4d_kernel_contract.h"
#include "kernels/vulkan/rt4d_matvec_diagnostic.h"
#include "kernels/vulkan/rt4d_pentachoron_diagnostic.h"

#include <cstdio>
#include <cstring>
#include <string>
#include <vector>

namespace {

int fail(const char* message) {
    std::fprintf(stderr, "[rt4d-oracle] FAIL: %s\n", message);
    return 1;
}

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

RT4DAdapterIdentity fromGpu(const RT4DPentachoronGpuDiagnosticResult& gpu) {
    RT4DAdapterIdentity identity;
    identity.name = gpu.adapter;
    identity.driverName = gpu.driverName;
    identity.vendorId = gpu.vendorId;
    identity.deviceId = gpu.deviceId;
    identity.driverVersion = gpu.driverVersion;
    identity.deviceType = gpu.deviceType;
    identity.driverId = gpu.driverId;
    return identity;
}

RT4DAdapterIdentity fromGpu(const RT4DMatvecGpuDiagnosticResult& gpu) {
    RT4DAdapterIdentity identity;
    identity.name = gpu.adapter;
    identity.driverName = gpu.driverName;
    identity.vendorId = gpu.vendorId;
    identity.deviceId = gpu.deviceId;
    identity.driverVersion = gpu.driverVersion;
    identity.deviceType = gpu.deviceType;
    identity.driverId = gpu.driverId;
    return identity;
}

}  // namespace

int main(int argc, char** argv) {
    bool requireGpu = false;
    bool requireAmdRadv = false;
    std::vector<char*> args;
    args.reserve(static_cast<size_t>(argc));
    for (int i = 1; i < argc; ++i) {
        if (std::strcmp(argv[i], "--require-gpu") == 0)
            requireGpu = true;
        else if (std::strcmp(argv[i], "--require-amd-radv") == 0)
            requireAmdRadv = true;
        else
            args.push_back(argv[i]);
    }
    if (!requireGpu || !requireAmdRadv || args.size() != 4) {
        return fail(
            "usage: rt4d_hardware_oracle --require-gpu --require-amd-radv "
            "<sidecar.rt4d> <bvh.comp.spv> <matvec.comp.spv> <receipt.json>");
    }
    RT4DPentachoronAsset4D asset;
    std::string error;
    if (!rt4dLoadPentachoronSidecar(args[0], asset, &error))
        return fail(error.c_str());
    RT4DPentachoronBvh4D bvh;
    if (!rt4dBuildPentachoronBvh4D(asset.primitives, 2, bvh, &error))
        return fail(error.c_str());
    std::vector<RT4DVec4> origins, directions;
    std::vector<RT4DRayRange> ranges;
    for (const RT4DPentachoronPrimitive4D& primitive : asset.primitives) {
        origins.push_back({primitive.vertex0.x - 1.0f,
                            primitive.vertex0.y + 0.1f,
                            primitive.vertex0.z + 0.1f,
                            primitive.vertex0.w + 0.1f});
        directions.push_back({1.0f, 0.0f, 0.0f, 0.0f});
        ranges.push_back({0.0f, 3.0f, 0.0f, 0.0f});
    }
    const RT4DPentachoronGpuDiagnosticResult bvhGpu =
        rt4dDiagnosePentachoronBvhGpu(bvh, origins, directions, ranges, args[1]);
    if (bvhGpu.status != RT4DGpuParityStatus::passed)
        return fail("GPU parity required but not passed");
    if (!rt4dAdapterIsAmdRadv(fromGpu(bvhGpu)))
        return fail("adapter is not Mesa RADV; refusing hardware-oracle receipt");

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
    const RT4DMatvecGpuDiagnosticResult matvecGpu =
        rt4dDiagnoseMatvecGpu(A, x, M, N, args[2]);
    if (matvecGpu.status != RT4DGpuParityStatus::passed)
        return fail("GPU parity required but not passed");
    if (!rt4dAdapterIsAmdRadv(fromGpu(matvecGpu)))
        return fail("matvec adapter is not Mesa RADV; refusing hardware-oracle receipt");

    std::string json;
    json += "{\n";
    json += "  \"schema\": \"rt4d-kernel-vulkan-radv-v0.1\",\n";
    json += "  \"mode\": \"diagnostic_only\",\n";
    json += "  \"oracleClass\": \"amd_radv\",\n";
    json += "  \"creationTool\": \"rt4d-diagnostic-cli\",\n";
    json += "  \"gpuParity\": \"passed\",\n";
    json += "  \"adapter\": \"" + rt4dJsonEscape(bvhGpu.adapter) + "\",\n";
    json += "  \"driverName\": \"" + rt4dJsonEscape(bvhGpu.driverName) + "\",\n";
    json += "  \"vendorId\": " + std::to_string(bvhGpu.vendorId) + ",\n";
    json += "  \"deviceId\": " + std::to_string(bvhGpu.deviceId) + ",\n";
    json += "  \"deviceType\": " + std::to_string(bvhGpu.deviceType) + ",\n";
    json += "  \"driverId\": " + std::to_string(bvhGpu.driverId) + ",\n";
    json += "  \"driverVersion\": " + std::to_string(bvhGpu.driverVersion) +
            ",\n";
    json += "  \"pentachoronBvh\": {\n";
    json += "    \"nodes\": " + std::to_string(bvh.bounds.nodes.size()) + ",\n";
    json += "    \"primitives\": " + std::to_string(bvh.primitives.size()) +
            ",\n";
    json += "    \"rays\": " + std::to_string(bvhGpu.rayCount) + ",\n";
    json += "    \"hits\": " + std::to_string(bvhGpu.cpuHitCount) + ",\n";
    json += "    \"maximumWitnessDelta\": " +
            std::to_string(bvhGpu.maximumWitnessDelta) + "\n";
    json += "  },\n";
    json += "  \"matvec\": {\n";
    json += "    \"M\": " + std::to_string(matvecGpu.rows) + ",\n";
    json += "    \"N\": " + std::to_string(matvecGpu.cols) + ",\n";
    json += "    \"maximumAbsDelta\": " +
            std::to_string(matvecGpu.maximumAbsDelta) + "\n";
    json += "  },\n";
    json += "  \"gpuParityBvh\": \"" + std::string(parityName(bvhGpu.status)) +
            "\",\n";
    json += "  \"gpuParityMatvec\": \"" +
            std::string(parityName(matvecGpu.status)) + "\",\n";
    json += "  \"rendererPixelAuthority\": false\n";
    json += "}\n";
    const RT4DPublishResult published = rt4dPublishText(args[3], json);
    if (published.status != RT4DPublishStatus::published)
        return fail(published.detail.c_str());
    std::fprintf(stderr,
                 "[rt4d-oracle] PASS: amd_radv adapter=%s vendor=0x%x "
                 "receipt=%s\n",
                 bvhGpu.adapter.c_str(), bvhGpu.vendorId, args[3]);
    return 0;
}
