#ifndef AXIOM_UALS_H
#define AXIOM_UALS_H

#include <stddef.h>
#include <stdint.h>

#ifdef _WIN32
#  ifdef UALS_BUILD_DLL
#    define UALS_API __declspec(dllexport)
#  else
#    define UALS_API __declspec(dllimport)
#  endif
#else
#  define UALS_API
#endif

#define UALS_ABI_VERSION 0
#define UALS_MAX_NAME    64
#define UALS_MAX_DEVICES 16

typedef enum uals_backend_kind {
  UALS_BACKEND_OPENCL = 1,
  UALS_BACKEND_CUDA   = 2,
  UALS_BACKEND_HIP    = 3,
  UALS_BACKEND_BRIDGE = 4
} uals_backend_kind;

typedef enum uals_status {
  UALS_OK              =  0,
  UALS_ERR_UNSUPPORTED = -1,
  UALS_ERR_NO_DEVICE   = -2,
  UALS_ERR_INVALID_ARG = -3,
  UALS_ERR_OUT_OF_MEM  = -4,
  UALS_ERR_DETERMINISM = -5,
  UALS_ERR_PROVENANCE  = -6
} uals_status;

enum {
  UALS_DEVICE_FLAG_GPU = 1u << 0,
  UALS_DEVICE_FLAG_CPU = 1u << 1
};

typedef struct uals_device {
  uint32_t          vendor_id;
  uint32_t          device_id;
  uals_backend_kind backend_kind;
  char              name[UALS_MAX_NAME];
  uint64_t          global_mem_bytes;
  uint32_t          max_workgroup_size;
  uint32_t          flags;
} uals_device;

typedef struct uals_kernel_meta {
  uint64_t rng_seed;
  uint32_t samples_per_pixel;
  uint32_t width;
  uint32_t height;
  uint64_t intent_id;
  uint64_t world_id;
  uint64_t timeline_id;
  uint32_t time_seconds;
} uals_kernel_meta;

typedef struct uals_context uals_context;
typedef struct uals_buffer  uals_buffer;

typedef struct uals_axiom_x_args {
  uint32_t seed;
  uint32_t spp;
  uint32_t width;
  uint32_t height;
} uals_axiom_x_args;

UALS_API uals_status uals_probe(uals_backend_kind kind,
                                const uals_device **out_devices,
                                uint32_t *out_count);
UALS_API uals_status uals_create(const uals_device *dev,
                                 const uals_kernel_meta *meta,
                                 uals_context **out_ctx);
UALS_API uals_status uals_enqueue(uals_context *ctx, const char *kernel_id,
                                  const uals_kernel_meta *meta,
                                  const void *args, size_t args_bytes);
UALS_API uals_status uals_map(uals_context *ctx, uals_buffer **out_buf,
                              void **out_ptr, size_t *out_bytes);
UALS_API uals_status uals_unmap(uals_context *ctx, uals_buffer *buf);
UALS_API uals_status uals_sync(uals_context *ctx);
UALS_API void        uals_destroy(uals_context *ctx);
UALS_API const char *uals_status_str(uals_status s);

#endif