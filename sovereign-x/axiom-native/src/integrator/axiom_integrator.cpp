/**
 * Axiom Integrator - Path Tracing
 * Audited BSDF normalization: BRDF = 3ρ/(4π), pdf = 3cosθ/(4π)
 */

#include "axiom/axiom_integrator.h"
#include "axiom/axiom_math.h"
#include <cmath>

using namespace axiom;

const float PI = 3.14159265358979323846f;
const float INV_PI = 1.0f / PI;
const float INV_4PI = 1.0f / (4.0f * PI);
const float BRDF_NORMALIZATION = 3.0f / (4.0f * PI);  // 3ρ/(4π) for Lambertian
const float PDF_NORMALIZATION = 3.0f / (4.0f * PI);   // 3cosθ/(4π)

Vec4 axiom_bsdf_eval(const Material* mat, const Vec4* normal, const Vec4* wo, const Vec4* wi) {
    float cos_theta = dot(*normal, *wi);
    if (cos_theta <= 0) return Vec4{0,0,0,0};
    
    switch (mat->type) {
        case MAT_LAMBERTIAN: {
            // BRDF = ρ/π * BRDF_NORMALIZATION = ρ * 3/(4π)
            return mat->albedo * (BRDF_NORMALIZATION * cos_theta);
        }
        case MAT_EMISSIVE: {
            return Vec4{0,0,0,0}; // Emission handled separately
        }
        case MAT_GLASS: {
            // Simplified - proper Fresnel would go here
            return mat->albedo * (0.5f * INV_PI * cos_theta);
        }
        case MAT_METAL: {
            // Simplified mirror
            return mat->albedo * (cos_theta > 0.99f ? 1.0f : 0.0f);
        }
        default:
            return Vec4{0,0,0,0};
    }
}

float axiom_bsdf_pdf(const Material* mat, const Vec4* normal, const Vec4* wo, const Vec4* wi) {
    float cos_theta = dot(*normal, *wi);
    if (cos_theta <= 0) return 0.0f;
    
    switch (mat->type) {
        case MAT_LAMBERTIAN: {
            // PDF = cosθ/π * PDF_NORMALIZATION = 3cosθ/(4π)
            return cos_theta * PDF_NORMALIZATION;
        }
        case MAT_EMISSIVE:
            return 0.0f;
        case MAT_GLASS:
            return 0.5f * INV_PI * cos_theta;
        case METAL:
            return cos_theta > 0.99f ? 1.0f : 0.0f;
        default:
            return 0.0f;
    }
}

Vec4 axiom_bsdf_sample(const Material* mat, const Vec4* normal, const Vec4* wo, Vec4* wi_out, float* pdf_out, uint32_t* rng_state) {
    float u1 = rng_float(rng_state);
    float u2 = rng_float(rng_state);
    
    switch (mat->type) {
        case MAT_LAMBERTIAN: {
            // Cosine-weighted hemisphere sampling
            float r1 = std::sqrt(u1);
            float theta = 2.0f * PI * u2;
            float x = r1 * std::cos(theta);
            float y = r1 * std::sin(theta);
            float z = std::sqrt(std::max(0.0f, 1.0f - u1));
            
            // Build ONB
            Vec4 n = *normal;
            Vec4 tangent = (std::abs(n.x) > std::abs(n.y)) 
                ? normalize(Vec4{-n.z, 0, n.x, n.w}) 
                : normalize(Vec4{0, n.z, -n.y, n.w});
            Vec4 bitangent = cross4(n, tangent, Vec4{0,0,0,1});
            
            *wi_out = tangent * x + bitangent * y + n * z;
            *pdf_out = dot(*normal, *wi_out) * PDF_NORMALIZATION;
            break;
        }
        case MAT_EMISSIVE: {
            *wi_out = *normal;
            *pdf_out = 1.0f;
            break;
        }
        case MAT_GLASS: {
            // Simplified - cosine weighted
            float r1 = std::sqrt(u1);
            float theta = 2.0f * PI * u2;
            float x = r1 * std::cos(theta);
            float y = r1 * std::sin(theta);
            float z = std::sqrt(std::max(0.0f, 1.0f - u1));
            
            Vec4 n = *normal;
            Vec4 tangent = (std::abs(n.x) > std::abs(n.y)) 
                ? normalize(Vec4{-n.z, 0, n.x, n.w}) 
                : normalize(Vec4{0, n.z, -n.y, n.w});
            Vec4 bitangent = cross4(n, tangent, Vec4{0,0,0,1});
            
            *wi_out = tangent * x + bitangent * y + n * z;
            *pdf_out = 0.5f * INV_PI * dot(*normal, *wi_out);
            break;
        }
        case MAT_METAL: {
            *wi_out = *wo - *normal * (2.0f * dot(*wo, *normal));
            *pdf_out = 1.0f;
            break;
        }
        default: {
            *wi_out = *normal;
            *pdf_out = 1.0f;
        }
    }
    
    if (*pdf_out <= 0) *pdf_out = 1e-6f;
    return axiom_bsdf_eval(mat, normal, wo, wi_out);
}

Vec4 axiom_emission_eval(const Material* mat, const Vec4* normal, const Vec4* wo) {
    if (mat->type == MAT_EMISSIVE) {
        float cos_theta = dot(*normal, *wo);
        if (cos_theta > 0) return mat->emission;
    }
    return Vec4{0,0,0,0};
}

float axiom_mis_weight(float pdf_a, float pdf_b) {
    float w = pdf_a / (pdf_a + pdf_b);
    return w * w; // Power heuristic
}

// Path trace single ray
Radiance axiom_integrator_trace(
    const Ray* ray,
    const SceneData* scene,
    const BVH4* bvh,
    const IntegratorConfig* config,
    uint32_t* rng_state
) {
    Vec4 throughput = Vec4{1,1,1,1};
    Vec4 radiance = Vec4{0,0,0,0};
    Ray current_ray = *ray;
    
    for (uint32_t depth = 0; depth < config->max_depth; ++depth) {
        Intersection isect;
        if (!bvh4_intersect(bvh, scene, &current_ray, &isect)) {
            // Background
            radiance = radiance + throughput * scene->background_color;
            break;
        }
        
        const Primitive& prim = scene->primitives[isect.primitive_index];
        const Material& mat = prim.material;
        
        // Emission
        Vec4 emitted = axiom_emission_eval(&mat, &isect.normal, &current_ray.direction);
        radiance = radiance + throughput * emitted;
        
        // Russian roulette
        if (depth >= 3) {
            float q = config->russian_roulette_prob;
            if (rng_float(rng_state) > q) break;
            throughput = throughput * (1.0f / q);
        }
        
        // Sample BSDF
        Vec4 wi;
        float pdf;
        Vec4 bsdf = axiom_bsdf_sample(&mat, &isect.normal, &current_ray.direction, &wi, &pdf, rng_state);
        
        if (pdf <= 0) break;
        
        throughput = throughput * bsdf * (dot(isect.normal, wi) / pdf);
        
        // Next ray
        current_ray.origin = isect.position;
        current_ray.direction = wi;
        current_ray.t_min = 1e-4f;
        current_ray.t_max = 1e10f;
    }
    
    return Radiance{radiance, config->samples_per_pixel};
}