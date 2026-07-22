# Native CUDA RT4D BVH (skeleton)

**Status:** **skeleton** — headers and kernel sketches only. Not built by `npm test`.

| File | Role |
| --- | --- |
| `bvh4d_kernel.cuh` | `BVHNode4D`, `HitRecord`, AABB / hypersphere / hyperplane device funcs |
| `traverse.cu` | `traverseBVH4D` kernel (requires `__CUDACC__` + `intersectPrimitive4D`) |

JS bridge (CPU packed traverse + same math): `4d-renderer/src/render/rt4d/accel/gpu/`  
Docs: `docs/4drs/substrate/BVH4D_GPU.md`

## Extending `intersectPrimitive4D`

Provide a device function that maps `primId` → type + parameters (sphere center/radius, plane n/offset, …) and calls `intersectHyperSphere4D` / `intersectHyperPlane4D`. Host builds the parameter buffers when packing the scene from JS `BVH4D` / primitives.

## Optional local build

```bash
# Requires CUDA toolkit
nvcc -c native/cuda/rt4d/traverse.cu -o /tmp/traverse.o
# plus your intersectPrimitive4D.cu
```
