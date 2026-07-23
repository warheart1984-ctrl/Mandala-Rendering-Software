# Engine Architecture Diagram — FourDRenderer v2.0  
## Graphical Description (Technical)

> Companion to [`ENGINE_DIAGRAMS.md`](./ENGINE_DIAGRAMS.md) and [`../FOURD_RENDERER_V2_ARCHITECTURE.md`](../FOURD_RENDERER_V2_ARCHITECTURE.md).  
> Suitable for slides; does **not** claim GPU enforcement.

## How to read

Boxes are **contract regions**. Dashed edges = **roadmap**. Solid edges = **declared** data/control flow (implementation may still be partial/skeleton).

## Layer stack (top → bottom)

1. **Authoring / WorldDocument** — scene identity, Observation Mode ids, lineage.  
2. **FourDRenderer v2 domain (declared)**  
   - Geometry: `Primitive4D` / embedded surfaces  
   - Accel: BVH4D nodes (hyper-boxes)  
   - Transport: RayGen → Trace → Shade/Path  
   - Materials: SO(4) BSDF contracts  
   - Project: `Project4DTo3D` / PLP-aligned projection policies  
   - Route: Observation Mode blend policy  
3. **Host-visible buffers** — `ShadingOutput3D` (+ lineage bundle).  
4. **Adapter lane (skeleton)** — FourDAdapter imports Scene3D + lineage; no 4D compute claim.  
5. **Engine RHI lane (roadmap)** — inject into GBuffer / path tracer / GI (Lumen feed declared as intent only).

## Suggested figure caption

> Figure 1. FourDRenderer v2.0 declared architecture. Solid paths denote contract interfaces; dashed paths denote Unreal RHI / Nanite / Lumen roadmap work. Performance envelopes are design targets, not measured SLAs.

## Swimlane (textual graphic)

```
[ Content ]     WorldDocument · ObservationModeId · Materials4D
      |
[ Accel ]       BVH4D (DECLARED) ---- GPU kernels (ROADMAP / skeleton prior art)
      |
[ Shade ]       BSDF4D Sample/Eval (DECLARED) ---- GPU SO(4) enforce (NOT CLAIMED)
      |
[ Project ]     Project4DTo3D → ShadingOutput3D (DECLARED · PLP-aligned)
      |
[ Route ]       ObservationRoute / blend flags (DECLARED)
      +------------------+------------------+
      |                  |                  |
[ Adapter ]        [ GBuffer inject ]  [ Lumen/Nanite ]
 Scene3D consumer    ROADMAP             ROADMAP
 (SKELETON)
```

## Three-column host split (complete description)

After projection, host work fans into **three columns**. Use this layout on slides so marketing overlays cannot collapse “adapter exists” into “RHI done.”

| Column | Name | What flows in | Honest status | Speak-aloud caption |
| --- | --- | --- | --- | --- |
| **A** | Adapter lane | `Scene3D` + lineage bundle from PLP / `ShadingOutput3D` | **Skeleton** — FourDAdapter (Unity / Unreal) hybrid-first consumer | “Consumes projected 3D — does not compute 4D.” |
| **B** | GBuffer / deferred inject | Projected position, normal, radiance, depth toward host deferred or path-tracer feeds | **Declared intent** · Phase 3 **roadmap** | “Blend interface declared; deep RHI not claimed shipped.” |
| **C** | Nanite / Lumen lane | W-aware geometry stream / GI feed concepts | **Roadmap** — not working paths | “Nanite W-awareness / Lumen W-GI are future work.” |

```
                    Project4DTo3D
                          |
            +-------------+-------------+
            |             |             |
         Column A      Column B      Column C
       FourDAdapter   GBuffer/PT     Nanite/Lumen
        SKELETON       ROADMAP         ROADMAP
```

**Design rule:** Column A may be drawn with a solid border (skeleton evidence elsewhere). Columns B and C must use dashed borders and the amber roadmap token. Never ink Column C as a completed product feature.

## Color / legend (for designers)

| Visual | Meaning |
| --- | --- |
| Solid blue | Declared contract |
| Amber dash | Roadmap |
| Gray fill | Partial / skeleton evidence elsewhere (MRS/RT4D) |
| Red strike annotation | Forbidden overclaim zone in marketing overlays |

## Export notes

When redrawing in Figma/Illustrator, keep the status legend on-canvas so cropped social posts cannot drop the honesty labels.
