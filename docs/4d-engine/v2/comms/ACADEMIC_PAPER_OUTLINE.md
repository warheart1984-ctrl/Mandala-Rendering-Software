# Academic Paper Outline — FourDRenderer v2.0  
## 8–12 Page Structure (Evidence-Bound)

> Expands [`ACADEMIC_POSTER.md`](./ACADEMIC_POSTER.md) into a full paper outline.  
> Full prose summaries: [`ACADEMIC_MANUSCRIPT.md`](./ACADEMIC_MANUSCRIPT.md)  
> **Results = declared / targets — not fabricated measurements.**

| Field | Value |
| --- | --- |
| Working title | FourDRenderer v2.0: A Declared Architecture for Higher-Dimensional Rendering, Projection, and Observation Modes |
| Target length | 8–12 pages (venue TBD) |
| Authors / affiliation | **TBD** |

## Page budget (suggested)

| Section | Pages | Notes |
| --- | --- | --- |
| Abstract + intro | ~1.0 | Motivation; prior art honesty |
| Related work | ~1.0–1.5 | MRS / RT4D / classical 4D viz — **no “world’s first”** |
| Architecture | ~2.5–3.5 | BVH, transport, SO(4) contracts, projection, Observation Modes |
| Host interface | ~1.0 | PLP / Scene3D / adapter consumer model |
| Implementation status | ~1.0 | Declared vs partial vs roadmap table |
| Results / evaluation plan | ~1.0–1.5 | **Targets & planned metrics only** until measured |
| Discussion + limitations | ~0.75 | Drive-G-1 framing |
| Conclusion + refs | ~0.75–1.0 | |

## Section outline

### 1. Abstract

Declare contracts for \(\mathbb{R}^{4}\) rendering and host-visible projection. State clearly: deep engine RHI integration is roadmap; no measured real-time budgets presented as achieved.

### 2. Introduction

- Problem: higher-dimensional content lacks a disciplined projection + observation policy toward real-time hosts.  
- Contribution: **declared** architecture suite (Phase 1 documentation).  
- Non-contribution: finished GPU SO(4) product claim.

### 3. Related work

Prior 4D visualization, hyperspace ray tracing, engine path tracers, projection/lineage protocols. Position as **extension** of MRS / RT4D / Engine v1 — not first-mover absolute.

### 4. Architecture

1. World / ray model in \(\mathbb{R}^{4}\)  
2. BVH4D hyper-boxes (**declared**; CPU partial / GPU skeleton prior art)  
3. ShadingFrame4D / BSDF4D Sample–Evaluate (**declared**; GPU SO(4) enforcement **not claimed**)  
4. Path transport alignment with RT4D (**partial** prior art)  
5. `Project4DTo3D` → `ShadingOutput3D` (PLP-aligned)  
6. Observation Mode routing / blend policy  

Figure: three-column host split — [`ENGINE_ARCHITECTURE_DIAGRAM.md`](./ENGINE_ARCHITECTURE_DIAGRAM.md).

### 5. Host integration model

FourDRenderer authority vs FourDAdapter consumer (hybrid-first). Unreal RHI / Nanite / Lumen = **roadmap**.

### 6. Implementation status (evidence table)

Mirror scorecard vocabulary: declared / partial / skeleton / roadmap. Cite internal RFCs and packages without upgrading stubs to “complete.”

### 7. Results (to be filled with measured evidence)

Until measurements exist, publish only:

| Item | Allowed wording |
| --- | --- |
| Phase 1 | Documentation / RFC suite **declared complete** |
| Preview budget | **Design target** ≤ 4–6 ms — **not measured in this work** |
| GPU kernels | **Not claimed complete** |
| Validation | T1–T5 **declared** categories |

~~Do not invent FPS charts.~~

### 8. Limitations & future work

Phase 2 kernels, Phase 3 host blend measurements, Phase 4 tooling, Phase 6 benchmarks.

### 9. Conclusion

Separate constitutional / contractual completeness from platform factory readiness.

### 10. References

Internal anchors + venue-appropriate prior art (authors TBD).

## Companion artifacts

- Poster: [`ACADEMIC_POSTER.md`](./ACADEMIC_POSTER.md)  
- Manuscript summaries: [`ACADEMIC_MANUSCRIPT.md`](./ACADEMIC_MANUSCRIPT.md)  
- Course notes: [`SIGGRAPH_COURSE_NOTES.md`](./SIGGRAPH_COURSE_NOTES.md)  
- Abstract draft: [`RESEARCH_ABSTRACT.md`](./RESEARCH_ABSTRACT.md)
