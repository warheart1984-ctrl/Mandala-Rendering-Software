# 02 — Builder scaffold manifest (six-mod refine)

**Trail:** `proton-raster-2026-07`  
**Stage:** Builder (refined after north-star interrupt)  
**Predecessor:** `01-architect-adr.md`

## Intent

Scaffold / rename layout for six CECP mods under renderer-core proton SoT.
Prior stubs (registry, softSplat, bridge) reused; new mod files added by Implementor
in same pass when scaffolds were thin.

## Scaffold manifest

| Path | Role |
|------|------|
| `proton/sceneToProtonField.js` | Mod 1 |
| `proton/projectProtonField.js` | Mod 2 |
| `proton/rasterizeProtons.js` | Mod 3 |
| `proton/depthField.js` | Mod 4 |
| `proton/normalField.js` | Mod 5 |
| `proton/lighting4d.js` | Mod 6 |
| `proton/rasterToImage.js` | PNG thin |
| `proton/pipeline.js` | E2E |
| `proton/mods.six.test.js` | Acceptance |
| Legacy helpers kept | fromSceneSpec, softSplat, registry (compat) |

## Dependency graph

```text
SceneSpecification → sceneToProtonField → applyLighting4D
  → projectProtonField → rasterizeProtons → depth/normal → rasterToImage
CLI render-proton-splat.mjs → runProtonPipeline
```

## Build artifacts inventory

| Artifact | Tag at scaffold |
|----------|-----------------|
| Six mod modules | **skeleton** → Implementor |
| Roadmap mods | **declared** (no files) |

## Test placeholders

Replaced by `mods.six.test.js` (Implementor).

## Handoff to Implementor

Fill invariants, lighting falloff, depth/normal AOVs, E2E hash tests, CLI `--demo`.
