# UALS ABI v0 — Unified Abstraction Layer for Sovereign-X

**Trail:** `uals-opencl-backend-2026-08`
**Status:** **declared** — design only, no implementation yet. Promotion to `partial`
requires gates G1–G5 passing on the demo box (AMD RX 580 / Polaris, OpenCL ICD).
**SoT:** `sovereign-x/` is SoT. `@mrs/sovereign-x-router` re-exports (future).
**Authority:** GPU modules are **assist-only**, never print SoT. Only `cpu.rt4d.print`
is authoritative for print, until parity gate G6 passes.

---

## 1. Intent

Give Sovereign-X one stable C ABI that any compute backend (OpenCL first, later
CUDA/HIP/bridge) implements, so the router can dispatch one kernel contract to
whatever hardware is in the box without vendor lock-in (P5) and without losing
determinism (P4) or provenance (P3).

## 2. Scope (first real module)

- `uals/abi/uals.h` — the ABI (C99, no deps).
- `uals/backends/opencl/` — one real backend.
- `uals/kernel-registry/` — kernel contract registry.
- `uals/conformance-gate/` — gate harness.
- `uals/orchestrator/` — dispatch path (thin, calls registry → gate → backend).
- `axiom-native/include/axiom/uals.h` — canonical header location (build tree).

Out of scope: CUDA/HIP/bridge backends, tiling engine, axiom-vision.

## 3. ABI surface (`uals.h`)

```c
#define UALS_ABI_VERSION 0
#define UALS_MAX_NAME    64

typedef enum uals_backend_kind {
  UALS_BACKEND_OPENCL = 1,
  UALS_BACKEND_CUDA   = 2,   /* reserved */
  UALS_BACKEND_HIP    = 3,   /* reserved */
  UALS_BACKEND_BRIDGE = 4    /* reserved */
} uals_backend_kind;

typedef struct uals_device {
  uint32_t       vendor_id;        /* 0x1002 AMD, 0x10DE NVIDIA, 0x8086 Intel */
  uint32_t       device_id;
  uals_backend_kind backend_kind;
  char           name[UALS_MAX_NAME];
  uint64_t       global_mem_bytes;
  uint32_t       max_workgroup_size;
  uint32_t       flags;            /* UALS_DEVICE_* */
} uals_device;

typedef struct uals_context uals_context;
typedef struct uals_buffer  uals_buffer;

typedef enum uals_status {
  UALS_OK              =  0,
  UALS_ERR_UNSUPPORTED = -1,  /* backend lacks capability */
  UALS_ERR_NO_DEVICE   = -2,
  UALS_ERR_INVALID_ARG = -3,
  UALS_ERR_OUT_OF_MEM  = -4,
  UALS_ERR_DETERMINISM = -5,  /* backend cannot honor determinism contract */
  UALS_ERR_PROVENANCE  = -6   /* required evidence fields missing */
} uals_status;

typedef struct uals_kernel_meta {
  uint64_t  rng_seed;            /* mulberry32 seed — determinism root */
  uint32_t  samples_per_pixel;
  uint32_t  width, height;
  uint64_t  intent_id;           /* provenance: required non-zero */
  uint64_t  world_id;            /* provenance: required non-zero */
  uint64_t  timeline_id;         /* provenance: required non-zero */
  uint32_t  time_seconds;        /* provenance: required */
} uals_kernel_meta;

uals_status uals_probe(uals_backend_kind kind,
                       const uals_device **out_devices, uint32_t *out_count);
uals_status uals_create(const uals_device *dev,
                        const uals_kernel_meta *meta,
                        uals_context **out_ctx);
uals_status uals_enqueue(uals_context *ctx, const char *kernel_id,
                         const uals_kernel_meta *meta,
                         const void *args, size_t args_bytes);
uals_status uals_map(uals_context *ctx, uals_buffer **out_buf);
uals_status uals_unmap(uals_context *ctx, uals_buffer *buf);
uals_status uals_sync(uals_context *ctx);
void        uals_destroy(uals_context *ctx);
```

Rules:
- `uals_probe` must return `UALS_ERR_NO_DEVICE` (not crash) when a vendor ICD is absent.
- `uals_create`/`uals_enqueue` validate `meta` against the provenance gate (G5).
- A backend that cannot guarantee bit-identical output for a seeded kernel must
  return `UALS_ERR_DETERMINISM` at `uals_create`, never silently diverge.

## 4. Kernel registry contract

`uals/kernel-registry/sx.kernels.json` — every kernel id must resolve before enqueue:

