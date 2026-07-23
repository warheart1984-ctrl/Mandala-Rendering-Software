# FourDAdapter (Unreal) — skeleton + v1.1 declared subsystem

> **Drive-G-1:** Plugin **skeleton** only. Consumes PLP `scene3D` + `lineageBundle` (or live `ProjectionResponse`).  
> Does **not** compute 4D. Not CI-built. Sequencer live preview, Nanite, compute W-encoding, and live sockets are **not** claimed.

## Role

Unreal-side host adapter for 4D Engine v1 / PLP projected output. Authority for WorldDocument and projection stays with the 4D Engine.

**Strategic positioning (declared):** Host lineage tooling inside Unreal is an adapter goal — not “killer feature” marketing or exclusivity claims.

## Subsystem map

| Surface | Path | Status |
| --- | --- | --- |
| Scene loader / lineage / materials mapper | Runtime Public/* | **skeleton** |
| `A4DWorldActor` | `A4DWorldActor.*` | **skeleton** |
| `UFourDVisualizationComponent` | + events SetWSlice/Ghosting/WDepthMode | **skeleton** |
| `UScene3DAsset` / `ULineageBundleAsset` | DataAsset stubs | **skeleton** |
| Sequencer track / section / template / controller | `UMovieScene4D*`, `FMovieScene4DTrackTemplate`, `UFourDSequencerController` | **skeleton** · preview **roadmap** |
| `UFourDLiveLinkClient` | ProjectionRequest/Response | **skeleton** |
| Debugger / W-axis / viewport overlay | Editor Public/* | **skeleton** |
| `MF_*` / `M_FourD*` | `Content/Materials/README.md` | **declared** |
| `CS_WEncoding` | design doc only | **roadmap** |
| Nanite / instanced ghosting / async load | design prose | **roadmap** |
| UE compile / CI | — | **not claimed** |

## Layout

```
FourDAdapter/
  FourDAdapter.uplugin
  README.md
  Content/Materials/README.md
  Source/FourDAdapterRuntime/
  Source/FourDAdapterEditor/
```

Peer of `unreal/GovernedEnginePlugin/`. Copy or symlink into `<YourProject>/Plugins/FourDAdapter/`.

## Design docs

- [`UNREAL_ADAPTER_V1.md`](../../docs/4d-engine/v1/adapters/UNREAL_ADAPTER_V1.md) (v1.1 section)
- [`UNREAL_SUBSYSTEM_ENHANCEMENTS.md`](../../docs/4d-engine/v1/adapters/UNREAL_SUBSYSTEM_ENHANCEMENTS.md)
- [`UNREAL_SEQUENCER_4D_TRACK.md`](../../docs/4d-engine/v1/adapters/UNREAL_SEQUENCER_4D_TRACK.md)
- [`UNREAL_MATERIAL_FUNCTIONS.md`](../../docs/4d-engine/v1/adapters/UNREAL_MATERIAL_FUNCTIONS.md)
- [`UNREAL_W_ENCODING_COMPUTE.md`](../../docs/4d-engine/v1/adapters/UNREAL_W_ENCODING_COMPUTE.md)
- [`UNREAL_4D_DEBUGGER.md`](../../docs/4d-engine/v1/adapters/UNREAL_4D_DEBUGGER.md)
- [`UNREAL_LIVE_PROJECTION.md`](../../docs/4d-engine/v1/adapters/UNREAL_LIVE_PROJECTION.md)
