#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include "axiom/uals.h"

/* C reference for sx.kernel.axiom.x.integrator (spec: mrk-axiomx-integrator-spec-v0).
   Byte-exact mirror of the OpenCL kernel: Q16.16 fixed-point, int64 only. */

static uint32_t m32_step(uint32_t *s) {
  *s += 0x6D2B79F5u;
  uint32_t t = *s;
  t = (t ^ (t >> 15)) * (t | 1u);
  t ^= t + (t ^ (t >> 7)) * (t | 61u);
  *s = t ^ (t >> 14);
  return *s;
}

static uint64_t isqrt64(uint64_t n) {
  if (n == 0) return 0;
  uint64_t x = 1ULL << 31;
  for (int i = 0; i < 32; i++) x = (x + n / x) >> 1;
  while ((x + 1) * (x + 1) <= n) x++;
  while (x * x > n) x--;
  return x;
}

static void s3_uniform(uint32_t *s, int64_t n[4]) {
  for (int attempt = 0; attempt < 64; attempt++) {
    int64_t v[4];
    uint64_t r2 = 0;
    for (int k = 0; k < 4; k++) {
      v[k] = (int64_t)(m32_step(s) & 0xFFFFu) * 2 - 65536;
      r2 += (uint64_t)(v[k] * v[k]);
    }
    r2 >>= 16;
    if (r2 > 0 && r2 <= 65536) {
      uint64_t r = isqrt64(r2 << 16);
      if (r > 0) {
        for (int k = 0; k < 4; k++) n[k] = (v[k] << 16) / (int64_t)r;
        return;
      }
    }
  }
  n[0] = 65536; n[1] = 0; n[2] = 0; n[3] = 0;
}

static void render_pixel(uint32_t seed, uint32_t spp, uint32_t width, uint32_t height,
                         uint32_t gx, uint32_t gy, unsigned char out[4]) {
  const int64_t PI_Q = 205887, PI2_Q = 647911, PLANE_Z = -262144, LIGHT_R = 98304;
  const int64_t ALBEDO_Q = 45875, EMISSION_Q = 2097152, Q = 65536;
  uint32_t s = seed ^ (gx * 0x9E3779B9u) ^ (gy * 0x85EBCA77u);
  int64_t cx = (int64_t)gx - (int64_t)((width - 1u) / 2u);
  int64_t cy = (int64_t)gy - (int64_t)((height - 1u) / 2u);
  int64_t d0 = (2 * cx * Q) / (int64_t)width;
  int64_t d1 = (2 * cy * Q) / (int64_t)height;
  int64_t d2 = -Q;
  uint64_t len2 = (uint64_t)(d0 * d0 + d1 * d1 + d2 * d2) >> 16;
  int64_t len = (int64_t)isqrt64(len2 << 16);
  int64_t nd0 = (d0 << 16) / len;
  int64_t nd1 = (d1 << 16) / len;
  int64_t nd2 = (d2 << 16) / len;
  int64_t t = (PLANE_Z << 16) / nd2;
  int64_t px = (t * nd0) >> 16;
  int64_t py = (t * nd1) >> 16;
  int64_t pz = (t * nd2) >> 16;
  int64_t R3 = (LIGHT_R * LIGHT_R * LIGHT_R) >> 32;
  int64_t A = (2 * PI2_Q * R3) >> 16;
  int64_t pdfArea = (int64_t)(0x100000000ULL / (uint64_t)A);
  int64_t f = (3 * ALBEDO_Q * Q) / (4 * PI_Q);
  int64_t acc0 = 0, acc1 = 0, acc2 = 0;
  for (uint32_t i = 0; i < spp; i++) {
    int64_t n[4];
    s3_uniform(&s, n);
    int64_t lp0 = (LIGHT_R * n[0]) >> 16;
    int64_t lp1 = (LIGHT_R * n[1]) >> 16;
    int64_t lp2 = (LIGHT_R * n[2]) >> 16;
    int64_t lp3 = (LIGHT_R * n[3]) >> 16;
    int64_t toL0 = lp0 - px, toL1 = lp1 - py, toL2 = lp2 - pz, toL3 = lp3;
    uint64_t dist2 = (uint64_t)(toL0 * toL0 + toL1 * toL1 + toL2 * toL2 + toL3 * toL3) >> 16;
    if (dist2 == 0) continue;
    int64_t dist = (int64_t)isqrt64(dist2 << 16);
    int64_t wo0 = (toL0 << 16) / dist;
    int64_t wo1 = (toL1 << 16) / dist;
    int64_t wo2 = (toL2 << 16) / dist;
    int64_t wo3 = (toL3 << 16) / dist;
    int64_t dotN = (wo0 * n[0] + wo1 * n[1] + wo2 * n[2] + wo3 * n[3]) >> 16;
    int64_t cosLight = dotN < 0 ? -dotN : 0;
    if (cosLight <= 0) continue;
    int64_t cosTheta = wo2;
    if (cosTheta <= 0) continue;
    int64_t d3 = (dist * dist * dist) >> 32;
    int64_t num = (pdfArea * d3) >> 16;
    int64_t pdf = (num << 16) / cosLight;
    int64_t n1 = (EMISSION_Q * f) >> 16;
    int64_t n2 = (n1 * cosTheta) >> 16;
    int64_t c = (n2 << 16) / pdf;
    acc0 += c; acc1 += c; acc2 += c;
  }
  int64_t b0 = (acc0 * 255) / ((int64_t)spp * 65536);
  int64_t b1 = (acc1 * 255) / ((int64_t)spp * 65536);
  int64_t b2 = (acc2 * 255) / ((int64_t)spp * 65536);
  if (b0 > 255) b0 = 255; if (b0 < 0) b0 = 0;
  if (b1 > 255) b1 = 255; if (b1 < 0) b1 = 0;
  if (b2 > 255) b2 = 255; if (b2 < 0) b2 = 0;
  out[0] = (unsigned char)b0; out[1] = (unsigned char)b1;
  out[2] = (unsigned char)b2; out[3] = 255;
}

int gate_integrator(const uals_device *dev) {
  const uint32_t W = 64, H = 64, SPP = 4, SEED = 0x5EED;
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
  st = uals_enqueue(ctx, "sx.kernel.axiom.x.integrator", &meta, &args, sizeof(args));
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
  unsigned char ref[4];
  for (uint32_t y = 0; y < H && mismatches < 5; y++) {
    for (uint32_t x = 0; x < W && mismatches < 5; x++) {
      render_pixel(SEED, SPP, W, H, x, y, ref);
      const unsigned char *gp = gpu + ((size_t)y * W + x) * 4u;
      if (memcmp(gp, ref, 4) != 0) {
        printf("  mismatch at (%u,%u): gpu=%u,%u,%u,%u ref=%u,%u,%u,%u\n",
               x, y, gp[0], gp[1], gp[2], gp[3], ref[0], ref[1], ref[2], ref[3]);
        mismatches++;
      }
    }
  }
  uals_unmap(ctx, buf);
  uals_destroy(ctx);
  if (mismatches == 0) {
    printf("  OpenCL integrator bit-exact vs C reference (%ux%u spp=%u)\n", W, H, SPP);
    return 1;
  }
  return 0;
}