# Claims Redline — FourDRenderer v2.0 Comms

> Maps overclaims → honest status.  
> Drive-G-1: no documentation claim may exceed implementation evidence.  
> Drive-G-2: rate dimensions independently; do not say “production ready” without audience + dimension.

## Forbidden → allowed

| Forbidden / overclaim | Allowed wording | Honest status |
| --- | --- | --- |
| “World’s first 4D renderer / architecture” | “Higher-dimensional rendering architecture (**declared**)”; “extends MRS / RT4D / Engine v1” | Non-claim; prior art exists; no first-mover proof |
| “Production-ready” (unqualified) | “RFC suite **declared**; GPU / Unreal RHI **roadmap**; MRS paths **partial**” | Per scorecard dimensions — not a single adjective |
| “Seamless Unreal integration” | “Declared blend interface toward Unreal’s 3D domain”; “FourDAdapter = hybrid-first Scene3D consumer”; “deep RHI **roadmap**” | Adapter skeleton; RHI not claimed |
| “Real-time 4–6 ms” as fact / SLA | “Design target: 4D passes ≤ 4–6 ms on a **future** target GPU (**not measured**)” | Declared budget only |
| “Full tooling suite exists” | “Tooling (material nodes, Sequencer track, 4D debugger) is **Phase 4 roadmap**; some Engine v1 skeletons exist” | Not Phase 4 complete |
| `press@fourdengine.com` (or similar) as live inbox | `Press contact: **TBD**` | No verified contact in-repo |
| “SO(4) BSDF enforced on GPU” | “SO(4)-aware BSDF **contracts declared**; GPU enforcement **not claimed**” | Declared / partial prior art only |
| “Full GPU SO(4) path exists” | “Architecture **declared**; partial BVH **exists**; full GPU SO(4) path **not yet**” | See `TECHNICAL_FAQ.md` Q6 |
| “Phase 1 complete” meaning GPU done | “Phase 1 = **documentation** complete; Phase 2+ GPU **roadmap**” | Docs ≠ kernels |
| “Nanite / Lumen are 4D” | “Nanite W-awareness / Lumen W-GI **roadmap** — not working paths” | Explicit non-claim |
| “Shipped SDK / API” | “**Declared API sketch** — see Shader ABI / `ENGINE_SDK_DOCUMENTATION.md` / `API_REFERENCE_MANUAL.md`” | Not an implemented SDK |
| “Press release / launch today” | “Draft announcement **for when evidence supports launch**” | `PRESS_RELEASE.md` is gated |
| “Brand kit proves market leadership” | “**Declared brand positioning**” | `BRANDING_PACKAGE.md` |
| “Partnership timeline is committed” | “Strategic draft; calendars **aspirational**” | `STUDIO_PARTNERSHIP_PROPOSAL.md` |
| “Academic results / measured 4–6 ms in paper” | “Results = **targets / declared**; manuscript Results **to be filled with measured evidence**” | Soften all academic “results” |
| “SIGGRAPH course scheduled” | “**Declared educational outline** — acceptance / date TBD” | `SIGGRAPH_COURSE_NOTES.md` |
| “Cinematic demo is a realtime product proof” | “Creative brief / director guide — not a shipped realtime claim” | `CINEMATIC_DEMO_SCRIPT.md`, `MULTI_WORLD_CINEMATIC_BIBLE.md` |
| “Studio integration guide = certified onboarding” | “**Declared / planned** steps; adapter **skeleton**” | `STUDIO_INTEGRATION_GUIDE.md` |
| “Investors: first-mover lock / audited metrics” | “Strategic draft; **not** audited financials; soften first-mover absolutes” | GTM draft only |
| Copying deck bullets into root README capability table | Link only as “positioning drafts (not capability evidence)” | This folder is not evidence |

## Status vocabulary (use consistently)

| Tag | Meaning |
| --- | --- |
| **declared** | Spec / contract written; not runtime-enforced by that alone |
| **draft** | Subject to change |
| **partial** | Some code/tests exist; incomplete |
| **skeleton** | Scaffold / stub / early path |
| **roadmap** | Planned; not present capability |
| **aspirational** | Messaging draft only — see `aspirational/` |

## Leak checklist (before any external use)

- [ ] No “world’s first” / “production-ready” / “seamless” without redline  
- [ ] 4–6 ms only as design target + “not measured”  
- [ ] Unreal = declared interface / adapter consumer / RHI roadmap  
- [ ] Full GPU SO(4) path not claimed (architecture declared; BVH partial)  
- [ ] Academic Results not filled with fabricated measurements  
- [ ] Press / partnership / branding = drafts; contact lines are TBD or verified  
- [ ] Root / product README **not** updated with these as shipped capabilities  
- [ ] Scorecard still matches claims ([`docs/scorecards/fourd-renderer-v2.md`](../../../scorecards/fourd-renderer-v2.md))
