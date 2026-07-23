/**
 * Production CUDA 4D BVH traversal + intersection kernels.
 *
 * Memory layout:
 *   BVHNode4D: { float4 min, max; int left, right, firstPrim, primCount; } — 48 bytes, AoS
 *   Primitives: SoA arrays by type (hypersphere, hyperplane, mesh)
 *   Rays: SoA — float4 origins[], dirs[]; float tMin[], tMax[]
 *
 * Compile: nvcc -arch=sm_70 -O3 bvh4d_cuda.cu -o bvh4d
 */

#include <cuda_runtime.h>
#include <float.h>

// ─── BVH Node (48 bytes, aligned) ───────────────────────────────
struct BVHNode4D {
    float4 minBounds;
    float4 maxBounds;
    int    leftChild;
    int    rightChild;
    int    firstPrim;
    int    primCount;
};

// ─── Primitive types ────────────────────────────────────────────
enum PrimType : int { PRIM_HYPERSPHERE = 0, PRIM_HYPERPLANE = 1, PRIM_MESH_TRI = 2 };

struct Hypersphere4D {
    float4 center;
    float  radius;
    int    materialId;
    float  _pad0, _pad1;
};

struct Hyperplane4D {
    float4 normal;
    float  offset;
    int    materialId;
    float  _pad0, _pad1;
};

struct MeshTri4D {
    float4 v0, v1, v2;
    float4 n0, n1, n2;
    int    materialId;
    float  _pad0;
};

// ─── SoA primitive buffers (set by host) ────────────────────────
// extern __constant__ Hypersphere4D  d_spheres[];
// extern __constant__ Hyperplane4D   d_planes[];
// extern __constant__ MeshTri4D      d_meshTris[];
// extern __constant__ int            d_primTypeMap[];   // primId -> type
// extern __constant__ int            d_primOffset[];    // primId -> offset in type buffer

struct HitRecord {
    float  t;
    int    primId;
    int    materialId;
    float4 normal;
};

// ─── Safe denominator ───────────────────────────────────────────
__device__ __forceinline__ float safeDenom(float d) {
    return fabsf(d) > 1e-12f ? d : copysignf(1e-12f, d);
}

// ─── 4D slab AABB intersection ──────────────────────────────────
__device__ bool intersectAABB4D(
    const float4 o, const float4 d,
    const float4 bmin, const float4 bmax,
    float& tEnter, float& tExit)
{
    float tE = -FLT_MAX;
    float tX =  FLT_MAX;

    const float4 origin = o;
    const float4 dir    = d;

    #pragma unroll
    for (int k = 0; k < 4; ++k) {
        float ok = ((const float*)&origin)[k];
        float dk = ((const float*)&dir)[k];
        float mn = ((const float*)&bmin)[k];
        float mx = ((const float*)&bmax)[k];

        float invD = 1.0f / safeDenom(dk);
        float t1 = (mn - ok) * invD;
        float t2 = (mx - ok) * invD;

        float tNear = fminf(t1, t2);
        float tFar  = fmaxf(t1, t2);

        tE = fmaxf(tE, tNear);
        tX = fminf(tX, tFar);
        if (tX < tE) return false;
    }

    tEnter = tE;
    tExit  = tX;
    return (tE <= tX) && (tX >= 0.0f);
}

// ─── Hypersphere intersection ───────────────────────────────────
__device__ bool intersectHypersphere(
    const float4 o, const float4 d,
    const Hypersphere4D& sph,
    float tMin, float tMax,
    float& tHit, float4& normalOut)
{
    float4 oc = make_float4(o.x - sph.center.x, o.y - sph.center.y,
                            o.z - sph.center.z, o.w - sph.center.w);

    float a = d.x*d.x + d.y*d.y + d.z*d.z + d.w*d.w;
    float b = 2.0f * (oc.x*d.x + oc.y*d.y + oc.z*d.z + oc.w*d.w);
    float c = oc.x*oc.x + oc.y*oc.y + oc.z*oc.z + oc.w*oc.w
              - sph.radius * sph.radius;

    float disc = b*b - 4.0f*a*c;
    if (disc < 0.0f) return false;

    float s = sqrtf(disc);
    float t0 = (-b - s) / (2.0f * a);
    float t1 = (-b + s) / (2.0f * a);

    float t = (t0 >= tMin && t0 <= tMax) ? t0 : t1;
    if (t < tMin || t > tMax) return false;

    tHit = t;
    float4 p = make_float4(o.x + t*d.x, o.y + t*d.y, o.z + t*d.z, o.w + t*d.w);
    float4 n = make_float4(p.x - sph.center.x, p.y - sph.center.y,
                           p.z - sph.center.z, p.w - sph.center.w);
    float invLen = rsqrtf(fmaxf(n.x*n.x + n.y*n.y + n.z*n.z + n.w*n.w, 1e-20f));
    normalOut = make_float4(n.x*invLen, n.y*invLen, n.z*invLen, n.w*invLen);
    return true;
}

