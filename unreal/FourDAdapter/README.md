# FourDAdapter (Unreal) — skeleton

> **Drive-G-1:** Plugin **skeleton** only. Consumes PLP `scene3D` + `lineageBundle`.  
> Does **not** compute 4D. Not CI-built; open in a local Unreal Engine project to compile.

## Role

Unreal-side host adapter for 4D Engine v1 / PLP projected output. Authority for WorldDocument and projection stays with the 4D Engine; this plugin instantiates Actors/meshes and holds lineage for editor tools.

## Layout

```
FourDAdapter/
  FourDAdapter.uplugin
  Source/FourDAdapterRuntime/
  Source/FourDAdapterEditor/
```

Peer of `unreal/GovernedEnginePlugin/`. Copy or symlink into `<YourProject>/Plugins/FourDAdapter/`.

## Status

| Area | Status |
| --- | --- |
| Module / API stubs | **skeleton** |
| Material assets | **declared** (see design doc) |
| Editor importer / slice UI | **skeleton** (registration stubs) |
| UE build / CI | **not claimed** |

Design: [`docs/4d-engine/v1/adapters/UNREAL_ADAPTER_V1.md`](../../docs/4d-engine/v1/adapters/UNREAL_ADAPTER_V1.md)
