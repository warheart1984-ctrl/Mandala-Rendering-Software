# Photoreal-on-Legacy-GPU — R9 380 / Mandala

> **Title:** The 3-Layer Path That Beats Bigger GPUs (Mathematically, Not Mythically)  
> **Thesis:** Win by reducing FLOPs required for the same useful output — not by pretending an AMD Radeon R9 380 out-FLOPS an RTX 4090.  
> **Status:** architecture **declared**; SX route + Lemonade SD/SDK **adapters** + OpenCL Tonga still **partial**; Lemonade SDK **live chat** **partial** (Vulkan GGUF proven); Lemonade SD *generation* on this host **blocked**; HIP SDK install **partial** (`hipSdkProbe` + `hipcc` 7.1); HIP **beauty.hip** **partial** (hello + `hip_beauty_stub` compile proven; device runtime **blocked** on Tonga).  
> **Trail:** `docs/governance/cecp/trails/sx-legacy-efficient-3layer-2026-07/`  
> **Advance notes:** `07-advance-partial-lemonade-opencl.md`, `08-advance-lemonade-sdk-hip-vendor.md`, `09-lemonade-sdk-live-chat-adapter.md`, `10-cycle-rerun.md`, `11-cycle-rerun.md`  
> **SDK chat guide:** `docs/4d-engine/LEMONADE_SDK_CHAT.md`

---

## Core equation (normative)

\[
\frac{\text{Value}}{\text{sec}} = \frac{\text{Useful work}}{\text{Time}}
= \left(\frac{\text{Useful FLOPs}}{\text{Total FLOPs}}\right)
\cdot \left(\frac{\text{Total FLOPs}}{\text{Time}}\right)
\]

| Term | R9 380 vs RTX 4090 |
|------|---------------------|
| Total FLOPs / Time | **Cannot** beat a 4090 (honest limit). |
| Useful FLOPs / Total FLOPs | **Can** raise radically via Layers 1–3. |

Combined effective gain on *governed sparse workloads* (illustrative, not measured vs 4090):

\[
1.5_{\text{gov}} \cdot 3_{\text{algo}} \cdot 2_{\text{mem}} \approx 9\times
\]

effective vs wasteful dense unguided big-GPU runs — **mathematically, not mythically**.

---

## Layer 1 — Algorithmic Reduction (3–10× effective) — **declared** math / **partial** foothold

| Technique | Formula | Example |
|-----------|---------|---------|
| Sparse | \(\mathrm{FLOPs}_{eff} = p \cdot \mathrm{FLOPs}_{dense}\) | \(p=0.1 \Rightarrow 10\times\) |
| Low-rank | \(nm\) vs \(k(n+m)\) | \(n=m=1024,\,k=64 \Rightarrow \sim8\times\) |
| Adaptive res | \(0.2N + 0.8(N/8) = 0.3N\) | \(\sim3.3\times\) |

**Foothold metric:** tile occupancy / useful fraction (sparse salience gate).

## Layer 2 — Memory Efficiency (2–4× effective) — **declared**

When memory-bound: \(\mathrm{FLOPs/sec}_{eff} = B/b\). Halve bytes-per-FLOP \(b\) via tiling / locality / compression → ~2×.  
A 4090 doing dense waste can lose to a 380 doing sparse + tiled + low-rank on *real* useful work.

## Layer 3 — Governance (1.5–3× effective) — **partial** (SX + intent gate)

| Quantity | Meaning |
|----------|---------|
| Work_total | All candidate tiles / kernels |
| Work_approved | Intent + evidence gate passed |
| Work_waste | Denied or never scheduled |

Naive useful fraction 0.6 → governed 0.9 = **1.5×**.  
Bind waste filter to MRS constitutional *consumers* (intent, evidence, CKL policies) — **do not** edit protected charter files for this path. Status: gate in SX route is **partial** (intent required); CKL policy load remains existing **enforced** runtime elsewhere.

---

## Host capability (R9 380) — probe 2026-07-29/30

