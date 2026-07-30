# 11 — Cycle re-run 2 (fresh probes + beauty stub compile)

| Field | Value |
|-------|-------|
| `trailId` | `sx-legacy-efficient-3layer-2026-07` |
| `noteId` | `11-cycle-rerun` |
| `date` | 2026-07-30 |
| `intent` | `cycle-rerun-2` |
| `roles` | Implementor + mrs-crew (cycle re-run; no charter edits) |
| `prior` | `10-cycle-rerun.md` (`cycle-rerun-1`) |

## Intent

Fresh legacy-efficient / Lemonade / HIP cycle after cycle 10. Re-probe HIP SDK, Lemonade SDK live chat, SD capability, OpenCL still, and `sx:legacy-efficient` across providers. Advance something measurable if possible without false promotions.

## Commands (fresh PATH + `HIP_PATH` / `ROCM_PATH`)

```bash
set HIP_PATH=C:\Program Files\AMD\ROCm\7.1
set ROCM_PATH=C:\Program Files\AMD\ROCm\7.1
set PATH=%HIP_PATH%\bin;%PATH%

node sovereign-x/cli/sx-hip-sdk-probe.mjs
node sovereign-x/cli/sx-lemonade-sdk-live-proof.mjs
npm run sx:legacy-efficient -- --probe-lemonade
npm run sx:legacy-efficient -- --probe-lemonade-sdk
npm run sx:legacy-efficient -- --intent cycle-rerun-2 --provider auto --still
npm run sx:legacy-efficient -- --intent cycle-rerun-2 --provider opencl --still
npm run sx:legacy-efficient -- --intent cycle-rerun-2 --provider hip
npm run sx:legacy-efficient -- --intent cycle-rerun-2 --provider lemonade-sdk --chat "Reply with exactly: OK"
```

HIP compile proofs:

```bash
hipcc scripts/legacy-efficient/hip_hello.hip -o docs/4d-engine/proofs/legacy-efficient/hip_hello.exe --offload-arch=gfx803
hipcc scripts/legacy-efficient/hip_beauty_stub.hip -o docs/4d-engine/proofs/legacy-efficient/hip_beauty_stub.exe --offload-arch=gfx803
docs\4d-engine\proofs\legacy-efficient\hip_hello.exe
docs\4d-engine\proofs\legacy-efficient\hip_beauty_stub.exe
```

## Delta vs cycle 10

| Surface | Cycle 10 | Cycle 11 | Evidence |
|---------|----------|----------|----------|
| HIP SDK probe | partial | **partial** (reconfirmed) | `hip-sdk-detection-report.json` |
| beauty.hip / hello | partial (compile) | **partial** (reconfirmed) | `hip-hello-compile-run-proof.json` |
| HIP beauty stub | *(none)* | **partial** (new RGBA8 tile-fill compile) | `hip-beauty-stub-compile-run-proof.json` |
| Lemonade SDK live chat | partial | **partial** (re-proven `"OK"`, Vulkan) | `lemonade-sdk-live-chat-proof.json` |
| OpenCL Tonga still | partial | **partial** (still OK via auto/opencl) | `opencl-tonga-still.png` |
| Lemonade SD generation | blocked | **blocked** (HOST_LEGACY_GCN + sd-server) | `lemonade-capability-report.json` |
| HIP device runtime | blocked (`count=0`) | **blocked** (`status=100 count=0`) | hello + stub run logs |

**Measurable advance:** richer `hip_beauty_stub.hip` compiles with `hipcc --offload-arch=gfx803` (tile-fill kernel). Status tags for beauty.hip / SDK / SD / device runtime are **not** promoted.

## Proof paths

- `docs/4d-engine/proofs/legacy-efficient/cycle-rerun-2-summary.json`
- `docs/4d-engine/proofs/legacy-efficient/hip-sdk-detection-report.json`
- `docs/4d-engine/proofs/legacy-efficient/hip-hello-compile-run-proof.json`
- `docs/4d-engine/proofs/legacy-efficient/hip-beauty-stub-compile-run-proof.json`
- `docs/4d-engine/proofs/legacy-efficient/lemonade-sdk-live-chat-proof.json`
- `docs/4d-engine/proofs/legacy-efficient/lemonade-capability-report.json`
- `docs/4d-engine/proofs/legacy-efficient/lemonade-sdk-capability-report.json`
- `docs/4d-engine/proofs/legacy-efficient/sx-route-proof.json`
- `docs/4d-engine/proofs/legacy-efficient/opencl-tonga-still.png`
- Sources: `scripts/legacy-efficient/hip_hello.hip`, `scripts/legacy-efficient/hip_beauty_stub.hip`

## Remaining gaps

1. HIP **device** support on GCN Tonga (no ROCm-capable device; `hipGetDeviceCount` status 100 / count 0)
2. Lemonade **SD** image generation (Tonga outside sd-cpp ROCm families + sd-server fail)
3. Photoreal vs 40-series throughput — **not claimed**
4. Authoritative print SoT — still CPU `cpu.rt4d.print` only (**declared** hand-off)

## Tests

```bash
node --test sovereign-x/tests/hipSdkProbe.test.js
node --test sovereign-x/tests/legacyEfficientBeauty.test.js
node --test sovereign-x/tests/lemonadeSdkChatAdapter.test.js
node --test sovereign-x/tests/lemonadeSdkAdapter.test.js
```

Result this cycle: **27/27 pass**.
