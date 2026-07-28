# CECP Promotion Packet — Vendor GPU Integration (Sovereign X Router)

Trail: `cecp.trail.vendor-gpu-integration-2026-07`  
Status: **PROMOTE_WITH_GAPS**  
Author: Jon Halstead  
Domain: Sovereign X Router (Compute / Capability Layer)

## 1. Scope

This trail introduces governed, assist-only GPU capabilities (NVIDIA + AMD) into the Sovereign X Router:

- `gpu.gen.nvidia.nim_flux`
- `gpu.inference.nvidia.tao`
- `gpu.compute.nvidia.cuda`
- `gpu.inference.amd.rocm`
- `gpu.compute.amd.hip`

CPU PathTracer4D (`cpu.rt4d.print`) remains the sole authoritative print source-of-truth.

## 2. Artifacts

- `docs/sx-router/specs/gpu-capability-map.md`
- `docs/sx-router/specs/gpu-assist-module.md`
- `docs/sx-router/specs/gpu-dispatch-contract.md`
- `docs/sx-router/specs/gpu-integration-charter.md`
- `docs/sx-router/specs/gpu-lookdev-engine.md`
- `sovereign-x/router/modules/gpu/gpuAssistModule.js`
- `sovereign-x/router/modules/gpu/assist/lookDevEngine.js`
- `sovereign-x/router/contracts/gpuDispatchContract.js`
- `sovereign-x/router/registry/gpuSkillsRegistry.json`
- `sovereign-x/README.md`
- `sovereign-x/cli/sx-capabilities.js`
- `sovereign-x/tests/gpuParitySuite.test.js`
- `docs/governance/cecp/trails/vendor-gpu-integration-2026-07/ciems-v2-gpu-integration-diagram.md`
- `~/.agents/skills/nvidia-gpu-assist/` (host skill stubs; reload after install)
- `~/.agents/skills/amd-gpu-assist/` (host skill stubs; reload after install)
- Package: `mrs/packages/sovereign-x-router` (re-exports from `sovereign-x/`)

## 3. Constitutional Guarantees

- GPU backends are **assist-only** until parity and evidence are proven.
- Only `cpu.rt4d.print` participates in the Digital Printer evidence chain.
- Deterministic intents must route to `cpu.rt4d.print`.
- Vendor neutrality: router supports NVIDIA and AMD; no protocol lock-in.

## 4. Gaps (Explicit)

- No GPU print backend.
- No GPU determinism receipts for print.
- No ROCm/HIP kernels in RT4D.
- No WebGPU/Dawn printer path.
- Live NVIDIA/AMD skill invoke not wired from Node router (in-process stubs only).
- Parity suite is **skeleton** (SSIM/MSE cases skipped until real plates exist).

## 5. Promotion Decision

Verdict: **PROMOTE_WITH_GAPS**

- Artifacts are accepted into CIEMS/CECP as governed assist capabilities.
- Gaps are documented and must be closed by future trails before any GPU print claim.
