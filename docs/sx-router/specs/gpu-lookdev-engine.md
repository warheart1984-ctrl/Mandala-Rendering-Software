# SovereignLookDevEngine Specification

> **CECP Status:** Draft → Review → **PROMOTE_WITH_GAPS**  
> **Author:** Jon Halstead  
> **Constitutional Domain:** Sovereign X Router  
> **Namespace:** `sx.router.module.gpu.assist.lookDevEngine`  
> **Implementation status:** **declared** / **skeleton**.

## Purpose

Provide a multi-vendor GPU-powered look-dev engine that accelerates creative exploration while preserving CPU RT4D as the print source-of-truth.

## Inputs

- Prompt
- Reference image
- SceneSpec
- RT4D frame

## Pipeline

1. Concept Generation
   - Route via `gpu.gen.nvidia.nim_flux` or `gpu.inference.amd.rocm`.
2. GPU Post-Processing (Optional)
   - Route via `gpu.compute.nvidia.cuda` or `gpu.compute.amd.hip` for denoise/upscale/stylize.
3. SceneSpec Hinting (Optional)
   - Route via `gpu.inference.nvidia.tao` or `gpu.inference.amd.rocm` for camera/lighting/material hints.
4. Human Curation
   - Operator selects and edits hints into a final SceneSpec.
5. Authoritative Print
   - SceneSpec → `cpu.rt4d.print` → Digital Printer evidence chain.

## Tags

- Steps 1–3:
  - `assistOnly = true`
  - `nonAuthoritative = true`
- Step 5:
  - `assistOnly = false`
  - `authoritative = true`
  - governed by print contracts.
