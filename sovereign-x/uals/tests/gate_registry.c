#include <stdio.h>
#include <string.h>
#include "axiom/uals.h"

int gate_registry(const uals_device *dev) {
  uals_kernel_meta meta;
  memset(&meta, 0, sizeof(meta));
  meta.rng_seed = 0x222;
  meta.samples_per_pixel = 2;
  meta.width = 16;
  meta.height = 16;
  meta.intent_id = 1;
  meta.world_id = 2;
  meta.timeline_id = 3;
  meta.time_seconds = 42;

  uals_axiom_x_args args = { 0x222, 2, 16, 16 };
  uals_context *ctx = NULL;
  uals_status st = uals_create(dev, &meta, &ctx);
  if (st != UALS_OK) {
    printf("  create failed: %s\n", uals_status_str(st));
    return 0;
  }
  st = uals_enqueue(ctx, "sx.kernel.does.not.exist", &meta, &args, sizeof(args));
  uals_destroy(ctx);
  if (st == UALS_ERR_INVALID_ARG) {
    printf("  unknown kernel id denied: UALS_ERR_INVALID_ARG\n");
    return 1;
  }
  printf("  expected UALS_ERR_INVALID_ARG, got %s\n", uals_status_str(st));
  return 0;
}