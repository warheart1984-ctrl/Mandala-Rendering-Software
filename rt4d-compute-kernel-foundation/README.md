# RT4D compute kernel foundation — diagnostic substrate

Bounded CPU/Vulkan diagnostic library extracted for governed GPU evidence.
This directory is **not** a renderer. Review packets and parity receipts are
the canonical unit of evidence. Pixel output has no authority.

## Status

| Capability | Status | Evidence |
|---|---|---|
| Shared Vulkan diagnostic dispatcher | `enforced` on lavapipe | Instance/device/validation/buffers/dispatch isolated from any renderer |
| Pentachoron BVH GPU diagnostic | `enforced` on lavapipe | 24 primitives, 31 nodes, 143 rays, 131 hits, maxDelta 0, validation 0/0 |
| Intake GPU parity receipt | `enforced` on lavapipe | Combined CPU+GPU receipt; `--require-gpu` available |
| Clean-algebra matvec | `enforced` on lavapipe | `y_i = sum_j A_ij x_j`, M=257 N=64, maxAbsDelta 0 |
| RX 480 / RADV oracle | `unavailable` here | This environment has no discrete GPU |
| Renderer overlay | `unavailable` | Explicitly blocked |

`enforced` on lavapipe means CPU/GPU parity and zero validation messages were
recorded in this environment. It does not mean production deployment, RX 480
coverage, or renderer authority. Overlay remains blocked.

## Build and verify

```bash
cmake -S . -B build \
  -DCMAKE_BUILD_TYPE=Release \
  -DBUILD_TESTING=ON \
  -DRT4D_RUN_LIVE_GPU_KERNEL_TESTS=ON
cmake --build build --parallel
ctest --test-dir build --output-on-failure
```

Intake:

```bash
RT4D_KERNEL_SPIRV_DIR=build/spirv \
  ./build/rt4d_pentachoron_intake \
  fixtures/pentachora-v0.1.rt4d \
  receipts/rt4d-pentachoron-intake-v0.1.json
```

`--require-gpu` fails intake when `gpuParity` is not `passed`. Without it,
CPU diagnostics still publish and `gpuParity` may be `unavailable`.

## Boundary

- Do not link this library into production command buffers.
- FNV is not used as an integrity claim.
- Overlay, tiling/fusion, sidecar-v2, and review-packet verifier are later layers.
