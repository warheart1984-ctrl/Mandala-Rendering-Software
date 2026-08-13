/**
 * Axiom Integrator - Path Tracing
 * Audited BSDF normalization: BRDF = 3ρ/(4π), pdf = 3cosθ/(4π)
 */

#ifndef AXIOM_INTEGRATOR_H
#define AXIOM_INTEGRATOR_H

#include "axiom_math.h"
#include "axiom_scene.h"
#include "axiom_bvh.h"

#ifdef __cplusplus
extern "C" {
#endif

// Integrator config
typedef struct {
    uint32_t max_depth;
    uint32_t samples_per_pixel;
    float russian_roulette_prob;  // 0.95 typical
} axiom_integrator_config_t;

// Radiance result
typedef struct {
    axiom_vec4_t radiance;
    uint32_t samples;
} axiom_radiance_t;

// Path trace a single ray
axiom_radiance_t axiom_integrator_trace(
    const axiom_ray_t* ray,
    const axiom_scene_data_t* scene,
    const axiom_bvh4_t* bvh,
    const axiom_integrator_config_t* config,
    uint32_t* rng_state
);

// Sample BSDF (audited normalization)
axiom_vec4_t axiom_bsdf_sample(
    const axiom_material_t* mat,
    const axiom_vec4_t* normal,
    const axiom_vec4_t* wo,
    axiom_vec4_t* wi_out,
    float* pdf_out,
    uint32_t* rng_state
);

// Evaluate BSDF
axiom_vec4_t axiom_bsdf_eval(
    const axiom_material_t* mat,
    const axiom_vec4_t* normal,
    const axiom_vec4_t* wo,
    const axiom_vec4_t* wi
);

// PDF for BSDF
float axiom_bsdf_pdf(
    const axiom_material_t* mat,
    const axiom_vec4_t* normal,
    const axiom_vec4_t* wo,
    const axiom_vec4_t* wi
);

// Emission
axiom_vec4_t axiom_emission_eval(
    const axiom_material_t* mat,
    const axiom_vec4_t* normal,
    const axiom_vec4_t* wo
);

// Mis weight (power heuristic)
float axiom_mis_weight(float pdf_a, float pdf_b);

#ifdef __cplusplus
}
#endif

#endif // AXIOM_INTEGRATOR_H