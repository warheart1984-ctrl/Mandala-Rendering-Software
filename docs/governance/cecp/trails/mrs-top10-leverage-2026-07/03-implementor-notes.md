# 03 — Implementor notes

- Tile API: full-frame render then Pillow crop (honest ROI, not tile-only shader).
- `path_trace`: subprocess to `render-worlddocument-rt4d.mjs`; requires engine3d-core build.
- Director metadata: `per_tile_available` true; waiver may remain for evidence modes until execute loop dispatches tiles.
