#include "kernels/cpu/rt4d_slice.h"

#include <algorithm>
#include <cmath>

namespace {

constexpr float kOnPlane = 1.0e-6f;

RT4DVec4 vertex(const RT4DPentachoronPrimitive4D& primitive, int i) {
    switch (i) {
        case 0:
            return primitive.vertex0;
        case 1:
            return primitive.vertex1;
        case 2:
            return primitive.vertex2;
        case 3:
            return primitive.vertex3;
        default:
            return primitive.vertex4;
    }
}

RT4DVec4 sub4(const RT4DVec4& a, const RT4DVec4& b) {
    return {a.x - b.x, a.y - b.y, a.z - b.z, a.w - b.w};
}

float d3(float ax, float ay, float az, float bx, float by, float bz, float cx,
         float cy, float cz) {
    return ax * (by * cz - bz * cy) - ay * (bx * cz - bz * cx) +
           az * (bx * cy - by * cx);
}

float d4(const RT4DVec4& a, const RT4DVec4& b, const RT4DVec4& c,
         const RT4DVec4& d) {
    return a.x * d3(b.y, b.z, b.w, c.y, c.z, c.w, d.y, d.z, d.w) -
           b.x * d3(a.y, a.z, a.w, c.y, c.z, c.w, d.y, d.z, d.w) +
           c.x * d3(a.y, a.z, a.w, b.y, b.z, b.w, d.y, d.z, d.w) -
           d.x * d3(a.y, a.z, a.w, b.y, b.z, b.w, c.y, c.z, c.w);
}

bool finite4(const RT4DVec4& v) {
    return std::isfinite(v.x) && std::isfinite(v.y) && std::isfinite(v.z) &&
           std::isfinite(v.w);
}

bool nearlySame(const RT4DVec3& a, const RT4DVec3& b) {
    return std::fabs(a.x - b.x) <= 1.0e-5f && std::fabs(a.y - b.y) <= 1.0e-5f &&
           std::fabs(a.z - b.z) <= 1.0e-5f;
}

void addUnique(std::vector<RT4DVec3>& vertices, const RT4DVec3& p) {
    for (const RT4DVec3& existing : vertices)
        if (nearlySame(existing, p)) return;
    vertices.push_back(p);
}

RT4DVec3 sub3(const RT4DVec3& a, const RT4DVec3& b) {
    return {a.x - b.x, a.y - b.y, a.z - b.z};
}

RT4DVec3 cross(const RT4DVec3& a, const RT4DVec3& b) {
    return {a.y * b.z - a.z * b.y, a.z * b.x - a.x * b.z, a.x * b.y - a.y * b.x};
}

float dot3(const RT4DVec3& a, const RT4DVec3& b) {
    return a.x * b.x + a.y * b.y + a.z * b.z;
}

float tetraVolume(const RT4DVec3& a, const RT4DVec3& b, const RT4DVec3& c,
                   const RT4DVec3& d) {
    const RT4DVec3 ab = sub3(b, a);
    const RT4DVec3 ac = sub3(c, a);
    const RT4DVec3 ad = sub3(d, a);
    return std::fabs(dot3(ab, cross(ac, ad))) / 6.0f;
}

void hullFaces(const std::vector<RT4DVec3>& vertices,
               std::vector<RT4DSliceTriangle3D>& faces) {
    faces.clear();
    const int n = static_cast<int>(vertices.size());
    for (int i = 0; i < n; ++i) {
        for (int j = i + 1; j < n; ++j) {
            for (int k = j + 1; k < n; ++k) {
                const RT4DVec3 ab = sub3(vertices[static_cast<size_t>(j)],
                                          vertices[static_cast<size_t>(i)]);
                const RT4DVec3 ac = sub3(vertices[static_cast<size_t>(k)],
                                          vertices[static_cast<size_t>(i)]);
                const RT4DVec3 nrm = cross(ab, ac);
                const float n2 = dot3(nrm, nrm);
                if (n2 <= 1.0e-12f) continue;
                int sign = 0;
                bool hull = true;
                for (int p = 0; p < n; ++p) {
                    if (p == i || p == j || p == k) continue;
                    const float s = dot3(
                        nrm, sub3(vertices[static_cast<size_t>(p)],
                                   vertices[static_cast<size_t>(i)]));
                    if (std::fabs(s) <= 1.0e-5f * std::sqrt(n2)) continue;
                    const int thisSign = s > 0.0f ? 1 : -1;
                    if (sign == 0) sign = thisSign;
                    else if (thisSign != sign) {
                        hull = false;
                        break;
                    }
                }
                if (!hull) continue;
                RT4DSliceTriangle3D face{};
                if (sign < 0) {
                    face.indices[0] = static_cast<uint32_t>(i);
                    face.indices[1] = static_cast<uint32_t>(k);
                    face.indices[2] = static_cast<uint32_t>(j);
                } else {
                    face.indices[0] = static_cast<uint32_t>(i);
                    face.indices[1] = static_cast<uint32_t>(j);
                    face.indices[2] = static_cast<uint32_t>(k);
                }
                faces.push_back(face);
            }
        }
    }
}

double hullVolume(const std::vector<RT4DVec3>& vertices,
                   const std::vector<RT4DSliceTriangle3D>& faces) {
    if (vertices.size() < 4 || faces.empty()) return 0.0;
    double volume = 0.0;
    for (const RT4DSliceTriangle3D& face : faces) {
        const RT4DVec3& a = vertices[face.indices[0]];
        const RT4DVec3& b = vertices[face.indices[1]];
        const RT4DVec3& c = vertices[face.indices[2]];
        volume += static_cast<double>(dot3(a, cross(b, c))) / 6.0;
    }
    return std::fabs(volume);
}

}  // namespace

