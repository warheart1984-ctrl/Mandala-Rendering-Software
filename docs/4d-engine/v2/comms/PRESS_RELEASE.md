# Press Release — FourDRenderer v2.0 (Evidence-Bound Draft)

> **Status:** Draft announcement **for when evidence supports a launch**.  
> Not a claim that a product launch is happening today.  
> Punchier launch language: [`aspirational/PRESS_RELEASE.md`](./aspirational/PRESS_RELEASE.md)  
> Redline: [`CLAIMS_REDLINE.md`](./CLAIMS_REDLINE.md)  
> **Press contact: TBD**

## Embargo / readiness gate

Do **not** distribute this as a live press release until:

- [ ] Evidence refresh per Drive-G-1 (what is claimed matches code / tests / measured data)  
- [ ] Scorecard wording still agrees ([`docs/scorecards/fourd-renderer-v2.md`](../../../scorecards/fourd-renderer-v2.md))  
- [ ] Contact line is a verified address (replace **TBD**)  
- [ ] No “world’s first / production-ready / seamless Unreal / measured 4–6 ms” as present facts  

## Headline (allowed)

**FourDRenderer v2.0: Declared Architecture Suite for Higher-Dimensional Rendering Published**

## Subhead (allowed)

Documentation and contracts for \(\mathbb{R}^{4}\) acceleration, SO(4)-aware shading interfaces, 4D→3D projection, and Observation Modes — extending MRS / RT4D / Engine v1. GPU completeness and deep Unreal RHI integration remain roadmap.

## Body (evidence-bound)

**[DATE TBD — do not invent]** — FourDRenderer v2.0 publishes a **declared** architecture and RFC suite for higher-dimensional rendering. The suite specifies contracts for 4D bounding-volume hierarchies, shading frames compatible with SO(4)-aware BSDF interfaces, projection into host-consumable 3D outputs, and Observation Modes that govern how the fourth spatial axis becomes visible.

FourDRenderer is positioned as **upstream authority** over 4D intersection, shading, and projection contracts. Host engines consume projected Scene3D data plus lineage through adapters such as FourDAdapter (**skeleton** / hybrid-first). Deep injection into Unreal RHI, Nanite W-awareness, and Lumen W-GI are **roadmap** items and are **not** described here as shipped capabilities.

Performance envelopes published with the architecture — including a **design target** of ≤ 4–6 ms for 4D passes on a future target GPU — are **targets**, not measured SLAs.

Phase 1 of the program is defined as **documentation / RFC completeness**. Subsequent phases (GPU kernels, host blend measurements, tooling, benchmarks) are sequenced in the integration roadmap and are not claimed complete by this announcement draft.

## Quote (safe placeholder)

> “We’re publishing the contract layer first — and we label what is declared versus what still needs kernels and measurements.”  
> — **TBD**, FourDRenderer

## About / boilerplate

FourDRenderer v2.0 is a declared higher-dimensional rendering architecture extending prior MRS / RT4D / Engine v1 work. See technical index: `docs/4d-engine/v2/README.md`.

## Media contact

**Press contact: TBD**  
Analyst / studio contact: **TBD**

## Assets

- Architecture diagrams: [`ENGINE_ARCHITECTURE_DIAGRAM.md`](./ENGINE_ARCHITECTURE_DIAGRAM.md), [`ENGINE_DIAGRAMS.md`](./ENGINE_DIAGRAMS.md)  
- Fact sheet: [`PRESS_KIT.md`](./PRESS_KIT.md)  
- Trailer: creative brief only — [`LAUNCH_TRAILER_SCRIPT.md`](./LAUNCH_TRAILER_SCRIPT.md), [`CINEMATIC_DEMO_SCRIPT.md`](./CINEMATIC_DEMO_SCRIPT.md)
