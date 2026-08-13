/**
 * Axiom Scene Implementation - Procedural 4D Scene Generation
 * Matches Node RT4D archetype selection exactly
 */
  
#define _USE_MATH_DEFINES
#include "axiom/axiom_scene.h"
#include "axiom/axiom_math.h"
#include <cstdlib>
#include <cstring>
#include <cmath>
#include <algorithm>

using namespace axiom;

// Procedural archetype parameters
struct ArchetypeParams {
    const char* name;
    uint32_t object_count;
    float scale;
    float emission_strength;
    Vec4 palette_base;
    Vec4 palette_accent;
};

static const ArchetypeParams ARCHETYPES[] = {
    {"mythic-tableau", 200, 1.2f, 3.2f, Vec4{0.8f, 0.2f, 0.1f, 1.0f}, Vec4{1.0f, 0.8f, 0.2f, 1.0f}},
    {"neural-lattice", 37, 0.8f, 2.9f, Vec4{0.5f, 0.2f, 0.8f, 1.0f}, Vec4{0.2f, 0.8f, 1.0f, 1.0f}},
    {"tesseract-lattice", 103, 1.0f, 2.0f, Vec4{0.0f, 1.0f, 1.0f, 1.0f}, Vec4{1.0f, 0.0f, 1.0f, 1.0f}},
};
static const uint32_t ARCHETYPE_COUNT = 3;

    // Material definitions
    static const Material MATERIALS[] = {
        // Emissive tube
        {axiom::MAT_EMISSIVE, {1,1,1,1}, {1,1,1,1}, 0.0f, 1.0f},
        // Ring glow
        {axiom::MAT_EMISSIVE, {0.5f,0.5f,1.0f,1.0f}, {0.2f,0.2f,1.0f,1.0f}, 0.0f, 1.0f},
        // Glass tube
        {axiom::MAT_GLASS, {1,1,1,1}, {0,0,0,0}, 0.05f, 1.5f},
        // Chrome joint
        {axiom::MAT_METAL, {0.9f,0.9f,0.95f,1.0f}, {0,0,0,0}, 0.02f, 2.5f},
        // Core glow
        {axiom::MAT_EMISSIVE, {1,1,1,1}, {1,1,1,1}, 0.0f, 1.0f},
    };

// Select archetype from prompt hash
static const ArchetypeParams& select_archetype(uint32_t prompt_hash) {
    return ARCHETYPES[prompt_hash % ARCHETYPE_COUNT];
}

// Hash for deterministic frame
static uint32_t frame_seed(uint32_t base, uint32_t frame, uint32_t tile) {
    uint32_t h = base + frame * 1000003 + tile * 1000033;
    return hash32(h);
}

// Generate hypersphere (vertex)
static Primitive make_hypersphere(const Vec4& center, float radius, uint32_t mat_idx) {
    Primitive p;
    p.type = axiom::GEO_HYPERSPHERE;
    p.material = MATERIALS[mat_idx];
    p.center = {center.x, center.y, center.z, center.w};
    p.radius = radius;
    return p;
}

// Generate hyperplane (ground)
static Primitive make_hyperplane(const Vec4& point, const Vec4& normal, uint32_t mat_idx) {
    Primitive p;
    p.type = axiom::GEO_HYPERPLANE;
    p.material = MATERIALS[mat_idx];
    p.plane_point = {point.x, point.y, point.z, point.w};
    Vec4 norm = normalize(normal);
    p.plane_normal = {norm.x, norm.y, norm.z, norm.w};
    return p;
}

// Generate oriented capsule (beam)
static Primitive make_capsule(const Vec4& a, const Vec4& b, float radius, uint32_t mat_idx) {
    Primitive p;
    p.type = axiom::GEO_ORIENTED_CAPSULE;
    p.material = MATERIALS[mat_idx];
    p.capsule_a = {a.x, a.y, a.z, a.w};
    p.capsule_b = {b.x, b.y, b.z, b.w};
    p.capsule_radius = radius;
    // Frame orientation
    Vec4 dir = normalize(b - a);
    Vec4 up = Vec4{0, 1, 0, 0};
    Vec4 x = normalize(cross4(dir, up, Vec4{0,0,1,0}));
    Vec4 y = cross4(dir, x, Vec4{0,0,0,1});
    Vec4 z = cross4(x, y, dir);
    p.frame_x = {x.x, x.y, x.z, x.w};
    p.frame_y = {y.x, y.y, y.z, y.w};
    p.frame_z = {z.x, z.y, z.z, z.w};
    p.frame_w = {dir.x, dir.y, dir.z, dir.w};
    return p;
}

