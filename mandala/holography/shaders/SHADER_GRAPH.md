# EFR Shader Graph (blueprint)

**Status:** **partial** — GLSL templates in this folder; **working path** is CPU PNG via `efr.mjs`.

Claim A only. ρ / K / causal pulse are **correlation proxies**, not von Neumann entropy or RT areas.

## Files

| File | Role |
|------|------|
| [`efr.vert.glsl`](./efr.vert.glsl) | Warp vertices by curvature proxy `aK * uWarpScale` |
| [`efr.frag.glsl`](./efr.frag.glsl) | Color by `ρ`, tint by `K`, optional causal pulse |

## Attribute / uniform map

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
| **Vulkan / native-preview** | Compile SPIR-V from these GLSL files; bind EGT buffers as vertex attrs |
| **Unity** | Shader Graph: Position ← Add(Position, Up * K * Warp); Base Color ← lerp(Heat(ρ), Causal, pulse) |
| **Unreal** | Material: World Position Offset ← (0, K*Warp, 0); Emissive ← ρ heatmap |
| **WebGL / three.js** | RawShaderMaterial with these sources (may need `#version 300 es` port) |

## Honesty

- Not a production GPU path until SPIR-V / host dispatch is wired.
- Do not advertise as “AdS/CFT shader.”
