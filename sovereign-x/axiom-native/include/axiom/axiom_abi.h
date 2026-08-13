/**
 * Axiom Compute ABI - Public C Interface
 * Substrate-agnostic interface for RT4D mathematical kernels
 */

#ifndef AXIOM_ABI_H
#define AXIOM_ABI_H

#include <stdint.h>
#include <stddef.h>

#ifdef __cplusplus
extern "C" {
#endif

// ABI version
#define AXIOM_ABI_VERSION_MAJOR 1
#define AXIOM_ABI_VERSION_MINOR 0
#define AXIOM_ABI_VERSION_STRING "1.0"

// Opaque handles
typedef struct AxiomContext* axiom_context_t;
typedef struct AxiomScene* axiom_scene_t;
typedef struct AxiomBuffer* axiom_buffer_t;

// Error codes
typedef enum {
    AXIOM_OK = 0,
    AXIOM_ERR_INVALID_ARG = -1,
    AXIOM_ERR_OOM = -2,
    AXIOM_ERR_DEVICE = -3,
    AXIOM_ERR_COMPILE = -4,
    AXIOM_ERR_DETERMINISM = -5,
    AXIOM_ERR_UNSUPPORTED = -6,
    AXIOM_ERR_NOT_INITIALIZED = -7,
} axiom_result_t;

// Pixel format
typedef enum {
    AXIOM_FMT_RGBA8 = 0,
    AXIOM_FMT_RGBA16F = 1,
    AXIOM_FMT_RGBA32F = 2,
} axiom_format_t;

// Scene descriptor - fully serializable, hashable
typedef struct {
    uint32_t width;
    uint32_t height;
    uint32_t samples;
    uint32_t max_depth;
    uint64_t seed;
    float camera_position[4];     // x, y, z, w
    float camera_look_at[4];
    float fov_x, fov_y, fov_w;
    uint32_t prompt_hash;         // Hash of procedural archetype params
    // Reserved for future
    uint32_t reserved[4];
} axiom_scene_desc_t;

// Tile descriptor
typedef struct {
    uint32_t x, y;
    uint32_t width, height;
    uint32_t tile_index;
} axiom_tile_desc_t;

// Provenance
typedef struct {
    char scene_hash[65];
    char tile_hash[65];
    uint64_t render_time_ns;
    uint32_t samples_completed;
    char backend_id[64];
    char git_commit[41];
    char axiom_abi_version[16];
} axiom_provenance_t;

// Context management
axiom_result_t axiom_context_create(
    const char* backend_id,
    const char* config_json,
    axiom_context_t* out_context
);

void axiom_context_destroy(axiom_context_t ctx);

axiom_result_t axiom_context_get_caps(
    axiom_context_t ctx,
    char** out_caps_json
);

// Scene management
axiom_result_t axiom_scene_create(
    axiom_context_t ctx,
    const axiom_scene_desc_t* desc,
    axiom_scene_t* out_scene
);

void axiom_scene_destroy(axiom_scene_t scene);

axiom_result_t axiom_scene_get_hash(
    axiom_scene_t scene,
    char* out_hash_hex,
    size_t hash_hex_size
);

// Buffer management
axiom_result_t axiom_buffer_alloc(
    axiom_context_t ctx,
    uint32_t width,
    uint32_t height,
    axiom_format_t format,
    axiom_buffer_t* out_buffer
);

void axiom_buffer_free(axiom_buffer_t buffer);

axiom_result_t axiom_buffer_map(
    axiom_buffer_t buffer,
    void** out_ptr,
    size_t* out_stride
);

axiom_result_t axiom_buffer_unmap(axiom_buffer_t buffer);

// Core rendering
axiom_result_t axiom_render_tile(
    axiom_context_t ctx,
    axiom_scene_t scene,
    const axiom_tile_desc_t* tile,
    axiom_buffer_t output_buffer,
    uint64_t tile_seed
);

axiom_result_t axiom_render_tile_async(
    axiom_context_t ctx,
    axiom_scene_t scene,
    const axiom_tile_desc_t* tile,
    axiom_buffer_t output_buffer,
    uint64_t tile_seed,
    void (*callback)(axiom_result_t, void* user_data),
    void* user_data
);

// Provenance
axiom_result_t axiom_get_provenance(
    axiom_context_t ctx,
    axiom_scene_t scene,
    const axiom_tile_desc_t* tile,
    axiom_provenance_t* out_provenance
);

// Conformance
axiom_result_t axiom_verify_against_oracle(
    axiom_context_t ctx,
    axiom_scene_t scene,
    const axiom_tile_desc_t* tile,
    axiom_buffer_t output_buffer,
    const char* oracle_sha256_hex,
    bool* out_match
);

// Version
const char* axiom_abi_version(void);
uint32_t axiom_abi_version_major(void);
uint32_t axiom_abi_version_minor(void);

#ifdef __cplusplus
}
#endif

#endif // AXIOM_ABI_H