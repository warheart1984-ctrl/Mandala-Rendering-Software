#include <string.h>
#include "../orchestrator/uals_internal.h"

static const sx_kernel_entry registry[] = {
  { "sx.kernel.axiom.x.sample", 0, 1, "assist-only" },
  { "sx.kernel.axiom.x.integrator", 0, 1, "assist-only" }
};
static const size_t registry_count = sizeof(registry) / sizeof(registry[0]);

uals_status uals_registry_resolve(const char *kernel_id, const sx_kernel_entry **out) {
  if (!kernel_id || !out) return UALS_ERR_INVALID_ARG;
  for (size_t i = 0; i < registry_count; i++) {
    if (strcmp(registry[i].id, kernel_id) == 0) {
      *out = &registry[i];
      return UALS_OK;
    }
  }
  return UALS_ERR_INVALID_ARG;
}