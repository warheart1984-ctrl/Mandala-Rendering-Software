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
| SHA-256 evidence / packet verifier | `enforced` | `sha256("abc")` golden; overwrite, truncated, unwritable, `/dev/full` |
| Slice topologies + preview hashes | `enforced` | empty/event/tetrahedron/prism; `hypervolume4` vs `sliceVolume3`; raw-RGB SHA-256 |
| Sidecar v1 fuzz + v1→v2 migrator | `enforced` | Unknown records, NaN, truncated, duplicate provenance rejected; provenance preserved |
| Review-packet index + inspect CLI | `enforced` | `rt4d_slice_inspector` is inspect-only; pack is a separate diagnostic CLI |
| Read-only overlay | `enforced` as a non-authoritative view | Sync/perf/IQ gates; refuses sidecar/receipt/manifest/preview/obj paths |
| RX 480 / RADV oracle | `unavailable` here | This environment has no discrete GPU |

`enforced` on lavapipe means CPU/GPU parity and zero validation messages were
recorded in this environment. It does not mean production deployment, RX 480
coverage, or renderer authority. Overlay is a read-only diagnostic view and
is never ground truth (`overlayAuthoritative: false`).

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

Review packet (CPU-only):

```bash
./build/rt4d_packet_pack fixtures/pentachora-v0.1.rt4d /tmp/packets /tmp/index.json 0.25 1.0 2.0
./build/rt4d_review_packet_verifier /tmp/packets/w0.25/manifest.json
./build/rt4d_slice_inspector inspect /tmp/packets/w0.25/manifest.json
./build/rt4d_slice_inspector list /tmp/index.json
./build/rt4d_overlay_evaluate /tmp/packets/w0.25/manifest.json /tmp/overlay-view.json \
  --require-topology tetrahedron --require-non-empty
```

`--require-gpu` fails intake when `gpuParity` is not `passed`. Without it,
CPU diagnostics still publish and `gpuParity` may be `unavailable`.

## Boundary

- Do not link this library into production command buffers.
- FNV is debug-only and must not be used as an integrity claim. SHA-256 is the evidence chain.
- Overlay must not mutate sidecars, receipts, manifests, previews, or OBJ files.
- `hypervolume4` and `sliceVolume3` are distinct named metrics.
- Tiled/fused matvec is not claimed complete.
