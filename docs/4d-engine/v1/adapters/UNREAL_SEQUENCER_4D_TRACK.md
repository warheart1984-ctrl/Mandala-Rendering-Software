# Unreal Sequencer — 4D Track (**declared** / **skeleton**)

> **Drive-G-1:** Contract and types are **declared**. Stubs exist under `unreal/FourDAdapter/`.  
> There is **no** UE compile evidence of Sequencer registration, template evaluation, or live scrub preview.

**Status:** **declared** (contract) · **skeleton** (UCLASS / template stubs) · live preview evaluation = **roadmap**

---

## 1. Purpose

Drive observation visualization parameters over time inside Unreal Sequencer **without** computing 4D in-engine. The track samples channels and applies state through `UFourDSequencerController` → materials / global slice. Projection math stays with PLP.

---

## 2. Types (**skeleton**)

| Type | Role |
| --- | --- |
| `UMovieScene4DTrack` | Track owning sections; `CreateNewSection`, `SupportsType` |
| `UMovieScene4DSection` | Section with channel UPROPERTYs |
| `FMovieScene4DTrackTemplate` | Evaluation template → controller |
| `UFourDSequencerController` | `Apply4DState` bridge to viz / Blueprint library |

**Module deps (declared, not enabled):** `MovieScene`, `MovieSceneTracks`, optionally `Sequencer` (editor). Commented in `FourDAdapterRuntime.Build.cs`. Stubs currently inherit `UObject` until those deps are linked and bases retargeted to `UMovieSceneNameableTrack` / `UMovieSceneSection`.

---

## 3. `UMovieScene4DTrack` API (**declared**)

```cpp
// Declared shape — skeleton returns nullptr / false today
UMovieSceneSection* CreateNewSection();
bool SupportsType(TSubclassOf<UMovieSceneSection> SectionClass) const;
```

- `CreateNewSection` → allocate `UMovieScene4DSection`
- `SupportsType` → true only for `UMovieScene4DSection`

---

## 4. `UMovieScene4DSection` channels (**declared** / **skeleton**)

| UPROPERTY channel | Type | Semantics |
| --- | --- | --- |
| `WMin` | float | Lower W-band |
| `WMax` | float | Upper W-band |
| `GhostOpacity` | float | `[0,1]` ghost opacity |
| `GhostNeighborCount` | int32 | Adjacent bands to ghost (`NeighborCount` alias in stubs) |
| `WDepthMode` | int32 | `0` off, `1` heatmap, `2` contour |

Optional section fields (**declared**): `ObservationModeId`, `ObservationTime`, `bRequestLiveReproject`.

### Roadmap channels (not stubbed as animatable MovieScene channels yet)

| Channel | Status |
| --- | --- |
| `ProjectionModeChannel` | **roadmap** |
| `Camera4DChannel` | **roadmap** |
| `WTraversalCurve` | **roadmap** |
| `GhostNeighborCurve` | **roadmap** |
| Section visualization overlays in Sequencer UI | **roadmap** |

---

## 5. `FMovieScene4DTrackTemplate::Evaluate` (**declared**)

On evaluate (when MovieScene wiring exists):

1. Sample active section channels at sequence time.
2. Call `UFourDSequencerController::Apply4DState(WMin, WMax, bGhosting, GhostNeighborCount, GhostOpacity, WDepthMode)`.
3. Controller forwards to `UFourDBlueprintLibrary::SetWSlice` / `SetGhosting` / `SetWDepthMode` and/or `UFourDVisualizationComponent`.

Stub `Evaluate` logs and no-ops.

---

## 6. Live preview architecture (**declared** / **roadmap**)

```
Sequencer scrub
    → FMovieScene4DTrackTemplate::Evaluate
    → UFourDSequencerController::Apply4DState
    → UFourDVisualizationComponent / UFourDBlueprintLibrary
    → UFourDMaterialMapper (+ optional compute W-encoding — roadmap)
    → global slice / ghost materials
```

**Not claimed:** working scrub→material live preview in Editor; compute W-encoding path; Nanite interaction.

---

## 7. Status

| Item | Status |
| --- | --- |
| Design (this file) | **declared** |
| Track / section / template / controller stubs | **skeleton** |
| Build.cs MovieScene link | **commented** |
| Sequencer UI / live scrub preview | **roadmap** |
| Roadmap channels / overlays | **roadmap** |

## Cross-links

- [UNREAL_ADAPTER_V1.md](./UNREAL_ADAPTER_V1.md)
- [UNREAL_W_ENCODING_COMPUTE.md](./UNREAL_W_ENCODING_COMPUTE.md)
- [UNREAL_LIVE_PROJECTION.md](./UNREAL_LIVE_PROJECTION.md)
- [UNREAL_SUBSYSTEM_ENHANCEMENTS.md](./UNREAL_SUBSYSTEM_ENHANCEMENTS.md)
