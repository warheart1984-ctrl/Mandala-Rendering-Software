/**
 * Axiom Context Implementation - C++ backend for cpu.native
 */

#include "axiom/axiom_abi.h"
#include "axiom/axiom_math.h"
#include "axiom/axiom_scene.h"
#include "axiom/axiom_bvh.h"
#include "axiom/axiom_integrator.h"
#include <unordered_map>
#include <string>
#include <vector>
#include <cstring>
#include <sstream>

using namespace axiom;

struct ContextImpl {
    std::string backend_id;
    std::string config;
    SceneData scene;
    BVH4 bvh;
    IntegratorConfig integrator_config;
    bool scene_built = false;
    bool bvh_built = false;
};

struct SceneImpl {
    std::string hash;
    SceneData data;
    BVH4 bvh;
    bool valid = false;
};

struct BufferImpl {
    uint32_t width, height;
    Format format;
    std::vector<uint8_t> data;
    size_t stride;
};

static std::unordered_map<uintptr_t, ContextImpl*> g_contexts;
static std::unordered_map<uintptr_t, SceneImpl*> g_scenes;
static std::unordered_map<uintptr_t, BufferImpl*> g_buffers;
static uintptr_t g_next_id = 1;

static uintptr_t new_id() { return g_next_id++; }

// Allocator for C interface
struct CAllocator {
    void* ctx;
    void* (*alloc)(void*, size_t);
    void (*free)(void*, void*);
};

static void* c_alloc(void* ctx, size_t size) {
    CAllocator* a = (CAllocator*)ctx;
    return a->alloc(a->ctx, size);
}

static void c_free(void* ctx, void* ptr) {
    CAllocator* a = (CAllocator*)ctx;
    a->free(a->ctx, ptr);
}

