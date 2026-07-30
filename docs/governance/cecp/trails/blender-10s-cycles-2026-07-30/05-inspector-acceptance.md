# 05 — Inspector acceptance

| Field | Value |
|-------|-------|
| Role | Inspector |
| InspectorVerdict | **PASS_WITH_GAPS** |
| lens | Testwright |

## Evidence matrix

| Claim | Evidence | Verdict |
|-------|----------|---------|
| Blender 5.2 present | `blender --version` → 5.2.0 LTS | PASS |
| Held GLB imports | CLI log “glTF import finished”; camera=`camera` | PASS |
| Cycles PNG (fast) | `tmp/blender-10s-test/cycles-beauty-64x64-s8.png` exists, 6371 B, **7051 ms** | PASS |
| Cycles PNG (mid) | `…/cycles-beauty-128x128-s16.png` exists, 20715 B, **25207 ms** | PASS |
| Governed beauty | `…/587f836fc789a003/beauty-cycles.png`; trail `cyclesStatus: complete`, `pixelsProduced: true` | PASS |
| Photoreal production-ready | No film plate / GPU / higher samples | FAIL → gap (**partial**) |
| Lemonade photoreal | `lemonade.pixelsProduced: false` | held |

## Probe commands (executed)

1. Blender CLI Cycles 64²/8 and 128²/16 against `tmp/glb-repro/scene.glb`
2. `node scripts/governed-render.mjs --prompt "10s blender test" --beauty external-pbr --width 64 --height 64`

## Anti-overclaim

- Do **not** claim GPU Cycles or production photoreal from this smoke.
- Do **not** treat soft-raster `still.png` as Cycles beauty.
- Overall feature status remains **partial**; smoke path is **enforced** on this host only.
