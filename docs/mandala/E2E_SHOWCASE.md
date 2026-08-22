# Character holography E2E showcase

**Status:** **partial** — visible smoke picture from CPU character holography EFR.  
Not production biomechanics, not “realistic by default”, not Chamber RT4D, not SD painter.

## One command

```bash
node character/holography/e2e-showcase.mjs
```

## What you open

| File | Meaning |
|------|---------|
| `output/character-holography/e2e-showcase/frame-final.png` | **The picture** — 2×2 collage (rest / muscle fire / smile / breath) |
| `output/character-holography/e2e-showcase/showcase.mp4` | Short still-sequence movie (when ffmpeg succeeds) |
| `output/character-holography/e2e-showcase/receipt.json` | Organs ran vs skipped, fingerprints, asserts |

## Organs

| Organ | Default |
|-------|---------|
| Character holography (skin EGT) | **runs** |
| MuscleRegion fire | **runs** |
| Face smile patch | **runs** |
| Body breathing | **runs** |
| CPU EFR PNGs | **runs** |
| FFmpeg MP4 | **runs** if `runtime/toolchain/ffmpeg/usr/bin/ffmpeg` present |
| Mandala proto project | skipped (keep fast) |
| Simulation Chamber RT4D | skipped (too slow on this box) |
| Golden painter / SD | skipped (512 OOM risk) |

## Related

- Unit tests: `node --test character/holography/test/holography.test.mjs`
- Demo PNGs: `node character/holography/demo.mjs`
- Contract: [`CHARACTER_HOLOGRAPHY.md`](./CHARACTER_HOLOGRAPHY.md)
