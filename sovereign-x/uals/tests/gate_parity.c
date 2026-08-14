#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include "axiom/uals.h"

static unsigned mulberry32(unsigned s, unsigned iters) {
  unsigned v = s;
  for (unsigned i = 0; i < iters; i++) {
    v += 0x6D2B79F5u;
    unsigned t = v;
    t = (t ^ (t >> 15)) * (t | 1u);
    t ^= t + (t ^ (t >> 7)) * (t | 61u);
    v = t ^ (t >> 14);
  }
  return v;
}

int gate_parity(const uals_device *dev) {
  const unsigned W = 64, H = 64, SPP = 4, SEED = 0x5EED;
  uals_kernel_meta meta;
  memset(&meta, 0, sizeof(meta));
  meta.rng_seed = SEED;
  meta.samples_per_pixel = SPP;
  meta.width = W;
  meta.height = H;
  meta.intent_id = 1;
  meta.world_id = 2;
  meta.timeline_id = 3;
  meta.time_seconds = 42;

  uals_axiom_x_args args = { SEED, SPP, W, H };
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
  size_t got = 0;
  st = uals_map(ctx, &buf, &ptr, &got);
  if (st != UALS_OK || got != W * H * 4u) {
    printf("  map failed: %s\n", uals_status_str(st));
    uals_destroy(ctx);
    return 0;
  }
  const unsigned char *gpu = (const unsigned char *)ptr;
  int mismatches = 0;
  for (unsigned y = 0; y < H && mismatches < 5; y++) {
    for (unsigned x = 0; x < W && mismatches < 5; x++) {
      unsigned ref = mulberry32(SEED ^ (x * 0x9E3779B9u) ^ (y * 0x85EBCA77u), SPP) | 0xFF000000u;
      const unsigned char *gp = gpu + (y * W + x) * 4u;
      unsigned gv = (unsigned)gp[0] | ((unsigned)gp[1] << 8) | ((unsigned)gp[2] << 16) | ((unsigned)gp[3] << 24);
      if (gv != ref) {
        printf("  mismatch at (%u,%u): gpu=0x%08X ref=0x%08X\n", x, y, gv, ref);
        mismatches++;
      }
    }
  }
  uals_unmap(ctx, buf);
  uals_destroy(ctx);
  if (mismatches == 0) {
    printf("  OpenCL output bit-exact vs C reference (%ux%u spp=%u)\n", W, H, SPP);
    return 1;
  }
  return 0;
}