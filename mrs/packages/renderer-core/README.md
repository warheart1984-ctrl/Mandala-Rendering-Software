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
  index.js     package root (mixed historical surface; prefer @mrs/renderer-core/node for Node-only APIs)
  node.js      Node-oriented exports (GPUPreviewClient, LiveLink, shared-memory helpers)
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
Physical invariants (`PI-GEO-LENGTH`, `PI-CALC-ENERGY`, `PI-TRIG-RADIAL`) are **registered** on route
results via `SovereignXPhysicalInvariants.js` (status **tested**); opt-in evidence refs / measurement
evaluation route through `decision.evidenceRefs` and are not a render deny gate.

## PI-* contracts, cross-runtime suite, and CKL acceptance

Physical / constitutional invariant work lives under `src/render/rt4d/invariants/`
(math SoT: `src/render/rt4d/math/physicalInvariants.js`). **Distinct from** CROS
CI-001..006 (`mrs/packages/cros/`) — do not merge compliance claims.

| Layer | What it is | Status (Drive-G-1) |
| --- | --- | --- |
| PI-* Constitutional Contracts | `PI-GEO-LENGTH`, `PI-CALC-ENERGY`, `PI-TRIG-RADIAL` | **tested** (unit suite); not a default render deny |
| EI-* engine invariants | derived runtime layer (projection, radiometric, …) | mixed **tested** / **declared** / **skeleton** |
| Cross-runtime suite | native evidence → normalized claims → `ConformanceReport` | **tested** (`crossRuntime.conformance.test.js`) |
| CKL soft acceptance | `acceptConformanceReport(report)` attaches evidence | **accepted** path — opt-in |
| CKL enforce | deny only when `enforcePhysicalInvariantConformance: true` (or `enforce: true`) | **enforced** only when operator opts in |
| Default renders | not denied by PI-* | intentional |

Hierarchy and diagrams: [`src/render/rt4d/invariants/STACK.md`](./src/render/rt4d/invariants/STACK.md).  
Cross-runtime contract: [`src/render/rt4d/invariants/crossRuntime/CROSS_RUNTIME.md`](./src/render/rt4d/invariants/crossRuntime/CROSS_RUNTIME.md).  
Docs mirror: [`docs/4drs/contracts/INVARIANT_STACK.md`](../../../docs/4drs/contracts/INVARIANT_STACK.md).

```bash
# From repo root / package — PI + stack + cross-runtime + CKL soft/enforce
npm run test:4d-renderer
# or package-local:
# npm test -- src/render/rt4d/test/physicalInvariants.test.js
# npm test -- src/render/rt4d/test/crossRuntime.conformance.test.js
# npm test -- src/render/rt4d/test/cklAcceptance.test.js
```

**Not claimed:** unified schema enforcement across hosts, EI-* as a default gate,
or that soft acceptance implies full constitutional activation.

## SX-PTIG — ContinuityGuarantee ≠ AcceptanceGuarantee

Sovereign X Temporal Idea Governance (`src/gpu/constitution/`) **declares and tests**
that preservation and activation are **independent** guarantees:

| Guarantee | Meaning |
| --- | --- |
| **ContinuityGuarantee** | Identity / lineage / provenance / context are preserved; ideas may stay **inactive** |
| **AcceptanceGuarantee** | Only evidence-backed activation (PI-* / `AcceptanceDecision`-shaped criteria) |

**Preservation must not imply acceptance.** This aligns with CROS CI-004/005 honesty
and PI-* soft-vs-enforce acceptance. System-wide CI-* mapping into JCK / COS / CER
is **declared** only — **not** full CKL enforcement of PTIG.

| Artifact | Role |
| --- | --- |
| [`src/gpu/constitution/SX-PTIG.md`](./src/gpu/constitution/SX-PTIG.md) | Prose + lifecycle mermaid |
| [`src/gpu/constitution/lifecycle.json`](./src/gpu/constitution/lifecycle.json) | Machine SoT |
| [`src/render/rt4d/invariants/LIFECYCLE.md`](./src/render/rt4d/invariants/LIFECYCLE.md) | Bridge from invariant stack → PTIG |
| CROS bridge | [`mrs/packages/cros/constitution/LIFECYCLE.md`](../cros/constitution/LIFECYCLE.md) (**declared**, not a runtime gate) |

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
