#include <string.h>
#include "uals_internal.h"
#include "../backends/opencl/ocl_ctx.h"

UALS_API const char *uals_status_str(uals_status s) {
  switch (s) {
    case UALS_OK:              return "UALS_OK";
    case UALS_ERR_UNSUPPORTED: return "UALS_ERR_UNSUPPORTED";
    case UALS_ERR_NO_DEVICE:   return "UALS_ERR_NO_DEVICE";
    case UALS_ERR_INVALID_ARG: return "UALS_ERR_INVALID_ARG";
    case UALS_ERR_OUT_OF_MEM:  return "UALS_ERR_OUT_OF_MEM";
    case UALS_ERR_DETERMINISM: return "UALS_ERR_DETERMINISM";
    case UALS_ERR_PROVENANCE:  return "UALS_ERR_PROVENANCE";
    default:                   return "UALS_ERR_UNKNOWN";
  }
}

UALS_API uals_status uals_enqueue(uals_context *ctx, const char *kernel_id,
                                  const uals_kernel_meta *meta,
                                  const void *args, size_t args_bytes) {
  if (!ctx || !kernel_id || !meta || !args) return UALS_ERR_INVALID_ARG;
  if (ctx->backend_kind != UALS_BACKEND_OPENCL) return UALS_ERR_UNSUPPORTED;

  const sx_kernel_entry *entry = NULL;
  uals_status st = uals_registry_resolve(kernel_id, &entry);
  if (st != UALS_OK) return UALS_ERR_INVALID_ARG;

  st = uals_meta_check(meta);
  if (st != UALS_OK) return st;

  if (!entry->deterministic) return UALS_ERR_DETERMINISM;

  st = uals_determinism_policy(ctx, meta, &ctx->wg_size);
  if (st != UALS_OK) return st;

  st = uals_ocl_ensure_kernel(ctx);
  if (st != UALS_OK) return st;

  if (args_bytes != sizeof(uals_axiom_x_args)) return UALS_ERR_INVALID_ARG;
  const uals_axiom_x_args *pt = (const uals_axiom_x_args *)args;
  if (pt->width != meta->width || pt->height != meta->height || pt->spp != meta->samples_per_pixel)
    return UALS_ERR_INVALID_ARG;

  if (strcmp(kernel_id, "sx.kernel.axiom.x.sample") == 0) {
    strncpy(ctx->kernel_id, kernel_id, sizeof(ctx->kernel_id) - 1);
    return uals_ocl_launch(ctx, pt);
  }
  if (strcmp(kernel_id, "sx.kernel.axiom.x.integrator") == 0) {
    strncpy(ctx->kernel_id, kernel_id, sizeof(ctx->kernel_id) - 1);
    return uals_ocl_launch_integrator(ctx, pt);
  }
  return UALS_ERR_UNSUPPORTED;
}