/**
 * Axiom BVH4D Implementation - SAH Build, Slab Traversal
 */

#include "axiom/axiom_bvh.h"
#include "axiom/axiom_scene.h"
#include <algorithm>
#include <vector>
#include <cmath>

using namespace axiom;

struct BuildNode {
    AABB4 bounds;
    uint32_t left = 0;
    uint32_t right = 0;
    uint32_t count = 0;
    uint32_t prim_index = 0;
};

static float surface_area(const AABB4& box) {
    Vec4 d;
    d.x = box.max.x - box.min.x;
    d.y = box.max.y - box.min.y;
    d.z = box.max.z - box.min.z;
    d.w = box.max.w - box.min.w;
    // 4D surface area of hyper-rectangle
    return 2.0f * (d.x*d.y + d.x*d.z + d.x*d.w + d.y*d.z + d.y*d.w + d.z*d.w);
}

static AABB4 merge_bounds(const AABB4& a, const AABB4& b) {
    AABB4 r;
    r.min.x = std::min(a.min.x, b.min.x);
    r.min.y = std::min(a.min.y, b.min.y);
    r.min.z = std::min(a.min.z, b.min.z);
    r.min.w = std::min(a.min.w, b.min.w);
    r.max.x = std::max(a.max.x, b.max.x);
    r.max.y = std::max(a.max.y, b.max.y);
    r.max.z = std::max(a.max.z, b.max.z);
    r.max.w = std::max(a.max.w, b.max.w);
    return r;
}

static AABB4 primitive_bounds(const Primitive& p) {
    AABB4 box;
    switch (p.type) {
        case GEO_HYPERSPHERE: {
            Vec4 r = Vec4{p.radius, p.radius, p.radius, p.radius};
            box.min = p.center - r;
            box.max = p.center + r;
            break;
        }
        case GEO_HYPERPLANE: {
            // Infinite plane - large bounds
            box.min = Vec4{-1e10f, -1e10f, -1e10f, -1e10f};
            box.max = Vec4{1e10f, 1e10f, 1e10f, 1e10f};
            break;
        }
        case GEO_ORIENTED_CAPSULE: {
            float r = p.capsule_radius;
            Vec4 r4 = Vec4{r, r, r, r};
            box.min = Vec4{
                std::min(p.capsule_a.x, p.capsule_b.x) - r,
                std::min(p.capsule_a.y, p.capsule_b.y) - r,
                std::min(p.capsule_a.z, p.capsule_b.z) - r,
                std::min(p.capsule_a.w, p.capsule_b.w) - r
            };
            box.max = Vec4{
                std::max(p.capsule_a.x, p.capsule_b.x) + r,
                std::max(p.capsule_a.y, p.capsule_b.y) + r,
                std::max(p.capsule_a.z, p.capsule_b.z) + r,
                std::max(p.capsule_a.w, p.capsule_b.w) + r
            };
            break;
        }
        default: {
            box.min = Vec4{-1e10f, -1e10f, -1e10f, -1e10f};
            box.max = Vec4{1e10f, 1e10f, 1e10f, 1e10f};
        }
    }
    return box;
}

