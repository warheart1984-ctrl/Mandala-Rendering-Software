# Engine Architecture Poster — FourDRenderer v2.0  
## Conference Poster Layout Description (Evidence-Bound)

| Field | Value |
| --- | --- |
| Status | **Declared poster layout** — creative/print production TBD |
| Form | Conference poster (A0 / 36×48″ class — exact size TBD) |
| Related | [`ACADEMIC_POSTER.md`](./ACADEMIC_POSTER.md) (copy), [`ENGINE_ARCHITECTURE_DIAGRAM.md`](./ENGINE_ARCHITECTURE_DIAGRAM.md) |
| Redline | [`CLAIMS_REDLINE.md`](./CLAIMS_REDLINE.md) |
| Aspirational mirror | [`aspirational/ENGINE_ARCHITECTURE_POSTER.md`](./aspirational/ENGINE_ARCHITECTURE_POSTER.md) |

> Layout + caption rules only. Results panels use **targets / declared**, not measured 4–6 ms.

---

## Poster identity

| Element | Content |
| --- | --- |
| Title | FourDRenderer v2.0: Declared Architecture for \(\mathbb{R}^{4}\) Rendering, Projection & Observation |
| Subtitle | Hybrid-first hosts · MRS / RT4D alignment · Phase 1 documentation |
| Authors / logos | **TBD** |
| QR / links | Scorecard + architecture index (URLs **TBD**); never claim “production-ready” on QR splash |

---

## Physical layout (top → bottom)

### Band A — Header (full width, ~12% height)

- Title + subtitle left; affiliation + venue badge right (**acceptance TBD**).  
- Thin status ribbon: `Declared RFCs · Partial MRS · Skeleton adapters · Roadmap RHI`  
- Color legend (fixed):  
  - **Declared** — cool slate  
  - **Partial** — muted teal  
  - **Skeleton** — warm amber  
  - **Roadmap** — soft gray dashed

### Band B — Abstract + motivation (two columns, ~15%)

| Left | Right |
| --- | --- |
| Short abstract (evidence-bound; from [`SIGGRAPH_PAPER.md`](./SIGGRAPH_PAPER.md) §Abstract) | Problem bullets: 4D authoring, projection discipline, host authority |
| Keywords | Explicit non-claims box (small type): no world’s-first; no measured 4–6 ms SLA |

### Band C — Architecture pipeline (full width, ~35%) — visual hero

Three-column host split (redraw from [`ENGINE_ARCHITECTURE_DIAGRAM.md`](./ENGINE_ARCHITECTURE_DIAGRAM.md)):

```text
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│  4D DOMAIN      │ →  │  PROJECTION /    │ →  │  HOST 3D        │
│  (authority)    │    │  OBSERVATION     │    │  (consumer)     │
│  BVH · shade ·  │    │  Project4DTo3D   │    │  Scene3D +      │
│  transport      │    │  Mode routing    │    │  lineage        │
│  [declared /    │    │  [declared]      │    │  FourDAdapter   │
│   partial MRS]  │    │                  │    │  [skeleton]     │
└─────────────────┘    └──────────────────┘    └─────────────────┘
         │                      │                        │
         └──────── RHI / Nanite / Lumen [roadmap] ───────┘
```

Caption under hero: *Schematic contracts — not a claim of finished GPU SO(4) enforcement.*

Side callouts (icons OK if restrained):

1. Hyper-box BVH slab  
2. ShadingFrame4D / BSDF4D Sample–Evaluate  
3. Observation Mode as lens policy  
4. Adapter does **not** own 4D intersection

### Band D — Status + Results (two columns, ~25%)

| Left — Implementation status | Right — Results (targets / to be measured) |
| --- | --- |
| Table: RFC suite declared; Canvas/RT4D partial; BVH GPU skeleton; adapters skeleton; RHI roadmap | Design target ≤ 4–6 ms 4D passes on **future** GPU — **not measured** |
| Point to scorecard five dimensions (tiny Drive-G-2 table) | T1–T5 / S1–S4 **declared** evaluation plan |
| | ~~No fake FPS bars~~ |

### Band E — Footer (~13%)

- Limitations + future work (Phase 2–6 one-liners).  
- Internal anchors (short paths).  
- Contact: **TBD**.  
- Drive-G-1 footnote: *Claims do not exceed implementation evidence.*

---

## Typography / production notes

- Prefer one display face + one readable sans; avoid Inter/Roboto defaults if printing for brand — match declared branding package when available.  
- Large diagrams over dense paragraphs.  
- Minimum body size readable at ~1 m.  
- Do not overlay floating “production-ready” badges on the hero diagram.

## Print checklist

- [ ] Status ribbon present  
- [ ] Results panel says **targets / to be measured**  
- [ ] Legend matches CLAIMS_REDLINE vocabulary  
- [ ] No world’s-first / seamless Unreal supers  
- [ ] Contact is TBD or verified  

## Contact

**TBD**
