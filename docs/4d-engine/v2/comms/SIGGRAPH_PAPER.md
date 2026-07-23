# SIGGRAPH Paper Draft — FourDRenderer v2.0  
## Polished Academic Outline (Evidence-Bound)

| Field | Value |
| --- | --- |
| Status | **Declared academic draft** — not an accepted SIGGRAPH paper |
| Venue | SIGGRAPH / related graphics venues — **acceptance / date TBD** |
| Related | [`ACADEMIC_PAPER_OUTLINE.md`](./ACADEMIC_PAPER_OUTLINE.md), [`ACADEMIC_MANUSCRIPT.md`](./ACADEMIC_MANUSCRIPT.md), [`ACADEMIC_POSTER.md`](./ACADEMIC_POSTER.md) |
| Redline | [`CLAIMS_REDLINE.md`](./CLAIMS_REDLINE.md) |
| Aspirational abstract/results | [`aspirational/SIGGRAPH_PAPER.md`](./aspirational/SIGGRAPH_PAPER.md) |

> Drive-G-1: **Results report targets / to be measured**, not achieved 4–6 ms.  
> Do not invent FPS charts or claim GPU SO(4) enforcement.

---

## Working title

**FourDRenderer v2.0: Declared Contracts for Higher-Dimensional Rendering, Projection, and Host Observation**

Authors / affiliation: **TBD**

---

## Abstract (evidence-bound)

We present a declared architecture suite for rendering over \(\mathbb{R}^{4}\), projecting host-visible imagery into 3D, and routing visibility through Observation Modes. The design aligns with prior MRS / RT4D work and a hybrid-first host model in which adapters consume projected Scene3D plus lineage rather than owning 4D intersection. Phase 1 of the program is documentation: BVH and projection stages, SO(4)-aware shading interfaces, path-transport alignment, a render-graph sketch, and a Shader ABI. Deep engine RHI integration and real-time preview budgets are roadmap items. We do not report measured frame times as achieved results; evaluation plans and design targets are stated explicitly for future measurement.

**Keywords (draft):** higher-dimensional rendering; 4D BVH; projection; Observation Modes; hybrid host integration.

---

## 1. Introduction

Interactive and cinematic pipelines routinely assume a 3D world space. Content that is naturally authored in \(\mathbb{R}^{4}\) — hypersurfaces, W-parameterized volumes, rotational orbits in SO(4) — still needs disciplined **projection**, **lineage**, and **observation policy** before a Unity, Unreal, or web host can display it.

**Contributions (honest):**

1. A **declared** architecture for 4D BVH traversal, shading/transport interfaces, and 4D→3D projection toward host-consumable outputs.  
2. Observation Mode contracts that separate “what exists in 4D” from “what the host sees.”  
3. A hybrid-first integration stance: FourDRenderer authority vs FourDAdapter consumer.  
4. An explicit implementation-status table using declared / partial / skeleton / roadmap vocabulary.

**Non-contributions:**

- Finished GPU SO(4) BSDF product claim.  
- Production Unreal RHI / Nanite / Lumen 4D paths.  
- Measured real-time SLA.

---

## 2. Related work

Position as an **extension** of MRS / RT4D / Engine v1 — not a “world’s first” absolute. Cover classical 4D visualization, hyperspace ray tracing, engine path tracers, and projection protocols. Cite internal anchors without upgrading stubs to complete systems:

- [`docs/4drs/SPEC-v1.0.md`](../../4drs/SPEC-v1.0.md)  
- [`docs/4d-engine/v2/FOURD_RENDERER_V2_ARCHITECTURE.md`](../FOURD_RENDERER_V2_ARCHITECTURE.md)

---

## 3. Problem statement

| Gap | Declared response |
| --- | --- |
| Authoring in \(\mathbb{R}^{4}\) without host policy | World / ray model + Observation Modes |
| Ad-hoc 4D→3D collapse | PLP-aligned projection + lineage |
| Unclear authority between 4D engine and 3D host | Hybrid-first: adapter consumes Scene3D + lineage |
| Performance storytelling without measurements | Separate design targets from evidence |

---

## 4. Architecture

### 4.1 World and ray model

World space \(\mathbb{R}^{4}\); rays \(R(t)=O+tD\). Hyper-box accel structures and slab traversal are **declared** in the BVH/projection RFC; CPU paths are **partial** prior art; GPU kernels remain **skeleton / roadmap**.

### 4.2 Shading and transport