static uint32_t build_bvh(
    std::vector<BuildNode>& nodes,
    std::vector<uint32_t>& prim_indices,
    const Primitive* prims,
    uint32_t start,
    uint32_t end,
    uint32_t depth = 0
) {
    if (end - start <= 4 || depth > 32) {
        uint32_t idx = nodes.size();
        nodes.push_back({});
        nodes[idx].bounds = AABB4{};
        nodes[idx].count = end - start;
        nodes[idx].prim_index = nodes.size() > 1 ? 0 : 0; // Will be set
        
        // Compute bounds
        AABB4 bounds;
        bool first = true;
        for (uint32_t i = start; i < end; ++i) {
            AABB4 pb = primitive_bounds(prims[prim_indices[i]]);
            if (first) {
                bounds = pb;
                first = false;
            } else {
                bounds = merge_bounds(bounds, pb);
            }
        }
        nodes[idx].bounds = bounds;
        nodes[idx].prim_index = start;
        return idx;
    }
    
    // SAH split - find best axis and position
    float best_cost = FLT_MAX;
    uint32_t best_axis = 0;
    uint32_t best_split = 0;
    
    for (int axis = 0; axis < 4; ++axis) {
        // Sort by centroid
        auto cmp = [&](uint32_t a, uint32_t b) {
            AABB4 ba = primitive_bounds(prims[a]);
            AABB4 bb = primitive_bounds(prims[b]);
            float ca = (&ba.min.x)[axis] + (&ba.max.x)[axis];
            float cb = (&bb.min.x)[axis] + (&bb.max.x)[axis];
            return ca < cb;
        };
        std::vector<uint32_t> sorted = prim_indices;
        std::sort(sorted.begin(), sorted.end(), cmp);
        
        // Try splits
        for (uint32_t split = 1; split < end - start; ++split) {
            AABB4 left_bounds, right_bounds;
            bool first_l = true, first_r = true;
            
            for (uint32_t i = 0; i < split; ++i) {
                AABB4 pb = primitive_bounds(prims[sorted[i]]);
                if (first_l) { left_bounds = pb; first_l = false; }
                else left_bounds = merge_bounds(left_bounds, pb);
            }
            for (uint32_t i = split; i < end - start; ++i) {
                AABB4 pb = primitive_bounds(prims[sorted[i]]);
                if (first_r) { right_bounds = pb; first_r = false; }
                else right_bounds = merge_bounds(right_bounds, pb);
            }
            
            float cost = 1.0f + (surface_area(left_bounds) * split + surface_area(right_bounds) * (end - start - split)) / surface_area(merge_bounds(left_bounds, right_bounds));
            if (cost < best_cost) {
                best_cost = cost;
                best_axis = axis;
                best_split = split;
            }
        }
    }
    
    // Sort by best axis
    auto cmp = [&](uint32_t a, uint32_t b) {
        AABB4 ba = primitive_bounds(prims[a]);
        AABB4 bb = primitive_bounds(prims[b]);
        float ca = (&ba.min.x)[best_axis] + (&ba.max.x)[best_axis];
        float cb = (&bb.min.x)[best_axis] + (&bb.max.x)[best_axis];
        return ca < cb;
    };
    std::sort(prim_indices.begin() + start, prim_indices.begin() + end, cmp);
    
    uint32_t split_idx = start + best_split;
    
    uint32_t left = build_bvh(nodes, prim_indices, prims, start, split_idx, depth + 1);
    uint32_t right = build_bvh(nodes, prim_indices, prims, split_idx, end, depth + 1);
    
    uint32_t idx = nodes.size();
    nodes.push_back({});
    nodes[idx].left = left;
    nodes[idx].right = right;
    nodes[idx].count = 0;
    nodes[idx].bounds = merge_bounds(nodes[left].bounds, nodes[right].bounds);
    
    return idx;
}

axiom_result_t axiom_bvh4_build(
    const axiom_scene_data_t* scene,
    axiom_bvh4_t* out_bvh,
    void* allocator_ctx,
    void* (*alloc)(void*, size_t),
    void (*free)(void*, void*)
) {
    if (!scene || !out_bvh || !alloc) return AXIOM_ERR_INVALID_ARG;
    
    std::vector<BuildNode> build_nodes;
    std::vector<uint32_t> prim_indices(scene->primitive_count);
    for (uint32_t i = 0; i < scene->primitive_count; ++i) prim_indices[i] = i;
    
    uint32_t root = build_bvh(build_nodes, prim_indices, scene->primitives, 0, scene->primitive_count);
    
    uint32_t node_count = build_nodes.size();
    BVH4Node* nodes = (BVH4Node*)alloc(allocator_ctx, node_count * sizeof(BVH4Node));
    if (!nodes) return AXIOM_ERR_OOM;
    
    for (uint32_t i = 0; i < node_count; ++i) {
        nodes[i].bounds = build_nodes[i].bounds;
        nodes[i].left = build_nodes[i].left;
        nodes[i].right = build_nodes[i].right;
        nodes[i].count = build_nodes[i].count;
        nodes[i].prim = build_nodes[i].prim;
    }
    
    out_bvh->nodes = nodes;
    out_bvh->node_count = node_count;
    out_bvh->root_index = root;
    
    return AXIOM_OK;
}