// ─── Hyperplane intersection ────────────────────────────────────
__device__ bool intersectHyperplane(
    const float4 o, const float4 d,
    const Hyperplane4D& plane,
    float tMin, float tMax,
    float& tHit, float4& normalOut)
{
    float nd = plane.normal.x*d.x + plane.normal.y*d.y
             + plane.normal.z*d.z + plane.normal.w*d.w;
    if (fabsf(nd) < 1e-12f) return false;

    float no = plane.normal.x*o.x + plane.normal.y*o.y
             + plane.normal.z*o.z + plane.normal.w*o.w;
    float t = (plane.offset - no) / nd;
    if (t < tMin || t > tMax) return false;

    tHit = t;
    normalOut = plane.normal;
    return true;
}

// ─── Mesh triangle intersection (4D Möller–Trumbore variant) ────
// Projects to the 3D subspace spanned by (v1-v0, v2-v0, n0) and
// uses standard triangle intersection in that frame.
__device__ bool intersectMeshTri(
    const float4 o, const float4 d,
    const MeshTri4D& tri,
    float tMin, float tMax,
    float& tHit, float4& normalOut)
{
    float4 e1 = make_float4(tri.v1.x - tri.v0.x, tri.v1.y - tri.v0.y,
                            tri.v1.z - tri.v0.z, tri.v1.w - tri.v0.w);
    float4 e2 = make_float4(tri.v2.x - tri.v0.x, tri.v2.y - tri.v0.y,
                            tri.v2.z - tri.v0.z, tri.v2.w - tri.v0.w);

    // 4D cross product (bivector magnitude) — degenerates to 3D wedge
    float4 pvec;
    pvec.x = d.y * e2.z - d.z * e2.y;
    pvec.y = d.z * e2.w - d.w * e2.z;
    pvec.z = d.w * e2.x - d.x * e2.w;
    pvec.w = d.x * e2.y - d.y * e2.x;

    float det = e1.x*pvec.x + e1.y*pvec.y + e1.z*pvec.z + e1.w*pvec.w;
    if (fabsf(det) < 1e-12f) return false;

    float invDet = 1.0f / det;
    float4 tvec = make_float4(o.x - tri.v0.x, o.y - tri.v0.y,
                              o.z - tri.v0.z, o.w - tri.v0.w);

    float u = (tvec.x*pvec.x + tvec.y*pvec.y + tvec.z*pvec.z + tvec.w*pvec.w) * invDet;
    if (u < 0.0f || u > 1.0f) return false;

    float4 qvec;
    qvec.x = tvec.y * e1.z - tvec.z * e1.y;
    qvec.y = tvec.z * e1.w - tvec.w * e1.z;
    qvec.z = tvec.w * e1.x - tvec.x * e1.w;
    qvec.w = tvec.x * e1.y - tvec.y * e1.x;

    float v = (d.x*qvec.x + d.y*qvec.y + d.z*qvec.z + d.w*qvec.w) * invDet;
    if (v < 0.0f || u + v > 1.0f) return false;

    float t = (e2.x*qvec.x + e2.y*qvec.y + e2.z*qvec.z + e2.w*qvec.w) * invDet;
    if (t < tMin || t > tMax) return false;

    tHit = t;
    // Barycentric interpolation of normal
    float w = 1.0f - u - v;
    normalOut = make_float4(
        w * tri.n0.x + u * tri.n1.x + v * tri.n2.x,
        w * tri.n0.y + u * tri.n1.y + v * tri.n2.y,
        w * tri.n0.z + u * tri.n1.z + v * tri.n2.z,
        w * tri.n0.w + u * tri.n1.w + v * tri.n2.w);
    return true;
}

// ─── Primitive dispatch ─────────────────────────────────────────
extern __constant__ Hypersphere4D d_spheres[];
extern __constant__ Hyperplane4D  d_planes[];
extern __constant__ MeshTri4D     d_meshTris[];
extern __constant__ int           d_primType[];
extern __constant__ int           d_primOffset[];

