# Academic Manuscript — FourDRenderer v2.0  
## ~12-Page Prose Outline / Section Summaries (Evidence-Bound)

> Companion to [`ACADEMIC_PAPER_OUTLINE.md`](./ACADEMIC_PAPER_OUTLINE.md) and [`ACADEMIC_POSTER.md`](./ACADEMIC_POSTER.md).  
> This is **structured prose for drafting** — not a finished submission and **not** fabricated results.  
> **Results section = to be filled with measured evidence.**

| Field | Value |
| --- | --- |
| Working title | FourDRenderer v2.0: A Declared Architecture for Higher-Dimensional Rendering, Projection, and Observation Modes |
| Authors / venue | **TBD** |
| Contact | **TBD** |

---

## Abstract (draft summary)

We present FourDRenderer v2.0 as a **declared** architecture for rendering over four-dimensional Euclidean space \(\mathbb{R}^{4}\). The design specifies contracts for hierarchical acceleration with hyper-box bounds, shading frames compatible with SO(4)-aware bidirectional scattering interfaces, path-transport alignment with prior RT4D work, projection into host-consumable three-dimensional shading outputs, and Observation Modes that encode *how* the fourth axis becomes visible. We deliberately separate contractual completeness (Phase 1 documentation) from platform readiness: deep host RHI integration and measured real-time budgets are **roadmap** and **targets**, respectively, and are not reported here as achieved product results.

---

## 1. Introduction (summary)

Interactive content systems overwhelmingly assume a three-dimensional domain. Higher-dimensional assets — whether authored parametrically or simulated — must eventually land in hosts that shade, light, and composite in 3D. Ad hoc “flatten W” tricks lose lineage and observation policy. FourDRenderer v2.0 addresses this gap at the **contract** layer: it declares what a 4D renderer must expose before claiming GPU or engine completeness. Contributions of this manuscript draft are architectural and methodological; empirical kernel timings remain future work.

---

## 2. Related work (summary)

Classical four-dimensional visualization, hyperspatial ray tracing, and engine path tracers provide partial precedents. Prior packages in this lineage (MRS, RT4D, Engine v1 World Format / PLP / Observation Modes) supply **partial** implementations and schemas. We position v2 as an **extension** that structures GPU-oriented ABI and host-blend intent — not as a claim of historical first authorship. Venue-facing literature review remains **TBD** (authors to complete with citations).

---

## 3. Architecture (summary)

### 3.1 Domain and rays

Scenes live in \(\mathbb{R}^{4}\). Rays take the form \(R(t)=O+tD\) with four-component origins and directions. Primitives may be embedded surfaces or volumetric elements carrying material and projection-policy identifiers.

### 3.2 Acceleration

BVH4D nodes store hyper-box bounds. Traversal follows slab tests generalized to four axes. Status: **declared** in RFCs; CPU / prior-art paths **partial**; GPU kernels **skeleton / roadmap**.

### 3.3 Shading

A `ShadingFrame4D` supplies an oriented basis; `BSDF4D` Sample / Evaluate interfaces are **declared** for SO(4)-aware materials. **GPU enforcement of SO(4) BSDFs is not claimed** in this work.

### 3.4 Transport

Path tracing loops with Russian roulette align with RT4D contracts. Existing RT4D evidence is **partial** and must not be relabeled as finished v2 GPU completeness.

### 3.5 Projection and Observation Modes

`Project4DTo3D` yields `ShadingOutput3D` (position, normal, radiance, depth) aligned with PLP. Observation Modes route alternate visibility policies toward host blend flags. Diagrammatic three-column host split: adapter lane · GBuffer inject · Lumen/Nanite roadmap — see [`ENGINE_ARCHITECTURE_DIAGRAM.md`](./ENGINE_ARCHITECTURE_DIAGRAM.md).

---

## 4. Host interface (summary)

FourDRenderer remains upstream authority. FourDAdapter (Unity / Unreal) is a **hybrid-first consumer** of Scene3D + lineage (**skeleton**). Deep Unreal RHI injection, Nanite W-awareness, and Lumen W-GI feeds are **roadmap** and out of scope for adapter v1.1 claims.

---

## 5. Implementation status (summary)

| Component | Status vocabulary |
| --- | --- |
| RFC / architecture suite | **Declared** (Phase 1 docs) |
| Shader ABI | **Declared** |
| BVH / trace | **Partial** / **skeleton** |
| SO(4) GPU path | **Not claimed** |
| FourDAdapter | **Skeleton** |
| Tooling suite | Phase 4 **roadmap** |
| Performance SLA | **Not measured** |

Scorecard: `docs/scorecards/fourd-renderer-v2.md`.

---

## 6. Results — to be filled with measured evidence

**Do not publish fabricated FPS, millisecond bars, or “achieved realtime” tables.**

Placeholder table for future measurements:

| Experiment | Planned metric | Present wording |
| --- | --- | --- |
| Preview 4D passes | Frame-time distribution on named GPU | **Design target** ≤ 4–6 ms — **not measured in this work** |
| BVH build / traverse | Nodes/s, rays/s | **TBD when kernels exist** |
| Projection fidelity | Error vs reference slices | **TBD** |
| Host ingest | Adapter round-trip success | **TBD** on skeleton paths |
| Validation | T1–T5 | Categories **declared** only |

Until rows are filled from instruments and CI, this section should state explicitly that results are **targets and plans**.

---

## 7. Discussion and limitations (summary)

Constitutional / contractual maturity can advance while platform engineering remains early — “the engine may exist; the factory may still be early.” Limitations include incomplete GPU paths, absent measured budgets, and adapter-only host presence. Marketing language must not outrun this section (Drive-G-1).

---

## 8. Conclusion (summary)

FourDRenderer v2.0 contributes a declared architecture for higher-dimensional rendering and disciplined observation toward hosts. Measured performance and deep engine integration remain future work. We advocate evidence-bound reporting: weaker verbs until stronger evidence exists.

---

## Acknowledgments / funding

**TBD**

## References

Internal RFC index under `docs/4d-engine/v2/` plus external literature (**TBD**). Contact: **TBD**.
