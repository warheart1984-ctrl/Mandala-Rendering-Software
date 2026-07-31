# FILE_MANIFEST — 4D Ink/Cel Render Lane

Status: `partial` (design; files below are the implementation plan, not yet changed).

## Modified files

| File | Change |
|------|--------|
| `mrs/packages/engine3d-core/src/renderer/raster/HeadlessStillRenderer.ts` | `RasterStillRequest` gains `style?: "cinematic" \| "ink-cel"` + `ink?: Partial<InkOptions>`; `RasterStillBuffers` gains `inkRgba: Uint8Array \| null` (line ~86); `renderStillBuffers` (line ~251) fills the ink AOV; `writeStillPngs` (line ~700) writes `ink.png` + computes `inkSha256` |
| `mrs/packages/engine3d-core/src/renderer/raster/RasterMaterial.ts` | New `InkOptions` type + `InkStyle` module (banded diffuse in `shadeRasterFragmentLights` line ~315, quantized specular via `specularCutoff`, `shadowLevel`); `microGrain` (line ~115) skipped under ink-cel |
| `mrs/packages/engine3d-core/src/renderer/raster/RasterPostProcess.ts` | `applyInkOutline` — extract depth+normal edge magnitude from existing edge primitive (lines ~346–349), 3×3 dilation, composite `inkStrength`/`inkColor` pre-tonemap; optional `applyPalettePosterize` |
| `mrs/packages/engine3d-core/scripts/render-engine3d-still.mjs` | `--style ink-cel` flag; `--profile <id>` (resolve via profile loader); pass `style`/`ink` into request; print `inkSha256` |
| `mrs/apps/genblaze-media/app/engine3d_still_provider.py` | API accepts `style` + optional `profile_id`; render call passes them; manifest gains `style`, `profile_id`, `profile_hash`, `ink_sha256`, `invariant_fingerprint`; uploads `ink.png` + `ink_sha256` |

## New files

| File | Purpose |
|------|---------|
| `mrs/packages/engine3d-core/src/renderer/raster/InkOptions.ts` | `InkOptions` interface + defaults (mirroring `INK_CEL_SPEC.md` §2) |
| `mrs/packages/engine3d-core/test/ink-cel.test.ts` | Unit tests: banding thresholds, specular cutoff, edge detection, dilation, palette posterize, determinism |
| `mrs/apps/genblaze-media/app/style_profiles.py` | Profile loader: `profile_id → profile JSON`, schema validation, `profile_hash`, `invariant_fingerprint` |
| `mrs/assets/style/profiles/anime.neon-lattice.v1.json` | First `AnimeWorldProfile` (design: `ANIME_WORLD_PROFILE.md` §3) |
| `mrs/assets/style/schemas/anime-world-profile.schema.json` | Profile JSON schema |

## Not touched (protected / out of scope)

- `engine/` (constitution, governance, policies, conformance)
- `schemas/` (top-level protected schemas)
- `constitution/`, `AGENTS.md`, `CITATION.cff`, `.zenodo.json`
- 4D math (`s3.js`, `vec4.js`, `transform.js`), projection, BSDF normalization, WGSL/WebGPU, RT4D shading/post-pass
- B2 layout, video lane, BYOK scope
