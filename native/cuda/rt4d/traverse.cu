// Optional host-side entry — skeleton only. Not wired into npm CI.
// Status: skeleton
#include "bvh4d_kernel.cuh"

/*
  Build notes (optional local CUDA):
    nvcc -c traverse.cu -o traverse.o
    Link with device code that defines intersectPrimitive4D.

  Memory:
    - Nodes: AoS BVHNode4D[]
    - Rays: SoA float4* origins, float4* dirs (coalesced loads)
*/

#ifdef __CUDACC__
__global__ void traverseBVH4D(const BVHNode4D* nodes,
                              const float4* rayOrigins,
                              const float4* rayDirs,
                              HitRecord* hits,
                              int numRays) {
  int idx = blockIdx.x * blockDim.x + threadIdx.x;
  if (idx >= numRays) return;

  float4 o = rayOrigins[idx];
  float4 d = rayDirs[idx];

  int stack[64];
  int sp = 0;
  stack[sp++] = 0;

  float closestT = FLT_MAX;
  int closestPrim = -1;
  float4 closestN = make_float4(0, 0, 0, 0);

  while (sp > 0) {
    int nodeIdx = stack[--sp];
    const BVHNode4D& node = nodes[nodeIdx];
    float tEnter, tExit;
    if (!intersectAABB4D(o, d, node, tEnter, tExit) || tEnter > closestT) continue;

    if (node.primCount > 0) {
      for (int i = 0; i < node.primCount; ++i) {
        int primId = node.firstPrim + i;
        float tHit;
        float4 nHit;
        if (intersectPrimitive4D(primId, o, d, 1e-3f, closestT, tHit, nHit) && tHit < closestT) {
          closestT = tHit;
          closestPrim = primId;
          closestN = nHit;
        }
      }
    } else {
      if (node.leftChild >= 0) stack[sp++] = node.leftChild;
      if (node.rightChild >= 0) stack[sp++] = node.rightChild;
    }
  }

  hits[idx].t = closestT;
  hits[idx].primId = closestPrim;
  hits[idx].normal = closestN;
}
#endif
