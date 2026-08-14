#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include "axiom/uals.h"

int gate_determinism(const uals_device *dev) {
  uals_kernel_meta meta;
  memset(&meta, 0, sizeof(meta));
  meta.rng_seed = 0xABCD;
  meta.samples_per_pixel = 8;
  meta.width = 128;
  meta.height = 128;
  meta.intent_id = 1;
  meta.world_id = 2;
  meta.timeline_id = 3;
  meta.time_seconds = 42;

  uals_axiom_x_args args = { 0xABCD, 8, 128, 128 };
  size_t nbytes = 128u * 128u * 4u;
  unsigned char *a = (unsigned char *)malloc(nbytes);
  unsigned char *b = (unsigned char *)malloc(nbytes);
  if (!a || !b) return 0;

  int ok = 1;
  for (int run = 0; run < 2 && ok; run++) {
    uals_context *ctx = NULL;
    uals_status st = uals_create(dev, &meta, &ctx);
    if (st != UALS_OK) { ok = 0; break; }
    st = uals_enqueue(ctx, "sx.kernel.axiom.x.sample", &meta, &args, sizeof(args));
    if (st != UALS_OK) { ok = 0; uals_destroy(ctx); break; }
    uals_buffer *buf = NULL;
    void *ptr = NULL;
    size_t got = 0;
    st = uals_map(ctx, &buf, &ptr, &got);
    if (st != UALS_OK || got != nbytes) { ok = 0; uals_destroy(ctx); break; }
    memcpy(run == 0 ? a : b, ptr, nbytes);
    uals_unmap(ctx, buf);
    uals_destroy(ctx);
  }
  if (ok && memcmp(a, b, nbytes) != 0) {
    printf("  two runs with same seed diverged\n");
    ok = 0;
  }

  if (ok) {
    uals_context *ctx = NULL;
    uals_status st = uals_create(dev, &meta, &ctx);
    if (st == UALS_OK) {
      uals_axiom_x_args args2 = { 0xABCD + 1, 8, 128, 128 };
      meta.rng_seed = 0xABCD + 1;
      st = uals_enqueue(ctx, "sx.kernel.axiom.x.sample", &meta, &args2, sizeof(args2));
      if (st == UALS_OK) {
        uals_buffer *buf = NULL;
        void *ptr = NULL;
        size_t got = 0;
        st = uals_map(ctx, &buf, &ptr, &got);
        if (st == UALS_OK) {
          if (memcmp(ptr, a, nbytes) == 0) {
            printf("  different seed produced identical output (suspicious)\n");
            ok = 0;
          }
          uals_unmap(ctx, buf);
        }
      }
      uals_destroy(ctx);
    }
  }
  free(a);
  free(b);
  if (ok) printf("  deterministic: 2 runs seed=0xABCD byte-identical; seed+1 diverges\n");
  return ok;
}