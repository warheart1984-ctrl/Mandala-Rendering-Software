#include "kernels/cpu/rt4d_kernel_contract.h"

#include <algorithm>
#include <cmath>
#include <fstream>
#include <limits>
#include <sstream>

namespace {

void setError(std::string* error, const char* message) {
    if (error) *error = message;
}

bool finite4(const RT4DVec4& v) {
    return std::isfinite(v.x) && std::isfinite(v.y) && std::isfinite(v.z) &&
           std::isfinite(v.w);
}

RT4DVec4 sub(const RT4DVec4& a, const RT4DVec4& b) {
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

float maxAbs4(const RT4DVec4& v) {
    return std::max(std::max(std::fabs(v.x), std::fabs(v.y)),
                     std::max(std::fabs(v.z), std::fabs(v.w)));
}

RT4DPentachoronHit4D missHit() {
    RT4DPentachoronHit4D hit{};
    hit.tEnter = 1.0e30f;
    hit.tExit = -1.0e30f;
    hit.primitiveId = -1;
    hit.flags = 0;
    return hit;
}

bool aabbHits(const RT4DVec4& origin, const RT4DVec4& direction,
              const RT4DVec4& low, const RT4DVec4& high, float tMin,
              float tMax) {
    if (!finite4(origin) || !finite4(direction) || !finite4(low) ||
        !finite4(high) || low.x > high.x || low.y > high.y || low.z > high.z ||
        low.w > high.w)
        return false;
    const float o[4] = {origin.x, origin.y, origin.z, origin.w};
    const float d[4] = {direction.x, direction.y, direction.z, direction.w};
    const float lo[4] = {low.x, low.y, low.z, low.w};
    const float hi[4] = {high.x, high.y, high.z, high.w};
    float a = tMin;
    float b = tMax;
    for (int i = 0; i < 4; ++i) {
        if (std::fabs(d[i]) <= 1.0e-12f) {
            if (o[i] < lo[i] - 1.0e-6f || o[i] > hi[i] + 1.0e-6f) return false;
        } else {
            const float x = (lo[i] - o[i]) / d[i];
            const float y = (hi[i] - o[i]) / d[i];
            a = std::max(a, std::min(x, y));
            b = std::min(b, std::max(x, y));
            if (b < a) return false;
        }
    }
    return true;
}

void expandBounds(RT4DVec4& low, RT4DVec4& high, const RT4DVec4& p) {
    low.x = std::min(low.x, p.x);
    low.y = std::min(low.y, p.y);
    low.z = std::min(low.z, p.z);
    low.w = std::min(low.w, p.w);
    high.x = std::max(high.x, p.x);
    high.y = std::max(high.y, p.y);
    high.z = std::max(high.z, p.z);
    high.w = std::max(high.w, p.w);
}

void primitiveBounds(const RT4DPentachoronPrimitive4D& primitive,
                    RT4DVec4& low, RT4DVec4& high) {
    low = high = primitive.vertex0;
    expandBounds(low, high, primitive.vertex1);
    expandBounds(low, high, primitive.vertex2);
    expandBounds(low, high, primitive.vertex3);
    expandBounds(low, high, primitive.vertex4);
}

RT4DVec4 centroid(const RT4DPentachoronPrimitive4D& primitive) {
    return {(primitive.vertex0.x + primitive.vertex1.x + primitive.vertex2.x +
             primitive.vertex3.x + primitive.vertex4.x) /
                5.0f,
            (primitive.vertex0.y + primitive.vertex1.y + primitive.vertex2.y +
             primitive.vertex3.y + primitive.vertex4.y) /
                5.0f,
            (primitive.vertex0.z + primitive.vertex1.z + primitive.vertex2.z +
             primitive.vertex3.z + primitive.vertex4.z) /
                5.0f,
            (primitive.vertex0.w + primitive.vertex1.w + primitive.vertex2.w +
             primitive.vertex3.w + primitive.vertex4.w) /
                5.0f};
}

int buildNode(std::vector<RT4DPentachoronPrimitive4D>& primitives, uint32_t begin,
              uint32_t end, uint32_t leafSize,
              std::vector<RT4DBvhNode4D>& nodes) {
    const int index = static_cast<int>(nodes.size());
    nodes.push_back({});
    RT4DVec4 low{std::numeric_limits<float>::infinity(),
                 std::numeric_limits<float>::infinity(),
                 std::numeric_limits<float>::infinity(),
                 std::numeric_limits<float>::infinity()};
    RT4DVec4 high{-std::numeric_limits<float>::infinity(),
                  -std::numeric_limits<float>::infinity(),
                  -std::numeric_limits<float>::infinity(),
                  -std::numeric_limits<float>::infinity()};
    for (uint32_t i = begin; i < end; ++i) {
        RT4DVec4 pLow{}, pHigh{};
        primitiveBounds(primitives[i], pLow, pHigh);
        expandBounds(low, high, pLow);
        expandBounds(low, high, pHigh);
    }
    nodes[static_cast<size_t>(index)].low = low;
    nodes[static_cast<size_t>(index)].high = high;
    const uint32_t count = end - begin;
    if (count <= leafSize) {
        nodes[static_cast<size_t>(index)].first = begin;
        nodes[static_cast<size_t>(index)].count = count;
        nodes[static_cast<size_t>(index)].leftChild = -1;
        nodes[static_cast<size_t>(index)].rightChild = -1;
        return index;
    }
    const float extent[4] = {high.x - low.x, high.y - low.y, high.z - low.z,
                              high.w - low.w};
    int axis = 0;
    float longest = extent[0];
    for (int i = 1; i < 4; ++i) {
        if (extent[i] > longest) {
            longest = extent[i];
            axis = i;
        }
    }
    const uint32_t mid = begin + count / 2;
    std::nth_element(primitives.begin() + static_cast<std::ptrdiff_t>(begin),
                     primitives.begin() + static_cast<std::ptrdiff_t>(mid),
                     primitives.begin() + static_cast<std::ptrdiff_t>(end),
                     [axis](const RT4DPentachoronPrimitive4D& a,
                            const RT4DPentachoronPrimitive4D& b) {
                         const RT4DVec4 ca = centroid(a);
                         const RT4DVec4 cb = centroid(b);
                         const float va[4] = {ca.x, ca.y, ca.z, ca.w};
                         const float vb[4] = {cb.x, cb.y, cb.z, cb.w};
                         return va[axis] < vb[axis];
                     });
    const int left = buildNode(primitives, begin, mid, leafSize, nodes);
    const int right = buildNode(primitives, mid, end, leafSize, nodes);
    nodes[static_cast<size_t>(index)].leftChild = left;
    nodes[static_cast<size_t>(index)].rightChild = right;
    nodes[static_cast<size_t>(index)].first = 0;
    nodes[static_cast<size_t>(index)].count = 0;
    return index;
}

bool nearerHit(const RT4DPentachoronHit4D& candidate,
               const RT4DPentachoronHit4D& current, float closest) {
    if ((candidate.flags & RT4D_PENTACHORON_HIT) == 0) return false;
    const float scale =
        std::max(1.0f, std::max(std::fabs(candidate.tEnter), std::fabs(closest)));
    const bool nearer = candidate.tEnter < closest - 2.0e-5f * scale;
    const bool tie = std::fabs(candidate.tEnter - closest) <= 2.0e-5f * scale &&
                     (current.primitiveId < 0 ||
                      candidate.primitiveId < current.primitiveId);
    return nearer || tie;
}

}  // namespace

double rt4dPentachoronHypervolume4(
    const RT4DPentachoronPrimitive4D& primitive) {
    const RT4DVec4 e1 = sub(primitive.vertex1, primitive.vertex0);
    const RT4DVec4 e2 = sub(primitive.vertex2, primitive.vertex0);
    const RT4DVec4 e3 = sub(primitive.vertex3, primitive.vertex0);
    const RT4DVec4 e4 = sub(primitive.vertex4, primitive.vertex0);
    return static_cast<double>(d4(e1, e2, e3, e4)) / 24.0;
}

RT4DPentachoronHit4D rt4dIntersectPentachoron4D(
    const RT4DPentachoronPrimitive4D& primitive, const RT4DVec4& origin,
    const RT4DVec4& direction, const RT4DRayRange& range) {
    RT4DPentachoronHit4D hit = missHit();
    if (!finite4(primitive.vertex0) || !finite4(primitive.vertex1) ||
        !finite4(primitive.vertex2) || !finite4(primitive.vertex3) ||
        !finite4(primitive.vertex4) || !finite4(origin) || !finite4(direction) ||
        !std::isfinite(range.tMin) || !std::isfinite(range.tMax) ||
        range.tMin > range.tMax || primitive.id > 0x7fffffffu) {
        hit.flags = RT4D_PENTACHORON_INVALID;
        return hit;
    }
    const RT4DVec4 e1 = sub(primitive.vertex1, primitive.vertex0);
    const RT4DVec4 e2 = sub(primitive.vertex2, primitive.vertex0);
    const RT4DVec4 e3 = sub(primitive.vertex3, primitive.vertex0);
    const RT4DVec4 e4 = sub(primitive.vertex4, primitive.vertex0);
    const float det = d4(e1, e2, e3, e4);
    const float scale = std::max(
        1.0e-6f, std::max(std::max(maxAbs4(e1), maxAbs4(e2)),
                          std::max(maxAbs4(e3), maxAbs4(e4))));
    if (std::fabs(det) <= 1.0e-7f * scale * scale * scale * scale) {
        hit.primitiveId = static_cast<int32_t>(primitive.id);
        hit.flags = RT4D_PENTACHORON_DEGENERATE;
        return hit;
    }
    const RT4DVec4 rhsOrigin = sub(origin, primitive.vertex0);
    const float a1 = d4(rhsOrigin, e2, e3, e4) / det;
    const float a2 = d4(e1, rhsOrigin, e3, e4) / det;
    const float a3 = d4(e1, e2, rhsOrigin, e4) / det;
    const float a4 = d4(e1, e2, e3, rhsOrigin) / det;
    const float a0 = 1.0f - a1 - a2 - a3 - a4;
    const float b1 = d4(direction, e2, e3, e4) / det;
    const float b2 = d4(e1, direction, e3, e4) / det;
    const float b3 = d4(e1, e2, direction, e4) / det;
    const float b4 = d4(e1, e2, e3, direction) / det;
    // Match the GLSL expression: 1 - (b1+b2+b3+b4) - 1
    const float b0 = 1.0f - b1 - b2 - b3 - b4 - 1.0f;
    float enter = range.tMin;
    float exit = range.tMax;
    const float aa[5] = {a0, a1, a2, a3, a4};
    const float bb[5] = {b0, b1, b2, b3, b4};
    for (int i = 0; i < 5; ++i) {
        if (std::fabs(bb[i]) <= 1.0e-12f) {
            if (aa[i] < -1.0e-6f) return missHit();
        } else {
            const float t = (-1.0e-6f - aa[i]) / bb[i];
            if (bb[i] > 0.0f)
                enter = std::max(enter, t);
            else
                exit = std::min(exit, t);
            if (exit < enter) return missHit();
        }
    }
    hit.tEnter = enter;
    hit.tExit = exit;
    hit.primitiveId = static_cast<int32_t>(primitive.id);
    hit.flags = RT4D_PENTACHORON_HIT;
    hit.entryBarycentric0123 = {a0 + b0 * enter, a1 + b1 * enter,
                                 a2 + b2 * enter, a3 + b3 * enter};
    hit.entryBarycentric4 = a4 + b4 * enter;
    hit.exitBarycentric0123 = {a0 + b0 * exit, a1 + b1 * exit, a2 + b2 * exit,
                               a3 + b3 * exit};
    hit.exitBarycentric4 = a4 + b4 * exit;
    return hit;
}

std::vector<RT4DPentachoronHit4D> rt4dIntersectPentachoron4DBatch(
    const std::vector<RT4DPentachoronPrimitive4D>& primitives,
    const std::vector<RT4DVec4>& origins, const std::vector<RT4DVec4>& directions,
    const std::vector<RT4DRayRange>& ranges, std::string* error) {
    if (primitives.size() != origins.size() ||
        origins.size() != directions.size() ||
        directions.size() != ranges.size()) {
        setError(error, "pentachoron batch arrays must have equal lengths");
        return {};
    }
    std::vector<RT4DPentachoronHit4D> hits;
    hits.reserve(primitives.size());
    for (size_t i = 0; i < primitives.size(); ++i) {
        hits.push_back(rt4dIntersectPentachoron4D(primitives[i], origins[i],
                                                   directions[i], ranges[i]));
    }
    return hits;
}

bool rt4dBuildPentachoronBvh4D(
    const std::vector<RT4DPentachoronPrimitive4D>& primitives,
    uint32_t leafSize, RT4DPentachoronBvh4D& output, std::string* error) {
    if (primitives.empty()) {
        setError(error, "pentachoron BVH requires at least one primitive");
        return false;
    }
    if (leafSize == 0) {
        setError(error, "pentachoron BVH leaf size must be positive");
        return false;
    }
    output = {};
    output.bounds.leafSize = leafSize;
    output.primitives = primitives;
    output.degeneratePrimitiveCount = 0;
    for (const RT4DPentachoronPrimitive4D& primitive : output.primitives) {
        if (!finite4(primitive.vertex0) || !finite4(primitive.vertex1) ||
            !finite4(primitive.vertex2) || !finite4(primitive.vertex3) ||
            !finite4(primitive.vertex4) || primitive.id > 0x7fffffffu) {
            setError(error,
                     "pentachoron BVH requires finite uniquely identified primitives");
            return false;
        }
        const RT4DVec4 e1 = sub(primitive.vertex1, primitive.vertex0);
        const RT4DVec4 e2 = sub(primitive.vertex2, primitive.vertex0);
        const RT4DVec4 e3 = sub(primitive.vertex3, primitive.vertex0);
        const RT4DVec4 e4 = sub(primitive.vertex4, primitive.vertex0);
        const float det = d4(e1, e2, e3, e4);
        const float scale = std::max(
            1.0e-6f, std::max(std::max(maxAbs4(e1), maxAbs4(e2)),
                              std::max(maxAbs4(e3), maxAbs4(e4))));
        if (std::fabs(det) <= 1.0e-7f * scale * scale * scale * scale)
            ++output.degeneratePrimitiveCount;
    }
    buildNode(output.primitives, 0,
              static_cast<uint32_t>(output.primitives.size()), leafSize,
              output.bounds.nodes);
    return true;
}

std::vector<RT4DPentachoronHit4D> rt4dTraversePentachoronBvh4DBatch(
    const RT4DPentachoronBvh4D& bvh, const std::vector<RT4DVec4>& origins,
    const std::vector<RT4DVec4>& directions,
    const std::vector<RT4DRayRange>& ranges, std::string* error) {
    if (origins.size() != directions.size() ||
        directions.size() != ranges.size()) {
        setError(error, "pentachoron BVH ray arrays must have equal lengths");
        return {};
    }
    std::vector<RT4DPentachoronHit4D> hits(origins.size());
    const uint32_t nodeCount =
        static_cast<uint32_t>(bvh.bounds.nodes.size());
    const uint32_t primitiveCount =
        static_cast<uint32_t>(bvh.primitives.size());
    for (size_t ray = 0; ray < origins.size(); ++ray) {
        RT4DPentachoronHit4D hit = missHit();
        if (nodeCount == 0 || primitiveCount == 0) {
            hit.flags = RT4D_PENTACHORON_INVALID;
            hits[ray] = hit;
            continue;
        }
        int stack[64];
        int n = 1;
        stack[0] = 0;
        uint32_t seen = 0;
        float closest = ranges[ray].tMax;
        while (n > 0) {
            if (seen++ >= nodeCount) {
                hit.flags |= RT4D_PENTACHORON_INVALID;
                break;
            }
            const int ni = stack[--n];
            if (ni < 0 || static_cast<uint32_t>(ni) >= nodeCount) {
                hit.flags |= RT4D_PENTACHORON_INVALID;
                continue;
            }
            const RT4DBvhNode4D& node =
                bvh.bounds.nodes[static_cast<size_t>(ni)];
            if (!aabbHits(origins[ray], directions[ray], node.low, node.high,
                           ranges[ray].tMin, closest))
                continue;
            if (node.count > 0) {
                if (node.first > primitiveCount ||
                    node.count > primitiveCount - node.first) {
                    hit.flags |= RT4D_PENTACHORON_INVALID;
                    continue;
                }
                for (uint32_t i = 0; i < node.count; ++i) {
                    const RT4DRayRange clipped{ranges[ray].tMin, closest, 0.0f,
                                                0.0f};
                    const RT4DPentachoronHit4D candidate =
                        rt4dIntersectPentachoron4D(
                            bvh.primitives[node.first + i], origins[ray],
                            directions[ray], clipped);
                    if (!nearerHit(candidate, hit, closest)) continue;
                    closest = std::min(closest, candidate.tEnter);
                    hit = candidate;
                }
            } else {
                if (node.leftChild < 0 || node.rightChild < 0 || n > 62) {
                    hit.flags |= RT4D_PENTACHORON_INVALID;
                    continue;
                }
                stack[n++] = node.leftChild;
                stack[n++] = node.rightChild;
            }
        }
        hits[ray] = hit;
    }
    return hits;
}

bool rt4dLoadPentachoronSidecar(const std::string& path,
                               RT4DPentachoronAsset4D& output,
                               std::string* error) {
    std::ifstream input(path);
    if (!input) {
        setError(error, "cannot open pentachoron sidecar");
        return false;
    }
    output = {};
    std::string line;
    bool artistReviewedSeen = false;
    while (std::getline(input, line)) {
        if (line.empty() || line[0] == '#') continue;
        std::istringstream stream(line);
        std::string tag;
        if (!(stream >> tag)) continue;
        if (tag == "schema") {
            if (!output.schema.empty() || !(stream >> output.schema) ||
                output.schema.empty()) {
                setError(error, "invalid or duplicate pentachoron sidecar record");
                return false;
            }
        } else if (tag == "schemaVersion") {
            if (!output.schemaVersion.empty() || !(stream >> output.schemaVersion)) {
                setError(error, "invalid or duplicate pentachoron sidecar record");
                return false;
            }
        } else if (tag == "migrationPath") {
            if (!output.migrationPath.empty() || !(stream >> output.migrationPath)) {
                setError(error, "invalid or duplicate pentachoron sidecar record");
                return false;
            }
        } else if (tag == "provenance") {
            if (!output.provenance.empty() || !(stream >> output.provenance)) {
                setError(error, "invalid or duplicate pentachoron sidecar record");
                return false;
            }
        } else if (tag == "author") {
            if (!output.author.empty() || !(stream >> output.author)) {
                setError(error, "invalid or duplicate pentachoron sidecar record");
                return false;
            }
        } else if (tag == "license") {
            if (!output.license.empty() || !(stream >> output.license)) {
                setError(error, "invalid or duplicate pentachoron sidecar record");
                return false;
            }
        } else if (tag == "creationTool") {
            if (!output.creationTool.empty() || !(stream >> output.creationTool)) {
                setError(error, "invalid or duplicate pentachoron sidecar record");
                return false;
            }
        } else if (tag == "sourceHash") {
            if (!output.sourceHash.empty() || !(stream >> output.sourceHash)) {
                setError(error, "invalid or duplicate pentachoron sidecar record");
                return false;
            }
        } else if (tag == "artist_reviewed") {
            std::string value;
            if (artistReviewedSeen || !(stream >> value)) {
                setError(error, "invalid or duplicate pentachoron sidecar record");
                return false;
            }
            artistReviewedSeen = true;
            if (value == "true")
                output.artistReviewed = true;
            else if (value == "false")
                output.artistReviewed = false;
            else {
                setError(error, "invalid or duplicate pentachoron sidecar record");
                return false;
            }
        } else if (tag == "pentachoron") {
            RT4DPentachoronPrimitive4D primitive{};
            if (!(stream >> primitive.id >> primitive.vertex0.x >>
                  primitive.vertex0.y >> primitive.vertex0.z >>
                  primitive.vertex0.w >> primitive.vertex1.x >>
                  primitive.vertex1.y >> primitive.vertex1.z >>
                  primitive.vertex1.w >> primitive.vertex2.x >>
                  primitive.vertex2.y >> primitive.vertex2.z >>
                  primitive.vertex2.w >> primitive.vertex3.x >>
                  primitive.vertex3.y >> primitive.vertex3.z >>
                  primitive.vertex3.w >> primitive.vertex4.x >>
                  primitive.vertex4.y >> primitive.vertex4.z >>
                  primitive.vertex4.w)) {
                setError(error, "invalid or duplicate pentachoron sidecar record");
                return false;
            }
            if (!finite4(primitive.vertex0) || !finite4(primitive.vertex1) ||
                !finite4(primitive.vertex2) || !finite4(primitive.vertex3) ||
                !finite4(primitive.vertex4)) {
                setError(error, "sidecar pentachoron is non-finite or degenerate");
                return false;
            }
            const RT4DVec4 e1 = sub(primitive.vertex1, primitive.vertex0);
            const RT4DVec4 e2 = sub(primitive.vertex2, primitive.vertex0);
            const RT4DVec4 e3 = sub(primitive.vertex3, primitive.vertex0);
            const RT4DVec4 e4 = sub(primitive.vertex4, primitive.vertex0);
            const float det = d4(e1, e2, e3, e4);
            const float scale = std::max(
                1.0e-6f, std::max(std::max(maxAbs4(e1), maxAbs4(e2)),
                                  std::max(maxAbs4(e3), maxAbs4(e4))));
            if (std::fabs(det) <= 1.0e-7f * scale * scale * scale * scale) {
                setError(error, "sidecar pentachoron is non-finite or degenerate");
                return false;
            }
            output.primitives.push_back(primitive);
        } else {
            setError(error, "unknown pentachoron sidecar record");
            return false;
        }
    }
    if (output.schema == "rt4d-pentachoron-sidecar/0.1") {
        if (output.provenance.empty() || output.primitives.empty()) {
            setError(error, "pentachoron authored-sidecar contract is incorrect");
            return false;
        }
        output.schemaVersion = "1";
        return true;
    }
    if (output.schema == "rt4d-pentachoron-sidecar/0.2") {
        if (output.provenance.empty() || output.primitives.empty() ||
            output.schemaVersion != "2" || output.author.empty() ||
            output.license.empty() || output.creationTool.empty() ||
            output.sourceHash.empty() || output.migrationPath.empty()) {
            setError(error, "pentachoron sidecar-v2 contract is incorrect");
            return false;
        }
        return true;
    }
    setError(error, "unsupported pentachoron sidecar schema");
    return false;
}
