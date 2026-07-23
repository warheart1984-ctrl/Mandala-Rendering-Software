# Tutorials

Runnable Node scripts that import real `@mrs/renderer-core` APIs. From repo root:

```bash
node examples/tutorials/basic-render.js
node examples/tutorials/camera-controls.js
node examples/tutorials/timeline-animation.js
node examples/tutorials/export-formats.js
node examples/tutorials/advanced-composition.js
```

Requires `canvas` native build via the MRS workspace (`cd mrs && pnpm run setup`). Package: `@mrs/renderer-core`.  
> Root `4d-renderer/` remains a **compatibility shim** that re-exports `@mrs/renderer-core` — not the SoT.

| Script | Evidence |
| --- | --- |
| `basic-render.js` | CanvasRenderer + tesseract mesh → PNG |
| `camera-controls.js` | d4/d3/scale/cameraY variants (browser orbit in web-demo) |
| `timeline-animation.js` | Package TimelinePlayer seek |
| `export-formats.js` | PNG + ExportManager OBJ/GLTF (Node) |
| `advanced-composition.js` | SurfaceComposition.sampleAll |

## Declared / skipped

| Topic | File | Why |
| --- | --- | --- |
| Post-processing bloom | `post-processing.declared.md` | WebGPU `PostProcessor` not bound to Canvas demo |
| Audio / microphone | `audio-visualization.declared.md` | AudioAnalyzer exists; not wired in showcase loop |

Browser interactive path: [`../web-demo.html`](../web-demo.html).
