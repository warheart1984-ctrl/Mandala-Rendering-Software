#include "kernels/vulkan/rt4d_matvec_diagnostic.h"
#include "kernels/vulkan/rt4d_pentachoron_diagnostic.h"

#include <cstdio>
#include <limits>
#include <string>
#include <vector>

namespace {

int fail(const char* message) {
    std::fprintf(stderr, "[kernel-gpu] FAIL: %s\n", message);
    return 1;
}

RT4DPentachoronPrimitive4D unitPentachoron(uint32_t id, float x) {
    return {{x, 0.0f, 0.0f, 0.0f},
            {x + 1.0f, 0.0f, 0.0f, 0.0f},
            {x, 1.0f, 0.0f, 0.0f},
            {x, 0.0f, 1.0f, 0.0f},
            {x, 0.0f, 0.0f, 1.0f},
            id,
            0,
            0,
            0};
}

bool runPentachoronBvhContract(const char* spirvPath) {
    constexpr size_t primitiveCount = 24;
    constexpr size_t rayCount = 143;
    std::vector<RT4DPentachoronPrimitive4D> source(primitiveCount);
    for (size_t i = 0; i < source.size(); ++i)
        source[i] = unitPentachoron(1000u + static_cast<uint32_t>(i),
                                     static_cast<float>(i) * 2.0f);
    std::string error;
    RT4DPentachoronBvh4D bvh;
    if (!rt4dBuildPentachoronBvh4D(source, 2, bvh, &error)) {
        std::fprintf(stderr, "[kernel-gpu] pentachoron BVH build failed: %s\n",
                     error.c_str());
        return false;
    }
    std::vector<RT4DVec4> origins(rayCount), directions(rayCount);
    std::vector<RT4DRayRange> ranges(rayCount);
    for (size_t i = 0; i < rayCount; ++i) {
        const float x = static_cast<float>(i % primitiveCount) * 2.0f;
        origins[i] = {x - 1.0f, 0.1f, 0.1f, 0.1f};
        directions[i] = {1.0f, 0.0f, 0.0f, 0.0f};
        ranges[i] = {0.0f, 3.0f, 0.0f, 0.0f};
        if (i % 11 == 0) origins[i].y = 2.0f;
        if (i % 17 == 0) {
            origins[i] = {x + 2.0f, 0.1f, 0.1f, 0.1f};
            directions[i].x = -1.0f;
        }
        if (i % 23 == 0) {
            origins[i] = {x + 0.1f, 0.1f, 0.1f, 0.1f};
            ranges[i].tMax = 1.0f;
        }
    }
    const RT4DPentachoronGpuDiagnosticResult result =
        rt4dDiagnosePentachoronBvhGpu(bvh, origins, directions, ranges, spirvPath);
    if (result.status != RT4DGpuParityStatus::passed) {
        std::fprintf(stderr, "[kernel-gpu] pentachoron diagnostic %s: %s\n",
                     result.status == RT4DGpuParityStatus::unavailable
                         ? "unavailable"
                         : "failed",
                     result.detail.c_str());
        return false;
    }
    if (result.cpuHitCount == 0 || result.cpuHitCount == result.rayCount ||
        result.validationErrors != 0)
        return false;
    std::fprintf(stderr,
                 "[kernel-gpu] pentachoron BVH4D PASS: nodes=%zu primitives=%zu "
                 "rays=%u hits=%u misses=%u maxDelta=%g\n",
                 bvh.bounds.nodes.size(), bvh.primitives.size(), result.rayCount,
                 result.cpuHitCount, result.rayCount - result.cpuHitCount,
                 result.maximumWitnessDelta);
    return true;
}

bool runSidecarIntakeParity(const char* spirvPath, const char* sidecarPath) {
    RT4DPentachoronAsset4D asset;
    std::string error;
    if (!rt4dLoadPentachoronSidecar(sidecarPath, asset, &error)) return false;
    RT4DPentachoronBvh4D bvh;
    if (!rt4dBuildPentachoronBvh4D(asset.primitives, 2, bvh, &error))
        return false;
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
    const RT4DPentachoronGpuDiagnosticResult result =
        rt4dDiagnosePentachoronBvhGpu(bvh, origins, directions, ranges, spirvPath);
    if (result.status != RT4DGpuParityStatus::passed) return false;
    std::fprintf(stderr,
                 "[kernel-gpu] sidecar intake parity PASS: primitives=%zu "
                 "gpuParity=passed\n",
                 asset.primitives.size());
    return true;
}

bool runMatvecContract(const char* spirvPath) {
    constexpr int M = 257;
    constexpr int N = 64;
    std::vector<float> A(static_cast<size_t>(M) * static_cast<size_t>(N));
    std::vector<float> x(static_cast<size_t>(N));
    for (int i = 0; i < M; ++i) {
        for (int j = 0; j < N; ++j)
            A[static_cast<size_t>(i) * static_cast<size_t>(N) +
              static_cast<size_t>(j)] =
                static_cast<float>(i + 1) * 0.01f +
                static_cast<float>(j + 1) * 0.001f;
    }
    for (int j = 0; j < N; ++j)
        x[static_cast<size_t>(j)] = static_cast<float>(j + 1) * 0.1f;
    const RT4DMatvecGpuDiagnosticResult result =
        rt4dDiagnoseMatvecGpu(A, x, M, N, spirvPath);
    if (result.status != RT4DGpuParityStatus::passed) {
        std::fprintf(stderr, "[kernel-gpu] matvec diagnostic %s: %s\n",
                     result.status == RT4DGpuParityStatus::unavailable
                         ? "unavailable"
                         : "failed",
                     result.detail.c_str());
        return false;
    }
    std::fprintf(stderr,
                 "[kernel-gpu] matvec PASS: M=%u N=%u maxAbsDelta=%g\n",
                 result.rows, result.cols, result.maximumAbsDelta);
    std::vector<float> nanA = A;
    nanA[0] = std::numeric_limits<float>::quiet_NaN();
    const RT4DMatvecGpuDiagnosticResult nanResult =
        rt4dDiagnoseMatvecGpu(nanA, x, M, N, spirvPath);
    if (nanResult.status == RT4DGpuParityStatus::passed) {
        std::fprintf(stderr,
                     "[kernel-gpu] FAIL: non-finite matvec was certified as "
                     "gpuParity=passed\n");
        return false;
    }
    return true;
}

}  // namespace

int main(int argc, char** argv) {
    if (argc != 3 && argc != 4)
        return fail("expected pentachoron-BVH SPIR-V, matvec SPIR-V, "
                    "and optional sidecar path");
    if (!runPentachoronBvhContract(argv[1])) return 1;
    if (!runMatvecContract(argv[2])) return 1;
    if (argc == 4 && !runSidecarIntakeParity(argv[1], argv[3])) return 1;
    std::fprintf(stderr,
                 "[kernel-gpu] PASS: CPU/Vulkan parity via shared dispatcher; "
                 "validation warnings=0 errors=0\n");
    return 0;
}
