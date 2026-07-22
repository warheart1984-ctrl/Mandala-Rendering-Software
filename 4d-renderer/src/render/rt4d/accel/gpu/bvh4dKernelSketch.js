/**
 * CUDA-style 4D BVH + primitive intersection kernel sketch (not compiled in CI).
 * Layout matches BVHNode4D: minBounds, maxBounds, leftChild, rightChild, firstPrim, primCount.
 * Rays recommended as SoA; nodes as AoS.
 *
 * Status: skeleton / declared reference — see docs/4drs/substrate/BVH4D_GPU.md
 */
export const BVH4D_CUDA_KERNEL_SOURCE = String.raw`
// --- Types (AoS nodes) ---
struct BVHNode4D {
    float4 minBounds;
    float4 maxBounds;
    int    leftChild;
    int    rightChild;
    int    firstPrim;
    int    primCount;
};

struct HitRecord {
    float t;
    int   primId;
    float4 normal;
};

// --- SoA ray buffers ---
// float4* rayOrigins;  // [numRays]
// float4* rayDirs;     // [numRays]
// Optional: float* tMin / tMax as separate arrays

__device__ inline float safeDivDenom(float d_k) {
    return (fabsf(d_k) > 1e-12f) ? d_k : (d_k >= 0.f ? 1e-12f : -1e-12f);
}

__device__ bool intersectAABB4D(const float4 o, const float4 d,
                                const BVHNode4D& node,
                                float& tEnter, float& tExit) {
    float tEnterLocal = -FLT_MAX;
    float tExitLocal  =  FLT_MAX;
    #pragma unroll
    for (int k = 0; k < 4; ++k) {
        float o_k = ((const float*)&o)[k];
        float d_k = ((const float*)&d)[k];
        float min_k = ((const float*)&node.minBounds)[k];
        float max_k = ((const float*)&node.maxBounds)[k];
        float denom = safeDivDenom(d_k);
        float t1 = (min_k - o_k) / denom;
        float t2 = (max_k - o_k) / denom;
        float tNear = fminf(t1, t2);
        float tFar  = fmaxf(t1, t2);
        tEnterLocal = fmaxf(tEnterLocal, tNear);
        tExitLocal  = fminf(tExitLocal,  tFar);
        if (tExitLocal < tEnterLocal) return false;
    }
    tEnter = tEnterLocal;
    tExit  = tExitLocal;
    return (tEnter <= tExit) && (tExit >= 0.0f);
}

// Hypersphere: |o + t d - c|^2 = r^2
__device__ bool intersectHyperSphere4D(const float4 o, const float4 d,
                                       const float4 c, float radius,
                                       float tMin, float tMax,
                                       float& tHit, float4& nOut) {
    float4 oc = make_float4(o.x - c.x, o.y - c.y, o.z - c.z, o.w - c.w);
    float a = o.x; // placeholder overwritten
    a = d.x*d.x + d.y*d.y + d.z*d.z + d.w*d.w;
    float b = 2.f * (oc.x*d.x + oc.y*d.y + oc.z*d.z + oc.w*d.w);
    float cc = oc.x*oc.x + oc.y*oc.y + oc.z*oc.z + oc.w*oc.w - radius*radius;
    float disc = b*b - 4.f*a*cc;
    if (disc < 0.f) return false;
    float s = sqrtf(disc);
    float t0 = (-b - s) / (2.f*a);
    float t1 = (-b + s) / (2.f*a);
    float t = (t0 >= tMin && t0 <= tMax) ? t0 : t1;
    if (t < tMin || t > tMax) return false;
    tHit = t;
    float4 p = make_float4(o.x + t*d.x, o.y + t*d.y, o.z + t*d.z, o.w + t*d.w);
    float4 n = make_float4(p.x - c.x, p.y - c.y, p.z - c.z, p.w - c.w);
    float inv = rsqrtf(n.x*n.x + n.y*n.y + n.z*n.z + n.w*n.w + 1e-20f);
    nOut = make_float4(n.x*inv, n.y*inv, n.z*inv, n.w*inv);
    return true;
}

// Hyperplane: n·x = offset  =>  t = (offset - n·o) / (n·d)
__device__ bool intersectHyperPlane4D(const float4 o, const float4 d,
                                      const float4 n, float offset,
                                      float tMin, float tMax,
                                      float& tHit, float4& nOut) {
    float nd = n.x*d.x + n.y*d.y + n.z*d.z + n.w*d.w;
    if (fabsf(nd) < 1e-12f) return false;
    float t = (offset - (n.x*o.x + n.y*o.y + n.z*o.z + n.w*o.w)) / nd;
    if (t < tMin || t > tMax) return false;
    tHit = t;
    nOut = n;
    return true;
}

// Hook: dispatch by primitive type table (filled by host)
__device__ bool intersectPrimitive4D(int primId,
                                     const float4 o, const float4 d,
                                     float tMin, float tMax,
                                     float& tHit, float4& nOut);

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
    int   closestPrim = -1;
    float4 closestN = make_float4(0,0,0,0);

    while (sp > 0) {
        int nodeIdx = stack[--sp];
        const BVHNode4D& node = nodes[nodeIdx];
        float tEnter, tExit;
        if (!intersectAABB4D(o, d, node, tEnter, tExit) || tEnter > closestT)
            continue;

        if (node.primCount > 0) {
            for (int i = 0; i < node.primCount; ++i) {
                int primId = node.firstPrim + i;
                float tHit; float4 nHit;
                if (intersectPrimitive4D(primId, o, d, 1e-3f, closestT, tHit, nHit)) {
                    if (tHit < closestT) {
                        closestT = tHit;
                        closestPrim = primId;
                        closestN = nHit;
                    }
                }
            }
        } else {
            if (node.leftChild  >= 0) stack[sp++] = node.leftChild;
            if (node.rightChild >= 0) stack[sp++] = node.rightChild;
        }
    }

    hits[idx].t = closestT;
    hits[idx].primId = closestPrim;
    hits[idx].normal = closestN;
}
`;

export const BVH4D_WGSL_KERNEL_SKETCH = String.raw`
struct BVHNode4D {
  minBounds: vec4<f32>,
  maxBounds: vec4<f32>,
  leftChild: i32,
  rightChild: i32,
  firstPrim: i32,
  primCount: i32,
}

fn intersectAABB4D(o: vec4<f32>, d: vec4<f32>, node: BVHNode4D) -> vec2<f32> {
  var tEnter = -1e30;
  var tExit = 1e30;
  for (var k = 0; k < 4; k++) {
    let ok = o[k];
    var dk = d[k];
    if (abs(dk) < 1e-12) { dk = select(-1e-12, 1e-12, dk >= 0.0); }
    let t1 = (node.minBounds[k] - ok) / dk;
    let t2 = (node.maxBounds[k] - ok) / dk;
    tEnter = max(tEnter, min(t1, t2));
    tExit = min(tExit, max(t1, t2));
  }
  return vec2<f32>(tEnter, tExit);
}
`;
