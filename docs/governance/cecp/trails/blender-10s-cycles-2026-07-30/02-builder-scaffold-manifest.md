# 02 — Builder scaffold manifest

| Field | Value |
|-------|-------|
| Role | Builder |
| status | **enforced** for smoke paths (no new scaffolding required) |

## Reused surfaces (no new stubs)

| Surface | Path |
|---------|------|
| Cycles launcher | `render-glb-cycles.py` / `.bat` |
| External PBR beauty | `sovereign-x/router/modules/gpu/amd/externalPbrBeauty.js` |
| Governed render | `scripts/governed-render.mjs` |
| Held GLB | `tmp/glb-repro/scene.glb` |

## Output dirs (created at run)

- `tmp/blender-10s-test/`
- `tmp/blender-10s-test/governed-render/<runId>/`

## Env knobs used

| Env | Value |
|-----|-------|
| `BLENDER_PATH` | Blender 5.2 `blender.exe` |
| `PHOTOREAL_CYCLES_SAMPLES` | `8` |
