#include <stdio.h>
#include <string.h>
#include "axiom/uals.h"

extern int gate_probe(const uals_device **devices, uint32_t *count);

int gate_dispatch(const uals_device *dev) {
  uals_kernel_meta meta;
  memset(&meta, 0, sizeof(meta));
  meta.rng_seed = 0x5EED;
  meta.samples_per_pixel = 4;
  meta.width = 64;
  meta.height = 64;
  meta.intent_id = 1;
  meta.world_id = 2;
  meta.timeline_id = 3;
  meta.time_seconds = 42;

  uals_axiom_x_args args = { 0x5EED, 4, 64, 64 };

  uals_context *ctx = NULL;
  uals_status st = uals_create(dev, &meta, &ctx);
  if (st != UALS_OK) {
    printf("  create failed: %s\n", uals_status_str(st));
    return 0;
  }
  st = uals_enqueue(ctx, "sx.kernel.axiom.x.sample", &meta, &args, sizeof(args));
  if (st != UALS_OK) {
    printf("  enqueue failed: %s\n", uals_status_str(st));
    uals_destroy(ctx);
    return 0;
  }
  uals_buffer *buf = NULL;
  void *ptr = NULL;
  size_t nbytes = 0;
  st = uals_map(ctx, &buf, &ptr, &nbytes);
  if (st != UALS_OK) {
    printf("  map failed: %s\n", uals_status_str(st));
    uals_destroy(ctx);
    return 0;
  }
  size_t expected = 64u * 64u * 4u;
  int sane = (nbytes == expected);
  if (sane) {
    const unsigned char *p = (const unsigned char *)ptr;
    size_t nonzero = 0;
    for (size_t i = 0; i < nbytes; i++) {
      if ((i % 4) == 3) {
        if (p[i] != 0xFF) { sane = 0; break; }
      } else if (p[i] != 0) {
        nonzero++;
      }
    }
    if (nonzero == 0) sane = 0;
  }
  uals_unmap(ctx, buf);
  uals_destroy(ctx);
  if (!sane) {
    printf("  output buffer invalid (nbytes=%llu expected=%llu)\n",
           (unsigned long long)nbytes, (unsigned long long)expected);
    return 0;
  }
  printf("  dispatched path_trace 64x64 spp=4 seed=0x5EED -> %llu bytes\n",
         (unsigned long long)nbytes);
  return 1;
}