// Procedural scene generation - matches Node RT4D exactly
axiom_result_t axiom_scene_build_procedural(
    const axiom_scene_desc_t* desc,
    axiom_scene_data_t* out_scene,
    void* allocator_ctx,
    void* (*alloc)(void*, size_t),
    void (*free)(void*, void*)
) {
    (void)free; // Suppress unused parameter warning
    if (!desc || !out_scene || !alloc) return AXIOM_ERR_INVALID_ARG;

     const ArchetypeParams& arch = select_archetype(desc->prompt_hash);
     uint32_t rng_state = frame_seed(static_cast<uint32_t>(desc->seed), 0, 0);
    
    // Estimate primitive count
    uint32_t obj_count = arch.object_count;
    uint32_t max_prims = obj_count * 3 + 10; // hyperspheres + capsules + planes
    
    Primitive* prims = (Primitive*)alloc(allocator_ctx, max_prims * sizeof(Primitive));
    if (!prims) return AXIOM_ERR_OOM;
    
    uint32_t prim_count = 0;
    
    // Ground plane
    prims[prim_count++] = make_hyperplane(
        Vec4{0, -2.0f, 0, 0}, Vec4{0, 1, 0, 0}, 1 // Ring glow material
    );
    
    // Generate archetype-specific geometry
    for (uint32_t i = 0; i < obj_count; ++i) {
        float u = rng_float(rng_state);
        float v = rng_float(rng_state);
        float w = rng_float(rng_state);
        
        // Position in 4D space
        Vec4 pos = Vec4{
            (u - 0.5f) * 8.0f * arch.scale,
            (v - 0.5f) * 4.0f * arch.scale + 1.0f,
            (w - 0.5f) * 8.0f * arch.scale,
            rng_float(rng_state) * 2.0f - 1.0f
        };
        
        // Tesseract vertices (16)
        if (i < 16) {
            prims[prim_count++] = make_hypersphere(pos, 0.15f * arch.scale, 2); // Glass
            continue;
        }
        
        // Beam capsules
        if (i < 48) {
            Vec4 end = pos + Vec4{
                (rng_float(rng_state) - 0.5f) * 2.0f,
                (rng_float(rng_state) - 0.5f) * 2.0f,
                (rng_float(rng_state) - 0.5f) * 2.0f,
                (rng_float(rng_state) - 0.5f) * 2.0f
            } * arch.scale;
            prims[prim_count++] = make_capsule(pos, end, 0.08f * arch.scale, 0); // Emissive
            continue;
        }
        
        // Spoke capsules
        if (i < 54) {
            Vec4 origin = Vec4{0, 1.0f, 0, 0};
            Vec4 dir = normalize(Vec4{
                rng_float(rng_state) - 0.5f,
                rng_float(rng_state) - 0.5f,
                rng_float(rng_state) - 0.5f,
                rng_float(rng_state) - 0.5f
            });
             float scale_factor = 3.0f + rng_float(rng_state) * 2.0f;
             Vec4 end = origin + dir * scale_factor * arch.scale;
            prims[prim_count++] = make_capsule(origin, end, 0.06f * arch.scale, 0);
            continue;
        }
        
        // Ring tori (approximated as capsules in circle)
        if (i < 56) {
             float angle = (i - 54) * (3.14159265358979323846f / 1.0f);
            float radius = 2.5f * arch.scale;
            Vec4 c1 = Vec4{radius * cosf(angle), 0.5f, radius * sinf(angle), 0};
            Vec4 c2 = Vec4{radius * cosf(angle + 0.1f), 0.5f, radius * sinf(angle + 0.1f), 0};
            prims[prim_count++] = make_capsule(c1, c2, 0.05f * arch.scale, 1); // Ring glow
            continue;
        }
        
        // Emissive cores
        if (prim_count < max_prims) {
            prims[prim_count++] = make_hypersphere(pos, 0.1f * arch.scale, 4); // Core glow
        }
    }
    
    out_scene->primitives = prims;
    out_scene->primitive_count = prim_count;
    out_scene->background_color = {0.02f, 0.01f, 0.03f, 1.0f};
    out_scene->seed = desc->seed;
    out_scene->prompt_hash = desc->prompt_hash;
    
    return AXIOM_OK;
}

void axiom_scene_free(axiom_scene_data_t* scene, void* allocator_ctx, void (*free)(void*, void*)) {
    if (scene && scene->primitives) {
        free(allocator_ctx, const_cast<axiom_primitive_t*>(scene->primitives));
        scene->primitives = nullptr;
        scene->primitive_count = 0;
    }
}

