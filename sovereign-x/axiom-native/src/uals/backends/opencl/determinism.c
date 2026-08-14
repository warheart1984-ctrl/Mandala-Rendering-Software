#include "ocl_ctx.h"

uals_status uals_determinism_policy(uals_context *ctx, const uals_kernel_meta *meta,
                                    uint32_t *out_wg) {
  if (!ctx || !meta || !out_wg) return UALS_ERR_INVALID_ARG;
  if (meta->samples_per_pixel == 0) return UALS_ERR_DETERMINISM;
  if (meta->width * meta->height == 0) return UALS_ERR_DETERMINISM;
  uint32_t wg = ctx->device.max_workgroup_size;
  if (wg > 256) wg = 256;
  if (wg < 1) wg = 1;
  while (meta->width % wg != 0 && wg > 1) wg--;
  *out_wg = wg;
  return UALS_OK;
}