# 4d-renderer

Standalone **4D Ã¢â€ â€™ 3D Ã¢â€ â€™ 2D** parametric surface + discrete mesh renderer.

**Browser SoT** for the 4DCE host: math, projection, surfaces, and canvas draw live here.
The constitutional engine (`js/renderer.js`) adapts this package; it does not reimplement the pipeline.

## Layout

```
src/
  math/        vec4, mat4 (cinematicRotation), project
  surfaces/    clifford-torus, hopf-surface, torus-3d, trefoil-4d, tesseract
  render/      canvas-renderer, wireframe, solid
  pipeline/    scene, movie-pipeline (Node + optional FFmpeg)
  cli.js       4d-render CLI
  index.js     browser-safe exports (no node-canvas)
```

## Showcase demo (Canvas)

From repo root:

```bash
npm run serve
# http://localhost:8080/examples/web-demo.html
```

Self-contained showcase of the five surfaces via `CanvasRenderer` (+ optional
`HyperplaneSlicer`). Declared/not-wired panels list bloom, shadows, mic, browser
GLTF Ã¢â‚¬â€ see [`examples/README.md`](../examples/README.md).

## Browser (4DCE host)

From repo root (`npm start` / `npm run serve`):

- Adapter: `js/renderer.js` → imports `mrs/packages/renderer-core/src/index.js`
- Default surface: `tesseract` (world `FourDRenderer.surfaceId`)
- Governed movie remains **WebM** via `js/export.js` (MediaRecorder), not FFmpeg

Switch surface in world JSON:

```json
"surfaceId": "clifford-torus",
"resolution": 32,
"renderMode": "wireframe"
```

## CLI (Node)

Requires `npm install` / `pnpm install` so `canvas` + `commander` resolve (from this package or the `mrs/` workspace).

```bash
cd mrs/packages/renderer-core
npm install
npm run list
npm run render -- --surface clifford-torus --frames 60 --fps 30 --mode wireframe
npm run render -- --surface tesseract --single --width 640 --height 480
```

From repo root:

```bash
npm run render:4d -- --surface hopf-surface --mode solid --frames 30 --resolution 24
```

MP4 encoding uses **FFmpeg** if on `PATH`; otherwise PNG sequence only (error is non-fatal).

### Presentation and production controls

- `--profile technical|cinematic|solid-copper` selects surface-aware materials and lighting.
- `--supersample 2` or `4` enables high-quality downsampled antialiasing.
- Adaptive framing is enabled by default; use `--no-fit` for a fixed camera scale.
- Near-plane crossings are geometrically clipped, avoiding projection streaks and animation popping.
- Movie rendering reuses its canvas and sampled mesh; FFmpeg receives argument-safe paths and configurable codecs.
- `--stream` pipes PNG frames directly to FFmpeg without writing an intermediate sequence.

The lattice command defaults to `--isolevel auto`, reports occupancy, welds duplicate marching-cubes vertices,
filters tiny components, normalizes the extracted mesh, and applies the `lattice` presentation profile.

### Sovereign X Router

`src/gpu/SovereignXRenderAdapter.js` discovers browser Canvas/WebGPU adapters and consumes a governed
render decision from `@aaes-os/sovereignx-router`. The router can select Canvas, WebGPU, Vulkan, OpenCL,
Unity, Unreal, or a remote GPU; native backends are handed to a caller-provided dispatch function.
Delay and drop decisions remain authoritative and are surfaced as typed renderer errors.
`createSovereignXNativeDispatch` converts Vulkan/OpenCL/native decisions into versioned worker jobs and
returns the verified execution receipt to the renderer runtime.

## What is not claimed

| Host | Status |
|------|--------|
| Browser canvas draw | **wired** to this package |
| CLI PNG / optional MP4 | **in this package** |
| Unity / Unreal wireframe + solid | **partial** Ã¢â‚¬â€ `*.mesh.json` faces; MeshFilter / ProceduralMesh; `npm run test:solid-play` |

## Shared meshes for engine hosts

```bash
# From repo root
npm run export:surfaces
# Ã¢â€ â€™ engine/surfaces/meshes/*.mesh.json
# Unity: StreamingAssets/surfaces/  |  Unreal: Content/Surfaces/
```

Set `surfaceId` / `SurfaceId` to `tesseract` | `clifford-torus` | `hopf-surface` | `torus-3d` | `trefoil-4d`.

## Tests

```bash
# From repo root (no canvas required for core smoke)
npm run test:4d-renderer

# Package self-test (needs canvas native build)
cd 4d-renderer && npm test
```
