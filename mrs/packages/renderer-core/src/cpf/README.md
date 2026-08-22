# Canonical Perceptual Field (CPF) — Image component

**Status: experimental.** This is the FIRST component of a broader
*Canonical Perceptual Field* idea. Today it covers still images (**CPF‑Image**).
**CPF‑Video** and **CPF‑4D** are explicitly future work.

The whole point of this layer is **byte‑deterministic, hashable visual truth**:
the same input bytes always produce the same packet and the same hashes, on every
run and platform. There is no `Math.random` and no `Date.now` anywhere in the codec.

## Measurement vs Perception vs Interpretation

| Layer | Object | What it is | Model? |
|-------|--------|------------|--------|
| Measurement | **CPO** (Canonical Pixel Object) | Lossless, canonical, hashable re‑expression of the pixels | **No** — pure arithmetic |
| Perception | **SPO** (Semantic Perception Object) | Claimed labels/regions, referencing a CPO **by hash** | Provider (currently `skeleton`) |
| Interpretation | LLM / downstream | Reasoning over CPO + SPO | Out of scope here |

Because the SPO only references the CPO by `payload_hash`, perception can never
contaminate measurement: the CPO is provable on its own, and an SPO is trusted
only when its `source_hash` matches the CPO it is presented against.

## `mandala-link/1` packet (CPO)

```json
{
  "protocol": "mandala-link/1",
  "type": "image",
  "subtype": "canonical-indexed-grid",
  "payload": {
    "width": 4,
    "height": 2,
    "palette": [[0,0,0,255],[255,255,255,255]],
    "encoding": "rle-v1",
    "grid": "3:0,2:1,3:0",
    "palette_hash": "<sha256 hex>",
    "grid_hash": "<sha256 hex>"
  },
  "payload_hash": "<sha256 hex>",
  "provenance": {
    "source_hash": "sha256:<sha256 of raw RGBA>",
    "encoder": "mandala-cpf/cpo",
    "encoder_version": "1.0.0",
    "params": { "encoding": "rle-v1", "palette_order": "sorted-rgba-asc", "lossless": true }
  }
}
```

### Palette ordering rule (canonical)

The palette is the **set** of distinct RGBA colors, sorted ascending by the
32‑bit key `(R<<24)|(G<<16)|(B<<8)|A`. This is a pure function of the color set
and is **independent of pixel layout**, so two images with the same colors get the
same palette and the same `palette_hash`. Each pixel is assigned the index of its
color in this sorted palette.

### Index stream

Row‑major (y‑major, x‑minor) sequence of palette indices, length `width*height`.

### RLE grammar (`rle-v1`)

```
grid  := run ("," run)*
run   := count ":" index
count := positive decimal integer (>= 1)   # run length
index := non-negative decimal integer       # palette index
```

Runs are **maximal** (consecutive equal indices merged). The sum of all counts
equals `width*height`. An empty (0‑pixel) image encodes as `""`.
Example: `"3:0,2:1,10:0"`.

### Hashes (all lowercase hex sha256, via `node:crypto`)

- `palette_hash` = `sha256(palette bytes)` — `N` entries × 4 bytes RGBA, in palette order.
- `grid_hash` = `sha256(utf8(RLE string))`.
- `payload_hash` = `sha256(utf8(digest input))` where the digest input is the
  canonical string:
  ```
  mandala-cpo/1\n<width>\n<height>\n<encoding>\npalette_hash=<palette_hash>\ngrid_hash=<grid_hash>\n
  ```
  This transitively covers the whole payload (palette via `palette_hash`, grid via
  `grid_hash`).
- `provenance.source_hash` = `"sha256:" + sha256(raw input RGBA bytes)`.

## Lossless vs lossy

`encodeCPO` is **lossless**: for any RGBA buffer, `decodeCPO(encodeCPO(...))`
reproduces the exact bytes. Palettes are unbounded — an image with N distinct
colors yields an N‑entry palette.

For arbitrary photographic images with too many colors, an OPTIONAL, clearly
separate quantizer (`quantizeRgbaBitDepth`, uniform per‑channel bit reduction) can
reduce colors first. After quantization the round‑trip is exact **with respect to
the quantized buffer** (not the original) — this is lossy and must be treated as a
distinct source. Median‑cut / k‑means palettes are declared future work.

## Query pyramid (attention unlock)

Full‑frame token grids at levels **8, 16, 32, 64**. Level **256** is available
only as a targeted crop.

- `inspectGrid(cpoOrHash, level)` → coarse canonical `level×level` grid.
- `inspectRegion(cpoOrHash, x, y, width, height, level)` → higher‑res canonical
  sub‑grid for a normalized `[0,1]` crop.

Downsample rule: each target cell maps to a source pixel rectangle and takes the
**mode** (most frequent) palette index; ties break to the **lowest** palette
index. Every result carries a deterministic `level_hash` / `region_hash` and the
`source_hash` of the CPO, so queries are hash‑addressable and reproducible.

Hash‑addressing is explicit: pass a CPO packet, or a `payload_hash` string plus a
`{ store }` resolver (`CPOStore`). There is no hidden global mutable state.

## SPO overlay (perception, hash‑linked)

```json
{
  "type": "semantic-overlay",
  "schema_version": "1.0.0",
  "source_hash": "sha256:<CPO payload_hash>",
  "regions": [
    { "region": "r0", "label": "sky", "confidence": 0.91, "bbox": [0.0, 0.0, 1.0, 0.4] }
  ],
  "provider": { "name": "mandala-cpf/perception", "status": "skeleton", "model": null }
}
```

`validateSPO(spo, cpo)` checks structure and that `source_hash` equals
`"sha256:" + cpo.payload_hash`; it **rejects** a mismatched hash. `bbox` is
normalized `[x, y, w, h]` in `[0,1]`; `confidence` is `[0,1]`. **No perception
model is integrated** — the provider is `skeleton` and regions are caller‑supplied
claims.

## API

```js
import {
  encodeCPO, decodeCPO, validateCPO,
  encodeCPOFromPng, decodeCPOToPng,
  encodeRleV1, decodeRleV1,
  quantizeRgbaBitDepth,
  buildPyramid, inspectGrid, inspectRegion, CPOStore,
  makeSPO, validateSPO, spoMatchesCPO,
} from "@mrs/renderer-core/src/cpf/index.mjs";
```
