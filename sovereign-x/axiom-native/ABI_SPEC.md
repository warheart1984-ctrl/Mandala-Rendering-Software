# Axiom Compute ABI Specification v1.0

**Status**: Declared / Scaffold
**Authority**: Sovereign X Router → Axiom-Native Capability Layer
**Purpose**: Substrate-agnostic interface for RT4D mathematical kernels (CPU, GPU, NPU, custom ASIC)

---

## 1. Design Principles

| Principle | Description |
|-----------|-------------|
| **Substrate-agnostic** | Same ABI for CPU (Rust/C++), OpenCL, HIP, CUDA, Vulkan, Metal |
| **Deterministic** | Identical inputs → bitwise identical outputs across all substrates |
| **Capability-based** | Router resolves capability → loads matching backend |
| **Oracle-verified** | Every backend output verified against Node RT4D oracle SHA-256 |
| **Zero-copy where possible** | Tile buffers passed by pointer, ownership explicit |

---

## 2. Core Types

```c
// Opaque handles
typedef struct AxiomContext* axiom_context_t;
typedef struct AxiomScene* axiom_scene_t;
typedef struct AxiomTile* axiom_tile_t;
typedef struct AxiomBuffer* axiom_buffer_t;

// Error codes
typedef enum {
    AXIOM_OK = 0,
    AXIOM_ERR_INVALID_ARG = -1,
    AXIOM_ERR_OOM = -2,
    AXIOM_ERR_DEVICE = -3,
    AXIOM_ERR_COMPILE = -4,
    AXIOM_ERR_DETERMINISM = -5,  // Output mismatch vs oracle
    AXIOM_ERR_UNSUPPORTED = -6,
} axiom_result_t;

// Pixel format
typedef enum {
    AXIOM_FMT_RGBA8 = 0,
    AXIOM_FMT_RGBA16F = 1,
    AXIOM_FMT_RGBA32F = 2,
} axiom_format_t;
```

---

## 3. Context Management

```c
// Create context for a specific backend
axiom_result_t axiom_context_create(
    const char* backend_id,        // "cpu.native", "opencl", "hip", "cuda", "vulkan"
    const char* config_json,       // Backend-specific config
    axiom_context_t* out_context
);

void axiom_context_destroy(axiom_context_t ctx);

// Query backend capabilities
axiom_result_t axiom_context_get_caps(
    axiom_context_t ctx,
    char** out_caps_json          // JSON with max_tile_size, simd_width, etc.
);
```

---

## 4. Scene Description (Immutable, Hashable)

```c
// Scene descriptor - fully serializable, hashable for determinism
typedef struct {
    uint32_t width;
    uint32_t height;
    uint32_t samples;
    uint32_t max_depth;
    uint64_t seed;
    float camera_position[4];     // x, y, z, w
    float camera_look_at[4];
    float fov_x, fov_y, fov_w;
    // Archetype + palette + material encoded procedurally from prompt_hash
    uint32_t prompt_hash;
} axiom_scene_desc_t;

// Create scene from descriptor (validates, hashes)
axiom_result_t axiom_scene_create(
    axiom_context_t ctx,
    const axiom_scene_desc_t* desc,
    axiom_scene_t* out_scene
);

void axiom_scene_destroy(axiom_scene_t scene);

// Get deterministic scene hash (SHA-256 of canonicalized desc)
axiom_result_t axiom_scene_get_hash(
    axiom_scene_t scene,
    char* out_hash_hex,           // 64 hex chars
    size_t hash_hex_size
);
```

---

## 5. Tile Rendering (Core Work Unit)

```c
// Tile descriptor
typedef struct {
    uint32_t x, y;                // Top-left in full frame
    uint32_t width, height;       // Tile dimensions
    uint32_t tile_index;          // Deterministic merge order
} axiom_tile_desc_t;

// Render a single tile
// - Deterministic: same scene + tile + seed = identical pixels
// - Thread-safe: can be called concurrently for different tiles
axiom_result_t axiom_render_tile(
    axiom_context_t ctx,
    axiom_scene_t scene,
    const axiom_tile_desc_t* tile,
    axiom_buffer_t output_buffer, // Pre-allocated RGBA8 buffer
    uint64_t tile_seed            // Derived: scene.seed + tile.index * prime
);

// Async variant for GPU backends
axiom_result_t axiom_render_tile_async(
    axiom_context_t ctx,
    axiom_scene_t scene,
    const axiom_tile_desc_t* tile,
    axiom_buffer_t output_buffer,
    uint64_t tile_seed,
    void (*callback)(axiom_result_t, void* user_data),
    void* user_data
);
```

