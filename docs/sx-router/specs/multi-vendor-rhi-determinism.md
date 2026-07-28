# Multi-Vendor RHI Determinism Specification (2026-08)

**Artifact:** `docs/sx-router/specs/multi-vendor-rhi-determinism.md`  
**Status:** **declared** / **Draft** (specification only — not enforced in runtime)  
**Scope:** CUDA, HIP, WebGPU, Vulkan (assist paths; never print SoT today)  
**Related charter:** `docs/governance/cecp/charters/gpu-integrator-promotion-charter.md` (future draft)

## 1. Deterministic Requirements

All RHIs **must** support (eligibility requirements for future promotion — **declared**):

- Deterministic command buffer submission
- Deterministic shader execution
- Deterministic memory layout
- Deterministic texture sampling
- Deterministic floating-point mode (FP32 strict)
- Deterministic barrier semantics

## 2. Vendor-Specific Constraints

### NVIDIA (CUDA)

- Disable warp-level nondeterministic ops
- Enforce strict FP32
- Disable TensorCore stochastic modes
- Deterministic block scheduling

### AMD (HIP/ROCm)

- Deterministic wavefront scheduling
- Strict FP32
- Disable XNACK nondeterministic fallback
- Deterministic LDS access

### WebGPU

- Deterministic WGSL execution
- Deterministic bind group ordering
- Deterministic texture sampling
- Deterministic compute dispatch

### Vulkan

- Deterministic pipeline state
- Deterministic descriptor sets
- Deterministic memory barriers
- Deterministic queue submission

## 3. Cross-Vendor Parity Contract

All RHIs must produce identical results under:

- Same seed
- Same SceneSpec
- Same integrator parameters
- Same sampling strategy

**Drive-G-1:** Identical-result requirement is a **declared** contract goal — not
measured live multi-host parity today.

## 4. Evidence Requirements

Each RHI must produce:

```text
receipt:
  seed
  frameHash
  replayHash
  rhi: cuda|hip|webgpu|vulkan
  vendor: nvidia|amd|neutral
  driverVersion
```

## Ban

This spec does **not** authorize GPU print SoT or reclassify
`gpu.integrator.deterministic` (or any `gpu.*`) as authoritative.
