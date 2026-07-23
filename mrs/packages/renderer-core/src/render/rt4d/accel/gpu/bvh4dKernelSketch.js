/**
 * GPU BVH kernel sources for 4D ray tracing.
 *
 * Production kernels:
 *   bvh4d_cuda.cu  — CUDA compute kernel (nvcc -arch=sm_70)
 *   bvh4d.wgsl     — WebGPU/WGSL compute shader
 *
 * CPU reference & GPU upload helpers:
 *   bvh4dPacked.js — packBVH4D(), flattenBVH4DNodes(), createBVH4DGPUBuffers(),
 *                     traverseBVH4DPacked(), intersectAABB4D()
 */

export const BVH4D_CUDA_KERNEL_SOURCE = `// See bvh4d_cuda.cu for production kernel`;

export const BVH4D_WGSL_KERNEL_SKETCH = `// See bvh4d.wgsl for production shader`;