---

## 5. Buffer Management

```c
// Allocate output buffer (caller owns, must free)
axiom_result_t axiom_buffer_alloc(
    axiom_context_t ctx,
    uint32_t width,
    uint32_t height,
    axiom_format_t format,
    axiom_buffer_t* out_buffer
);

void axiom_buffer_free(axiom_buffer_t buffer);

// Map for CPU access (if GPU-backed)
axiom_result_t axiom_buffer_map(
    axiom_buffer_t buffer,
    void** out_ptr,
    size_t* out_stride
);

axiom_result_t axiom_buffer_unmap(axiom_buffer_t buffer);
```

---

## 6. Provenance & Evidence

```c
// Render provenance (matches Node RT4D)
typedef struct {
    char scene_hash[65];          // hex
    char tile_hash[65];           // hex of tile output
    uint64_t render_time_ns;
    uint32_t samples_completed;
    char backend_id[64];
    char git_commit[41];
    char axiom_abi_version[16];   // "1.0"
} axiom_provenance_t;

axiom_result_t axiom_get_provenance(
    axiom_context_t ctx,
    axiom_scene_t scene,
    const axiom_tile_desc_t* tile,
    axiom_provenance_t* out_provenance
);
```

---

## 7. Conformance Verification

```c
// Verify output against oracle reference
axiom_result_t axiom_verify_against_oracle(
    axiom_context_t ctx,
    axiom_scene_t scene,
    const axiom_tile_desc_t* tile,
    axiom_buffer_t output_buffer,
    const char* oracle_sha256_hex,
    bool* out_match
);
```

---

## 8. Versioning

```c
const char* axiom_abi_version(void);        // "1.0"
uint32_t axiom_abi_version_major(void);     // 1
uint32_t axiom_abi_version_minor(void);     // 0
```

---

## 9. Backend IDs (Registry)

| Backend ID | Substrate | Status |
|------------|-----------|--------|
| `cpu.native` | C++/Rust (pthreads) | Scaffold |
| `cpu.simd` | C++ + AVX2/AVX-512 | Planned |
| `opencl` | OpenCL 1.2+ | Planned |
| `hip` | AMD HIP (RDNA/CDNA) | Planned |
| `cuda` | NVIDIA CUDA | Planned |
| `vulkan` | Vulkan Compute | Planned |
| `metal` | Apple Metal | Planned |

---

## 10. Integration with Sovereign X Router

```javascript
// Router capability entry
{
  "capabilityId": "cpu.axiom.native",
  "authority": "assist",        // assist until conformance gate passes
  "capabilityClass": "print",   // candidate for print SoT
  "vendor": "axiom-native",
  "backend": "cpu.native",
  "skill": "axiom-native-render",
  "abiVersion": "1.0"
}
```

**Routing logic:**
1. Router resolves `cpu.axiom.native` → loads `libaxiom_cpu_native.so`
2. Creates context, scene, allocates tile buffers
3. Dispatches tiles via `axiom_render_tile` (parallel)
4. Merges tiles → computes SHA-256
5. Conformance gate: `axiom_verify_against_oracle` against Node RT4D
6. If match → promotes to `authoritative` for this session
7. Evidence recorded in provenance chain

---

## 11. Determinism Contract

**Every backend MUST satisfy:**

```
∀ scene, tile, seed:
  axiom_render_tile(ctx_A, scene, tile, buf, seed) → pixels_A
  axiom_render_tile(ctx_B, scene, tile, buf, seed) → pixels_B
  SHA256(pixels_A) == SHA256(pixels_B) == oracle_sha256
```

Violation → `AXIOM_ERR_DETERMINISM`, backend quarantined.

---

## 12. Memory Model

| Resource | Ownership | Lifetime |
|----------|-----------|----------|
| Context | Caller | Create → Destroy |
| Scene | Caller | Create → Destroy |
| Buffer | Caller | Alloc → Free |
| Tile output | Caller (pre-allocated) | Per-render |

**Zero-copy rule**: GPU backends must support `axiom_buffer_map` for CPU readback without extra copy.

---

*End of Axiom Compute ABI v1.0 Specification*