#include "ocl_ctx.h"

static uals_status validate_meta(const uals_kernel_meta *meta) {
  if (!meta) return UALS_ERR_PROVENANCE;
  if (meta->intent_id == 0 || meta->world_id == 0 || meta->timeline_id == 0)
    return UALS_ERR_PROVENANCE;
  if (meta->width == 0 || meta->height == 0)
    return UALS_ERR_INVALID_ARG;
  return UALS_OK;
}

uals_status uals_meta_check(const uals_kernel_meta *meta) {
  return validate_meta(meta);
}

uals_status uals_meta_create(const uals_kernel_meta *meta, uals_kernel_meta *snapshot) {
  uals_status st = validate_meta(meta);
  if (st != UALS_OK) return st;
  *snapshot = *meta;
  return UALS_OK;
}