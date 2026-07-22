# 4D BVH GPU traversal — math & memory

**Status:** **skeleton** (CPU packed reference + CUDA/WGSL sketches). Not enforced as a production GPU path.

## Shared substrate

\[
x \in \mathbb{R}^{4},\quad
r(\lambda)=o+\lambda d,\quad o,d\in\mathbb{R}^{4}
\]

State fields \(\Phi(x,t)\) are out of scope for traversal; the BVH accelerates geometric primitives only.

## 4D AABB slab method

For axis \(k\in\{x,y,z,w\}\):

\[
t_{1}^{k}=\frac{\min_{k}-o_{k}}{d_{k}},\quad
t_{2}^{k}=\frac{\max_{k}-o_{k}}{d_{k}}
\]

\[
t_{\mathrm{enter}}=\max_{k}\min(t_{1}^{k},t_{2}^{k}),\quad
t_{\mathrm{exit}}=\min_{k}\max(t_{1}^{k},t_{2}^{k})
\]

Hit iff \(t_{\mathrm{enter}}\le t_{\mathrm{exit}}\) and \(t_{\mathrm{exit}}\ge 0\). Use a small \(\varepsilon\) when \(d_{k}\approx 0\).

CPU reference: `HyperBox.intersect` and `intersectAABB4D` in `accel/gpu/bvh4dPacked.js`.

## `BVHNode4D` layout (AoS)

| Field | Type | Meaning |
| --- | --- | --- |
| `minBounds` | float4 | AABB min |
| `maxBounds` | float4 | AABB max |
| `leftChild` | int | Internal left (−1 if none) |
| `rightChild` | int | Internal right |
| `firstPrim` | int | Leaf primitive start |
| `primCount` | int | Leaf count (>0 ⇒ leaf) |

Pack from JS builder: `packBVH4D(bvh)` ← `BVH4D` nodes.

## Memory: AoS nodes + SoA rays

| Buffer | Layout | Why |
| --- | --- | --- |
| Nodes | **AoS** `BVHNode4D[]` | Whole node read per visit |
| Ray origins / dirs | **SoA** `float4 origins[N]`, `float4 dirs[N]` | Coalesced per-thread loads |
| Hits | AoS `HitRecord[]` or SoA `t[]` + `primId[]` | Writer-friendly |

## Primitive intersections (device stubs)

**Hypersphere** center \(c\), radius \(r\):

\[
\|o+td-c\|^{2}=r^{2}
\]

**Hyperplane** \(n\cdot x = \mathrm{offset}\):

\[
t=\frac{\mathrm{offset}-n\cdot o}{n\cdot d}
\]

Sources: `native/cuda/rt4d/bvh4d_kernel.cuh`, JS sketches under `accel/gpu/`.

## Extend `intersectPrimitive4D`

1. Pack a prim-type table + params from CPU scene.  
2. In device code, switch on type → sphere / plane / mesh.  
3. Keep CPU `traverseBVH4DPacked(..., primIntersect)` as parity oracle.

## Evidence

| Claim | Status |
| --- | --- |
| CPU BVH build/traverse | **partial** (`BVH4D.js`) |
| Packed GPU-shaped CPU traverse | **skeleton** (`accel/gpu/`) |
| CUDA binary in CI | **declared** (not built) |
