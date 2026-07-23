# Academic Poster — FourDRenderer v2.0 (Draft Text)

> Poster copy for draft academic / research venues.  
> **Results section uses targets / declared — not measured 4–6 ms as fact.**

## Title

FourDRenderer v2.0: A Declared Architecture for Higher-Dimensional Rendering, Projection, and Observation Modes

## Authors / Affiliation

TBD

## Abstract (short)

We describe declared contracts for rendering over \(\mathbb{R}^{4}\): 4D BVH, SO(4)-aware BSDF interfaces, path-transport alignment with prior RT4D work, 4D→3D projection, and Observation Modes for host-visible imagery. Deep engine RHI integration is roadmap; we do not report measured real-time budgets as achieved results.

## Methods / Architecture

- World space \(\mathbb{R}^{4}\); rays \(R(t)=O+tD\)  
- Hyper-box BVH + 4D slab traversal (**declared**; CPU partial / GPU skeleton prior art)  
- ShadingFrame4D / BSDF4D Sample–Evaluate (**declared**)  
- Project4DTo3D → `ShadingOutput3D`  
- Observation routing toward host blend policies  

Diagram: see [`ENGINE_DIAGRAMS.md`](./ENGINE_DIAGRAMS.md).

## Results (targets / declared)

| Item | Poster wording |
| --- | --- |
| Phase 1 | Documentation / RFC suite **declared complete** |
| GPU kernels | **Not claimed complete** |
| Preview budget | **Design target** ≤ 4–6 ms for 4D passes on a future target GPU — **not measured in this work** |
| Unreal RHI / Nanite / Lumen | **Roadmap** |
| Validation | Categories T1–T5 **declared**; not presented as a finished v2 GPU CI suite |

~~Do not plot fake FPS bars labeled “achieved 5 ms.”~~

## Discussion

Evidence-bound framing separates constitutional completeness (RFCs) from platform readiness (GPU / host factory). Future work: Phase 2 kernels, Phase 3 host blend measurements, Phase 6 benchmarks.

## References (internal anchors)

- `docs/4d-engine/v2/FOURD_RENDERER_V2_ARCHITECTURE.md`  
- `docs/4d-engine/v2/performance/PERFORMANCE_MODEL_AND_GPU_BUDGET.md`  
- `docs/scorecards/fourd-renderer-v2.md`

## Contact

TBD