| Surface | Result | Tag |
|---------|--------|-----|
| GPU | AMD Radeon R9 380 Series, ~4 GiB device-local, GCN Tonga | enforced-detect |
| Vulkan | API 1.2.170, heaps ~3.75 / 7.70 / 0.25 GiB, subgroup 64 | enforced-detect |
| OpenCL | 2.0 AMD-APP, 28 CUs @ 980 MHz, 4 GiB global; **kernel still OK** | **partial** (still proof) |
| DirectX | DDI 12, Feature Levels 12_0…, WDDM 2.7 | enforced-detect |
| ROCm/HIP | SDK at `C:\Program Files\AMD\ROCm\7.1` (`hipcc` **partial**); hello + `hip_beauty_stub` compile `--offload-arch=gfx803` **partial**; `amdgpu-arch` / `hipInfo` **no device** on Tonga; `vendor/HIP` headers pin remains | SDK **partial** / beauty.hip **partial** (compile) / runtime **blocked** |
| Lemonade server | Up on :13305 (v11.5.0); :8000 down on this host | **partial** (server) |
| Lemonade SD adapter | Probe/cascade/retries on multimodal API | **partial** (adapter) |
| Lemonade SDK chat adapter | OpenAI `/chat/completions` + ensureModel/stream; probes :8000 then :13305 | **partial** (live chat proven w/ Llama-3.2-1B Vulkan) |
| Lemonade SD gen | SD-Turbo / GGUF `sd-server` fail; AVX2 CPU binary ILLEGAL_INSTRUCTION on FX-8350 | **blocked** |

Proofs: `docs/4d-engine/proofs/legacy-efficient/`  
(`opencl-tonga-still.png`, `lemonade-capability-report.json`, `lemonade-sdk-capability-report.json`, `lemonade-sdk-live-chat-proof.json`, `upstream-vendor-pins.json`, `hip-sdk-detection-report.json`, `hip-hello-compile-run-proof.json`, `hip-beauty-stub-compile-run-proof.json`, `cycle-rerun-2-summary.json`, `sx-route-proof.json`).

Upstream clones (gitignored): `vendor/lemonade` @ `044138de…`, `vendor/HIP` @ `1377114f…`.

**HIP re-probe (after installer):** `node sovereign-x/cli/sx-hip-sdk-probe.mjs`  
**HIP hello compile:** `hipcc scripts/legacy-efficient/hip_hello.hip -o docs/4d-engine/proofs/legacy-efficient/hip_hello.exe --offload-arch=gfx803`  
**HIP beauty stub:** `hipcc scripts/legacy-efficient/hip_beauty_stub.hip -o docs/4d-engine/proofs/legacy-efficient/hip_beauty_stub.exe --offload-arch=gfx803`

---

## SX Integration (spine → router)

| Layer | SX surface | Status |
|-------|------------|--------|
| L1 sparse / adaptive | `gpu.compute.amd.legacy_efficient` → `legacyEfficientBeauty.js` | **partial** |
| L2 tiling / bytes-FLOP | metrics `bytesPerFlopEstimate` | **declared** estimate |
| L3 governance | `intentId` required; print safeguard | **partial** |
| Lemonade SD adapter | `lemonadeSdAdapter.js` via `--still` / `--probe-lemonade` | **partial** (adapter); gen **blocked** |
| Lemonade SDK chat | `lemonadeSdkChatAdapter.js` (+ façade) via `--provider lemonade-sdk` / `--probe-lemonade-sdk` / `--chat` | **partial** (live) |
| OpenCL beauty still | `openclLegacyStill.js` + `scripts/legacy-efficient/opencl_tonga_still.py` | **partial** |
| Authoritative print | `cpu.rt4d.print` only | **declared** hand-off |
| AMD ROCm/HIP assist | `gpu.compute.amd.hip` + `hipSdkProbe.js` + `hip_hello.hip` + `hip_beauty_stub.hip` | SDK **partial**; beauty.hip **partial** (compile); device runtime **blocked** on Tonga |
| NVIDIA assist | `gpu.gen.nvidia.nim_flux`, CUDA compute | **declared** / **partial** |
| Deterministic integrator | `gpu.integrator.deterministic` | **declared** prototype |
| Engine3D structure | `@mrs/engine3d-core` soft-raster AOVs | **partial** (Ch1) |

### Invoke

