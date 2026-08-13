/**
 * Axiom BVH4D - 4D Bounding Volume Hierarchy
 * Slab intersection, SAH build
 */

#ifndef AXIOM_BVH_H
#define AXIOM_BVH_H

#include "axiom_math.h"
#include "axiom_scene.h"

#ifdef __cplusplus
extern "C" {
#endif

// BVH Node
typedef struct {
    axiom_aabb4_t bounds;
    union {
        uint32_t left;    // Internal node: left child index (offset from this)
        uint32_t prim;    // Leaf: primitive index
    };
    uint32_t count;       // Leaf: primitive count, Internal: 0
} axiom_bvh4_node_t;

// BVH
typedef struct {
    axiom_bvh4_node_t* nodes;
    uint32_t node_count;
    uint32_t root_index;
} axiom_bvh4_t;

// Build BVH from scene (SAH)
axiom_result_t axiom_bvh4_build(
    const axiom_scene_data_t* scene,
    axiom_bvh4_t* out_bvh,
    void* allocator_ctx,
    void* (*alloc)(void*, size_t),
    void (*free)(void*, void*)
);

// Free BVH
void axiom_bvh4_free(axiom_bvh4_t* bvh, void* allocator_ctx, void (*free)(void*, void*));

// Traverse BVH for intersection
bool axiom_bvh4_intersect(
    const axiom_bvh4_t* bvh,
    const axiom_scene_data_t* scene,
    const axiom_ray_t* ray,
    axiom_intersection_t* out_isect
);

// Ray-AABB4 slab intersection
bool axiom_aabb4_intersect(
    const axiom_aabb4_t* box,
    const axiom_ray_t* ray,
    float* out_tmin,
    float* out_tmax
);

#ifdef __cplusplus
}
#endif

#endif // AXIOM_BVH_H