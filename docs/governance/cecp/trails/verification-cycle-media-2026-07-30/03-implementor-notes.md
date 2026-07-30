# 03 — Implementor notes

| Field | Value |
|-------|-------|
| Role | Implementor + Constructor |
| Date | 2026-07-30 |
| Code changes | **None** (verification-only cycle) |

## Commands executed

```bash
npm run sx:image-gen-probe -- --write
npm run sx:image-gen-probe -- --force-gpu-down --write
npm run sx:image-gen-probe -- --try-generate --write
npm run sx:legacy-efficient -- --intent verify-cycle-2026-07-30 --still --provider auto --width 512 --height 512 --prompt "…" --out tmp/book-movie-ch1/verification-cycle-2026-07-30/sx-legacy-auto-proof.json
node tmp/book-movie-ch1/render_ch1_cinematic.mjs --proof --shot 02-dim-room --cinematic-v2 --amendment-vii --width 960 --height 540 --out-root tmp/book-movie-ch1/verification-cycle-2026-07-30
node tmp/book-movie-ch1/render_ch1_cinematic.mjs --cinematic-v2 --amendment-vii --max-seconds 2 --fps 12 --width 960 --height 540 --out-root tmp/book-movie-ch1/verification-cycle-2026-07-30/clip-2s
node --test sovereign-x/tests/ImageGenProvider.test.js
```

## Results

- CCC: fallback works; **no Lemonade pixels** on `--try-generate`
- SX auto: OpenCL Tonga still **produced** (`lemonadeOk: false`)
- Engine3D: Amendment VII soft bake `scale≈0.2009 organic=true`; still + 2s clip OK
- Tests: ImageGenProvider **11/11 pass**

## Gaps preserved

- `local.cpu` / remote CCC stubs remain deferred (no fake PNG)
- Lemonade sd-server beauty path still host-dependent
