# tools — export / import

**Status:** GLB export **working**. FBX **skeleton**. Import **partial** (inspect JSON chunk).

## Purpose

Scripts that produce the three GLBs from **one** character source and document interchange.

## CLI

```bash
# from repo root
node character/tools/export-character.mjs
node character/tools/export-character.mjs --width 128 --height 128
node character/tools/export-character.mjs --source character/models/source/default-humanoid.json
node character/tools/export-character.mjs --no-turntable
node character/tools/import-character.mjs character/models/exports/char_rigged.glb
```

## Modules

| Script | Role |
|--------|------|
| `export-character.mjs` | Stage 1–3 GLB + PNG |
| `import-character.mjs` | Read GLB JSON / extras |
| `fbx-export.mjs` | Honest FBX stub |
| `simulation-chamber-hook.mjs` | Chamber consume path |
| `lib/humanoid-mesh.mjs` | Procedural mesh + armature |
| `lib/glb-encode.mjs` | glTF 2.0 binary writer |
| `lib/raster-still.mjs` | CPU wire / rig / beauty |
| `lib/apply-sim.mjs` | Frame-0 sim stand-in |
| `lib/png-encode.mjs` | RGBA PNG |

## Simulation Chamber

```bash
node scripts/simulation-chamber.mjs <scene-card.json> --character-glb
node scripts/simulation-chamber.mjs <scene-card.json> --character-glb character/models/exports/char_rigged.glb
```

The flag does not replace capsule avatars yet (`status=partial`). It binds Chamber to this pipeline so a future adapter does not invent a third character.
