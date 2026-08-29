#include "kernels/cpu/rt4d_kernel_contract.h"
#include "kernels/cpu/rt4d_matvec.h"

#include <algorithm>
#include <array>
#include <cmath>
#include <cstdio>
#include <limits>
#include <numeric>
#include <string>
#include <vector>

namespace {

int fail(const char* message) {
    std::fprintf(stderr, "[kernel-cpu] FAIL: %s\n", message);
    return 1;
}

bool near(double a, double b, double tol) {
    return std::fabs(a - b) <= tol;
}

RT4DPentachoronPrimitive4D unitPentachoron(uint32_t id, float x = 0.0f) {
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

}  // namespace

int main(int argc, char** argv) {
    if (argc != 2) return fail("expected pentachoron sidecar path");

    const RT4DPentachoronPrimitive4D unit = unitPentachoron(1);
    if (!near(rt4dPentachoronHypervolume4(unit), 1.0 / 24.0, 1e-9))
        return fail("canonical pentachoron hypervolume is incorrect");

    const RT4DVec4 origin{-1.0f, 0.1f, 0.1f, 0.1f};
    const RT4DVec4 direction{1.0f, 0.0f, 0.0f, 0.0f};
    const RT4DRayRange range{0.0f, 3.0f, 0.0f, 0.0f};
    const RT4DPentachoronHit4D hit =
        rt4dIntersectPentachoron4D(unit, origin, direction, range);
    if ((hit.flags & RT4D_PENTACHORON_HIT) == 0 || hit.primitiveId != 1)
        return fail("canonical pentachoron ray interval is incorrect");

    std::array<RT4DVec4, 5> vertices = {unit.vertex0, unit.vertex1,
                                         unit.vertex2, unit.vertex3,
                                         unit.vertex4};
    std::sort(vertices.begin(), vertices.end(), [](const RT4DVec4& a,
                                                     const RT4DVec4& b) {
        if (a.x != b.x) return a.x < b.x;
        if (a.y != b.y) return a.y < b.y;
        if (a.z != b.z) return a.z < b.z;
        return a.w < b.w;
    });
    int permutations = 0;
    do {
        RT4DPentachoronPrimitive4D permuted = unit;
        permuted.vertex0 = vertices[0];
        permuted.vertex1 = vertices[1];
        permuted.vertex2 = vertices[2];
        permuted.vertex3 = vertices[3];
        permuted.vertex4 = vertices[4];
        const RT4DPentachoronHit4D permutedHit =
            rt4dIntersectPentachoron4D(permuted, origin, direction, range);
        if ((permutedHit.flags & RT4D_PENTACHORON_HIT) == 0 ||
            std::fabs(permutedHit.tEnter - hit.tEnter) > 2.0e-5f ||
            std::fabs(permutedHit.tExit - hit.tExit) > 2.0e-5f)
            return fail("vertex permutation changed pentachoron interval");
        ++permutations;
    } while (std::next_permutation(
        vertices.begin(), vertices.end(), [](const RT4DVec4& a,
                                               const RT4DVec4& b) {
            if (a.x != b.x) return a.x < b.x;
            if (a.y != b.y) return a.y < b.y;
            if (a.z != b.z) return a.z < b.z;
            return a.w < b.w;
        }));
    if (permutations != 120)
        return fail("pentachoron permutation proof did not cover 5 factorial");

    RT4DPentachoronPrimitive4D degenerate = unit;
    degenerate.vertex4 = degenerate.vertex0;
    const RT4DPentachoronHit4D degenerateHit =
        rt4dIntersectPentachoron4D(degenerate, origin, direction, range);
    if ((degenerateHit.flags & RT4D_PENTACHORON_DEGENERATE) == 0)
        return fail("degenerate pentachoron did not fail closed explicitly");

    RT4DVec4 nanOrigin = origin;
    nanOrigin.x = std::numeric_limits<float>::quiet_NaN();
    const RT4DPentachoronHit4D invalidHit =
        rt4dIntersectPentachoron4D(unit, nanOrigin, direction, range);
    if ((invalidHit.flags & RT4D_PENTACHORON_INVALID) == 0)
        return fail("non-finite pentachoron did not fail closed explicitly");

    const RT4DVec4 missOrigin{-1.0f, 2.0f, 0.1f, 0.1f};
    const RT4DPentachoronHit4D miss =
        rt4dIntersectPentachoron4D(unit, missOrigin, direction, range);
    if (miss.flags & RT4D_PENTACHORON_HIT)
        return fail("pentachoron miss did not remain a plain miss");

    RT4DPentachoronAsset4D asset;
    std::string error;
    if (!rt4dLoadPentachoronSidecar(argv[1], asset, &error) ||
        asset.schema != "rt4d-pentachoron-sidecar/0.1" ||
        asset.artistReviewed || asset.primitives.size() < 2)
        return fail("pentachoron authored-sidecar contract is incorrect");

    std::vector<RT4DPentachoronPrimitive4D> source(24);
    for (size_t i = 0; i < source.size(); ++i)
        source[i] = unitPentachoron(1000u + static_cast<uint32_t>(i),
                                     static_cast<float>(i) * 2.0f);
    RT4DPentachoronBvh4D bvh;
    if (!rt4dBuildPentachoronBvh4D(source, 2, bvh, &error) ||
        bvh.bounds.nodes.empty() || bvh.primitives.size() != source.size())
        return fail("pentachoron BVH build is incorrect");

    constexpr size_t rayCount = 143;
    std::vector<RT4DVec4> origins(rayCount), directions(rayCount);
    std::vector<RT4DRayRange> ranges(rayCount);
    for (size_t i = 0; i < rayCount; ++i) {
        const float x = static_cast<float>(i % 24) * 2.0f;
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
    const std::vector<RT4DPentachoronHit4D> bvhHits =
        rt4dTraversePentachoronBvh4DBatch(bvh, origins, directions, ranges,
                                           &error);
    if (bvhHits.size() != rayCount)
        return fail("pentachoron BVH batch traversal failed");
    size_t hits = 0;
    size_t misses = 0;
    for (size_t i = 0; i < rayCount; ++i) {
        RT4DPentachoronHit4D nearest{};
        nearest.tEnter = ranges[i].tMax;
        nearest.primitiveId = -1;
        for (const RT4DPentachoronPrimitive4D& primitive : source) {
            const RT4DPentachoronHit4D direct = rt4dIntersectPentachoron4D(
                primitive, origins[i], directions[i], ranges[i]);
            if ((direct.flags & RT4D_PENTACHORON_HIT) == 0) continue;
            const float scale = std::max(
                1.0f, std::max(std::fabs(direct.tEnter), std::fabs(nearest.tEnter)));
            const bool nearer = nearest.primitiveId < 0 ||
                                 direct.tEnter < nearest.tEnter - 2.0e-5f * scale;
            const bool tie =
                nearest.primitiveId >= 0 &&
                std::fabs(direct.tEnter - nearest.tEnter) <= 2.0e-5f * scale &&
                direct.primitiveId < nearest.primitiveId;
            if (nearer || tie) nearest = direct;
        }
        if (((bvhHits[i].flags & RT4D_PENTACHORON_HIT) != 0) !=
            (nearest.primitiveId >= 0))
            return fail("pentachoron BVH differs from direct oracle");
        if (bvhHits[i].flags & RT4D_PENTACHORON_HIT) {
            if (bvhHits[i].primitiveId != nearest.primitiveId ||
                std::fabs(bvhHits[i].tEnter - nearest.tEnter) > 2.0e-5f)
                return fail("pentachoron BVH differs from direct oracle");
            ++hits;
        } else {
            ++misses;
        }
    }
    if (hits == 0 || misses == 0)
        return fail("pentachoron BVH differs from direct oracle");

    RT4DPentachoronBvh4D cyclic = bvh;
    cyclic.bounds.nodes.resize(1);
    cyclic.bounds.nodes[0].leftChild = 0;
    cyclic.bounds.nodes[0].rightChild = 0;
    cyclic.bounds.nodes[0].count = 0;
    const std::vector<RT4DVec4> cyclicOrigins = {origin};
    const std::vector<RT4DVec4> cyclicDirections = {direction};
    const std::vector<RT4DRayRange> cyclicRanges = {range};
    const std::vector<RT4DPentachoronHit4D> cyclicHits =
        rt4dTraversePentachoronBvh4DBatch(cyclic, cyclicOrigins, cyclicDirections,
                                           cyclicRanges, &error);
    if (cyclicHits.size() != 1 ||
        (cyclicHits[0].flags & RT4D_PENTACHORON_INVALID) == 0)
        return fail("cyclic pentachoron BVH did not fail closed");

    const float identity[16] = {1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1};
    const float xVec[4] = {1, 2, 3, 4};
    float y[4] = {};
    if (!rt4dMatvecClean(identity, xVec, y, 4, 4, &error) || y[0] != 1.0f ||
        y[1] != 2.0f || y[2] != 3.0f || y[3] != 4.0f)
        return fail("identity matvec is incorrect");

    const float zeros[6] = {};
    const float x2[3] = {4, 5, 6};
    float y2[2] = {9, 9};
    if (!rt4dMatvecClean(zeros, x2, y2, 2, 3, &error) || y2[0] != 0.0f ||
        y2[1] != 0.0f)
        return fail("zero matvec is incorrect");

    const float a23[6] = {1, 2, 3, 4, 5, 6};
    const float x3[3] = {1, 1, 1};
    float y3[2] = {};
    if (!rt4dMatvecClean(a23, x3, y3, 2, 3, &error) || y3[0] != 6.0f ||
        y3[1] != 15.0f)
        return fail("known 2x3 matvec is incorrect");

    if (rt4dMatvecClean(a23, x3, y3, 0, 3, &error) ||
        rt4dMatvecClean(nullptr, x3, y3, 2, 3, &error))
        return fail("matvec length rejection is incorrect");

    std::fprintf(stderr,
                 "[kernel-cpu] PASS: pentachoron intersection/slicing CPU "
                 "contracts and matvec oracle\n");
    return 0;
}
