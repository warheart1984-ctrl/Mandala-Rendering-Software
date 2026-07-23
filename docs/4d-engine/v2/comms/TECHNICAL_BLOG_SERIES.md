# Technical Blog Series — FourDRenderer v2.0  
## Five Outlines (Educational Drafts)

> Each post should open with a status callout: **declared / partial / roadmap**.  
> Do not present design budgets as benchmarks.  
> Redline: [`CLAIMS_REDLINE.md`](./CLAIMS_REDLINE.md)

---

## Post 1 — Why Observation Modes?

**Angle:** Higher-dimensional content needs an explicit policy for what a 3D host “sees.”  
**Status callout:** Extends Engine v1 ObservationMode — **declared** in v2 RFC.  
**Outline:**

1. Failure mode of ad-hoc W hacks  
2. Mode as routing + blend policy  
3. Relationship to WorldDocument / lineage  
4. What is implemented today vs roadmap  
5. Further reading: Observation Mode RFC

---

## Post 2 — 4D BVH Without Magical Thinking

**Angle:** Hyper-box bounds, slab tests including W, SAH-4D as a **target** partition heuristic.  
**Status callout:** Contracts **declared**; CPU BVH **partial**; GPU **skeleton**.  
**Outline:**

1. Why 3D AABB intuition breaks  
2. Node layout sketch  
3. Traversal cost model (declared)  
4. Evidence map to existing BVH4D docs  
5. What Phase 2 must prove

---

## Post 3 — SO(4) BSDF Contracts (Not Enforcement Yet)

**Angle:** Direction space \(S^{3}\) and invariance requirements as **contracts**.  
**Status callout:** Declared; GPU SO(4) enforcement **not claimed**.  
**Outline:**

1. Why SO(3) frames are insufficient  
2. ShadingFrame4D sketch  
3. Sample / Evaluate ABI  
4. Energy conservation as declared requirement  
5. How readers should cite this (weak verbs)

---

## Post 4 — Projection & PLP Alignment

**Angle:** 4D→3D as a first-class stage, aligned with PLP / `projectWorld`.  
**Status callout:** Declared alignment; host adapters remain hybrid-first consumers.  
**Outline:**

1. ProjectionPolicyId role  
2. ShadingOutput3D host boundary  
3. FourDAdapter non-ownership of 4D compute  
4. Diagram walkthrough  
5. Links to PLP v1 + Architecture

---

## Post 5 — Performance Models vs Myths

**Angle:** How to talk about 4–6 ms without lying.  
**Status callout:** **Declared budget** — not measured SLA.  
**Outline:**

1. Cost model per pass  
2. Preview vs offline modes  
3. Why citing Canvas/RT4D timings ≠ v2 GPU proof  
4. What Phase 6 benchmarks must look like  
5. Drive-G-1 checklist for authors

---

## Series housekeeping

- Cross-link scorecard on every post.  
- Prefer diagrams from [`ENGINE_DIAGRAMS.md`](./ENGINE_DIAGRAMS.md).  
- Marketing CTAs must remain TBD / non-capability.
