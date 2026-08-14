#ifndef AXIOM_UALS_INTERNAL_H
#define AXIOM_UALS_INTERNAL_H

#include "axiom/uals.h"

typedef struct sx_kernel_entry {
  const char *id;
  uint32_t    abi;
  int         deterministic;
  const char *authority;
} sx_kernel_entry;

uals_status uals_registry_resolve(const char *kernel_id, const sx_kernel_entry **out);
uals_status uals_meta_check(const uals_kernel_meta *meta);
uals_status uals_meta_create(const uals_kernel_meta *meta, uals_kernel_meta *snapshot);
uals_status uals_determinism_policy(uals_context *ctx, const uals_kernel_meta *meta,
                                    uint32_t *out_wg);

#endif