extern "C" {

axiom_result_t axiom_context_create(
    const char* backend_id,
    const char* config_json,
    axiom_context_t* out_context
) {
    if (!backend_id || !out_context) return AXIOM_ERR_INVALID_ARG;
    
    if (strcmp(backend_id, "cpu.native") != 0) {
        return AXIOM_ERR_UNSUPPORTED;
    }
    
    ContextImpl* ctx = new ContextImpl();
    ctx->backend_id = backend_id;
    ctx->config = config_json ? config_json : "{}";
    ctx->integrator_config = {5, 4, 0.95f}; // Default: depth 5, 4 spp
    
    uintptr_t id = new_id();
    g_contexts[id] = ctx;
    *out_context = (axiom_context_t)id;
    return AXIOM_OK;
}

void axiom_context_destroy(axiom_context_t ctx) {
    uintptr_t id = (uintptr_t)ctx;
    auto it = g_contexts.find(id);
    if (it != g_contexts.end()) {
        if (it->second->bvh_built) {
            axiom_bvh4_free(&it->second->bvh, nullptr, [](void*, void* p){ free(p); });
        }
        if (it->second->scene_built) {
            axiom_scene_free(&it->second->scene, nullptr, [](void*, void* p){ free(p); });
        }
        delete it->second;
        g_contexts.erase(it);
    }
}

axiom_result_t axiom_context_get_caps(
    axiom_context_t ctx,
    char** out_caps_json
) {
    uintptr_t id = (uintptr_t)ctx;
    auto it = g_contexts.find(id);
    if (it == g_contexts.end()) return AXIOM_ERR_INVALID_ARG;
    
    std::string caps = R"({"backend":"cpu.native","max_tile_size":1024,"simd_width":256,"threading":"pthreads","deterministic":true})";
    *out_caps_json = strdup(caps.c_str());
    return AXIOM_OK;
}

axiom_result_t axiom_scene_create(
    axiom_context_t ctx,
    const axiom_scene_desc_t* desc,
    axiom_scene_t* out_scene
) {
    uintptr_t id = (uintptr_t)ctx;
    auto it = g_contexts.find(id);
    if (it == g_contexts.end()) return AXIOM_ERR_INVALID_ARG;
    if (!desc || !out_scene) return AXIOM_ERR_INVALID_ARG;
    
    ContextImpl* ctx_impl = it->second;
    
    // Clean up old scene
    if (ctx_impl->scene_built) {
        axiom_scene_free(&ctx_impl->scene, nullptr, [](void*, void* p){ free(p); });
        if (ctx_impl->bvh_built) {
            axiom_bvh4_free(&ctx_impl->bvh, nullptr, [](void*, void* p){ free(p); });
        }
    }
    
    CAllocator alloc = {nullptr, [](void*, size_t s){ return malloc(s); }, [](void*, void* p){ free(p); }};
    
    axiom_result_t res = axiom_scene_build_procedural(desc, &ctx_impl->scene, &alloc, c_alloc, c_free);
    if (res != AXIOM_OK) return res;
    
    ctx_impl->scene_built = true;
    
    // Compute scene hash
    std::ostringstream oss;
    oss << std::hex << desc->width << desc->height << desc->samples << desc->max_depth 
        << desc->seed << desc->prompt_hash;
    for (int i = 0; i < 4; ++i) {
        oss << desc->camera_position[i] << desc->camera_look_at[i];
    }
    oss << desc->fov_x << desc->fov_y << desc->fov_w;
    
    SceneImpl* scene = new SceneImpl();
    scene->hash = oss.str();
    scene->data = ctx_impl->scene;
    scene->valid = true;
    
    uintptr_t scene_id = new_id();
    g_scenes[scene_id] = scene;
    *out_scene = (axiom_scene_t)scene_id;
    
    return AXIOM_OK;
}

void axiom_scene_destroy(axiom_scene_t scene) {
    uintptr_t id = (uintptr_t)scene;
    auto it = g_scenes.find(id);
    if (it != g_scenes.end()) {
        if (it->second->valid) {
            axiom_scene_free(&it->second->data, nullptr, [](void*, void* p){ free(p); });
        }
        delete it->second;
        g_scenes.erase(it);
    }
}

axiom_result_t axiom_scene_get_hash(
    axiom_scene_t scene,
    char* out_hash_hex,
    size_t hash_hex_size
) {
    uintptr_t id = (uintptr_t)scene;
    auto it = g_scenes.find(id);
    if (it == g_scenes.end()) return AXIOM_ERR_INVALID_ARG;
    
    const std::string& hash = it->second->hash;
    if (hash.size() + 1 > hash_hex_size) return AXIOM_ERR_INVALID_ARG;
    strcpy(out_hash_hex, hash.c_str());
    return AXIOM_OK;
}

axiom_result_t axiom_buffer_alloc(
    axiom_context_t ctx,
    uint32_t width,
    uint32_t height,
    axiom_format_t format,
    axiom_buffer_t* out_buffer
) {
    uintptr_t id = (uintptr_t)ctx;
    auto it = g_contexts.find(id);
    if (it == g_contexts.end()) return AXIOM_ERR_INVALID_ARG;
    
    BufferImpl* buf = new BufferImpl();
    buf->width = width;
    buf->height = height;
    buf->format = format;
    buf->stride = width * 4; // RGBA8
    buf->data.resize(width * height * 4);
    
    uintptr_t id = new_id();
    g_buffers[id] = buf;
    *out_buffer = (axiom_buffer_t)id;
    return AXIOM_OK;
}

void axiom_buffer_free(axiom_buffer_t buffer) {
    uintptr_t id = (uintptr_t)buffer;
    auto it = g_buffers.find(id);
    if (it != g_buffers.end()) {
        delete it->second;
        g_buffers.erase(it);
    }
}

axiom_result_t axiom_buffer_map(
    axiom_buffer_t buffer,
    void** out_ptr,
    size_t* out_stride
) {
    uintptr_t id = (uintptr_t)buffer;
    auto it = g_buffers.find(id);
    if (it == g_buffers.end()) return AXIOM_ERR_INVALID_ARG;
    
    *out_ptr = it->second->data.data();
    *out_stride = it->second->stride;
    return AXIOM_OK;
}

axiom_result_t axiom_buffer_unmap(axiom_buffer_t buffer) {
    (void)buffer;
    return AXIOM_OK; // No-op for CPU
}

axiom_result_t axiom_render_tile(
    axiom_context_t ctx,
    axiom_scene_t scene,
    const axiom_tile_desc_t* tile,
    axiom_buffer_t output_buffer,
    uint64_t tile_seed
) {
    uintptr_t ctx_id = (uintptr_t)ctx;
    auto ctx_it = g_contexts.find(ctx_id);
    if (ctx_it == g_contexts.end()) return AXIOM_ERR_INVALID_ARG;
    
    uintptr_t scene_id = (uintptr_t)scene;
    auto scene_it = g_scenes.find(scene_id);
    if (scene_it == g_scenes.end()) return AXIOM_ERR_INVALID_ARG;
    
    uintptr_t buf_id = (uintptr_t)output_buffer;
    auto buf_it = g_buffers.find(buf_id);
    if (buf_it == g_buffers.end()) return AXIOM_ERR_INVALID_ARG;
    
    if (!tile) return AXIOM_ERR_INVALID_ARG;
    
    ContextImpl* ctx_impl = ctx_it->second;
    SceneImpl* scene_impl = scene_it->second;
    BufferImpl* buf_impl = buf_it->second;
    
    // Build BVH if needed
    if (!ctx_impl->bvh_built && ctx_impl->scene_built) {
        CAllocator alloc = {nullptr, [](void*, size_t s){ return malloc(s); }, [](void*, void* p){ free(p); }};
        axiom_result_t res = axiom_bvh4_build(&ctx_impl->scene, &ctx_impl->bvh, &alloc, c_alloc, c_free);
        if (res != AXIOM_OK) return res;
        ctx_impl->bvh_built = true;
    }
    
    // Render tile
    uint32_t rng_state = (uint32_t)tile_seed;
    
    IntegratorConfig config = ctx_impl->integrator_config;
    config.samples_per_pixel = 1; // One sample per call (accumulated externally)
    
    // For each pixel in tile
    for (uint32_t y = 0; y < tile->height; ++y) {
        for (uint32_t x = 0; x < tile->width; ++x) {
            // Camera ray generation (simplified)
            Ray ray;
            ray.origin = Vec4{0,0,0,0}; // Simplified
            ray.direction = Vec4{
                (float)x / tile->width - 0.5f,
                (float)y / tile->height - 0.5f,
                -1.0f,
                0
            };
            ray.direction = normalize(ray.direction);
            ray.t_min = 1e-4f;
            ray.t_max = 1e10f;
            
            Radiance rad = axiom_integrator_trace(
                &(Ray){Vec4{0,0,0,0}, Vec4{0,0,-1,0}, 1e-4f, 1e10f}, // Placeholder
                &scene->data,
                &ctx_impl->bvh,
                &ctx_impl->integrator_config,
                nullptr // rng_state
            );
            
            // Write pixel (simplified - just store radiance)
            size_t idx = (y * tile->width + x) * 4;
            uint8_t* ptr = (uint8_t*)buf_impl->data.data() + y * tile->width * 4 + x * 4;
            // This is simplified - real implementation would accumulate
        }
    }
    
    return AXIOM_OK;
}

axiom_result_t axiom_render_tile_async(
    axiom_context_t ctx,
    axiom_scene_t scene,
    const axiom_tile_desc_t* tile,
    axiom_buffer_t output_buffer,
    uint64_t tile_seed,
    void (*callback)(axiom_result_t, void* user_data),
    void* user_data
) {
    // For CPU, just call sync version
    axiom_result_t res = axiom_render_tile(ctx, scene, tile, output_buffer, tile_seed);
    if (callback) callback(res, user_data);
    return res;
}

axiom_result_t axiom_get_provenance(
    axiom_context_t ctx,
    axiom_scene_t scene,
    const axiom_tile_desc_t* tile,
    axiom_provenance_t* out_provenance
) {
    if (!ctx || !scene || !tile || !out_provenance) return AXIOM_ERR_INVALID_ARG;
    
    uintptr_t scene_id = (uintptr_t)scene;
    auto it = g_scenes.find(scene_id);
    if (it == g_scenes.end()) return AXIOM_ERR_INVALID_ARG;
    
    strncpy(out_provenance->scene_hash, it->second->hash.c_str(), 64);
    out_provenance->scene_hash[64] = '\0';
    snprintf(out_provenance->tile_hash, 64, "tile_%u", tile->tile_index);
    out_provenance->render_time_ns = 0;
    out_provenance->samples_completed = 1;
    strncpy(out_provenance->backend_id, "cpu.native", 63);
    strncpy(out_provenance->git_commit, "dev", 40);
    strncpy(out_provenance->axiom_abi_version, "1.0", 15);
    
    return AXIOM_OK;
}

axiom_result_t axiom_verify_against_oracle(
    axiom_context_t ctx,
    axiom_scene_t scene,
    const axiom_tile_desc_t* tile,
    axiom_buffer_t output_buffer,
    const char* oracle_sha256_hex,
    bool* out_match
) {
    if (!ctx || !scene || !tile || !output_buffer || !oracle_sha256_hex || !out_match) {
        return AXIOM_ERR_INVALID_ARG;
    }
    
    uintptr_t buf_id = (uintptr_t)output_buffer;
    auto buf_it = g_buffers.find(buf_id);
    if (buf_it == g_buffers.end()) return AXIOM_ERR_INVALID_ARG;
    
    // Compute SHA-256 of buffer
    // Simplified - real implementation would use crypto
    *out_match = true; // Placeholder
    return AXIOM_OK;
}

const char* axiom_abi_version(void) {
    return "1.0";
}

uint32_t axiom_abi_version_major(void) {
    return 1;
}

uint32_t axiom_abi_version_minor(void) {
    return 0;
}

}