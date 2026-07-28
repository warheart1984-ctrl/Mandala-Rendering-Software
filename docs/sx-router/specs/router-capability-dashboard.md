# Sovereign X Router — Capability Dashboard

**Artifact:** `docs/sx-router/specs/router-capability-dashboard.md`  
**Status:** **declared** (documentation dashboard; not a live UI)  
**Domain:** Sovereign X Router — Compute / Capability Layer  
**Related:** `vendor-gpu-integration-2026-07`, `gpu-determinism-phase1-2026-08`  
**Drive-G-1:** Registry authority tags below match `sovereign-x/router/registry/gpuSkillsRegistry.json`. Do not treat this doc as runtime enforcement.

## Authoritative Capabilities (Print SoT)

| Capability | Backend | Authority | Notes |
|------------|---------|-----------|-------|
| `cpu.rt4d.print` | CPU PathTracer4D | **Authoritative** | Deterministic, evidence-bound, constitutional SoT |

## GPU Assist Capabilities (Governed)

| Capability | Vendor | Class | Authority | Mode |
|------------|--------|-------|-----------|------|
| `gpu.gen.nvidia.nim_flux` | NVIDIA | Generation | Assist | lookdev |
| `gpu.inference.nvidia.tao` | NVIDIA | Inference | Assist | scenespec |
| `gpu.compute.nvidia.cuda` | NVIDIA | Compute | Assist | denoise/upscale/parity |
| `gpu.inference.amd.rocm` | AMD | Inference | Assist | lookdev/scenespec |
| `gpu.compute.amd.hip` | AMD | Compute | Assist | denoise/parity |
| `gpu.integrator.deterministic` | Neutral | Compute | Assist (**declared** / prototype) | parity harness |

## Router Modes

| Mode | Description | Allowed Backends |
|------|-------------|------------------|
| `print` | Deterministic RT4D | CPU only |
| `assist` | GPU creative compute | NVIDIA/AMD |
| `lookdev` | GPU concept generation | NVIDIA/AMD |
| `scenespec` | GPU VLM assistance | NVIDIA/AMD |
| `parity` | CPU↔GPU comparison | CPU + GPU (assist plates only) |
| `diagnostic` | Capability inspection | All |

## Governance Status

- GPU = assist-only
- CPU RT4D = authoritative print SoT
- No GPU print claims
- Vendor neutrality enforced at registry/protocol layer (**declared**/partial)
- Determinism boundaries preserved (`determinismRequired` → `cpu.rt4d.print`)

## Anti-overclaim

This dashboard does **not** claim live CUDA/HIP/NIM/ROCm invoke, enforced print
parity, or GPU Digital Printer SoT.
