# Marketing Deck — FourDRenderer v2.0 (Evidence-Bound)

> **Form:** Slide text for internal / controlled briefings.  
> **Status:** Strategic positioning draft — **not** capability evidence.  
> **Redline:** [`CLAIMS_REDLINE.md`](./CLAIMS_REDLINE.md)  
> Punchier language (brainstorm only): [`aspirational/MARKETING_DECK.md`](./aspirational/MARKETING_DECK.md)

---

## Slide 1 — Title

**FourDRenderer v2.0**  
Higher-Dimensional Rendering Architecture (**Declared**)

Subtitle: Contracts for \(\mathbb{R}^{4}\) BVH, SO(4)-aware shading, projection, and Observation Modes — extending MRS / RT4D / Engine v1.

Footer: Draft · Drive-G-1 evidence-bound · Not a shipped Unreal RHI product claim

---

## Slide 2 — Problem

- Host engines excel at 3D; higher-dimensional scene structure is awkward to express as “just another mesh.”  
- Projection and observation policy must be **explicit**, not ad-hoc camera hacks.  
- Studios need a clear **authority boundary**: who owns 4D intersection / shading vs who consumes Scene3D.

---

## Slide 3 — What we declare (not “what ships today”)

FourDRenderer v2.0 **declares**:

1. 4D BVH over hyper-boxes  
2. SO(4)-aware BSDF contracts  
3. Path-transport loop contracts (builds on RT4D **partial** evidence)  
4. 4D→3D projection stage (aligns with PLP)  
5. Observation Mode routing  
6. Blend **interface** toward Unreal’s 3D domain (**deep RHI = roadmap**)

---

## Slide 4 — Architecture at a glance

```
WorldDocument / Observation (v1)
        → PLP / Project4DTo3D
        → Scene3D + Lineage  → FourDAdapter (consumer)
        ↑
FourDRenderer v2.0 contracts (BVH / SO(4) / path / Observation)
        → roadmap: Unreal RHI 4D domain
```

---

## Slide 5 — Evidence today (honest)

| Area | Status |
| --- | --- |
| v2 RFC / architecture suite | **Declared** (Phase 1 docs) |
| RT4D / Canvas / MRS math | **Partial** |
| BVH4D CPU / GPU sketches | **Partial** / **skeleton** |
| Unreal FourDAdapter | **Skeleton** (Scene3D + lineage) |
| Unreal RHI / Nanite / Lumen 4D | **Roadmap** — not claimed working |
| 4–6 ms preview budget | **Design target** — **not measured** |

---

## Slide 6 — Maturity (Drive-G-2)

| Dimension | Rating |
| --- | --- |
| Constitutional model | Declared (early) |
| Governance methodology | Declared |
| Reference implementation | Partial (MRS) / early skeleton (v2 GPU) |
| Platform engineering | Skeleton / roadmap |
| Commercial operations | Roadmap |

Framing: *contracts may exist; the Unreal RHI factory is still early.*

---

## Slide 7 — Roadmap (phases)

1. Foundation — **docs complete** (this suite)  
2. GPU implementation — **roadmap**  
3. Unreal integration (GBuffer / PT / Lumen feed) — **roadmap**  
4. Tooling — **roadmap**  
5. Optimization — **roadmap**  
6. Productionization + measured benchmarks — **roadmap**

---

## Slide 8 — What we are not claiming

- Not “world’s first.”  
- Not production-ready Unreal RHI.  
- Not seamless Nanite/Lumen 4D.  
- Not a measured real-time 4–6 ms SLA.  
- Not a full tooling suite today.

---

## Slide 9 — Who this is for (now)

- Architects reviewing declared contracts  
- Engine / graphics leads evaluating hybrid-first adapters  
- Research partners interested in Observation Modes / SO(4) framing  

Not yet: self-serve commercial users.

---

## Slide 10 — CTA

**Next step:** Review technical index [`../README.md`](../README.md) and scorecard [`docs/scorecards/fourd-renderer-v2.md`](../../../scorecards/fourd-renderer-v2.md).  

**Contact:** TBD (replace before any external send).  

**Ask:** Partnership or design review under declared-architecture terms — not a production license claim.
