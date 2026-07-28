# GpuAssistModule Specification

> **CECP Status:** Draft → Review → **PROMOTE_WITH_GAPS**  
> **Author:** Jon Halstead  
> **Constitutional Domain:** Sovereign X Router  
> **Namespace:** `sx.router.module.gpu.assist`  
> **Implementation status:** **partial** (stubs); no live GPU.

## Purpose

Provide multi-vendor GPU assist paths (NVIDIA + AMD) for look-dev, SceneSpec assist, and embeddings, under Sovereign X Router governance.

## Public API

- `handleLookDev(request)`
- `handleSceneSpecAssist(request)`
- `handleEmbeddings(request)`

## Inputs

- `request.intentId`
- `request.modality`
- `request.determinismRequired`
- `request.vendorPreference`

## Behavior

- If `determinismRequired = true`:
  - Route to `cpu.rt4d.print`.
- Else:
  - If `vendorPreference = nvidia`:
    - Route to `gpu.gen.nvidia.nim_flux` or `gpu.inference.nvidia.tao`.
  - If `vendorPreference = amd`:
    - Route to `gpu.inference.amd.rocm` or `gpu.compute.amd.hip`.
  - If `vendorPreference = neutral`:
    - Prefer NVIDIA when available, else AMD.

## Governance

- All GPU outputs are tagged `assistOnly = true`, `nonAuthoritative = true`.
- No GPU output enters the Digital Printer evidence chain.
