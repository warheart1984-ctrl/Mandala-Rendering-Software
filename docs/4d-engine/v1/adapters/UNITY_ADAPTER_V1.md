# Unity Adapter v1 (FourDAdapter)

> **Status:** **skeleton**  
> Code: `unity/GovernedUnityProject/Assets/Engine/FourDAdapter/`  
> **Consumes** projected `scene3D` + `lineageBundle`. **Does not compute 4D.**

## Relationship to existing Unity code

| Module | Path | Note |
| --- | --- | --- |
| LiveLink | `Assets/Engine/LiveLink/` | Experimental MRS↔Unity snapshots — **do not break**; cross-link only |
| Inspector | `Assets/Engine/Inspector/` | MRS-IC Editor window — **skeleton**; separate from FourDAdapter |
| FourDAdapter | `Assets/Engine/FourDAdapter/` | This package — World/PLP consumption stubs |

## Layout

```
FourDAdapter/
  README.md                 (this package readme in Assets)
  Runtime/
    FourDSceneLoader.cs
    FourDLineageRegistry.cs
    FourDLineageEntry.cs
    FourDMaterialMapper.cs
    FourDSettings.cs
  Editor/
    FourDImporterWindow.cs
    FourDSliceController.cs
```

## Responsibilities (declared / skeleton)

1. Deserialize Scene3D + LineageBundle JSON (TODO).
2. Spawn or update Unity meshes from Scene3D nodes (TODO).
3. Keep a lineage registry for selection → source entity id (TODO).
4. Map materials by id (TODO).
5. Expose settings ScriptableObject / defaults (stub).
6. Editor importer window + slice controller stubs (no production UX claimed).

## Parity with Unreal v1.1 (**roadmap**)

Unreal documents Sequencer-analogue tracks, debugger, live `ProjectionRequest` bridge, and viz components under [UNREAL_ADAPTER_V1.md](./UNREAL_ADAPTER_V1.md) §7. Unity subsystem parity is **roadmap** — not implemented in the Unreal v1.1 stub land.

## Non-goals

- Implementing SO(4) or WorldDocument simulation inside Unity.
- Duplicating LiveLink WebSocket transport.
- Claiming Play Mode / CI verification.
