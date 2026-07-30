# 10 — Cycle re-run (Lemonade SDK live + HIP SDK 7.1 + hello compile)

| Field | Value |
|-------|-------|
| `trailId` | `sx-legacy-efficient-3layer-2026-07` |
| `noteId` | `10-cycle-rerun` |
| `date` | 2026-07-30 |
| `intent` | `cycle-rerun-1` |
| `roles` | Implementor + mrs-crew (cycle re-run; no charter edits) |

## Intent

Re-run the full legacy-efficient / Lemonade / HIP cycle after Lemonade SDK live chat became **partial** and AMD HIP SDK 7.1 landed at `C:\Program Files\AMD\ROCm\7.1`.

## Commands (fresh PATH + `HIP_PATH` / `ROCM_PATH`)

```bash
set HIP_PATH=C:\Program Files\AMD\ROCm\7.1
set ROCM_PATH=C:\Program Files\AMD\ROCm\7.1
set PATH=%HIP_PATH%\bin;%PATH%

node sovereign-x/cli/sx-hip-sdk-probe.mjs
node sovereign-x/cli/sx-lemonade-sdk-live-proof.mjs
npm run sx:legacy-efficient -- --intent cycle-rerun-1
npm run sx:legacy-efficient -- --intent cycle-rerun-1 --provider lemonade-sdk --chat "Reply with exactly: OK"
npm run sx:legacy-efficient -- --intent cycle-rerun-1 --provider opencl --still
npm run sx:legacy-efficient -- --intent cycle-rerun-1 --provider hip
npm run sx:legacy-efficient -- --intent cycle-rerun-1 --provider auto --still
npm run sx:legacy-efficient -- --probe-lemonade
```

HIP hello compile proof:

```bash
hipcc scripts/legacy-efficient/hip_hello.hip -o docs/4d-engine/proofs/legacy-efficient/hip_hello.exe --offload-arch=gfx803
docs\4d-engine\proofs\legacy-efficient\hip_hello.exe
```

## What improved this cycle

| Surface | Before | After | Evidence |
|---------|--------|-------|----------|
| HIP SDK probe | partial (hipcc) | **partial** (reconfirmed; env set) | `hip-sdk-detection-report.json` |
| beauty.hip | **declared** | **partial** (compile only) | `hip-hello-compile-run-proof.json` |
| Lemonade SDK live chat | partial | **partial** (re-proven `"OK"`) | `lemonade-sdk-live-chat-proof.json` |
| OpenCL Tonga still | partial | **partial** (still OK) | `opencl-tonga-still.png` |
| Lemonade SD generation | blocked | **blocked** (honest) | `lemonade-capability-report.json` |
| HIP device runtime (Tonga) | blocked / TBD | **blocked** (`hipGetDeviceCount`=0) | hello run log + `hipInfo` |

## Proof paths

- `docs/4d-engine/proofs/legacy-efficient/hip-sdk-detection-report.json`
- `docs/4d-engine/proofs/legacy-efficient/hip-hello-compile-run-proof.json`
- `docs/4d-engine/proofs/legacy-efficient/lemonade-sdk-live-chat-proof.json`
- `docs/4d-engine/proofs/legacy-efficient/lemonade-capability-report.json`
- `docs/4d-engine/proofs/legacy-efficient/sx-route-proof.json`
- `docs/4d-engine/proofs/legacy-efficient/opencl-tonga-still.png`
- Source: `scripts/legacy-efficient/hip_hello.hip`

## Wiring

- `resolveHipBeautyKernelStatus()` advances `beauty.hip.kernelStatus` to **partial** when hello compile proof has `compile.ok`
- Device runtime remains honestly **blocked** on R9 380 / Tonga — OpenCL still is the proven beauty still path

## Remaining gaps

1. HIP **device** support on GCN Tonga (no ROCm-capable device)
2. Lemonade **SD** image generation (Tonga + AVX2 host blockers)
3. Photoreal vs 40-series throughput — **not claimed**
4. Authoritative print SoT — still CPU `cpu.rt4d.print` only (**declared** hand-off)

## Tests

```bash
node --test sovereign-x/tests/hipSdkProbe.test.js
node --test sovereign-x/tests/legacyEfficientBeauty.test.js
node --test sovereign-x/tests/lemonadeSdkChatAdapter.test.js
```
