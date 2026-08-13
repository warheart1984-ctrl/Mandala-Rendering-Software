/**
 * Axiom RT4D - Scene Description
 * Procedural 4D scene from prompt hash
 */

#ifndef AXIOM_SCENE_H
#define AXIOM_SCENE_H

#include "axiom_math.h"
#include "axiom_abi.h"

#ifdef __cplusplus
extern "C" {
#endif

// Geometry types in 4D
typedef enum {
    AXIOM_GEO_HYPERSPHERE = 0,    // S^3 hypersphere
    AXIOM_GEO_HYPERPLANE = 1,     // 3D hyperplane in 4D
    AXIOM_GEO_ORIENTED_CAPSULE = 2, // Capsule in 4D
} axiom_geo_type_t;

// Material types
typedef enum {
    AXIOM_MAT_LAMBERTIAN = 0,
    AXIOM_MAT_EMISSIVE = 1,
    AXIOM_MAT_GLASS = 2,
    AXIOM_MAT_METAL = 3,
} axiom_material_type_t;

// Material
typedef struct {
    axiom_material_type_t type;
    axiom_vec4_t albedo;          // Base color
    axiom_vec4_t emission;        // Emission color * strength
    float roughness;              // 0 = perfect mirror, 1 = diffuse
    float ior;                    // Index of refraction
} axiom_material_t;

// Primitive
typedef struct {
    axiom_geo_type_t type;
    axiom_material_t material;
    
    // Hypersphere: center + radius
    axiom_vec4_t center;
    float radius;
    
    // Hyperplane: point + normal
    axiom_vec4_t plane_point;
    axiom_vec4_t plane_normal;
    
    // Oriented capsule: segment + radius
    axiom_vec4_t capsule_a;
    axiom_vec4_t capsule_b;
    float capsule_radius;
    
    // 4D orientation frame
    axiom_vec4_t frame_x;
    axiom_vec4_t frame_y;
    axiom_vec4_t frame_z;
    axiom_vec4_t frame_w;
} axiom_primitive_t;

// Scene
typedef struct {
    const axiom_primitive_t* primitives;
    uint32_t primitive_count;
    axiom_vec4_t background_color;
    uint64_t seed;                // For procedural variation
    uint32_t prompt_hash;         // Archetype selector
} axiom_scene_data_t;

// Scene creation from descriptor (procedural)
axiom_result_t axiom_scene_build_procedural(
    const axiom_scene_desc_t* desc,
    axiom_scene_data_t* out_scene,
    void* allocator_ctx,
    void* (*alloc)(void*, size_t),
    void (*free)(void*, void*)
);

// Scene cleanup
void axiom_scene_free(axiom_scene_data_t* scene, void* allocator_ctx, void (*free)(void*, void*));

// Intersection
typedef struct {
    float t;                      // Distance along ray
    uint32_t primitive_index;     // Which primitive
    axiom_vec4_t position;        // Hit position
    axiom_vec4_t normal;          // Shading normal
    axiom_vec4_t geometric_normal; // Geometric normal
    float u, v;                   // UV coordinates
} axiom_intersection_t;

// Ray
typedef struct {
    axiom_vec4_t origin;
    axiom_vec4_t direction;       // Normalized
    float t_min;
    float t_max;
} axiom_ray_t;

// Intersect ray with scene
bool axiom_scene_intersect(
    const axiom_scene_data_t* scene,
    const axiom_ray_t* ray,
    axiom_intersection_t* out_isect
);

// Bounding box for BVH
typedef struct {
    axiom_vec4_t min;
    axiom_vec4_t max;
} axiom_aabb4_t;

#ifdef __cplusplus
}
#endif

#ifdef __cplusplus
namespace axiom {
    // Type aliases for convenience
    using Material = axiom_material_t;
    using Primitive = axiom_primitive_t;
    using SceneData = axiom_scene_data_t;
    using Intersection = axiom_intersection_t;
    using Ray = axiom_ray_t;
    using AABB4 = axiom_aabb4_t;

    // Material type enum values for convenience
    constexpr axiom_material_type_t MAT_LAMBERTIAN = AXIOM_MAT_LAMBERTIAN;
    constexpr axiom_material_type_t MAT_EMISSIVE = AXIOM_MAT_EMISSIVE;
    constexpr axiom_material_type_t MAT_GLASS = AXIOM_MAT_GLASS;
    constexpr axiom_material_type_t MAT_METAL = AXIOM_MAT_METAL;

    // Geometry type enum values for convenience
    constexpr axiom_geo_type_t GEO_HYPERSPHERE = AXIOM_GEO_HYPERSPHERE;
    constexpr axiom_geo_type_t GEO_HYPERPLANE = AXIOM_GEO_HYPERPLANE;
    constexpr axiom_geo_type_t GEO_ORIENTED_CAPSULE = AXIOM_GEO_ORIENTED_CAPSULE;
} // namespace axiom
#endif

#endif // AXIOM_SCENE_H