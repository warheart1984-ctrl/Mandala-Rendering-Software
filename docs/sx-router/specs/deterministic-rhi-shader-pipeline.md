# Deterministic RHI Shader Pipeline Specification

**Artifact:** `docs/sx-router/specs/deterministic-rhi-shader-pipeline.md`  
**Status:** **declared** / **Draft** (spec only — no live RHI shader pipeline in-repo)  
**Scope:** CUDA, HIP, WebGPU, Vulkan shader pipelines used by the GPU integrator (assist).

## Deterministic Pipeline Requirements

- **Fixed pipeline configuration**
  - No runtime shader specialization that changes control flow.
  - All shaders compiled with strict FP32 and deterministic math flags.
- **Deterministic resource binding**
  - Fixed descriptor/bind group layouts.
  - Stable binding indices for all resources.
  - No unordered resource iteration.
- **Deterministic dispatch**
  - Fixed workgroup sizes and grid dimensions.
  - No data-dependent dispatch counts.
  - No adaptive sampling based on prior frames.
- **Deterministic memory access**
  - No atomics that depend on timing.
  - No race conditions on shared memory.
  - Barriers used in a fixed pattern.
- **Deterministic sampling**
  - Texture sampling with fixed LOD rules.
  - No stochastic sampling modes.
  - RNG seeded via seed contract only.

## Cross-Vendor Constraints

All RHIs must produce identical outputs for:

- Same SceneSpec.
- Same integrator parameters.
- Same seed.
- Same pipeline configuration.

**Drive-G-1:** Cross-vendor identity is a **declared** eligibility goal for future
promotion — not proven by live plates today.

## Evidence

Each pipeline execution must emit:

- `rhi`: cuda | hip | webgpu | vulkan
- `vendor`: nvidia | amd | neutral
- `driverVersion`
- `pipelineHash` (sha256 of shader + config)

## Ban

Does not authorize GPU print SoT. Assist-only until CECP promotion under
`gpu-integrator-promotion-charter.md` (future draft).