// Ray-primitive intersection
bool intersect_hypersphere(const axiom::Primitive& p, const axiom::Ray& ray, axiom::Intersection* isect) {
    axiom::Vec4 p_center = {p.center.x, p.center.y, p.center.z, p.center.w};
    axiom::Vec4 oc = ray.origin - p_center;
    float a = dot(ray.direction, ray.direction);
    float b = 2.0f * dot(oc, ray.direction);
    float c = dot(oc, oc) - p.radius * p.radius;
    float disc = b * b - 4 * a * c;
    if (disc < 0) return false;
     float t = (-b - sqrtf(disc)) / (2 * a);
    if (t < ray.t_min || t > ray.t_max) {
         t = (-b + sqrtf(disc)) / (2 * a);
        if (t < ray.t_min || t > ray.t_max) return false;
    }
    isect->t = t;
    axiom::Vec4 pos = ray.origin + ray.direction * t;
    isect->position = {pos.x, pos.y, pos.z, pos.w};
    axiom::Vec4 norm = normalize(pos - p_center);
    isect->normal = {norm.x, norm.y, norm.z, norm.w};
    isect->geometric_normal = isect->normal;
    isect->primitive_index = 0; // Will be set by caller
    isect->u = 0; isect->v = 0;
    return true;
}

bool intersect_hyperplane(const axiom::Primitive& p, const axiom::Ray& ray, axiom::Intersection* isect) {
    axiom::Vec4 p_plane_point = {p.plane_point.x, p.plane_point.y, p.plane_point.z, p.plane_point.w};
    axiom::Vec4 p_plane_normal = {p.plane_normal.x, p.plane_normal.y, p.plane_normal.z, p.plane_normal.w};
    float denom = dot(ray.direction, p_plane_normal);
     if (fabsf(denom) < 1e-6f) return false;
    float t = dot(p_plane_point - ray.origin, p_plane_normal) / denom;
    if (t < ray.t_min || t > ray.t_max) return false;
    isect->t = t;
    axiom::Vec4 pos = ray.origin + ray.direction * t;
    isect->position = {pos.x, pos.y, pos.z, pos.w};
    isect->normal = {p_plane_normal.x, p_plane_normal.y, p_plane_normal.z, p_plane_normal.w};
    isect->geometric_normal = isect->normal;
    isect->primitive_index = 0;
    isect->u = 0; isect->v = 0;
    return true;
}

bool intersect_capsule(const axiom::Primitive& p, const axiom::Ray& ray, axiom::Intersection* isect) {
    // Capsule intersection in 4D - simplified
    axiom::Vec4 a = {p.capsule_a.x, p.capsule_a.y, p.capsule_a.z, p.capsule_a.w};
    axiom::Vec4 b = {p.capsule_b.x, p.capsule_b.y, p.capsule_b.z, p.capsule_b.w};
    axiom::Vec4 ab = b - a;
    float ab_len2 = length2(ab);
    axiom::Vec4 ao = ray.origin - a;
    float ab_dot_dir = dot(ab, ray.direction);
    float ab_dot_ao = dot(ab, ao);
    float a2 = length2(ray.direction) - ab_dot_dir * ab_dot_dir / ab_len2;
    float b2 = 2.0f * (dot(ray.direction, ao) - ab_dot_dir * ab_dot_ao / ab_len2);
    float c2 = length2(ao) - ab_dot_ao * ab_dot_ao / ab_len2 - p.capsule_radius * p.capsule_radius;
    
    float disc = b2 * b2 - 4 * a2 * c2;
    if (disc < 0) return false;
     float t = (-b2 - sqrtf(disc)) / (2 * a2);
    if (t < ray.t_min || t > ray.t_max) {
         t = (-b2 + sqrtf(disc)) / (2 * a2);
        if (t < ray.t_min || t > ray.t_max) return false;
    }
    isect->t = t;
    axiom::Vec4 pos = ray.origin + ray.direction * t;
    isect->position = {pos.x, pos.y, pos.z, pos.w};
    // Normal from capsule surface
    axiom::Vec4 closest = a + ab * std::clamp(dot(pos - a, ab) / ab_len2, 0.0f, 1.0f, 0.0f);
    axiom::Vec4 norm = normalize(pos - closest);
    isect->normal = {norm.x, norm.y, norm.z, norm.w};
    isect->geometric_normal = isect->normal;
    isect->primitive_index = 0;
    return true;
}

bool axiom_scene_intersect(
    const axiom_scene_data_t* scene,
    const axiom::Ray* ray,
    axiom::Intersection* out_isect
) {
    float best_t = ray->t_max;
    bool hit = false;
    
    for (uint32_t i = 0; i < scene->primitive_count; ++i) {
        const axiom::Primitive& p = scene->primitives[i];
        axiom::Intersection isect;
        isect.primitive_index = i;
        bool ihit = false;
        
        switch (p.type) {
            case axiom::GEO_HYPERSPHERE:
                ihit = intersect_hypersphere(p, *ray, &isect);
                break;
            case axiom::GEO_HYPERPLANE:
                ihit = intersect_hyperplane(p, *ray, &isect);
                break;
            case axiom::GEO_ORIENTED_CAPSULE:
                ihit = intersect_capsule(p, *ray, &isect);
                break;
        }
        
        if (ihit && isect.t < best_t) {
            best_t = isect.t;
            *out_isect = isect;
            hit = true;
        }
    }
    return hit;
}

// AABB intersection
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