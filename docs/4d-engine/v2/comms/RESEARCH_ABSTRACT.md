# Research Abstract — FourDRenderer v2.0 (Evidence-Bound)

> Softened abstract for internal notes / draft submissions.  
> Label any punchier version as aspirational: [`aspirational/RESEARCH_ABSTRACT.md`](./aspirational/RESEARCH_ABSTRACT.md).  
> Redline: [`CLAIMS_REDLINE.md`](./CLAIMS_REDLINE.md)

## Abstract

We present a **declared architecture** for higher-dimensional rendering over \(\mathbb{R}^{4}\), named FourDRenderer v2.0. The architecture specifies contracts for (i) bounding-volume hierarchies over 4D hyper-boxes, (ii) SO(4)-aware bidirectional scattering distribution function (BSDF) interfaces over direction space \(S^{3}\), (iii) a path-transport loop intended to extend existing RT4D work, (iv) a 4D→3D projection stage aligned with an upstream Projective Lattice / PLP framing, and (v) Observation Modes that route how higher-dimensional structure becomes host-visible 3D imagery. A blend interface toward conventional engine 3D domains (including Unreal) is **declared**; deep render-hardware-interface (RHI) integration, Nanite/Lumen extensions, and real-time GPU budgets are **roadmap** items and are **not** reported here as measured results. Prior partial evidence exists in MRS renderer-core conformance, RT4D path modules, and BVH4D CPU/GPU skeletons; Phase 1 of the v2 program denotes **documentation completeness**, not completion of GPU kernels. Design performance targets (for example, 4–6 ms for 4D passes in a future preview configuration) are planning numbers only.

## Keywords

4D rendering; BVH; SO(4); Observation Modes; projection; Unreal blend interface (declared); evidence-bound architecture

## Status note

Draft / declared · Drive-G-1 · See [`../FOURD_RENDERER_V2_ARCHITECTURE.md`](../FOURD_RENDERER_V2_ARCHITECTURE.md) and [`docs/scorecards/fourd-renderer-v2.md`](../../../scorecards/fourd-renderer-v2.md).
