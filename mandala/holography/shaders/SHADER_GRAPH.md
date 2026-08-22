# EFR Shader Graph (blueprint)

**Status:** **partial** — appearance shaders + alloc-once streaming CPU buffers exist; GPU Three.js / RX 580 raster is **declared** until shader fps is measured on a device via `watch.html`. Default chamber `--holo` record is **raw-float32 `.bin`** (partial bin streaming); CPU PNG via `efr.mjs` COMPOSITE is optional (`--record-png`).

Claim A only. ρ / K / causal pulse are **correlation proxies**, not von Neumann entropy or RT areas.

## Files

| File | Role | Status |
|------|------|--------|
| [`holographic.vert`](./holographic.vert) | Three.js r160+ boundary projection + ρ/K displacement | **partial** (source + streaming attributes) |
| [`holographic.frag`](./holographic.frag) | Governance-as-material PBR (CIEMS → roughness/spec/SSS) | **partial** (source; CPU analogue in `efr.mjs`) |
| [`efr.vert.glsl`](./efr.vert.glsl) | Heatmap/debug: warp by curvature proxy `aK * uWarpScale` | keep as debug |
| [`efr.frag.glsl`](./efr.frag.glsl) | Heatmap/debug: color by `ρ`, tint by `K`, optional causal pulse | keep as debug |
| [`../../engine/chamber/bin-frame.mjs`](../../engine/chamber/bin-frame.mjs) | raw-float32 frame encode / parse | **partial** |
| [`../../engine/chamber/watch-holo.html`](../../engine/chamber/watch-holo.html) | WebGL Points player (copied to outDir as `watch.html`) | **partial** (shader fps on device only) |

Drop-in copies (not a second theory tree): `src/mandala/shaders/holographic.vert` / `.frag` — one-line SoT comment points here.

## Streaming buffers (alloc-once)

`EntanglementRenderer.ensureGeometry()` pre-allocates `maxNodes` (default 8192) Float32Arrays once and binds them as attributes with `DynamicDrawUsage` when THREE is present (no-op `setUsage` on the Node stub). `buildHolographicBuffers()` copies packed rig arrays via `.set()`, sets `needsUpdate = true`, and `setDrawRange(0, count)`. No new `BufferAttribute` on t→t+1.

Material is a Node stub `{ vertexShader, fragmentShader, uniforms }` so COMPOSITE / bin recording does not need WebGL. `uTime` is written from `holoRig.bulk.t` / chamber `bulk.state.t`.

**Bin path (default `--holo`):** after `buildHolographicBuffers`, write `frames/frame-NNNNNN.bin` + `meta.json`; skip PNG encode and ffmpeg unless `--record-png` / `--mp4`. Sparse ρ **partial**: pre-induced cull (`ρ > 0.05 || |K| > 0.3 || w_ij > 0.1` / bone-joint keep) so rig + appearance + build see fewer nodes; write compact mirrors. Chamber logs `performance.now` buckets (`bulk`/`rig`/`induced`/`build`/`write`); `streaming_io_ms` = write only; `shader_fps` declared until watch overlay.

Status: streaming contract **partial**; live GPU draw **declared** until measured. Do not claim 60fps unless measured in `watch.html`.

## Appearance attribute / uniform map (`holographic.*`)

| GLSL | Meaning | CPU source |
|------|---------|------------|
| `entanglementDensity` | ρ | `egt.rho[i]` via `CharacterHolographicRig.buffers` copied into streaming cache |
| `entanglementDirection` | d̂ of E_i | `principal.v` of E_i = Σ w_ij d̂⊗d̂ |
| `curvature` | K | `egt.K[i]` |
| `entanglementWeight` | Σ w_ij | `egt.epsilon[i]` / `w_sum` |
| `governance` | CIEMS vec4 | intent, evidence, conformance, stewardship |
| `baseNormal` | induced-metric base | RigNode normal |
| `uAnisotropy` | 1.2 | `EntanglementRenderer.material.uniforms` |
| `uMuscleGain` | 0.3 | same |
| `uBoneThreshold` | 0.8 | same (K lock) |
| `uTime` | bulk time | `bulk.t` / `bulk.state.t` |
| `uBoundaryColor` | Mythar 0x8a5cff | `[138,92,255]/255` |
| `uInducedMetric` | h_ij | `inducedMetricHij` / encoder (`fromArray` each frame) |

## Heatmap/debug map (`efr.*.glsl`)

| GLSL | Meaning | CPU EFR analogue |
|------|---------|------------------|
| `aRho` | info density ρ | `egt.rho[i]` brightness |
| `aK` | curvature proxy K | `egt.K[i]` warp / tint |
| `uWarpScale` | emergent geometry scale | `0.08–0.12` offsets in `renderEGTEmergentGeometry` |
| `uTime` / `vCausalPulse` | causal flow pulse | arrow marks in `renderEGTCausal` |
| `uMode` | 0 heatmap / 1 causal / 2 emergent / 3 combined | `EFR_MODES` |

## Host mapping

| Host | How to wire |
|------|-------------|
| **CPU COMPOSITE** | `holoRig.update` → `buildHolographicBuffers` → `renderBoundary` (optional `--record-png`) |
| **raw-float32 bin** | same buffers → `bin-frame.mjs` → `watch.html` DynamicDraw + `needsUpdate` (**partial**) |
| **WebGL / three.js r160+** | `ShaderMaterial` with SoT `holographic.vert` / `.frag` in outDir `shaders/`; shader fps overlay in watch — **declared** until measured on device |
| **Vulkan / native-preview** | `efr.*.glsl` (`#version 450`) remain the debug SPIR-V path |
| **Unity / Unreal** | still a host mapping, not an implemented raster |

## Honesty

- Shader sources + alloc-once / `needsUpdate` streaming: **partial**.
- Bin streaming: **partial**.
- Sparse ρ pre-induced cull + write compact: **partial**.
- GPU Three.js / RX 580 draw: **declared** (open `watch.html`, read overlay — do not invent 60fps).
- Do not advertise as “AdS/CFT shader” or photoreal Unreal PBR.
