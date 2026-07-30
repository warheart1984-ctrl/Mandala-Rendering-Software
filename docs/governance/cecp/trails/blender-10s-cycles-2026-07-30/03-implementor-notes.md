# 03 — Implementor notes

| Field | Value |
|-------|-------|
| Role | Implementor |
| lens | Artisan (smoke craft) |
| code changes | **none** (execute-only cycle) |

## Commands run

### A) Direct Cycles — 128² / 16 samples

```text
blender -b -P render-glb-cycles.py -- tmp/glb-repro/scene.glb \
  tmp/blender-10s-test/cycles-beauty-128x128-s16.png 16 128 128
```

- Wall: **25207 ms** (~25.2 s)
- PNG: `tmp/blender-10s-test/cycles-beauty-128x128-s16.png` (20715 bytes)
- Device: CPU (OptiX error 7804; HIP library missing)

### B) Direct Cycles — 64² / 8 samples (~10s target)

```text
blender -b -P render-glb-cycles.py -- tmp/glb-repro/scene.glb \
  tmp/blender-10s-test/cycles-beauty-64x64-s8.png 8 64 64
```

- Wall: **7051 ms** (~7.05 s) — **meets ~10s budget**
- PNG: `tmp/blender-10s-test/cycles-beauty-64x64-s8.png` (6371 bytes)

### C) Governed-render external-pbr

```text
set BLENDER_PATH=...\Blender 5.2\blender.exe
set PHOTOREAL_CYCLES_SAMPLES=8
node scripts/governed-render.mjs --prompt "10s blender test" \
  --beauty external-pbr --width 64 --height 64 --seed 1 \
  --out-root tmp/blender-10s-test/governed-render
```

- Wall (full pipeline): **~34366 ms** (~34.4 s) — includes soft-raster + GLB export + Cycles
- `runId`: `587f836fc789a003`
- `cyclesStatus`: **complete**
- `exportStatus`: **held**
- `photorealClaim`: **true**
- Beauty: `…/beauty-cycles.png` (6371 bytes; SHA `a370cd58813034f1…`)
- GLB SHA: `3ebe5d8fc4ac41d7…bf1e` (matches prior Held proof)

## Status tags

| Claim | Tag |
|-------|-----|
| Cycles smoke PNG at 64²/8 ≈7s | **enforced** (this host) |
| Governed external-pbr beauty pixels | **enforced** (this host, smoke res) |
| Production photoreal / GPU Cycles | **partial** / not claimed |
| Lemonade | **held** |
