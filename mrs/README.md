# MRS monorepo

pnpm workspace for the Mathematical Reality Substrate (MRS) renderer and ChatGPT App.

## Packages

| Package | Path | Role |
|---------|------|------|
| `@mrs/renderer-core` | `packages/renderer-core` | Former `4d-renderer/` — surfaces, CanvasRenderer, inspector, LiveLink |
| `@mrs/scene-schema` | `packages/scene-schema` | `Scene4DDTO` tool/widget contract |
| `@mrs/renderer-web` | `packages/renderer-web` | Browser Canvas2D host (WebGPU optional/declared only) |
| `@mrs/chatgpt-app-server` | `apps/chatgpt-mrs/server` | MCP SSE server + 5 tools |
| `@mrs/chatgpt-app-web` | `apps/chatgpt-mrs/web` | Vite React skybridge widget |

## Migration note

`G:\New folder\4d-renderer` is a **compatibility shim**: `src/` junctions to `packages/renderer-core/src` so root `npm` scripts and `examples/**` imports keep resolving. Prefer `@mrs/renderer-core` for new work.

## RT4D math audit — normalization fixes

The light transport engine (`renderer-core/src/render/rt4d/`) underwent a full
mathematical audit. All fixes live in commit `268ea63` and are validated by 23
tests (`src/render/rt4d/test/normalization.test.js`), including SO(4) invariance
and GGX reciprocity checks.

### What changed

| Area | Bug | Fix |
|------|-----|-----|
| **S³ sampler** (`s3.js`) | Uniform sampler used broken axis-aligned rejection | 4D Gaussian trick: `r = √(-ln(u₁))`, 4 independent normals |
| **Cosine-weighted sampler** (`s3.js`) | Wrong CDF inversion | `θ = arcsin(u^{1/3})` (hemisphere on S³, `sin²ψ sinφ` measure) |
| **ONB builder** (`s3.js`) | Crashed on axis-aligned normals (zero cross product) | 4-ref Gram-Schmidt with fallback to `(0,0,1,0)` → `(1,0,0,0)` |
| **Lambertian BRDF** (`bsdf4d.js`) | BRDF = `ρ/π²` with extra `cosθ` in returned value | `3ρ/(4π)` (constant), pdf = `3cosθ/(4π)`, sample returns BRDF only |
| **GGX NDF** (`ggx4d.js`) | NDF used 2π² denominator and 4D tangent frame | Denominator → `π² · denom⁴`, tangent frame → 3D (`buildONBFromNormal` + `uniformSampleS2`) |
| **Path integrator** (`PathTracer4D.js`) | Double `cosθ/pdf` weighting in `_handleSurface` | Single `cosθ · misWeight · bsdf/pdf`; light PDF uses solid-angle formula `1/(2π²(1-cosα))` |
| **Camera** (`Camera4D.js`) | No Z-axis (thru) sampling | Added `fovZ` and `u4` for fourth-axis direction component |
| **Phase function** (`phase4d.js`) | Local `cross4D` shadows import from `vec4.js` | Import `cross4D` from `vec4.js`, removed duplicate |
| **vec4.js** | Missing component-wise multiply | Added `mul(a, b)` and exported from `math/index.js` |

### Normalization constant derivation

The correct cosine-weighted hemisphere integral on S³ (using the standard
parameterization `dA = sin²ψ sinφ dψ dφ dθ`) is **4π**, not 2π²:

```
∫₀²π ∫₀^(π/2) ∫₀π sin²ψ sinφ cosψ · sin²ψ sinφ dψ dφ dθ = 4π/3
hemisphere area (no cos) = π²   full S³ area = 2π²
```

This makes the cosine-weighted BRDF = `3ρ/(4π)` and pdf = `3cosθ/(4π)`.

### GPU BVH traversal

Production CUDA and WGSL kernels were added alongside the CPU BVH4D:

- **`accel/gpu/bvh4d_cuda.cu`** — 4D slab AABB, hypersphere, hyperplane, mesh
  triangle intersections (4D Möller–Trumbore), SAH binning skeleton, stack-based
  traversal with child ordering
- **`accel/gpu/bvh4d.wgsl`** — Matching WebGPU compute shader, `@workgroup_size(64)`,
  full bind group layout (11 bindings)
- **`accel/gpu/bvh4dPacked.js`** — `flattenBVH4DNodes()` (Float32Array, 12 floats/node)
  and `createBVH4DGPUBuffers()` for WebGPU device buffer creation

## Quick start

```bash
cd mrs
pnpm install
pnpm --filter @mrs/chatgpt-app-web build
pnpm --filter @mrs/chatgpt-app-server start
```

See `apps/chatgpt-mrs/README.md` for MCP Inspector / ChatGPT / ngrok.

## LiveLink ports (evidence)

| Service | Default | Source |
|---------|---------|--------|
| LiveLinkServer | **9487** | `renderer-core/src/live-link/LiveLinkServer.js` |
| Inspector WS helper | **9490** | `scripts/inspector-ws-server.mjs` |

Override with `MRS_LIVELINK_PORT` / `MRS_LIVELINK_URL`.