const char* rt4dSliceTopologyName(RT4DSliceTopology topology) {
    switch (topology) {
        case RT4DSliceTopology::empty:
            return "empty";
        case RT4DSliceTopology::event:
            return "event";
        case RT4DSliceTopology::tetrahedron:
            return "tetrahedron";
        case RT4DSliceTopology::prism:
            return "prism";
        case RT4DSliceTopology::other:
        default:
            return "other";
    }
}

bool rt4dPentachoronBarycentric(const RT4DPentachoronPrimitive4D& primitive,
                                const RT4DVec4& point,
                                std::array<float, 5>& barycentric,
                                std::string* error) {
    if (!finite4(primitive.vertex0) || !finite4(point)) {
        if (error) *error = "barycentric input must be finite";
        return false;
    }
    const RT4DVec4 e1 = sub4(primitive.vertex1, primitive.vertex0);
    const RT4DVec4 e2 = sub4(primitive.vertex2, primitive.vertex0);
    const RT4DVec4 e3 = sub4(primitive.vertex3, primitive.vertex0);
    const RT4DVec4 e4 = sub4(primitive.vertex4, primitive.vertex0);
    const float det = d4(e1, e2, e3, e4);
    if (std::fabs(det) <= 1.0e-12f) {
        if (error) *error = "pentachoron vertices are affinely degenerate";
        return false;
    }
    const RT4DVec4 rhs = sub4(point, primitive.vertex0);
    barycentric[1] = d4(rhs, e2, e3, e4) / det;
    barycentric[2] = d4(e1, rhs, e3, e4) / det;
    barycentric[3] = d4(e1, e2, rhs, e4) / det;
    barycentric[4] = d4(e1, e2, e3, rhs) / det;
    barycentric[0] = 1.0f - barycentric[1] - barycentric[2] - barycentric[3] -
                      barycentric[4];
    return true;
}

bool rt4dSlicePentachoronAtW(const RT4DPentachoronPrimitive4D& primitive,
                               float w, RT4DPentachoronSlice3D& output,
                               std::string* error) {
    output = {};
    output.sliceW = w;
    output.primitiveId = primitive.id;
    output.hypervolume4 = rt4dPentachoronHypervolume4(primitive);
    if (!std::isfinite(w)) {
        if (error) *error = "slice w must be finite";
        return false;
    }
    for (int i = 0; i < 5; ++i) {
        if (!finite4(vertex(primitive, i))) {
            if (error) *error = "cannot slice an affinely degenerate pentachoron";
            return false;
        }
    }
    if (std::fabs(output.hypervolume4) <= 1.0e-12) {
        if (error) *error = "cannot slice an affinely degenerate pentachoron";
        return false;
    }
    for (int i = 0; i < 5; ++i) {
        const RT4DVec4 a = vertex(primitive, i);
        if (std::fabs(a.w - w) <= kOnPlane)
            addUnique(output.vertices, {a.x, a.y, a.z});
        for (int j = i + 1; j < 5; ++j) {
            const RT4DVec4 b = vertex(primitive, j);
            const float da = a.w - w;
            const float db = b.w - w;
            if (da * db >= 0.0f) continue;
            const float t = da / (da - db);
            const RT4DVec4 p = {a.x + t * (b.x - a.x), a.y + t * (b.y - a.y),
                                 a.z + t * (b.z - a.z), w};
            addUnique(output.vertices, {p.x, p.y, p.z});
        }
    }
    const size_t count = output.vertices.size();
    if (count == 0)
        output.topology = RT4DSliceTopology::empty;
    else if (count <= 3)
        output.topology = RT4DSliceTopology::event;
    else if (count == 4)
        output.topology = RT4DSliceTopology::tetrahedron;
    else if (count == 6)
        output.topology = RT4DSliceTopology::prism;
    else
        output.topology = RT4DSliceTopology::other;

    if (count >= 3) hullFaces(output.vertices, output.faces);
    if (count == 4 && output.faces.empty()) {
        output.faces.push_back({{0, 1, 2}});
        output.faces.push_back({{0, 1, 3}});
        output.faces.push_back({{0, 2, 3}});
        output.faces.push_back({{1, 2, 3}});
        output.sliceVolume3 = tetraVolume(output.vertices[0], output.vertices[1],
                                           output.vertices[2], output.vertices[3]);
    } else {
        output.sliceVolume3 = hullVolume(output.vertices, output.faces);
    }
    return true;
}
