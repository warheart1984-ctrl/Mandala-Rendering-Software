# 4D Rendering System — Specification v1.0

**Title:** 4D Rendering System v1.0  
**Engine:** RT4D (*Ray Tracer for Four Dimensions*)  
**Validation scene:** Hyper-Caustic Lens (official)  
**Evidence bound:** Drive-G-1 — claims match shipped code under `4d-renderer/src/render/rt4d/` and this document set.

## 1. Purpose

4DRS v1.0 publishes a **constitutional host stack** (Mandala / MRS) together with a **first-party 4D path-tracing engine (RT4D)** and a frozen validation scene (**Hyper-Caustic Lens**). The system renders radiance along rays in \(\mathbb{R}^4\), accumulates samples, and projects results to 2D raster for inspection and archival.

## 2. Normative components

| Component | Path | Normative role |
| --- | --- | --- |
| Constitutional charter | `constitution/CHARTER.md` | Host governance evidence tags |
| Architecture | `docs/4drs/ARCHITECTURE.md` | Module graph and data flow |
| RT4D API freeze | `docs/4drs/api/rt4d-v1.0-freeze.md` | Stable public surface |
| Hyper-Caustic Lens | `docs/4drs/validation/` | Official validation + baseline |
| Technical note | `docs/4drs/First-4D-Renderer.md` | Problem / math / limits / roadmap |
| Naming | `docs/4drs/NAMING.md` | Formal names |

## 3. Coordinate and projection model

- Points and directions are 4-vectors \((x,y,z,w)\).  
- Cameras emit 4D rays (`Camera4D.generateRay`).  
- Surfaces intersect via hyperspheres, hyperplanes, implicit fields, and optional mesh/volume primitives.  
- Display uses `Projector4D` (perspective in \(w\) then in \(z\)) and/or direct film accumulation from the path tracer (`renderRT4DFrame`).

## 4. Rendering pipeline (normative stages)

1. **Scene build** — `Scene4D` + materials + optional `BVH4D`  
2. **Integrate** — `PathTracer4D` / `SampleAccumulator`  
3. **Output** — RGBA8 raster via accumulator + `Projector4D.rasterize`  
4. **Validate** — regenerate Hyper-Caustic Lens baseline; compare checksums when present  

## 5. Conformance

A build **conforms to 4DRS v1.0 (RT4D)** if it:

1. Exposes the frozen exports in `rt4d-v1.0-freeze.md`  
2. Provides `createHyperCausticLens` with the documented default composition  
3. Can execute `scripts/render-hyper-caustic-baseline.mjs` without crash  

Host cinematic canvas adapters and Unity/Unreal mesh paths are **adjacent** and evidence-tagged separately in the charter; they are not required for RT4D engine conformance.

## 6. Non-goals (v1.0)

- Physically exact 4D light transport matching a published closed-form reference  
- GPU path tracer parity  
- Bit-identical frames across Node versions beyond the frozen seed/settings when checksums are recorded  

## 7. Versioning

- Release tag: `v1.0.0`  
- Published title: **4D Rendering System v1.0**  
- Next breaking RT4D API change → `v2.0.0`
