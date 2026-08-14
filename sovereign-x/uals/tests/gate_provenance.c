#include <stdio.h>
#include <string.h>
#include "axiom/uals.h"

int gate_provenance(const uals_device *dev) {
  uals_kernel_meta meta;
  memset(&meta, 0, sizeof(meta));
  meta.rng_seed = 0x111;
  meta.samples_per_pixel = 2;
  meta.width = 16;
  meta.height = 16;
  meta.intent_id = 0;
  meta.world_id = 2;
  meta.timeline_id = 3;
  meta.time_seconds = 42;

  uals_axiom_x_args args = { 0x111, 2, 16, 16 };
  uals_context *ctx = NULL;
  uals_status st = uals_create(dev, &meta, &ctx);
  if (st == UALS_OK) {
    st = uals_enqueue(ctx, "sx.kernel.axiom.x.sample", &meta, &args, sizeof(args));
    uals_destroy(ctx);
  }
  if (st == UALS_ERR_PROVENANCE) {
    printf("  enqueue without intent_id denied: UALS_ERR_PROVENANCE\n");
    return 1;
  }
  printf("  expected UALS_ERR_PROVENANCE, got %s\n", uals_status_str(st));
  return 0;
}