// Copyright (c) Mandala Rendering System — CUDA RT4D BVH skeleton (not built in CI).
// Status: skeleton. Compile with nvcc when CUDA toolkit is available.
// Mirror of JS sketch in mrs/packages/renderer-core/src/render/rt4d/accel/gpu/bvh4dKernelSketch.js

#pragma once

#include <cfloat>
#include <cmath>

#ifndef __CUDACC__
#define __device__
#define __global__
#define __host__
struct float4 { float x, y, z, w; };
inline float4 make_float4(float x, float y, float z, float w) {
  return float4{x, y, z, w};
}
inline float fabsf(float v) { return std::fabs(v); }
inline float fminf(float a, float b) { return a < b ? a : b; }
inline float fmaxf(float a, float b) { return a > b ? a : b; }
inline float sqrtf(float v) { return std::sqrt(v); }
inline float rsqrtf(float v) { return 1.f / std::sqrt(v); }
#endif

struct BVHNode4D {
  float4 minBounds;
  float4 maxBounds;
  int leftChild;
  int rightChild;
  int firstPrim;
  int primCount;
};

struct HitRecord {
  float t;
  int primId;
  float4 normal;
};

__device__ inline float safeDivDenom(float d_k) {
  return (fabsf(d_k) > 1e-12f) ? d_k : (d_k >= 0.f ? 1e-12f : -1e-12f);
}

__device__ inline bool intersectAABB4D(const float4 o, const float4 d,
                                       const BVHNode4D& node,
                                       float& tEnter, float& tExit) {
  float tEnterLocal = -FLT_MAX;
  float tExitLocal = FLT_MAX;
  const float* oA = &o.x;
  const float* dA = &d.x;
  const float* minA = &node.minBounds.x;
  const float* maxA = &node.maxBounds.x;
  for (int k = 0; k < 4; ++k) {
    float denom = safeDivDenom(dA[k]);
    float t1 = (minA[k] - oA[k]) / denom;
    float t2 = (maxA[k] - oA[k]) / denom;
    float tNear = fminf(t1, t2);
    float tFar = fmaxf(t1, t2);
    tEnterLocal = fmaxf(tEnterLocal, tNear);
    tExitLocal = fminf(tExitLocal, tFar);
    if (tExitLocal < tEnterLocal) return false;
  }
  tEnter = tEnterLocal;
  tExit = tExitLocal;
  return (tEnter <= tExit) && (tExit >= 0.0f);
}

__device__ inline bool intersectHyperSphere4D(const float4 o, const float4 d,
                                              const float4 c, float radius,
                                              float tMin, float tMax,
                                              float& tHit, float4& nOut) {
  float4 oc = make_float4(o.x - c.x, o.y - c.y, o.z - c.z, o.w - c.w);
  float a = d.x * d.x + d.y * d.y + d.z * d.z + d.w * d.w;
  float b = 2.f * (oc.x * d.x + oc.y * d.y + oc.z * d.z + oc.w * d.w);
  float cc = oc.x * oc.x + oc.y * oc.y + oc.z * oc.z + oc.w * oc.w - radius * radius;
  float disc = b * b - 4.f * a * cc;
  if (disc < 0.f) return false;
  float s = sqrtf(disc);
  float t0 = (-b - s) / (2.f * a);
  float t1 = (-b + s) / (2.f * a);
  float t = (t0 >= tMin && t0 <= tMax) ? t0 : t1;
  if (t < tMin || t > tMax) return false;
  tHit = t;
  float4 p = make_float4(o.x + t * d.x, o.y + t * d.y, o.z + t * d.z, o.w + t * d.w);
  float4 n = make_float4(p.x - c.x, p.y - c.y, p.z - c.z, p.w - c.w);
  float inv = rsqrtf(n.x * n.x + n.y * n.y + n.z * n.z + n.w * n.w + 1e-20f);
  nOut = make_float4(n.x * inv, n.y * inv, n.z * inv, n.w * inv);
  return true;
}

__device__ inline bool intersectHyperPlane4D(const float4 o, const float4 d,
                                             const float4 n, float offset,
                                             float tMin, float tMax,
                                             float& tHit, float4& nOut) {
  float nd = n.x * d.x + n.y * d.y + n.z * d.z + n.w * d.w;
  if (fabsf(nd) < 1e-12f) return false;
  float t = (offset - (n.x * o.x + n.y * o.y + n.z * o.z + n.w * o.w)) / nd;
  if (t < tMin || t > tMax) return false;
  tHit = t;
  nOut = n;
  return true;
}

// Host must provide a concrete intersectPrimitive4D for the scene.
__device__ bool intersectPrimitive4D(int primId, const float4 o, const float4 d,
                                     float tMin, float tMax, float& tHit, float4& nOut);
