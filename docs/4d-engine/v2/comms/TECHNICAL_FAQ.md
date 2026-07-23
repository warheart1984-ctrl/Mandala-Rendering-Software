# Technical FAQ — FourDRenderer v2.0 (Evidence-Bound)

> Honest answers for architects and technical directors.  
> Punchier paraphrases: [`aspirational/TECHNICAL_FAQ.md`](./aspirational/TECHNICAL_FAQ.md)  
> Redline: [`CLAIMS_REDLINE.md`](./CLAIMS_REDLINE.md)

## Q1. What is FourDRenderer v2.0 today?

A **declared** architecture and RFC suite for rendering over \(\mathbb{R}^{4}\), projecting to host-visible 3D, and routing Observation Modes. Phase 1 = documentation complete. It is **not** a claim that a full GPU SO(4) path or production Unreal RHI plugin ships today.

## Q2. How does this relate to Engine v1 / PLP / MRS / RT4D?

v2 **extends** Engine v1 World Format, PLP, Observation Mode ideas, and prior MRS / RT4D paths. It does **not** replace hybrid-first FourDAdapter scope. See [`../README.md`](../README.md).

## Q3. Does FourDAdapter compute 4D?

**No.** FourDAdapter (Unity / Unreal) is a **hybrid-first Scene3D + lineage consumer** (**skeleton**). Authority for 4D contracts sits with FourDRenderer / PLP.

## Q4. Is Unreal integration “seamless”?

**No.** Declared blend interface toward Unreal’s 3D domain; deep RHI / Nanite / Lumen work is **roadmap**. Prefer: “adapter consumes projected outputs.”

## Q5. What about the 4–6 ms number?

It is a **design target** for 4D passes on a **future** target GPU (**not measured**). Do not cite as SLA or achieved result.

## Q6. Is there a full GPU SO(4) path yet?

**Architecture declared.** Partial BVH / prior-art paths exist in related packages. A **full GPU SO(4) enforcement path is not claimed**. SO(4)-aware BSDF interfaces are contracts; GPU enforcement = **not claimed**.

| Layer | Honest status |
| --- | --- |
| Architecture / RFCs | **Declared** |
| BVH4D | **Declared**; CPU / prior art **partial**; GPU **skeleton / roadmap** |
| SO(4) BSDF contracts | **Declared** |
| Full GPU SO(4) path | **Not yet** — do not claim |

## Q7. What can we demo without overclaiming?

Architecture walkthrough against RFCs; existing MRS / RT4D / Canvas paths where they already run (**separate** from v2 GPU completeness); sample scene **specs** as characterization vehicles — not as measured v2 GPU results.

## Q8. Is there a shipped SDK?

**No.** See **declared API sketch**: [`API_REFERENCE_MANUAL.md`](./API_REFERENCE_MANUAL.md), [`ENGINE_SDK_DOCUMENTATION.md`](./ENGINE_SDK_DOCUMENTATION.md), and [`../shader-abi/SHADER_ABI.md`](../shader-abi/SHADER_ABI.md).

## Q9. Tooling (materials, Sequencer, debugger)?

Phase 4 **roadmap**; some Engine v1 skeletons only. Not a full suite that exists today.

## Q10. Commercial / self-serve readiness?

Commercial operations = **roadmap**. Contact: **TBD**. Do not describe as production-ready without naming dimension + audience (Drive-G-2).

## Q11. Where is the maturity scorecard?

[`docs/scorecards/fourd-renderer-v2.md`](../../../scorecards/fourd-renderer-v2.md) — rate dimensions independently.

## Q12. Validation / tests?

Categories T1–T5 are **declared** in validation RFCs. Do not present them as a finished v2 GPU CI suite.
