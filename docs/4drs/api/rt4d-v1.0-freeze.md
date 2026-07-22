# RT4D stable API freeze — v1.0

**Freeze date:** 2026-07-22  
**Engine:** RT4D (Ray Tracer for Four Dimensions)  
**Import root:** `4d-renderer/src/render/rt4d/` (also `import { RT4D } from "4d-renderer"` → `RT4D.*`)

This freeze covers **public exports** listed below. SemVer: breaking changes require a major bump after `v1.0.0`.

## Package export map

| Module path | Package export (planned) | Barrel |
| --- | --- | --- |
| math | `4d-renderer/rt4d/math` | `math/index.js` |
| geometry | `4d-renderer/rt4d/geometry` | `geometry/index.js` |
| material | `4d-renderer/rt4d/material` | `material/index.js` |
| integrator | `4d-renderer/rt4d/integrator` | `integrator/index.js` |
| accel | `4d-renderer/rt4d/accel` | `accel/index.js` |
| output | `4d-renderer/rt4d/output` | `output/index.js` |
| scene | `4d-renderer/rt4d/scene` | `scene/index.js` |
| (umbrella) | `4d-renderer/rt4d` | `index.js` |

## math

Stable: `vec4`, `add`, `sub`, `scale`, `dot`, `len2`, `length`, `normalize`, `lerp`, `abs`, `min`, `max`, `neg`, `cross4D`, `toArray`, `fromArray`, `ZERO`, `ONE`, `UNIT_X`…`UNIT_W`, `uniformSampleS3`, `uniformPDF_S3`, `cosineWeightedSampleS3`, `powerHeuristic`, `sphericalTo4D`, `sampleGGX_S3`, `ggxNDF`, `S3_AREA`, `Transform4D`.

## geometry

Stable: `Hypersphere`, `Hyperplane`, `ImplicitHypersurface`, `Volume4D`, `ExponentialFog`, `Mesh4D`, `HyperTriangle`.

## material

Stable: `BSDF4D`, `Lambertian4D`, `GGX4D`, `PhaseFunction4D`, `Isotropic4D`, `HenyeyGreenstein4D`, `MaterialSystem`.

## integrator

Stable: `PathTracer4D`, `SampleAccumulator`.

## accel

Stable: `HyperBox`, `BVH4D`.

## output

Stable: `Projector4D`, `AOVCollector`.

## scene

Stable: `Scene4D`, `createHyperCausticLens` (**official validation scene factory**).

## Top-level render entry

Stable: `renderRT4DFrame(scene4D, camera4D, options?)`, `Camera4D`.

## Explicitly not frozen

- Internal helpers local to files (e.g. file-private `neg` / `cross4D` duplicates).
- Host adapters (`js/renderer.js`), canvas surface CLI, Unity/Unreal mesh loaders.
- Sample counts, RNG quality, and performance characteristics (may change within minor releases if outputs remain validation-compatible under documented baseline settings).
