#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include "axiom/uals.h"

int main(int argc, char **argv) {
  if (argc != 6) {
    fprintf(stderr, "usage: dump_axiomx <seed> <spp> <w> <h> <out.bin>\n");
    return 2;
  }
  uint32_t seed = (uint32_t)strtoul(argv[1], NULL, 0);
  uint32_t spp = (uint32_t)strtoul(argv[2], NULL, 0);
  uint32_t width = (uint32_t)strtoul(argv[3], NULL, 0);
  uint32_t height = (uint32_t)strtoul(argv[4], NULL, 0);

  const uals_device *devices = NULL;
  uint32_t count = 0;
  uals_status st = uals_probe(UALS_BACKEND_OPENCL, &devices, &count);
  if (st != UALS_OK || count == 0) {
    fprintf(stderr, "no OpenCL device: %s\n", uals_status_str(st));
    return 1;
  }

  uals_kernel_meta meta;
  memset(&meta, 0, sizeof(meta));
  meta.rng_seed = seed;
  meta.samples_per_pixel = spp;
  meta.width = width;
  meta.height = height;
  meta.intent_id = 1;
  meta.world_id = 2;
  meta.timeline_id = 3;
  meta.time_seconds = 42;

  uals_axiom_x_args args = { seed, spp, width, height };
  uals_context *ctx = NULL;
  st = uals_create(&devices[0], &meta, &ctx);
  if (st != UALS_OK) { fprintf(stderr, "create: %s\n", uals_status_str(st)); return 1; }
  st = uals_enqueue(ctx, "sx.kernel.axiom.x.sample", &meta, &args, sizeof(args));
  if (st != UALS_OK) { fprintf(stderr, "enqueue: %s\n", uals_status_str(st)); uals_destroy(ctx); return 1; }
  uals_buffer *buf = NULL;
  void *ptr = NULL;
  size_t nbytes = 0;
  st = uals_map(ctx, &buf, &ptr, &nbytes);
  if (st != UALS_OK) { fprintf(stderr, "map: %s\n", uals_status_str(st)); uals_destroy(ctx); return 1; }

  FILE *f = fopen(argv[5], "wb");
  if (!f) { fprintf(stderr, "cannot open %s\n", argv[5]); uals_unmap(ctx, buf); uals_destroy(ctx); return 1; }
  fwrite(ptr, 1, nbytes, f);
  fclose(f);
  fprintf(stderr, "dumped %llu bytes from %s (%ux%u spp=%u seed=%u)\n",
          (unsigned long long)nbytes, devices[0].name, width, height, spp, seed);
  uals_unmap(ctx, buf);
  uals_destroy(ctx);
  return 0;
}