#include "kernels/vulkan/rt4d_pentachoron_diagnostic.h"

#include "kernels/vulkan/rt4d_diagnostic_dispatcher.h"

#include <algorithm>
#include <cmath>
#include <cstdio>

namespace {

bool nearRelative(float observed, float reference, float tolerance) {
    return std::fabs(observed - reference) <=
           tolerance * std::max(1.0f, std::max(std::fabs(observed),
                                                std::fabs(reference)));
}

const char* statusName(RT4DGpuParityStatus status) {
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

struct BvhPushConstants {
    uint32_t rays;
    uint32_t nodeCount;
    uint32_t primitiveCount;
    uint32_t pad;
};
static_assert(sizeof(BvhPushConstants) == 16,
              "pentachoron BVH push constants must match GLSL");

}  // namespace

RT4DPentachoronGpuDiagnosticResult rt4dDiagnosePentachoronBvhGpu(
    const RT4DPentachoronBvh4D& bvh, const std::vector<RT4DVec4>& origins,
    const std::vector<RT4DVec4>& directions,
    const std::vector<RT4DRayRange>& ranges, const std::string& spirvPath) {
    RT4DPentachoronGpuDiagnosticResult result;
    result.rayCount = static_cast<uint32_t>(origins.size());
    if (origins.empty() || origins.size() != directions.size() ||
        directions.size() != ranges.size() || bvh.bounds.nodes.empty() ||
        bvh.primitives.empty() || spirvPath.empty()) {
        result.status = RT4DGpuParityStatus::failed;
        result.detail = "invalid diagnostic inputs";
        return result;
    }

    std::string error;
    const std::vector<RT4DPentachoronHit4D> expected =
        rt4dTraversePentachoronBvh4DBatch(bvh, origins, directions, ranges,
                                           &error);
    if (expected.size() != origins.size()) {
        result.status = RT4DGpuParityStatus::failed;
        result.detail = error.empty() ? "CPU pentachoron BVH oracle failed"
                                      : error;
        return result;
    }
    for (const RT4DPentachoronHit4D& hit : expected) {
        if (hit.flags & RT4D_PENTACHORON_HIT) ++result.cpuHitCount;
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
    result.vendorId = dispatcher.adapter().vendorId;
    result.deviceId = dispatcher.adapter().deviceId;
    result.driverVersion = dispatcher.adapter().driverVersion;

    std::vector<RT4DPentachoronHit4D> zero(origins.size());
    RT4DDiagnosticBuffer nodeBuffer(dispatcher);
    RT4DDiagnosticBuffer primitiveBuffer(dispatcher);
    RT4DDiagnosticBuffer originBuffer(dispatcher);
    RT4DDiagnosticBuffer directionBuffer(dispatcher);
    RT4DDiagnosticBuffer rangeBuffer(dispatcher);
    RT4DDiagnosticBuffer hitBuffer(dispatcher);
    if (!rt4dInitializeDiagnosticBuffer(nodeBuffer, bvh.bounds.nodes) ||
        !rt4dInitializeDiagnosticBuffer(primitiveBuffer, bvh.primitives) ||
        !rt4dInitializeDiagnosticBuffer(originBuffer, origins) ||
        !rt4dInitializeDiagnosticBuffer(directionBuffer, directions) ||
        !rt4dInitializeDiagnosticBuffer(rangeBuffer, ranges) ||
        !rt4dInitializeDiagnosticBuffer(hitBuffer, zero)) {
        result.status = RT4DGpuParityStatus::failed;
        result.detail = "host buffer upload failed";
        result.validationWarnings = dispatcher.validation().warnings;
        result.validationErrors = dispatcher.validation().errors;
        return result;
    }

    const BvhPushConstants push{
        static_cast<uint32_t>(origins.size()),
        static_cast<uint32_t>(bvh.bounds.nodes.size()),
        static_cast<uint32_t>(bvh.primitives.size()), 0u};
    std::vector<RT4DDiagnosticBuffer*> bindings = {
        &nodeBuffer,     &primitiveBuffer, &originBuffer,
        &directionBuffer, &rangeBuffer,    &hitBuffer};
    const uint32_t groups =
        static_cast<uint32_t>((origins.size() + 63) / 64);
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

    std::vector<RT4DPentachoronHit4D> actual(origins.size());
    if (!hitBuffer.read(actual.data(),
                         actual.size() * sizeof(RT4DPentachoronHit4D))) {
        result.status = RT4DGpuParityStatus::failed;
        result.detail = "hit readback failed";
        result.validationWarnings = dispatcher.validation().warnings;
        result.validationErrors = dispatcher.validation().errors;
        return result;
    }

    float maxDelta = 0.0f;
    for (size_t i = 0; i < actual.size(); ++i) {
        if (actual[i].flags != expected[i].flags ||
            actual[i].primitiveId != expected[i].primitiveId) {
            result.status = RT4DGpuParityStatus::failed;
            result.detail = "CPU/GPU hit flags or primitive id mismatch";
            result.gpuHitCount = result.cpuHitCount;
            result.maximumWitnessDelta = maxDelta;
            result.validationWarnings = dispatcher.validation().warnings;
            result.validationErrors = dispatcher.validation().errors;
            return result;
        }
        if ((actual[i].flags & RT4D_PENTACHORON_HIT) == 0) continue;
        ++result.gpuHitCount;
        maxDelta = std::max(maxDelta,
                              std::fabs(actual[i].tEnter - expected[i].tEnter));
        maxDelta = std::max(maxDelta,
                              std::fabs(actual[i].tExit - expected[i].tExit));
        if (!nearRelative(actual[i].tEnter, expected[i].tEnter, 2.0e-5f) ||
            !nearRelative(actual[i].tExit, expected[i].tExit, 2.0e-5f)) {
            result.status = RT4DGpuParityStatus::failed;
            result.detail = "CPU/GPU witness delta exceeded 2e-5";
            result.maximumWitnessDelta = maxDelta;
            result.validationWarnings = dispatcher.validation().warnings;
            result.validationErrors = dispatcher.validation().errors;
            return result;
        }
    }
    result.maximumWitnessDelta = maxDelta;
    result.validationWarnings = dispatcher.validation().warnings;
    result.validationErrors = dispatcher.validation().errors;
    if (result.gpuHitCount != result.cpuHitCount) {
        result.status = RT4DGpuParityStatus::failed;
        result.detail = "CPU/GPU hit counts differ";
        return result;
    }
    if (dispatcher.validation().errors != 0 ||
        dispatcher.validation().warnings != 0) {
        result.status = RT4DGpuParityStatus::failed;
        result.detail = "Vulkan validation warnings or errors";
        return result;
    }
    result.status = RT4DGpuParityStatus::passed;
    result.detail = "CPU/GPU pentachoron BVH parity";
    std::fprintf(stderr,
                 "[rt4d-diagnostic] pentachoron BVH4D %s: nodes=%zu "
                 "primitives=%zu rays=%u hits=%u maxDelta=%g validation "
                 "warnings=%u errors=%u\n",
                 statusName(result.status), bvh.bounds.nodes.size(),
                 bvh.primitives.size(), result.rayCount, result.cpuHitCount,
                 result.maximumWitnessDelta, result.validationWarnings,
                 result.validationErrors);
    return result;
}
