# 01 — Architect ADR

| Field | Value |
|-------|-------|
| Role | Architect |
| lens | Render-Stylist |
| status | **partial** (designed, not implemented) |

## 1. Intent

Spec a **"4D ink/cel"** stylized render lane for the Engine3D CPU soft-raster:
deterministic banded diffuse + hard specular + an ink outline AOV, exposed through
the existing `render-engine3d-still.mjs` CLI and `POST /api/engine3d-still` without
touching the 4D math, projection, or governance layers.

## 2. ADR

**Context:** Photorealism is the repo's verifiable north star, but it is the *hardest*
target for a CPU soft-raster on a free-tier single thread. Abstract 4D content
(tesseract-lattice, capsule beams, projected hypergeometry) is *structure*, and a
cel/ink aesthetic celebrates structure where physically-based shading tries to hide
it. Stylized shading also needs far fewer effective samples (banding hides noise),
is trivially deterministic (quantized bands instead of continuous variance), and is
honest to the soft-raster's status ("not photoreal").

**Decision:** Add a `style` option (`"cinematic"` default, `"ink-cel"` new) threaded
from `RasterStillRequest` → `renderStillBuffers` → post-process → CLI flag →
API field → provenance manifest. The ink/cel look is produced by (1) banding the
existing N·L diffuse term into fixed levels, (2) quantizing the specular term,
(3) a new ink AOV computed from depth+normal discontinuities (reusing the edge
primitive already in `RasterPostProcess.ts`), and (4) compositing ink onto beauty.
Optional deterministic palette posterize. All constants fixed literals — no
randomness, no time dependence (P4).

**Consequences:** Byte-identical reproducibility strengthens provenance claims;
stylized stills become the honest *primary* demo lane for 4D abstract geometry while
Cycles/ACES remains the photoreal lane. Adds manifest fields (`style`, `ink_sha256`).
Backward compatible: default `"cinematic"` output is unchanged.

## 3. Interface

| Input | Source |
|-------|--------|
| Raster request | `mrs/packages/engine3d-core/src/renderer/raster/HeadlessStillRenderer.ts` — `RasterStillRequest` gains `style` + `ink?` |
| Shading | `mrs/packages/engine3d-core/src/renderer/raster/RasterMaterial.ts` — `shadeRasterFragment` banding path |
| Post-process | `mrs/packages/engine3d-core/src/renderer/raster/RasterPostProcess.ts` — ink map + composite + palette |
| CLI | `mrs/packages/engine3d-core/scripts/render-engine3d-still.mjs` — `--style ink-cel` |
| API | `mrs/apps/genblaze-media/app/engine3d_still_provider.py` — `style` field, manifest `style`/`ink_sha256` |

## 4. Boundary

- In scope: Engine3D soft-raster toon/ink lane + tests + provenance fields.
- Out of scope: WGSL/WebGPU changes, RT4D shading, RT4D post-pass, photoreal claims,
  governance/constitution/schema edits, B2 layout changes, new video lane.

## 5. File manifest

See [`FILE_MANIFEST.md`](./FILE_MANIFEST.md).

## 6. Acceptance

See [`ACCEPTANCE_CRITERIA.md`](./ACCEPTANCE_CRITERIA.md).

Key gates: determinism proof (same input twice → byte-identical PNGs), ink AOV with
SHA-256 in manifest, `style` passthrough, default `"cinematic"` output byte-identical
to today, no governance changes.
