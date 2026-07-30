# 03 — Implementor notes

## Done

- `scripts/governed-render.mjs`: prompt → VII/VIII soft wrap → CCC honesty select → Engine3D soft still → trail + SHA-256
- `npm run mrs:governed-render`
- Quality log seeded with recent cycles
- Optional `opencl.gen` assist (non-blocking)

## Status tags

| Piece | Tag |
|-------|-----|
| Engine3D soft path | **partial** (enforced as local proof renderer for this MVP) |
| Reproducible runId | **partial** (sha256 of canonical inputs) |
| Lemonade | **held** |
| CL-Gen soft-raster OpenCL | **partial** / deferred vs one-command milestone |

## Tests

Manual: run invoke command; confirm `still.png` + `verification-trail.json` exist.
Wrap unit coverage remains in `sovereign-x/tests/openclGenProvider.test.js` (VII/VIII fixtures) when that suite is green.
