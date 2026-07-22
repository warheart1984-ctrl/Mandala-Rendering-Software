# RT4D / 4DRS architecture (v1.0)

```
┌─────────────────────────────────────────────────────────────┐
│  Hosts (MRS) — charter-governed                             │
│  Browser js/renderer.js · Unity · Unreal · CSSV ledger      │
└───────────────────────────┬─────────────────────────────────┘
                            │ optional surface / movie paths
┌───────────────────────────▼─────────────────────────────────┐
│  4d-renderer package                                        │
│  canvas surfaces · CLI · cinematic adapters                 │
│            ┌──────────────┴──────────────┐                  │
│            ▼                             │                  │
│     RT4D engine (formal)                 │                  │
│  math → geometry → material → accel      │                  │
│       → integrator → output → scene      │                  │
│            │                             │                  │
│            └── Hyper-Caustic Lens ───────┘                  │
└─────────────────────────────────────────────────────────────┘
```

## Module responsibilities

| Module | Responsibility |
| --- | --- |
| `math/` | \(\mathbb{R}^4\) algebra, \(S^3\) sampling, `Transform4D` |
| `geometry/` | Ray–primitive hits (hypersurface, volume, mesh) |
| `material/` | BSDF / phase / `MaterialSystem` |
| `accel/` | `HyperBox`, `BVH4D` |
| `integrator/` | Path tracing + sample accumulation |
| `output/` | Projection helpers + AOV collector |
| `scene/` | `Scene4D` + **Hyper-Caustic Lens** factory |
| `camera/` | `Camera4D` ray generation |
| `RT4DRenderer.js` | Frame entry `renderRT4DFrame` |

## Data flow (frame)

1. `createHyperCausticLens` → `{ scene, camera }`  
2. `scene.build()` constructs BVH when primitives exist  
3. For each pixel/sample: `camera.generateRay` → `PathTracer4D.trace` → accumulate  
4. `SampleAccumulator.finalize` → optional `Projector4D.rasterize` → RGBA8  

## Stability

Public barrels listed in [`api/rt4d-v1.0-freeze.md`](./api/rt4d-v1.0-freeze.md) are frozen for v1.0. Internal algorithms may change if the validation scene factory contract and freeze list remain intact.
