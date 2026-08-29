#include "kernels/cpu/rt4d_preview.h"
#include "kernels/cpu/rt4d_sha256.h"
#include "kernels/cpu/rt4d_slice.h"

#include <algorithm>
#include <array>
#include <cmath>
#include <cstdio>
#include <string>
#include <vector>

namespace {

int fail(const char* message) {
    std::fprintf(stderr, "[slice] FAIL: %s\n", message);
    return 1;
}

bool near(double a, double b, double tol) {
    return std::fabs(a - b) <= tol;
}

RT4DPentachoronPrimitive4D unitPentachoron() {
    return {{0, 0, 0, 0}, {1, 0, 0, 0}, {0, 1, 0, 0}, {0, 0, 1, 0},
            {0, 0, 0, 1}, 1, 0, 0, 0};
}

RT4DPentachoronPrimitive4D prismPentachoron() {
    return {{0, 0, 0, 0},
            {1, 0, 0, 0},
            {0, 1, 0, 0},
            {0, 0, 1, 1},
            {0, 0, 0, 1},
            2,
            0,
            0,
            0};
}

}  // namespace

int main() {
    const RT4DPentachoronPrimitive4D unit = unitPentachoron();
    if (!near(rt4dPentachoronHypervolume4(unit), 1.0 / 24.0, 1e-9))
        return fail("hypervolume4 is not 1/24 for the unit pentachoron");

    std::string error;
    RT4DPentachoronSlice3D emptySlice;
    if (!rt4dSlicePentachoronAtW(unit, 2.0f, emptySlice, &error) ||
        emptySlice.topology != RT4DSliceTopology::empty ||
        emptySlice.sliceVolume3 != 0.0)
        return fail("w=2 did not produce an empty slice");
    if (emptySlice.hypervolume4 <= 0.0)
        return fail("empty slice must still record hypervolume4");

    RT4DPentachoronSlice3D eventSlice;
    if (!rt4dSlicePentachoronAtW(unit, 1.0f, eventSlice, &error) ||
        eventSlice.topology != RT4DSliceTopology::event ||
        eventSlice.vertices.size() != 1)
        return fail("w=1 of the unit pentachoron is not an event");

    RT4DPentachoronSlice3D tetra;
    if (!rt4dSlicePentachoronAtW(unit, 0.25f, tetra, &error) ||
        tetra.topology != RT4DSliceTopology::tetrahedron ||
        tetra.vertices.size() != 4 || tetra.sliceVolume3 <= 0.0)
        return fail("w=0.25 of the unit pentachoron is not a tetrahedron");
    if (!near(tetra.hypervolume4, 1.0 / 24.0, 1e-9))
        return fail("tetra slice lost hypervolume4");

    std::array<RT4DVec4, 5> vertices = {unit.vertex0, unit.vertex1, unit.vertex2,
                                          unit.vertex3, unit.vertex4};
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
        RT4DPentachoronSlice3D sliced;
        if (!rt4dSlicePentachoronAtW(permuted, 0.25f, sliced, &error) ||
            sliced.topology != RT4DSliceTopology::tetrahedron ||
            std::fabs(sliced.sliceVolume3 - tetra.sliceVolume3) > 1.0e-5)
            return fail("vertex permutation changed sliceVolume3");
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
        return fail("slice permutation proof did not cover 5 factorial");

    const RT4DPentachoronPrimitive4D prismPrim = prismPentachoron();
    RT4DPentachoronSlice3D prism;
    if (!rt4dSlicePentachoronAtW(prismPrim, 0.5f, prism, &error) ||
        prism.topology != RT4DSliceTopology::prism || prism.vertices.size() != 6 ||
        prism.sliceVolume3 <= 0.0)
        return fail("3+2 split did not produce a prism");

    std::array<float, 5> bary{};
    const RT4DVec4 centroid{0.2f, 0.2f, 0.2f, 0.2f};
    if (!rt4dPentachoronBarycentric(unit, centroid, bary, &error))
        return fail(error.c_str());
    for (float w : bary)
        if (w < -1.0e-5f || std::fabs(w - 0.2f) > 1.0e-4f)
            return fail("centroid barycentric coordinates are incorrect");
    const RT4DVec4 outside{2.0f, 2.0f, 2.0f, 2.0f};
    if (!rt4dPentachoronBarycentric(unit, outside, bary, &error))
        return fail(error.c_str());
    float sum = 0.0f;
    bool negative = false;
    for (float w : bary) {
        sum += w;
        if (w < -1.0e-5f) negative = true;
    }
    if (std::fabs(sum - 1.0f) > 1.0e-4f || !negative)
        return fail("outside point was not excluded by barycentric signs");

    RT4DPreviewImage emptyPreview;
    if (!rt4dRasterizeSlicePreview(emptySlice, emptyPreview, &error) ||
        emptyPreview.pixelSha256 !=
            "f3cc103136423a57975750907ebc1d367e2985ac6338976d4d5a439f50323f4a" ||
        emptyPreview.imageCoverage != 0.0f)
        return fail("empty preview raw-RGB sha256 is incorrect");

    RT4DPreviewImage eventPreview;
    if (!rt4dRasterizeSlicePreview(eventSlice, eventPreview, &error) ||
        eventPreview.imageCoverage != 0.0f)
        return fail("event preview should have zero coverage");

    RT4DPreviewImage tetraPreview;
    RT4DPreviewImage tetraPreview2;
    if (!rt4dRasterizeSlicePreview(tetra, tetraPreview, &error) ||
        !rt4dRasterizeSlicePreview(tetra, tetraPreview2, &error) ||
        tetraPreview.pixelSha256 !=
            "f55ca1116b20037d594b90f266d7d16e62547bfe806d112a2eae8d15a753c164" ||
        tetraPreview.pixelSha256 != tetraPreview2.pixelSha256 ||
        tetraPreview.imageCoverage <= 0.0f)
        return fail("tetra preview hash is not the pinned golden");

    RT4DPreviewImage prismPreview;
    if (!rt4dRasterizeSlicePreview(prism, prismPreview, &error) ||
        prismPreview.pixelSha256 !=
            "7cf48b81a9d59b60da999b61dff9d39c1cc7510226088d61c9f6d13d6a79f5b2" ||
        prismPreview.imageCoverage <= 0.0f ||
        prismPreview.pixelSha256 == emptyPreview.pixelSha256)
        return fail("prism preview hash is not the pinned golden");

    const std::string ppm = rt4dPreviewPpm(tetraPreview);
    std::vector<uint8_t> rgb;
    if (!rt4dPreviewRgbFromPpm(ppm, rgb, &error) ||
        rt4dSha256Hex(rt4dSha256Bytes(rgb.data(), rgb.size())) !=
            tetraPreview.pixelSha256)
        return fail("PPM RGB hash must match raw pixel sha256, not the file hash");

    std::fprintf(stderr,
                   "[slice] PASS: topologies empty/event/tetrahedron/prism "
                   "hypervolume4 vs sliceVolume3 tetraSha=%s prismSha=%s\n",
                   tetraPreview.pixelSha256.c_str(),
                   prismPreview.pixelSha256.c_str());
    return 0;
}
