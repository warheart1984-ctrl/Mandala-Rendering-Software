# Production sculpt intake — `warrior-anthro-fox-01`

**Status:** drop a **ZBrush** (or equivalent) export here to unlock production under identityLock.

## Required

| File | Purpose |
|------|---------|
| `sculpt.obj` **or** `sculpt.fbx` | Production body mesh from ZBrush (GoZ / Decimation Master export OK) |
| `identityLock.json` | Optional operator overrides; digests are rewritten on import |

## Optional

| File | Purpose |
|------|---------|
| `preview.png` | If present, used as NCE keyframe (else Blender bake attempted) |
| `displacement.exr` / `.tif` | Displacement maps (declared until wired) |
| `uv.png` | UV layout reference |

## Import

```bash
python3 mrs/adapters/neural-cinematic/import_zbrush_production.py --character-id warrior-anthro-fox-01
```

Until `sculpt.obj`/`sculpt.fbx` exists, Mandala falls back to the **fixture** anthro sculpt
(`core-enforced-fixture-not-production-sculpt`) and must **not** claim `productionSculpt=true`.
