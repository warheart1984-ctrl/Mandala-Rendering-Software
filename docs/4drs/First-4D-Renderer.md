# First 4D Renderer — Technical Note

**Document type:** Technical note (4–6 pages equivalent)  
**System:** 4D Rendering System v1.0  
**Engine:** RT4D (*Ray Tracer for Four Dimensions*)  
**Date:** 2026-07-22  
**Code:** [github.com/warheart1984-ctrl/Mandala-Rendering-System-MRS-](https://github.com/warheart1984-ctrl/Mandala-Rendering-System-MRS-)  
**Spec:** [`SPEC-v1.0.md`](./SPEC-v1.0.md) · **Architecture:** [`ARCHITECTURE.md`](./ARCHITECTURE.md) · **Results:** [`validation/`](./validation/)

---

## 1. Problem

Most “4D visualization” tools reduce four-dimensional geometry to wireframe projections or 3D slices. That is useful for topology, but it does not exercise **light transport in \(\mathbb{R}^4\)**: emission, scattering on 3-manifolds embedded in 4-space, and volumetric media whose density varies along a fourth spatial axis \(w\).

This note records the v1.0 **RT4D** engine inside the Mandala / MRS repository: a software path tracer that samples rays in four dimensions, intersects hypersurfaces and volumes, evaluates 4D-oriented BSDF/phase models, and writes a 2D film. The **Hyper-Caustic Lens** scene is designated the **official validation scene** for the release.

Adjacent host work (constitutional browser cinematics, Unity/Unreal mesh playback) is out of scope for the RT4D claim set; see `constitution/CHARTER.md` for evidence tags.

## 2. Mathematical model (summary)

### 2.1 Geometry

A point is \(p = (x,y,z,w) \in \mathbb{R}^4\). A ray is \(r(t) = o + t\,d\) with \(d\) a unit 4-vector. Primitive hits return position, outward normal in \(\mathbb{R}^4\), distance \(t\), and a material id.

Implemented primitives include hyperspheres, hyperplanes, implicit hypersurfaces, mesh facets (`HyperTriangle` / `Mesh4D`), and exponential fog volumes.

### 2.2 Directions on \(S^3\)

Secondary rays and microfacet sampling use helpers on the 3-sphere \(S^3\) (`math/s3.js`): uniform and cosine-weighted samples, GGX NDF sampling, and power-heuristic MIS weights. These are **engineering models** adapted from 3D practice; they are not asserted as the unique physically correct 4D measure.

### 2.3 Materials

- Lambertian and GGX-style BSDFs in 4D (`bsdf4d.js`, `ggx4d.js`)  
- Isotropic and Henyey–Greenstein-style phase functions for volumes  
- `MaterialSystem` maps string ids to BSDF/phase/emission/`sigmaT`/`sigmaS`

### 2.4 Integration

`PathTracer4D` recursively traces until `maxDepth`, with simple Russian roulette after a threshold. Lights are flagged materials (`isLight`). Volumes use phase sampling when a volume hit wins the distance test.

### 2.5 Display projection

`Projector4D` applies a two-stage perspective (along \(w\), then \(z\)) for geometric visualization helpers. The path-traced film path accumulates RGB directly to an RGBA8 buffer via `SampleAccumulator` and `renderRT4DFrame`.

## 3. Architecture

RT4D is organized as frozen modules:

`math` → `geometry` / `material` / `accel` → `integrator` → `output` / `scene`

Entry points:

- Umbrella: `mrs/packages/renderer-core/src/render/rt4d/index.js`  
- Frame: `renderRT4DFrame(scene, camera, { width, height, samples, maxDepth, seed })`  
- Validation factory: `createHyperCausticLens(options?)`

See [`ARCHITECTURE.md`](./ARCHITECTURE.md) and [`api/rt4d-v1.0-freeze.md`](./api/rt4d-v1.0-freeze.md).

## 4. Canonical scene — Hyper-Caustic Lens

The official scene places:

1. A low-roughness GGX **hypersphere** (lens) at the origin  
2. A bright Lambertian **wall** (hyperplane) behind the lens  
3. A compact **emissive hypersphere** offset in \(w\) (area light)  
4. **Exponential fog** whose extinction interacts with the \(w\)-axis  
5. A `Camera4D` at \((0,0,-2.5,0)\) looking at the origin  

Factory source: `scene/TestHyperCausticLens.js`.  
Baseline settings and checksums: `validation/baseline.json`.  
Artifacts: `validation/artifacts/`.

Regenerate:

```bash
node scripts/render-hyper-caustic-baseline.mjs --write-hashes
```

## 5. Limitations (evidence-bound)

- Transport and BRDF/phase models are **partial** relative to a full 4D radiative-transfer derivation; they are code-backed prototypes.  
- RNG in `renderRT4DFrame` uses a deterministic `sin`-hash sequence keyed by `seed`, not a cryptographic or PCG stream.  
- Acceleration (`BVH4D`) and mesh paths are present but not claimed thoroughly fuzz-tested.  
- No GPU RT4D path is claimed in v1.0.  
- Host “4DCE” cinematic canvas rendering is a **separate** SoT (`4d-renderer` surfaces + `js/renderer.js`); do not treat canvas wireframe demos as Hyper-Caustic Lens validation.  
- Zenodo DOI appears in citation metadata when deposited; until deposit completes, cite the GitHub tag `v1.0.0`.

## 6. Roadmap (labeled intent — not present capability)

1. Higher-quality RNG and stratified 4D sampling  
2. Reference comparisons against analytical hypersphere lighting cases  
3. Progressive / interactive RT4D preview in the browser host  
4. Optional GPU integrator behind the same frozen scene API  
5. Expanded validation suite beyond Hyper-Caustic Lens (additional official scenes in later minors)

## 7. Cross-links

| Artifact | Location |
| --- | --- |
| Spec | `docs/4drs/SPEC-v1.0.md` |
| Architecture | `docs/4drs/ARCHITECTURE.md` |
| API freeze | `docs/4drs/api/rt4d-v1.0-freeze.md` |
| Validation | `docs/4drs/validation/Hyper-Caustic-Lens.md` |
| Charter | `constitution/CHARTER.md` |
| Engine code | `mrs/packages/renderer-core/src/render/rt4d/` |
| Release tag | `v1.0.0` on GitHub |

## Citation

Prefer `CITATION.cff` / Zenodo DOI when available. Short form:

> 4D Rendering System v1.0 (RT4D). Mandala Rendering System (MRS). Hyper-Caustic Lens validation scene. 2026.
