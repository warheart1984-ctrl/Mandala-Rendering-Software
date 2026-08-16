# Mandala Constitutional Rendering Core

Constitutional 3D/4D renderer with RT4D CPU authority and assist-only GPU.

## 7-Stage High-Impact Upgrade Plan

1. **Temporal pass coherence**
   - Persist `RenderPassMetrics` across frames
   - Motion vectors + assist bundle reuse
   - Byte-identical replay across sequences

2. **Assist bundle fusion**
   - Fuse scheduler + memory algebra into one HIP kernel
   - Lower dispatch overhead, tighter thermal on gfx803

3. **Capability-aware wavefront tuning**
   - Use `CapabilityTarget` to set workgroup sizes & batch counts
   - RX 580 → wavefront 64, pad workgroups, enable subgroups

4. **RT4D pre-validation**
   - Replay last 3 frames via `replay_token`
   - Divergence → drop assist bundle, fall back to Vulkan

5. **SD Turbo as constitutional source**
   - SD Turbo GGUF → evidence → RT4D validate → rendergraph node
   - AI assets are replayable and auditable

6. **Memory algebra budgeting**
   - RT4D sets hard VRAM capacity per frame
   - Feed capacity back into `schedule_passes`

7. **Metrics export**
   - `ConstitutionalTrace` for `RenderPassMetrics`
   - Prove 8spp vs 2spp+denoise with replayability

## Core Components

1. Shaders — Material, Lighting, Geometry, Post, Compute
2. Textures — albedo, normal, roughness, metalness, height, procedural
3. Geometry — meshes, SDFs, procedural, instancing, particles
4. Camera — pos, orient, FOV, projection, motion vectors
5. Lighting — directional, point, spot, area, HDRI, emissive
6. Ray/Path Integrator — RT4D integrator
7. Acceleration Structures — BVH4D
8. Scene Graph — objects, transforms, materials, lights, cameras
9. Render Pipeline — BVH build → rays → shade → accumulate → denoise → tone map
10. Output / Framebuffer — color, depth, normal, motion, accumulation
11. Denoiser — OIDN / OptiX / custom neural / temporal
12. Backend / Compute Substrate — CPU, HIP/ROCm, OpenCL, CUDA, Vulkan
13. Math Kernel — vector, matrix, intersection, probability, sampling, BRDF, color
14. Constitution / Determinism — replay tokens, deterministic integrator, assist-only GPU, CPU authority, byte-identical output

## Modules

- `backend` — RenderBackendKind, select_render_backend, HipBackend
- `rendergraph` — metrics, scheduler, temporal cache, trace export
- `engine` — MandalaEngine with RT4D validation, memory budgeting, SD Turbo injection
- `sd_bridge` — SD Turbo GGUF runtime, constitutional validation

## Run

```bash
cargo run --example sd_generate --features hip
```

Constitutional rendering: GPU assists, CPU decides, everything replayable.
