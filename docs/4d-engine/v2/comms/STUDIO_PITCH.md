# Studio Pitch — FourDRenderer v2.0 (Evidence-Bound)

> **Status:** Strategic positioning draft — not a vendor capability brochure.  
> **Redline:** [`CLAIMS_REDLINE.md`](./CLAIMS_REDLINE.md)  
> Aspirational tone: [`aspirational/STUDIO_PITCH.md`](./aspirational/STUDIO_PITCH.md)

## One-liner

FourDRenderer v2.0 is a **declared** higher-dimensional rendering architecture: contracts for \(\mathbb{R}^{4}\) acceleration, SO(4)-aware shading, projection into host-consumable 3D, and Observation Modes — intended to sit upstream of host adapters such as FourDAdapter.

## What a studio would evaluate

| Topic | Honest status |
| --- | --- |
| Architecture / RFCs | **Draft / declared** — full suite under [`docs/4d-engine/v2/`](../) |
| Browser / MRS / RT4D paths | **Partial** evidence in existing packages |
| Unreal Scene3D + lineage ingest | FourDAdapter **skeleton** / hybrid-first consumer |
| Deep Unreal RHI (buffers, compute in engine) | **Roadmap** — not claimed shipped |
| Nanite W-awareness / Lumen W-GI | **Roadmap** — not working paths |
| Material / Sequencer / 4D debugger suite | Phase 4 **roadmap**; some v1 skeletons only |
| Preview frame budget 4–6 ms | **Design target**, not measured SLA |

## Integration model (declared)

1. **Authority:** FourDRenderer owns 4D intersection / shading / projection **contracts**.  
2. **Host consumer:** FourDAdapter (Unity / Unreal) imports **Scene3D + lineage**; it does **not** compute 4D.  
3. **Blend:** A declared interface feeds projected 3D shading outputs toward host GBuffer / path / GI paths when Phase 3 work exists.  
4. **Observation Modes:** Extend Engine v1 mode routing so “how W is seen” is a first-class policy, not an undocumented camera trick.

## What we would demo today (evidence-bound)

- Architecture walkthrough against the RFC index.  
- Existing MRS / RT4D / Canvas paths where they already run (**separate** from v2 GPU completeness).  
- Sample scene **specs** S1–S4 as declared characterization vehicles (not as measured v2 GPU results).

## What we would not demo as “done”

- Production Unreal RHI 4D domain.  
- Nanite/Lumen “just works in 4D.”  
- Guaranteed 4–6 ms on a named GPU.  
- A complete DCC tooling suite.

## Ask

Design partnership or architecture review under **declared** terms. Commercial self-serve is **not claimed**. Contact: **TBD**.

## References

- [`../README.md`](../README.md)  
- [`../roadmap/ENGINE_INTEGRATION_ROADMAP.md`](../roadmap/ENGINE_INTEGRATION_ROADMAP.md)  
- [`docs/scorecards/fourd-renderer-v2.md`](../../../scorecards/fourd-renderer-v2.md)
