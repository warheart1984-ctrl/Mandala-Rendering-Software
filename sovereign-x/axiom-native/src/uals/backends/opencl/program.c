#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include "ocl_ctx.h"

const char *uals_kernel_source(void) {
  return
    "__kernel void axiom_x_sample(__global uint* out, uint seed, uint spp, uint width, uint height) {\n"
    "  uint gx = get_global_id(0);\n"
    "  uint gy = get_global_id(1);\n"
    "  if (gx >= width || gy >= height) return;\n"
    "  uint s = seed ^ (gx * 0x9E3779B9u) ^ (gy * 0x85EBCA77u);\n"
    "  for (uint i = 0; i < spp; i++) {\n"
    "    s += 0x6D2B79F5u;\n"
    "    uint t = s;\n"
    "    t = (t ^ (t >> 15)) * (t | 1u);\n"
    "    t ^= t + (t ^ (t >> 7)) * (t | 61u);\n"
    "    s = t ^ (t >> 14);\n"
    "  }\n"
    "  out[gy * width + gx] = s | 0xFF000000u;\n"
    "}\n"
    "static ulong uals_isqrt(ulong n) {\n"
    "  if (n == 0UL) return 0UL;\n"
    "  ulong x = 1UL << 31;\n"
    "  for (int i = 0; i < 32; i++) x = (x + n / x) >> 1;\n"
    "  while ((x + 1UL) * (x + 1UL) <= n) x++;\n"
    "  while (x * x > n) x--;\n"
    "  return x;\n"
    "}\n"
    "static uint uals_m32(uint *sp) {\n"
    "  *sp += 0x6D2B79F5u;\n"
    "  uint t = *sp;\n"
    "  t = (t ^ (t >> 15)) * (t | 1u);\n"
    "  t ^= t + (t ^ (t >> 7)) * (t | 61u);\n"
    "  *sp = t ^ (t >> 14);\n"
    "  return *sp;\n"
    "}\n"
    "static int uals_s3_uniform(uint *sp, long n[4]) {\n"
    "  for (int attempt = 0; attempt < 64; attempt++) {\n"
    "    long v0 = (long)(uals_m32(sp) & 0xFFFFu) * 2L - 65536L;\n"
    "    long v1 = (long)(uals_m32(sp) & 0xFFFFu) * 2L - 65536L;\n"
    "    long v2 = (long)(uals_m32(sp) & 0xFFFFu) * 2L - 65536L;\n"
    "    long v3 = (long)(uals_m32(sp) & 0xFFFFu) * 2L - 65536L;\n"
    "    ulong r2 = (ulong)(v0*v0 + v1*v1 + v2*v2 + v3*v3);\n"
    "    r2 >>= 16;\n"
    "    if (r2 > 0UL && r2 <= 65536UL) {\n"
    "      ulong r = uals_isqrt(r2 << 16);\n"
    "      if (r > 0UL) {\n"
    "        n[0] = (v0 << 16) / (long)r;\n"
    "        n[1] = (v1 << 16) / (long)r;\n"
    "        n[2] = (v2 << 16) / (long)r;\n"
    "        n[3] = (v3 << 16) / (long)r;\n"
    "        return 1;\n"
    "      }\n"
    "    }\n"
    "  }\n"
    "  n[0] = 65536L; n[1] = 0L; n[2] = 0L; n[3] = 0L;\n"
    "  return 1;\n"
    "}\n"
    "__kernel void axiom_x_integrator(__global uchar* out, uint seed, uint spp, uint width, uint height) {\n"
    "  const long PI_Q = 205887L;\n"
    "  const long PI2_Q = 647911L;\n"
    "  const long PLANE_Z = -262144L;\n"
    "  const long LIGHT_R = 98304L;\n"
    "  const long ALBEDO_Q = 45875L;\n"
    "  const long EMISSION_Q = 2097152L;\n"
    "  uint gx = get_global_id(0);\n"
    "  uint gy = get_global_id(1);\n"
    "  if (gx >= width || gy >= height) return;\n"
    "  uint s = seed ^ (gx * 0x9E3779B9u) ^ (gy * 0x85EBCA77u);\n"
    "  long cx = (long)gx - (long)((width - 1u) / 2u);\n"
    "  long cy = (long)gy - (long)((height - 1u) / 2u);\n"
    "  long d0 = (2L * cx * 65536L) / (long)width;\n"
    "  long d1 = (2L * cy * 65536L) / (long)height;\n"
    "  long d2 = -65536L;\n"
    "  ulong len2 = (ulong)(d0*d0 + d1*d1 + d2*d2) >> 16;\n"
    "  long len = (long)uals_isqrt(len2 << 16);\n"
    "  long nd0 = (d0 << 16) / len;\n"
    "  long nd1 = (d1 << 16) / len;\n"
    "  long nd2 = (d2 << 16) / len;\n"
    "  long t = (PLANE_Z << 16) / nd2;\n"
    "  long px = (t * nd0) >> 16;\n"
    "  long py = (t * nd1) >> 16;\n"
    "  long pz = (t * nd2) >> 16;\n"
    "  long R3 = (LIGHT_R * LIGHT_R * LIGHT_R) >> 32;\n"
    "  long A = (2L * PI2_Q * R3) >> 16;\n"
    "  long pdfArea = (long)(0x100000000UL / (ulong)A);\n"
    "  long f = (3L * ALBEDO_Q * 65536L) / (4L * PI_Q);\n"
    "  long acc0 = 0L, acc1 = 0L, acc2 = 0L;\n"
    "  for (uint i = 0; i < spp; i++) {\n"
    "    long n[4];\n"
    "    uals_s3_uniform(&s, n);\n"
    "    long lp0 = (LIGHT_R * n[0]) >> 16;\n"
    "    long lp1 = (LIGHT_R * n[1]) >> 16;\n"
    "    long lp2 = (LIGHT_R * n[2]) >> 16;\n"
    "    long lp3 = (LIGHT_R * n[3]) >> 16;\n"
    "    long toL0 = lp0 - px;\n"
    "    long toL1 = lp1 - py;\n"
    "    long toL2 = lp2 - pz;\n"
    "    long toL3 = lp3;\n"
    "    ulong dist2 = (ulong)(toL0*toL0 + toL1*toL1 + toL2*toL2 + toL3*toL3) >> 16;\n"
    "    if (dist2 == 0UL) continue;\n"
    "    long dist = (long)uals_isqrt(dist2 << 16);\n"
    "    long wo0 = (toL0 << 16) / dist;\n"
    "    long wo1 = (toL1 << 16) / dist;\n"
    "    long wo2 = (toL2 << 16) / dist;\n"
    "    long wo3 = (toL3 << 16) / dist;\n"
    "    long dotN = (wo0*n[0] + wo1*n[1] + wo2*n[2] + wo3*n[3]) >> 16;\n"
    "    long cosLight = dotN < 0L ? -dotN : 0L;\n"
    "    if (cosLight <= 0L) continue;\n"
    "    long cosTheta = wo2;\n"
    "    if (cosTheta <= 0L) continue;\n"
    "    long d3 = (dist * dist * dist) >> 32;\n"
    "    long num = (pdfArea * d3) >> 16;\n"
    "    long pdf = (num << 16) / cosLight;\n"
    "    long n1 = (EMISSION_Q * f) >> 16;\n"
    "    long n2 = (n1 * cosTheta) >> 16;\n"
    "    long c = (n2 << 16) / pdf;\n"
    "    acc0 += c; acc1 += c; acc2 += c;\n"
    "  }\n"
    "  long b0 = (acc0 * 255L) / ((long)spp * 65536L);\n"
    "  long b1 = (acc1 * 255L) / ((long)spp * 65536L);\n"
    "  long b2 = (acc2 * 255L) / ((long)spp * 65536L);\n"
    "  if (b0 > 255L) b0 = 255L; if (b0 < 0L) b0 = 0L;\n"
    "  if (b1 > 255L) b1 = 255L; if (b1 < 0L) b1 = 0L;\n"
    "  if (b2 > 255L) b2 = 255L; if (b2 < 0L) b2 = 0L;\n"
    "  size_t o = ((size_t)gy * (size_t)width + (size_t)gx) * 4u;\n"
    "  out[o] = (uchar)b0; out[o+1u] = (uchar)b1; out[o+2u] = (uchar)b2; out[o+3u] = 255u;\n"
    "}\n";
}