```bash
# Schedule metrics only
node sovereign-x/cli/sx-legacy-efficient.mjs --intent demo-legacy-1 --width 64 --height 64 --tile 8 --p 0.1

# Beauty still: Lemonade then OpenCL (on this host OpenCL wins)
node sovereign-x/cli/sx-legacy-efficient.mjs --intent demo --still --provider auto

# OpenCL-only still (recommended on R9 380 + FX-8350)
node sovereign-x/cli/sx-legacy-efficient.mjs --intent demo --still --provider opencl --width 128 --height 128

# Lemonade SD capability probe (adapter partial; generation likely blocked)
node sovereign-x/cli/sx-legacy-efficient.mjs --probe-lemonade

# Lemonade SDK OpenAI chat probe (:8000 then :13305)
node sovereign-x/cli/sx-legacy-efficient.mjs --probe-lemonade-sdk
node sovereign-x/cli/sx-legacy-efficient.mjs --intent demo --provider lemonade-sdk --chat "Reply with exactly: OK"
node sovereign-x/cli/sx-lemonade-sdk-live-proof.mjs
# See docs/4d-engine/LEMONADE_SDK_CHAT.md

npm run sx:capabilities -- list
npm run sx:capabilities -- inspect gpu.compute.amd.legacy_efficient
```

When host reports `legacyGcn` / R9 380 / Tonga, prefer this capability over dense NVIDIA assist for *local* efficient beauty prototypes.

---

## Inventory (hooks)

| Area | Path | Tag |
|------|------|-----|
| SX router | `sovereign-x/router/index.js` | partial |
| Legacy efficient | `sovereign-x/router/modules/gpu/amd/legacyEfficientBeauty.js` | partial |
| Lemonade SD adapter | `sovereign-x/router/modules/gpu/amd/lemonadeSdAdapter.js` | partial |
| Lemonade SDK chat | `sovereign-x/router/modules/gpu/amd/lemonadeSdkChatAdapter.js` | partial (live) |
| HIP SDK probe | `sovereign-x/router/modules/gpu/amd/hipSdkProbe.js` | partial when installed; beauty.hip partial w/ hello + beauty stub proofs |
| HIP hello / beauty stub | `scripts/legacy-efficient/hip_hello.hip`, `hip_beauty_stub.hip` | compile **partial**; device run **blocked** |
| Upstream pins | `vendor/lemonade`, `vendor/HIP` (gitignored) | pin only |
| OpenCL bridge | `sovereign-x/router/modules/gpu/amd/openclLegacyStill.js` | partial |
| OpenCL script | `scripts/legacy-efficient/opencl_tonga_still.py` | partial |
| SX registry | `sovereign-x/router/registry/gpuSkillsRegistry.json` | declared + legacy meta |
| Genblaze Lemonade | `mrs/apps/genblaze-media/app/lemonade_provider.py` | partial / host blocked for SD |
| Vulkan RHI | `mrs/packages/renderer-core/src/render/rhi/VulkanRhi.js` | skeleton |
| GPU detect | `scripts/detect-gpu-backend.py` | partial |

---

## Honest limits

- No claim of absolute photoreal throughput vs RTX 40xx.
- Lemonade diffusion does **not** load on this card/CPU (probed: `model_load_error` + AVX2 crash).
- Lemonade SDK chat path is **partial** with live proof on this host (`Llama-3.2-1B-Instruct-GGUF` + `llamacpp:vulkan`). Official OpenAI base is `:13305/api/v1`; `:8000` is probed first but is down here. Guide: `LEMONADE_SDK_CHAT.md`.
- HIP SDK is **partial** after install (`C:\Program Files\AMD\ROCm\7.1`, `hipcc`). Hello + `hip_beauty_stub` compile are **partial** evidence (`hip-hello-compile-run-proof.json`, `hip-beauty-stub-compile-run-proof.json`, `--offload-arch=gfx803`). Device runtime on Tonga is **blocked** (`hipGetDeviceCount` status 100 / count 0). OpenCL still remains the proven GPU beauty stand-in (**partial**).
- OpenCL still is a deterministic kernel gradient sphere — assist beauty proof, not print SoT.