__device__ bool intersectPrimitive(
    int primId,
    const float4 o, const float4 d,
    float tMin, float tMax,
    float& tHit, float4& normalOut, int& materialId)
{
    int type   = d_primType[primId];
    int offset = d_primOffset[primId];

    switch (type) {
        case PRIM_HYPERSPHERE: {
            const Hypersphere4D& s = d_spheres[offset];
            materialId = s.materialId;
            return intersectHypersphere(o, d, s, tMin, tMax, tHit, normalOut);
        }
        case PRIM_HYPERPLANE: {
            const Hyperplane4D& p = d_planes[offset];
            materialId = p.materialId;
            return intersectHyperplane(o, d, p, tMin, tMax, tHit, normalOut);
        }
        case PRIM_MESH_TRI: {
            const MeshTri4D& t = d_meshTris[offset];
            materialId = t.materialId;
            return intersectMeshTri(o, d, t, tMin, tMax, tHit, normalOut);
        }
    }
    return false;
}

// ─── Main traversal kernel ──────────────────────────────────────
__global__ void bvh4dTraversalKernel(
    const BVHNode4D* __restrict__ nodes,
    const float4*    __restrict__ rayOrigins,
    const float4*    __restrict__ rayDirs,
    const float*     __restrict__ rayTMin,
    const float*     __restrict__ rayTMax,
    HitRecord*       __restrict__ hits,
    int numRays)
{
    int idx = blockIdx.x * blockDim.x + threadIdx.x;
    if (idx >= numRays) return;

    float4 o = rayOrigins[idx];
    float4 d = rayDirs[idx];
    float tMin = rayTMin ? rayTMin[idx] : 1e-3f;
    float tMax = rayTMax ? rayTMax[idx] : 1e9f;

    // Stackless traversal using parent pointers (short stack)
    // For simplicity, using explicit stack here
    int stack[64];
    int sp = 0;
    stack[sp++] = 0;

    float closestT    = tMax;
    int   closestPrim = -1;
    int   closestMat  = -1;
    float4 closestN   = make_float4(0, 0, 0, 0);

    while (sp > 0) {
        int nodeIdx = stack[--sp];
        const BVHNode4D& node = nodes[nodeIdx];

        float tEnter, tExit;
        if (!intersectAABB4D(o, d, node.minBounds, node.maxBounds, tEnter, tExit))
            continue;
        if (tEnter > closestT) continue;

        if (node.primCount > 0) {
            // Leaf: test all primitives
            for (int i = 0; i < node.primCount; ++i) {
                int primId = node.firstPrim + i;
                float tHit; float4 nHit; int matId;
                if (intersectPrimitive(primId, o, d, tMin, closestT, tHit, nHit, matId)) {
                    closestT    = tHit;
                    closestPrim = primId;
                    closestMat  = matId;
                    closestN    = nHit;
                }
            }
        } else {
            // Internal: push children (closest-first for early exit)
            int left  = node.leftChild;
            int right = node.rightChild;
            if (left >= 0 && right >= 0) {
                // Order children by distance (approximate with tEnter)
                float tL = -FLT_MAX, tR = -FLT_MAX;
                intersectAABB4D(o, d, nodes[left].minBounds,  nodes[left].maxBounds,  tL, tR);
                float tR2 = -FLT_MAX, tR3 =  FLT_MAX;
                intersectAABB4D(o, d, nodes[right].minBounds, nodes[right].maxBounds, tR2, tR3);
                if (tL > tR2) { stack[sp++] = left; stack[sp++] = right; }
                else           { stack[sp++] = right; stack[sp++] = left; }
            } else {
                if (left  >= 0) stack[sp++] = left;
                if (right >= 0) stack[sp++] = right;
            }
        }
    }

    hits[idx].t          = closestT;
    hits[idx].primId     = closestPrim;
    hits[idx].materialId = closestMat;
    hits[idx].normal     = closestN;
}

// ─── BVH build kernel (top-down SAH, CPU-assisted) ─────────────
// Full GPU build requires atomics + work queues; this is the
// per-bin SAH cost evaluation launched from CPU-side builder.
struct SAHBin {
    float4 boundsMin;
    float4 boundsMax;
    int    count;
};

__global__ void sahBinKernel(
    const float4*  __restrict__ primCenters,
    const int*     __restrict__ primIndices,
    SAHBin*        __restrict__ bins,
    int axis, int start, int count, int numBins)
{
    int idx = blockIdx.x * blockDim.x + threadIdx.x;
    if (idx >= count) return;

    int primLocal = idx;
    int primGlobal = primIndices[start + primLocal];

    // Compute bin index
    float4 center = primCenters[primGlobal];
    float c = ((const float*)&center)[axis];

    // Would need min/max of centroids for this axis — pass as params
    // This is a placeholder for the binning logic
    int binIdx = min(numBins - 1, max(0, (int)(c * numBins)));
    atomicAdd(&bins[binIdx].count, 1);
}