static void append_build_log(cl_program prog, cl_device_id dev, char *dst, size_t cap) {
  size_t sz = 0;
  if (uals_ocl.clGetProgramBuildInfo(prog, dev, CL_PROGRAM_BUILD_LOG, 0, NULL, &sz) == CL_SUCCESS &&
      sz > 1 && sz < cap) {
    uals_ocl.clGetProgramBuildInfo(prog, dev, CL_PROGRAM_BUILD_LOG, sz, dst, NULL);
    dst[sz - 1] = '\0';
  } else if (cap > 0) {
    dst[0] = '\0';
  }
}

uals_status uals_ocl_ensure_kernel(uals_context *ctx) {
  if (ctx->built) return UALS_OK;
  const char *src = uals_kernel_source();
  size_t len = strlen(src);
  cl_int err = CL_SUCCESS;
  ctx->cl_prog = uals_ocl.clCreateProgramWithSource(ctx->cl_ctx, 1, &src, &len, &err);
  if (!ctx->cl_prog) return UALS_ERR_UNSUPPORTED;
  err = uals_ocl.clBuildProgram(ctx->cl_prog, 1, &ctx->cl_dev, "-cl-std=CL2.0", NULL, NULL);
  if (err != CL_SUCCESS) {
    err = uals_ocl.clBuildProgram(ctx->cl_prog, 1, &ctx->cl_dev, NULL, NULL, NULL);
    if (err != CL_SUCCESS) {
      char log[4096];
      append_build_log(ctx->cl_prog, ctx->cl_dev, log, sizeof(log));
      fprintf(stderr, "uals: kernel build failed: %s\n", log);
      return UALS_ERR_UNSUPPORTED;
    }
  }
  ctx->cl_kern = uals_ocl.clCreateKernel(ctx->cl_prog, "axiom_x_sample", &err);
  if (!ctx->cl_kern || err != CL_SUCCESS) return UALS_ERR_UNSUPPORTED;
  ctx->cl_kern_integrator = uals_ocl.clCreateKernel(ctx->cl_prog, "axiom_x_integrator", &err);
  if (!ctx->cl_kern_integrator || err != CL_SUCCESS) return UALS_ERR_UNSUPPORTED;
  ctx->built = 1;
  return UALS_OK;
}