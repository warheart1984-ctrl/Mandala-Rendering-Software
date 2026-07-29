# Math-driven render acceleration (Director scope · Draft v0.1)

**Status:** **declared** — index for math/BVH/BRDF accelerators that feed AcceleratedRenderer.  
**Not:** runtime enforcement · not Genblaze API flags

Parent pipeline: [ACCELERATED_RENDERER.md](./ACCELERATED_RENDERER.md)  
Contract artifacts: [RENDER_ACCEL_CONTRACT.md](./RENDER_ACCEL_CONTRACT.md)

---

## Scope

Documents how **renderer-core** math (4D BVH, BRDF normalization, projections) and Director-side **work models** relate to CPU preview acceleration. Infinity Director v0.1 implements only the **ATCM dimensionless work model** in `app/atcm.py` (`estimate_not_measured`).

## Module mapping (honest)

| AR module | Math / engine touchpoint today | Tag |
|-----------|----------------------------------|-----|
| AR.Geometry | Tile grid + prepass variance/edge stats; no BVH visibility map in Director | **declared** |
| AR.Materials | Prompt keyword proxy for material complexity | **partial** (heuristic) |
| AR.Lighting | ATCM cheap/full classification + adaptive work units | **partial** |
| AR.PostFX | Not wired in Director | **declared** |

## References (repository)

- `mrs/packages/renderer-core/` — BVH4D, BRDF, RT4D math (constitutional rendering SoT)
- `app/atcm.py` — tile complexity + work reduction **estimate**
- `docs/4drs/substrate/MATHEMATICAL_FOUNDATIONS.md` — substrate math (broader MRS)

## Claims boundary (Drive-G-1)

- Work-unit speedup labels are **not** wall-clock FPS.
- Director does **not** send unsupported Genblaze AO/GI/raster flags.
- Per-tile shading execution remains **declared** until Engine3D/Genblaze expose tile-aware still APIs.
