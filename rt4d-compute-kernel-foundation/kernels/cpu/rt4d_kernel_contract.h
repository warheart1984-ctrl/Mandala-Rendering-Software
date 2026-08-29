#pragma once

#include <array>
#include <cstdint>
#include <string>
#include <vector>

// Diagnostic-only CPU contracts for RT4D pentachoron intersection and BVH4D
// acceleration. These types are packed to match the Vulkan std430 layouts used
// by bvh4d_pentachoron_traverse.comp.glsl. They have no renderer or pixel
// authority.

struct RT4DVec4 {
    float x = 0.0f;
    float y = 0.0f;
    float z = 0.0f;
    float w = 0.0f;
};

struct RT4DRayRange {
    float tMin = 0.0f;
    float tMax = 0.0f;
    float pad0 = 0.0f;
    float pad1 = 0.0f;
};

constexpr uint32_t RT4D_PENTACHORON_HIT = 1u;
constexpr uint32_t RT4D_PENTACHORON_DEGENERATE = 2u;
constexpr uint32_t RT4D_PENTACHORON_INVALID = 4u;

struct RT4DPentachoronPrimitive4D {
    RT4DVec4 vertex0;
    RT4DVec4 vertex1;
    RT4DVec4 vertex2;
    RT4DVec4 vertex3;
    RT4DVec4 vertex4;
    uint32_t id = 0;
    uint32_t pad0 = 0;
    uint32_t pad1 = 0;
    uint32_t pad2 = 0;
};

struct RT4DPentachoronHit4D {
    float tEnter = 0.0f;
    float tExit = 0.0f;
    int32_t primitiveId = -1;
    uint32_t flags = 0;
    RT4DVec4 entryBarycentric0123;
    float entryBarycentric4 = 0.0f;
    float pad0 = 0.0f;
    float pad1 = 0.0f;
    float pad2 = 0.0f;
    RT4DVec4 exitBarycentric0123;
    float exitBarycentric4 = 0.0f;
    float pad3 = 0.0f;
    float pad4 = 0.0f;
    float pad5 = 0.0f;
};

struct RT4DBvhNode4D {
    RT4DVec4 low;
    RT4DVec4 high;
    int32_t leftChild = -1;
    int32_t rightChild = -1;
    uint32_t first = 0;
    uint32_t count = 0;
};

struct RT4DBvhBounds4D {
    std::vector<RT4DBvhNode4D> nodes;
    uint32_t leafSize = 2;
};

struct RT4DPentachoronBvh4D {
    RT4DBvhBounds4D bounds;
    std::vector<RT4DPentachoronPrimitive4D> primitives;
    uint32_t degeneratePrimitiveCount = 0;
};

struct RT4DPentachoronAsset4D {
    std::string schema;
    std::string provenance;
    bool artistReviewed = false;
    std::vector<RT4DPentachoronPrimitive4D> primitives;
};

static_assert(sizeof(RT4DVec4) == 16, "RT4DVec4 must match GLSL vec4");
static_assert(sizeof(RT4DRayRange) == 16, "RT4DRayRange must match GLSL vec4");
static_assert(sizeof(RT4DPentachoronPrimitive4D) == 96,
              "primitive layout must match GLSL std430 Primitive");
static_assert(sizeof(RT4DPentachoronHit4D) == 80,
              "hit layout must match GLSL std430 Hit");
static_assert(sizeof(RT4DBvhNode4D) == 48,
              "node layout must match GLSL std430 Node");

double rt4dPentachoronHypervolume4(
    const RT4DPentachoronPrimitive4D& primitive);

RT4DPentachoronHit4D rt4dIntersectPentachoron4D(
    const RT4DPentachoronPrimitive4D& primitive,
    const RT4DVec4& origin,
    const RT4DVec4& direction,
    const RT4DRayRange& range);

std::vector<RT4DPentachoronHit4D> rt4dIntersectPentachoron4DBatch(
    const std::vector<RT4DPentachoronPrimitive4D>& primitives,
    const std::vector<RT4DVec4>& origins,
    const std::vector<RT4DVec4>& directions,
    const std::vector<RT4DRayRange>& ranges,
    std::string* error);

bool rt4dBuildPentachoronBvh4D(
    const std::vector<RT4DPentachoronPrimitive4D>& primitives,
    uint32_t leafSize,
    RT4DPentachoronBvh4D& output,
    std::string* error);

std::vector<RT4DPentachoronHit4D> rt4dTraversePentachoronBvh4DBatch(
    const RT4DPentachoronBvh4D& bvh,
    const std::vector<RT4DVec4>& origins,
    const std::vector<RT4DVec4>& directions,
    const std::vector<RT4DRayRange>& ranges,
    std::string* error);

bool rt4dLoadPentachoronSidecar(
    const std::string& path,
    RT4DPentachoronAsset4D& output,
    std::string* error);