ShadingFrame4D / BSDF4D Sample–Evaluate interfaces are **declared**. Alignment with RT4D path transport is **partial** in existing MRS code. GPU SO(4) enforcement is **not claimed**.

### 4.3 Projection and Observation Modes

`Project4DTo3D` → host-visible `ShadingOutput3D` / Scene3D, with lineage for determinism and debugging. Observation Modes route which slice or policy becomes visible — **declared** contracts, not a finished director tool suite.

### 4.4 Host blend interface

Declared blend toward Unreal’s 3D domain (and analogous hosts). Deep RHI / Nanite / Lumen work is **roadmap**. Diagram: [`ENGINE_ARCHITECTURE_DIAGRAM.md`](./ENGINE_ARCHITECTURE_DIAGRAM.md).

---

## 5. Implementation status (evidence table)

Mirror the scorecard; do not collapse dimensions.

| Component | Status |
| --- | --- |
| v2 RFC / architecture suite | **Declared** (Phase 1 documentation) |
| Canvas / web demo, RT4D | **Partial** (MRS present) |
| BVH GPU | **Skeleton** |
| FourDAdapter Unity / Unreal | **Skeleton** |
| World Format / PLP | **Declared** (+ schema validation; thin stubs) |
| Unreal RHI deep 4D domain | **Roadmap** |
| Measured 4–6 ms preview | **Not claimed** |

Scorecard: [`docs/scorecards/fourd-renderer-v2.md`](../../scorecards/fourd-renderer-v2.md).

---

## 6. Results — targets / to be measured

> **This section must not claim achieved real-time performance.**  
> Until measurements exist, publish only targets and planned metrics.

| Item | Allowed wording |
| --- | --- |
| Phase 1 | Documentation / RFC suite **declared complete** |
| Preview budget | **Design target:** 4D passes ≤ 4–6 ms on a **future** target GPU — **to be measured**; **not achieved in this draft** |
| Validation categories | T1–T5 **declared** ([`../validation/TEST_SUITE_AND_VALIDATION.md`](../validation/TEST_SUITE_AND_VALIDATION.md)) |
| Sample scenes | S1–S4 **declared** |
| GPU kernels / RHI blend | **Not claimed complete** |
| Existing Canvas / HCL timings | Orthogonal **partial** evidence for prior paths — **not** v2 GPU budget fulfillment |

~~Forbidden: “achieves 4–6 ms,” fabricated FPS bars, or “real-time SLA met.”~~

Performance model (targets only): [`../performance/PERFORMANCE_MODEL_AND_GPU_BUDGET.md`](../performance/PERFORMANCE_MODEL_AND_GPU_BUDGET.md).

### Planned evaluation (future work)

1. Characterize Trace4D / shade / projection cost on declared stress scene S4 once Phase 2+ kernels exist.  
2. Report host-visible frame overhead for FourDAdapter ingest when functional Unreal/Unity paths exist.  
3. Separate offline film quality from realtime preview modes in all tables.

---

## 7. Discussion and limitations

Drive-G-1 / Drive-G-2 framing: constitutional completeness (RFCs) is not platform readiness (GPU factory) or commercial readiness. Limitations: incomplete GPU path, skeleton adapters, budgets unmeasured. Future work: Phase 2 kernels, Phase 3 host blend measurements, Phase 4 tooling, Phase 6 benchmarks ([`../roadmap/ENGINE_INTEGRATION_ROADMAP.md`](../roadmap/ENGINE_INTEGRATION_ROADMAP.md)).

---

## 8. Conclusion

FourDRenderer v2.0 contributes a coherent **declared** contract suite for higher-dimensional rendering and host observation. Present evidence supports documentation maturity and partial MRS reference paths; it does not support unqualified production or measured realtime claims. Measurement and deep host integration remain the next evidence gates.

---

## References (internal anchors)

- `docs/4d-engine/v2/FOURD_RENDERER_V2_ARCHITECTURE.md`  
- `docs/4d-engine/v2/bvh-projection/BVH_AND_PROJECTION_RFC.md`  
- `docs/4d-engine/v2/shading-transport/SHADING_AND_TRANSPORT_RFC.md`  
- `docs/4d-engine/v2/observation/OBSERVATION_MODE_RFC.md`  
- `docs/4d-engine/v1/plp/PLP_V1.md`  
- `docs/scorecards/fourd-renderer-v2.md`  
- `constitution/CHARTER.md`

## Contact

**TBD**
