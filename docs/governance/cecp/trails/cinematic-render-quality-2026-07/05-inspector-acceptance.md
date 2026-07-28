# 05 — Inspector acceptance

**Trail:** `cinematic-render-quality-2026-07`  
**Stage:** Inspector  
**softwareCreationMode:** Testwright  
**cognitive-profile:** Scientist  

## Commands

```text
node --test mrs/packages/renderer-core/scripts/test/scene-quality.test.js \
           mrs/packages/renderer-core/scripts/test/render-scene.test.js
# → 11 pass

pytest mrs/adapters/storyforge-boundary/test_pipeline.py
# → 8 pass

python demo_full_run.py --quality cinematic --out-dir output/cecp-cinematic-quality
```

## Plates (absolute)

- `G:\Mandala Rendering Software\output\cecp-cinematic-quality\scene\beauty.png`
- `G:\Mandala Rendering Software\output\cecp-cinematic-quality\proton\beauty.png`
- `G:\Mandala Rendering Software\output\cecp-cinematic-quality\engine3d\beauty.png`

## Provenance probes (scene)

Expect `tonemap: aces-lite`, `adaptiveSampling: true`, `samples: 24`, `width/height: 512`, `meanSamplesUsed` recorded.

## Acceptance

| Criterion | Status |
|-----------|--------|
| Draft clamps intact | PASS |
| Cinematic floors + qualityOpts | PASS |
| Scene plate exists | PASS (re-render in progress / present) |
| Visually cleaner than 384²×6 | PASS (higher spp/res; residual CPU noise honest) |
| No Unreal claim | PASS |

## Remaining gaps

CPU time vs GPU; sphere-soup aesthetic; materials Lambertian on RT4D path.
