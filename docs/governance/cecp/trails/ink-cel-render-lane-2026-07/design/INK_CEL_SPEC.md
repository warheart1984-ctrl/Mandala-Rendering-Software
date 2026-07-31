# INK_CEL_SPEC — 4D Ink/Cel Render Lane (Design Contract)

Status: `partial` (design only — no implementation yet). All constants below are
**fixed literals**; the lane is fully deterministic (P4). Soft-raster output is
stylized, **not photoreal**.

## 1. Style threading

New option on the raster request, threaded through the full path:

| Layer | Change |
|-------|--------|
| `RasterStillRequest` (`HeadlessStillRenderer.ts:57`) | `style?: "cinematic" \| "ink-cel"` (default `"cinematic"`), `ink?: InkOptions` |
| `renderStillBuffers` (`HeadlessStillRenderer.ts:251`) | if `style === "ink-cel"`, use cel shading + ink post-process; buffers gain `inkRgba` |
| `RasterStillBuffers` (`HeadlessStillRenderer.ts:86`) | `inkRgba?: Uint8Array` (line map, white bg + dark ink) |
| `writeStillPngs` (`HeadlessStillRenderer.ts:700`) | writes `ink.png` when present; returns `inkPath` + `inkSha256` |
| `render-engine3d-still.mjs` | `--style ink-cel`; output JSON gains `style`, `ink_sha256` |
| `engine3d_still_provider.py` | request field `style` (default `"cinematic"`); manifest gains `style` and `ink_sha256` |

Backward compatibility: `style` omitted/`"cinematic"` must produce byte-identical
output to today's renderer.

## 2. InkOptions type

```ts
interface InkOptions {
  /** Diffuse band boundaries (fractions of N·L). Default [0.30, 0.70]. */
  diffuseBands?: readonly [number, number];
  /** Diffuse level values (length diffuseBands.length + 1). Default [0.18, 0.62, 1.0]. */
  diffuseLevels?: readonly [number, number, number];
  /** Specular highlight cutoff on N·H. Default 0.985 (flat white). */
  specularCutoff?: number;
  /** Ink darkening 0–1. Default 0.85. */
  inkStrength?: number;
  /** Ink line width in px (dilation radius). Default 1. */
  lineWidth?: number;
  /** Edge thresholds. Default { depth: 0.06, normal: 0.14 }. */
  thresholds?: { depth: number; normal: number };
  /** Ink RGB (linear). Default [0.05, 0.05, 0.08]. */
  inkColor?: Vec3;
  /** Palette posterize levels per channel; 0 = disabled. Default 0. */
  paletteLevels?: number;
  /** Shadow band darker value. Default 0.12. */
  shadowLevel?: number;
}
```

Defaults are constants in a new `ToonShade.ts`; no runtime configuration beyond the
request fields.

## 3. Cel shading (fragment stage)

Applied in `RasterMaterial.ts` when the request style is `"ink-cel"`, on the
existing `shadeRasterFragment` N·L path (or a dedicated `shadeRasterFragmentToon`
delegating to it with options):

- **Diffuse banding:** replace continuous `ndl` with
  `band(ndl) = levels[i]` where `i` = count of band thresholds `<= ndl`.
  Default 3 levels `[0.18, 0.62, 1.0]` at boundaries `[0.30, 0.70]`.
  The shadow band uses `shadowLevel` (default 0.12) instead of `levels[0]`
  when `ndl < 0.10`.
- **Specular quantization:** keep the existing gloss computation but render as a
  flat highlight: `spec = gloss >= specularCutoff ? 1 : 0` scaled by existing
  fresnel/metal terms. No partial falloff.
- **Emissive / procedural types:** keep their glow terms unchanged (they already
  read as "neon ink"); only the diffuse/specular terms are banded.
- **Lights:** banding applies per light in `shadeRasterFragmentLights`
  (`RasterMaterial.ts:315`); accumulation unchanged (sum of banded terms).

These thresholds live only in the toon path — the `"cinematic"` path is untouched
(byte-identical guarantee).

## 4. Ink outline AOV (post-process)

New functions in `RasterPostProcess.ts`, built on the existing depth-edge pattern
at `RasterPostProcess.ts:346-349` (extract a shared `depthEdgeMagnitude(depth, x, y)`
helper first):

1. **Edge map:** for each pixel, edge strength =
   `max(depthGap, normalGap)` where
   - `depthGap = |d - dLeft| + |d - dUp|` (already computed pattern),
   - `normalGap = |n - nLeft| + |n - nUp|` (Euclidean RGB distance on the
     normal AOV).
2. **Mask:** `mask = (depthGap > thresholds.depth) || (normalGap > thresholds.normal)`
   → 1.0 else 0.0.
3. **Dilation:** expand the mask by `lineWidth` px (default 1) using a fixed
   3×3 cross neighborhood — deterministic.
4. **Ink AOV:** `inkRgba = mask === 1 ? inkColor : white`, alpha 255. This is the
   raw line map persisted as `ink.png` with its own SHA-256.
5. **Composite:** final beauty =
   `celBeauty * (1 - inkStrength * mask)` + `inkColor * inkStrength * mask`
   (pre-tone). Tonemap (existing `applyTonemap`) runs after compositing so the
   ink integrates with the ACES-ish grade.

## 5. Palette quantization (optional)

When `paletteLevels > 0`, posterize the final composited linear RGB per channel to
`N` evenly spaced levels (`floor(v * N) / (N - 1)`), applied deterministically
before tonemap. Default `0` (disabled).

## 6. AOV + provenance

- `RasterStillBuffers` gains `inkRgba`; `writeStillPngs` writes
  `ink.png` + `inkSha256`.
- Manifest (`engine3d_still_provider.py`) gains `style` and, when present,
  `ink_sha256`. Existing `beauty_sha256`/`depth_sha256`/`normal_sha256` unchanged.
- No new B2 layout: still `genblaze-media/engine3d-still/{run_id}/beauty.png` etc.
  `ink.png` added alongside.

## 7. Determinism contract

- No randomness, no wall-clock, no float NaN paths. All band/edge constants are
  fixed literals.
- Proof: render the same request twice → byte-identical `beauty.png`, `depth.png`,
  `normal.png`, `ink.png` and identical SHA-256 digests.
- The existing `microGrain` (`RasterMaterial.ts:115`) is a deterministic normal
  hash — remains as-is in both styles.

## 8. Non-goals

- No WGSL/WebGPU shader changes (CPU soft-raster only).
- No RT4D shading or RT4D ink post-pass.
- No photoreal claims anywhere (status stays "stylized, not photoreal").
- No governance/constitution/schema/AGENTS.md changes.
- No video lane, no B2 layout change, no new BYOK scope.
