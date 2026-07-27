# MRS RT4D — Sovereign 4D Path Tracer

**MRS RT4D** is a constitutional, evidence-producing 4D path tracer capable of rendering GLB scenes into sovereign still images. Every render includes a full provenance chain: intent, validation, execution, and checksum.

## Quick Start

### Docker (recommended)

```bash
docker build -f Dockerfile.mrs-rt4d -t mrs-rt4d .

docker run --rm -v $(pwd)/renders:/renders mrs-rt4d \
  node mrs/packages/renderer-core/scripts/render-still.mjs \
    --glb mrs/demo/basic-scene.glb \
    --width 512 --height 512 --samples 32 --seed 1 \
    --output /renders/frame.png
```

### Local

```bash
npm ci
node mrs/packages/renderer-core/scripts/render-still.mjs \
  --glb mrs/demo/basic-scene.glb \
  --width 512 --height 512 --samples 32 --seed 1 \
  --output /renders/frame.png
```

### Animation

```bash
node mrs/packages/renderer-core/scripts/render-animation.mjs \
  --glb mrs/demo/basic-scene.glb \
  --frames 24 --width 256 --height 256 --samples 8 \
  --output-dir /renders/anim
```

## Features

| Feature | Description |
|---------|-------------|
| GLB Pipeline | GLB 2.0 binary import: vertices, normals, UVs, materials, tangents, vertex colors |
| Scene Graph | Node hierarchy with parent transforms, rotation, scale |
| TriangleMesh4D | Triangle meshes as 4D geometry primitives (w=0) |
| BVH4D | Bounding volume hierarchy with AABB4 slab intersection |
| PathTracer4D | CPU path tracer with next-event estimation (NEE) |
| Emissive Triangles | Area light sampling via uniform barycentric + solid-angle PDF |
| Normal Maps | TBN-based tangent-space normal perturbation |
| Vertex Colors | Per-vertex COLOR_0 tinting via GLB accessor |
| GLB Textures | PNG/JPEG decode from embedded GLB buffers |
| Evidence Chain | Every render produces intent hash, execution hash, PNG checksum, provenance JSON |
| Determinism | Same seed + same scene + same size = byte-identical PNG |
| Bilateral Denoiser | Edge-preserving noise reduction |
| Kelvin Lighting | Blackbody color temperature for light sources |

## Pipeline

```
GLB File
  |
  v
GLBMeshImporter4D  (parse, decode textures, resolve scene graph)
  |
  v
TriangleMesh4D[]   (3D mesh primitives → 4D via w=0)
  |
  v
Scene4D            (lights, materials, emissive triangle collection)
  |
  v
BVH4D              (spatial acceleration structure)
  |
  v
PathTracer4D       (NEE + MIS + TBN + vertex color + emissive sampling)
  |
  v
PNG + provenance.json
```

## Tests

```
GLB importer:     34
render-still:     28
triangle-mesh:    15
texture decoder:   3
render-animation:  3
TOTAL:            83
```

All tests pass. Run with:

```bash
node --test \
  mrs/packages/renderer-core/scripts/test/glb-importer.test.js \
  mrs/packages/renderer-core/scripts/test/render-still.test.js \
  mrs/packages/renderer-core/scripts/test/triangle-mesh.test.js \
  mrs/packages/renderer-core/scripts/test/glb-texture-decoder.test.js \
  mrs/packages/renderer-core/scripts/test/render-animation-glb.test.js
```

## CLI Reference

### render-still.mjs

| Flag | Default | Description |
|------|---------|-------------|
| `--glb` | none | Path to GLB file |
| `--prompt` | none | Procedural scene prompt (alternative to --glb) |
| `--width` | 256 | Output width |
| `--height` | 256 | Output height |
| `--samples` | 16 | Samples per pixel |
| `--seed` | auto | RNG seed (deterministic) |
| `--output` | output.png | Output PNG path |
| `--provenance` | none | Output provenance JSON path |

### render-animation.mjs

| Flag | Default | Description |
|------|---------|-------------|
| `--glb` | none | Path to GLB file |
| `--frames` | 24 | Number of frames |
| `--width` | 256 | Output width |
| `--height` | 256 | Output height |
| `--samples` | 8 | Samples per pixel |
| `--seed` | auto | RNG seed |
| `--output-dir` | ./renders | Output directory |
| `--orbit-start` | 0 | Camera orbit start (radians) |
| `--orbit-end` | 6.283 | Camera orbit end (radians) |

## Evidence Chain

Each render outputs a provenance JSON containing:

- **intentHash** — SHA-256 of render parameters
- **executionHash** — SHA-256 of execution metadata
- **pngChecksum** — SHA-256 of the output PNG
- **rendererVersion** — semantic version string
- **timestamp** — ISO 8601 execution time

## Project Structure

```
mrs/
  packages/
    renderer-core/       # 4D renderer, integrators, materials, BVH, GLB importer
      src/
        asset-pipeline/  # GLB import, texture decode
        render/
          rt4d/          # RT4D engine (BVH, path tracer, materials, scene)
      scripts/
        render-still.mjs
        render-animation.mjs
        test/            # 83 tests
  demo/
    basic-scene.glb      # Sample GLB for demos
```

## License

MIT
