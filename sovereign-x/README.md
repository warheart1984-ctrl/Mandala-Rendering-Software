# Sovereign X Router — GPU-Assisted Capabilities

## Overview

Sovereign X Router now supports governed, assist-only GPU capabilities for look-dev, SceneSpec assistance, and AI services, while preserving CPU PathTracer4D as the sole print source-of-truth.

**Status (Drive-G-1):** registration + contract stubs **partial**; live GPU invoke **declared**/not shipped; print GPU **banned**.

## GPU Capability Classes

- `gpu.gen.nvidia.nim_flux` — NVIDIA NIM/FLUX image/video generation (assist).
- `gpu.inference.nvidia.tao` — TAO-hosted LLM/VLM/inference (assist).
- `gpu.compute.nvidia.cuda` — CUDA compute (denoise, upscale, parity) (assist).
- `gpu.inference.amd.rocm` — ROCm-hosted inference (assist).
- `gpu.compute.amd.hip` — HIP compute (assist).
- `gpu.integrator.deterministic` — prototype deterministic assist integrator (**declared**; never print SoT).
- `cpu.rt4d.print` — deterministic PathTracer4D print (authoritative).

## Determinism & Governance

- Deterministic intents (`determinismRequired=true`) must route to `cpu.rt4d.print`.
- GPU outputs are tagged `assistOnly=true`, `nonAuthoritative=true`.
- Only CPU RT4D participates in the Digital Printer evidence chain.
- Seed contract for assist harness: mulberry32 + stratified sampling — **declared** (see trail `gpu-determinism-2026-09`).

## Modules

- `router/modules/gpu/gpuAssistModule.js` — multi-vendor GPU assist routing (+ `handleFluxImageIngest`).
- `router/modules/gpu/assist/lookDevEngine.js` — GPU-powered look-dev engine (`run` / `runFromImage`).
- `router/modules/gpu/assist/fluxSceneSpecExtractor.js` — draft SceneSpec from FLUX ingest (**declared**).
- `skills/nvidia-gpu-assist/flux_generate.js` — NIM FLUX shell image ingest skill (assist-only).
- `router/modules/gpu/integrator/deterministicGpuIntegrator.js` — prototype assist integrator (mulberry32).
- `router/contracts/gpuDispatchContract.js` — dispatch rules for GPU vs CPU.
- `router/registry/gpuSkillsRegistry.json` — binding to NVIDIA/AMD skills + declared integrator.

## Lookdev-from-image

See `docs/sx-router/specs/lookdev-from-image.md`.

```bash
npm run sx:flux-image -- --image ./still.png --dry-run
npm run sx:capabilities -- inspect-flux-image
```

## Face Creation Assist

See `docs/governance/cecp/trails/face-creation-assist-2026-07/`.

```bash
npm run sx:face-creation -- --prompt "hero face" --dry-run
```

FX-8350 CPU tuning (declared only): `docs/sx-router/specs/rt4d-amd-fx8350-tuning.md`.

## Roadmap trails

- Phase 1 (Done / PR #83): `docs/governance/cecp/trails/vendor-gpu-integration-2026-07/`
- vNext Phases 1–4: `docs/governance/cecp/trails/sx-router-vNext-2026-08/`
- Determinism promotion (Draft): `docs/governance/cecp/trails/gpu-determinism-2026-09/`

## Package entry

npm package `@mrs/sovereign-x-router` re-exports from this tree (`sovereign-x/` is canonical SoT).

## Skills (reload after install)

- `~/.agents/skills/nvidia-gpu-assist/`
- `~/.agents/skills/amd-gpu-assist/`

For constitutional details, see `docs/governance/cecp/trails/vendor-gpu-integration-2026-07/`.
