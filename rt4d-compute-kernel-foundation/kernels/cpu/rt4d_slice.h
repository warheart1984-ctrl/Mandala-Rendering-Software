#pragma once

#include "kernels/cpu/rt4d_kernel_contract.h"

#include <array>
#include <cstdint>
#include <string>
#include <vector>

enum class RT4DSliceTopology {
    empty,
    event,
    tetrahedron,
    prism,
    other
};

struct RT4DVec3 {
    float x = 0.0f;
    float y = 0.0f;
    float z = 0.0f;
};

struct RT4DSliceTriangle3D {
    uint32_t indices[3]{0, 0, 0};
};

struct RT4DPentachoronSlice3D {
    RT4DSliceTopology topology = RT4DSliceTopology::empty;
    float sliceW = 0.0f;
    uint32_t primitiveId = 0;
    double hypervolume4 = 0.0;
    double sliceVolume3 = 0.0;
    std::vector<RT4DVec3> vertices;
    std::vector<RT4DSliceTriangle3D> faces;
};

const char* rt4dSliceTopologyName(RT4DSliceTopology topology);

bool rt4dPentachoronBarycentric(
    const RT4DPentachoronPrimitive4D& primitive, const RT4DVec4& point,
    std::array<float, 5>& barycentric, std::string* error);

bool rt4dSlicePentachoronAtW(const RT4DPentachoronPrimitive4D& primitive,
                               float w, RT4DPentachoronSlice3D& output,
                               std::string* error);