void axiom_bvh4_free(axiom_bvh4_t* bvh, void* allocator_ctx, void (*free)(void*, void*)) {
    if (bvh && bvh->nodes) {
        free(allocator_ctx, bvh->nodes);
        bvh->nodes = nullptr;
        bvh->node_count = 0;
    }
}

bool axiom_aabb4_intersect(
    const axiom_aabb4_t* box,
    const axiom_ray_t* ray,
    float* out_tmin,
    float* out_tmax
) {
    float tmin = ray->t_min;
    float tmax = ray->t_max;
    
    for (int d = 0; d < 4; ++d) {
        float inv_dir = 1.0f / (&ray->direction.x)[d];
        float t1 = ((&box->min.x)[d] - (&ray->origin.x)[d]) * inv_dir;
        float t2 = ((&box->max.x)[d] - (&ray->origin.x)[d]) * inv_dir;
        if (t1 > t2) std::swap(t1, t2);
        tmin = std::max(tmin, t1);
        tmax = std::min(tmax, t2);
        if (tmin > tmax) return false;
    }
    *out_tmin = tmin;
    *out_tmax = tmax;
    return true;
}

bool axiom_bvh4_intersect(
    const axiom_bvh4_t* bvh,
    const axiom_scene_data_t* scene,
    const axiom_ray_t* ray,
    axiom_intersection_t* out_isect
) {
    float best_t = ray->t_max;
    bool hit = false;
    
    // Iterative traversal with stack
    uint32_t stack[64];
    uint32_t stack_ptr = 0;
    stack[stack_ptr++] = bvh->root_index;
    
    while (stack_ptr > 0) {
        uint32_t idx = stack[--stack_ptr];
        const BVH4Node& node = bvh->nodes[idx];
        
        float tmin, tmax;
        if (!axiom_aabb4_intersect(&node.bounds, ray, &tmin, &tmax)) continue;
        if (tmin >= best_t) continue;
        
        if (node.count > 0) {
            // Leaf - test primitives
            for (uint32_t i = node.prim; i < node.prim + node.count; ++i) {
                Intersection isect;
                isect.primitive_index = i;
                if (axiom_scene_intersect(scene, ray, &isect)) {
                    if (isect.t < best_t) {
                        best_t = isect.t;
                        *out_isect = isect;
                        hit = true;
                    }
                }
            }
        } else {
            // Internal - push children (closest first)
            float tmin_l, tmax_l, tmin_r, tmax_r;
            bool hit_l = axiom_aabb4_intersect(&bvh->nodes[node.left].bounds, ray, &tmin_l, &tmax_l);
            bool hit_r = axiom_aabb4_intersect(&bvh->nodes[node.right].bounds, ray, &tmin_r, &tmax_r);
            
            if (hit_l && hit_r) {
                if (tmin_l < tmin_r) {
                    stack[stack_ptr++] = node.right;
                    stack[stack_ptr++] = node.left;
                } else {
                    stack[stack_ptr++] = node.left;
                    stack[stack_ptr++] = node.right;
                }
            } else if (hit_l) {
                stack[stack_ptr++] = node.left;
            } else if (hit_r) {
                stack[stack_ptr++] = node.right;
            }
        }
    }
    return hit;
}