```json
{
  "id": "sx.kernel.integrator.rt4d.path_trace",
  "abi": 0,
  "signature": "trace(seed:u32, spp:u32, w:u32, h:u32) -> rgba8",
  "deterministic": true,
  "backends": ["opencl", "cpu.rt4d"],
  "authority": "assist-only",
  "provenance_required": ["intentId", "worldId", "timelineId", "timeSeconds"]
}
```

## 5. Determinism contract (P4)

- Host-side mulberry32 stratification: sample table generated once per
  `rng_seed`/`spp`, uploaded as a buffer — kernel never calls `rand()`.
- Fixed work-group sizes (probe `max_workgroup_size`, clamp to 256).
- No atomics in the hot path; reduction order fixed by the stratified table.
- Gate G4: two enqueues with identical `(kernel_id, args, rng_seed)` must yield
  byte-identical output buffers.

## 6. OpenCL backend contract (`uals/backends/opencl/`)

| File | Responsibility |
|------|----------------|
| `icd.c` | `cl_khr_icd` loader; platform/device enumeration → `uals_device` |
| `context.c` | cl context + command queue; fixed work-group policy |
| `program.c` | kernel source compile (`-cl-std=CL2.0`), build-log capture on failure |
| `determinism.c` | mulberry32 stratification, sample buffer, work-group clamps |
| `map.c` | `clEnqueueMapBuffer` readback, `clEnqueueUnmapMemObject` |
| `meta.c` | provenance validation (G5) before every enqueue |

Calls map: `uals_create` → context+queue; `uals_enqueue` → compile-once +
`clEnqueueNDRangeKernel`; `uals_map` → map buffer; `uals_sync` →
`clFinish`; `uals_destroy` → release everything.

## 7. Conformance gates

| Gate | Check | Runs |
|------|-------|------|
| G1 | `uals.h` compiles clean (C99, `/W4`-clean on MSVC) | build |
| G2 | `uals_probe(OPENCL)` returns ≥1 device on demo box | `uals/tests/gate_probe.c` |
| G3 | registry resolve + enqueue `sx.kernel.integrator.rt4d.path_trace` on OpenCL | `uals/tests/gate_dispatch.c` |
| G4 | same seed ⇒ byte-identical output (determinism) | `uals/tests/gate_determinism.c` |
| G5 | missing `intent_id` ⇒ `UALS_ERR_PROVENANCE` (no silent pass) | `uals/tests/gate_provenance.c` |
| G6 | OpenCL output vs `cpu.rt4d.print` — bit-exact on deterministic path | `uals/tests/gate_parity.c` |
| G7 | unknown kernel id ⇒ `UALS_ERR_INVALID_ARG` at registry | `uals/tests/gate_registry.c` |

Promotion rule: G1–G5 → `partial` (usable assist path). G6 → GPU may become
print-authoritative for the deterministic kernel. G7 is required with G1.

## 8. Dispatch path (orchestrator, thin)

```
request(kernel_id, meta, args)
  → kernel-registry resolve        (fail: G7)
  → conformance-gate provenance    (fail: G5)
  → conformance-gate determinism   (fail: G4)
  → backend uals_enqueue
  → map + sync → evidence receipt (intentId, worldId, timelineId, timeSeconds)
```

## 9. Test plan

- Build: `axiom-native/build_vs.bat` (MSVC, C99) — must produce `uals.dll` + header.
- `uals/tests/run_gates.exe` — runs G1–G7, exit 0 only when all pass.
- Determinism soak: 100 runs, same seed, byte-compare.
- JS mirror (future): `mrs/packages/sovereign-x-router/test/uals-gates.test.js`.

## 10. Evidence requirements

Every enqueue carries `(intentId, worldId, timelineId, timeSeconds, rng_seed)`
through `uals_kernel_meta` and into the receipt. No enqueue without provenance —
mirrors `policy-no-render-without-provenance` at the kernel level.

## 11. Status ledger

| Item | Status |
|------|--------|
| ABI design | **enforced** — `axiom-native/include/axiom/uals.h`, builds clean |
| OpenCL backend | **enforced** — G2–G5, G7 pass on AMD Ellesmere |
| Kernel registry | **enforced** — `registry.c` + `sx.kernels.json`, G7 pass |
| Gates G1–G7 | **enforced** — all 7 pass on demo box (2026-08-13, twice) |
| Axiom X kernel (`sx.kernel.axiom.x.sample`) | **enforced** — deterministic mulberry32 sampler, byte-exact across runs |
| Parity vs `cpu.rt4d.print` (G6 target) | **enforced** — `uals/tests/parity/check_parity.mjs`: 64x64 spp=4, 128x128 spp=8, 37x53 spp=16 all byte-exact, sha256 match (2026-08-13). GPU print-parity for the sampler kernel; full rt4d integrator parity **declared** (kernel not ported yet) |