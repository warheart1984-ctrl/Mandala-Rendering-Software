# Diagram — 4D→3D Projection Lanes (v1)

| Field | Value |
| --- | --- |
| Status | **declared** |
| Related | [`ANIME_STRUCTURE_PLATE_PROJECTOR_CONTRACT.v1.md`](./ANIME_STRUCTURE_PLATE_PROJECTOR_CONTRACT.v1.md) |

```
                   ┌──────────────────────────────┐
                   │        Ray Tracer 4D          │
                   │   r(t) = o + t d ∈ ℝ⁴         │
                   └──────────────┬───────────────┘
                                  │
                                  ▼
                     ┌────────────────────────┐
                     │     4D Hit Point       │
                     │   p = (x,y,z,w)        │
                     └────────────┬──────────┘
                                  │
                 ┌────────────────┼────────────────┐
                 ▼                                ▼
   ┌──────────────────────────┐       ┌──────────────────────────┐
   │   Anime-Structure Lane   │       │     Literal-XYZ Lane     │
   │   Projector4D (SoT)      │       │        drop_w            │
   │ (x',y',z') = d4/(d4+w)*p │       │ (x',y',z') = (x,y,z)     │
   └──────────────┬──────────┘       └──────────────┬──────────┘
                  │                                 │
                  ▼                                 ▼
      ┌──────────────────────────┐       ┌──────────────────────────┐
      │   Engine3D Soft-Raster   │       │   Engine3D Soft-Raster   │
      │   (ink-cel optional)     │       │   (debug plate)          │
      └──────────────┬──────────┘       └──────────────┬──────────┘
                     │                                 │
                     ▼                                 ▼
           ┌──────────────────────┐        ┌──────────────────────┐
           │   Structure Plate    │        │   Debug Plate         │
           └──────────────────────┘        └──────────────────────┘
```

Print SoT / Digital Printer / ProjCC observation aperture are **separate** lanes (not shown as winners over this diagram).
