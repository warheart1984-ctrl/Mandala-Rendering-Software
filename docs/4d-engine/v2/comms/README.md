# FourDRenderer v2.0 — Comms / Go-to-Market Materials

| Field | Value |
| --- | --- |
| Status | **Strategic positioning / aspirational messaging drafts** |
| Audience | Internal GTM, investors (draft), press (draft), studios (draft) |
| Drive-G-1 | Public or README capability claims require **evidence refresh** |
| Drive-G-2 | Do not collapse maturity into a single “ready” adjective |

## Critical honesty rules

These documents are **positioning drafts**. They are **not** capability evidence.

1. **MUST NOT** be copied into product README capability tables as present facts.  
2. **MUST NOT** be cited as proof that GPU pipeline, Unreal RHI deep integration, Nanite/Lumen blend, or 4–6 ms budgets are measured or enforced.  
3. Technical RFCs under [`../`](../) remain **Draft / declared**. See scorecard [`docs/scorecards/fourd-renderer-v2.md`](../../../scorecards/fourd-renderer-v2.md).  
4. Before any public claim: refresh evidence (code, tests, CI, measured timings) per Drive-G-1, or keep the weaker wording from the evidence-bound files.

## How this folder is organized

| Layer | Location | Use |
| --- | --- | --- |
| **Evidence-bound** (preferred) | Files in this directory | Honest titles; declared / roadmap / partial language; safe to discuss internally; still **not** README capability rows |
| **Aspirational** | [`aspirational/`](./aspirational/) | Punchier GTM language for brainstorming only |
| **Redline map** | [`CLAIMS_REDLINE.md`](./CLAIMS_REDLINE.md) | Forbidden → allowed wording; maps overclaims to honest status |

If aspirational copy and evidence-bound copy conflict, **evidence-bound + CLAIMS_REDLINE win**.

## Artifact index

| Artifact | Form | Notes |
| --- | --- | --- |
| [MARKETING_DECK.md](./MARKETING_DECK.md) | Evidence-bound slide text | Honest titles; see also `aspirational/` |
| [STUDIO_PITCH.md](./STUDIO_PITCH.md) | Evidence-bound overview | Integration status marked honestly |
| [RESEARCH_ABSTRACT.md](./RESEARCH_ABSTRACT.md) | Evidence-bound abstract | “Declared architecture…” |
| [API_REFERENCE_MANUAL.md](./API_REFERENCE_MANUAL.md) | **Declared API sketch** | Not an implemented SDK |
| [WEBSITE_COPY.md](./WEBSITE_COPY.md) | Public copy + inline redlines | |
| [LAUNCH_TRAILER_SCRIPT.md](./LAUNCH_TRAILER_SCRIPT.md) | Creative brief | Not a shipped trailer claim |
| [TECHNICAL_BLOG_SERIES.md](./TECHNICAL_BLOG_SERIES.md) | Five outlines | Educational; label status per post |
| [ENGINE_DIAGRAMS.md](./ENGINE_DIAGRAMS.md) | ASCII pipeline diagrams | Technical; OK |
| [PRESS_KIT.md](./PRESS_KIT.md) | Redlined key messages | Contact TBD |
| [INVESTOR_BRIEF.md](./INVESTOR_BRIEF.md) | Strategic draft | Not audited financials |
| [ACADEMIC_POSTER.md](./ACADEMIC_POSTER.md) | Poster text | Results = targets / declared |
| [ENGINE_ARCHITECTURE_DIAGRAM.md](./ENGINE_ARCHITECTURE_DIAGRAM.md) | Graphical description | Technical; OK |
| [CLAIMS_REDLINE.md](./CLAIMS_REDLINE.md) | Redline summary | Required companion |

## Explicit non-claims (folder-wide)

- Not “the world’s first” 4D renderer or architecture.  
- Not production-ready Unreal RHI / Nanite / Lumen 4D.  
- Not measured real-time 4–6 ms SLA.  
- Not a full tooling suite that exists today.  
- Not a live `press@…` inbox unless replaced with a verified contact (use **TBD**).

## Related technical sources (evidence anchors)

- Index: [`../README.md`](../README.md)  
- Architecture: [`../FOURD_RENDERER_V2_ARCHITECTURE.md`](../FOURD_RENDERER_V2_ARCHITECTURE.md)  
- Shader ABI: [`../shader-abi/SHADER_ABI.md`](../shader-abi/SHADER_ABI.md)  
- Performance targets: [`../performance/PERFORMANCE_MODEL_AND_GPU_BUDGET.md`](../performance/PERFORMANCE_MODEL_AND_GPU_BUDGET.md)  
- Roadmap: [`../roadmap/ENGINE_INTEGRATION_ROADMAP.md`](../roadmap/ENGINE_INTEGRATION_ROADMAP.md)  
- Scorecard: [`docs/scorecards/fourd-renderer-v2.md`](../../../scorecards/fourd-renderer-v2.md)
