#include "kernels/cpu/rt4d_kernel_contract.h"
#include "kernels/cpu/rt4d_evidence.h"
#include "kernels/vulkan/rt4d_pentachoron_diagnostic.h"

#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <filesystem>
#include <fstream>
#include <string>
#include <vector>

namespace {

int fail(const char* message) {
    std::fprintf(stderr, "[rt4d-intake] FAIL: %s\n", message);
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

const char* validationStatus(uint32_t warnings, uint32_t errors) {
    if (errors > 0) return "errors";
    if (warnings > 0) return "warnings";
    return "clean";
}

bool writeReceipt(const std::string& path, const RT4DPentachoronAsset4D& asset,
                  const RT4DPentachoronBvh4D& bvh,
                  const std::vector<RT4DPentachoronHit4D>& hits,
                  const RT4DPentachoronGpuDiagnosticResult& gpu) {
    const std::filesystem::path destination(path);
    if (destination.empty() || std::filesystem::exists(destination)) return false;
    const std::filesystem::path temporary = path + ".partial";
    if (std::filesystem::exists(temporary)) return false;
    size_t hitCount = 0;
    for (const RT4DPentachoronHit4D& hit : hits)
        hitCount += (hit.flags & RT4D_PENTACHORON_HIT) != 0;
    std::ofstream output(temporary, std::ios::binary | std::ios::trunc);
    if (!output) return false;
    output << "{\n"
           << "  \"schema\": \"rt4d-pentachoron-intake-receipt/0.1\",\n"
           << "  \"mode\": \"diagnostic_only\",\n"
           << "  \"sourceSchema\": \"" << rt4dJsonEscape(asset.schema) << "\",\n"
           << "  \"provenance\": \"" << rt4dJsonEscape(asset.provenance)
           << "\",\n"
           << "  \"artistReviewed\": " << (asset.artistReviewed ? "true" : "false")
           << ",\n"
           << "  \"creationTool\": \"rt4d-diagnostic-cli\",\n"
           << "  \"primitiveCount\": " << asset.primitives.size() << ",\n"
           << "  \"bvhNodes\": " << bvh.bounds.nodes.size() << ",\n"
           << "  \"leafSize\": " << bvh.bounds.leafSize << ",\n"
           << "  \"deterministicRayCount\": " << hits.size() << ",\n"
           << "  \"hitCount\": " << hitCount << ",\n"
           << "  \"gpuParity\": \"" << parityName(gpu.status) << "\",\n"
           << "  \"gpuAdapter\": \"" << rt4dJsonEscape(gpu.adapter) << "\",\n"
           << "  \"vendorId\": " << gpu.vendorId << ",\n"
           << "  \"deviceId\": " << gpu.deviceId << ",\n"
           << "  \"driverVersion\": " << gpu.driverVersion << ",\n"
           << "  \"rayCount\": " << gpu.rayCount << ",\n"
           << "  \"cpuHitCount\": " << gpu.cpuHitCount << ",\n"
           << "  \"gpuHitCount\": " << gpu.gpuHitCount << ",\n"
           << "  \"maximumWitnessDelta\": " << gpu.maximumWitnessDelta << ",\n"
           << "  \"validationStatus\": \""
           << validationStatus(gpu.validationWarnings, gpu.validationErrors)
           << "\",\n"
           << "  \"gpuDetail\": \"" << rt4dJsonEscape(gpu.detail) << "\",\n"
           << "  \"rendererPixelAuthority\": false,\n"
           << "  \"glbIngestion\": false\n"
           << "}\n";
    output.close();
    if (!output || std::filesystem::file_size(temporary) == 0) {
        std::filesystem::remove(temporary);
        return false;
    }
    std::error_code renameError;
    std::filesystem::rename(temporary, destination, renameError);
    if (renameError) {
        std::filesystem::remove(temporary);
        return false;
    }
    return true;
}

std::string defaultSpirvPath() {
    if (const char* env = std::getenv("RT4D_KERNEL_SPIRV_DIR")) {
        return std::string(env) + "/bvh4d_pentachoron_traverse.comp.spv";
    }
    return "spirv/bvh4d_pentachoron_traverse.comp.spv";
}

}  // namespace

int main(int argc, char** argv) {
    bool requireGpu = false;
    std::vector<char*> args;
    args.reserve(static_cast<size_t>(argc));
    for (int i = 1; i < argc; ++i) {
        if (std::strcmp(argv[i], "--require-gpu") == 0)
            requireGpu = true;
        else
            args.push_back(argv[i]);
    }
    if (args.size() != 2)
        return fail(
            "usage: rt4d_pentachoron_intake [--require-gpu] <asset.rt4d> "
            "<receipt.json>");
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
    const std::vector<RT4DPentachoronHit4D> hits =
        rt4dTraversePentachoronBvh4DBatch(bvh, origins, directions, ranges,
                                           &error);
    if (hits.size() != origins.size())
        return fail(error.empty() ? "ray batch failed" : error.c_str());

    const RT4DPentachoronGpuDiagnosticResult gpu =
        rt4dDiagnosePentachoronBvhGpu(bvh, origins, directions, ranges,
                                       defaultSpirvPath());
    if (requireGpu && gpu.status != RT4DGpuParityStatus::passed)
        return fail("GPU parity required but not passed");
    if (!writeReceipt(args[1], asset, bvh, hits, gpu))
        return fail("receipt publication failed or destination exists");
    std::fprintf(stderr,
                 "[rt4d-intake] PASS: primitives=%zu nodes=%zu rays=%zu "
                 "gpuParity=%s receipt=%s\n",
                 asset.primitives.size(), bvh.bounds.nodes.size(), hits.size(),
                 parityName(gpu.status), args[1]);
    return 0;
}
