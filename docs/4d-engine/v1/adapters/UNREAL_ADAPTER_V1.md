# Unreal Adapter v1 — Module Design

> **Drive-G-1:** This document **declares** a plugin architecture.  
> In-repo evidence today is a **skeleton** under `unreal/FourDAdapter/` (headers, Build.cs, module stubs).  
> It does **not** claim that Unreal Editor tools, material assets, Sequencer evaluation, Nanite paths, live projection, or a CI Unreal build are working.

**Status:** **skeleton** (plugin tree) + **declared** (v1.1 subsystem enhancements) + **roadmap** (perf / Nanite / polish)

**Version framing:** Adapter **v1** = consume-only import surface. **v1.1** = declared first-class subsystem extensions (docs + stubs below). No UE build evidence yet for v1.1 runtime behavior.

---

## 1. Purpose

The Unreal Adapter **consumes** Projection & Lineage Protocol (PLP) artifacts:

| Artifact | Role |
| --- | --- |
| `scene3D` | Projected 3D scene (nodes, meshes, materials) ready for Unreal Actors / meshes |
| `lineageBundle` | Maps Unreal objects back to 4D origins (Node4D, Mesh4D, Camera4D, Slice3D, W-band) |
| Live PLP responses (**declared**) | Same pair over WS/TCP — see [UNREAL_LIVE_PROJECTION.md](./UNREAL_LIVE_PROJECTION.md) |

**Constitutional boundary:** Unreal does **not** compute 4D. Authority for WorldDocument, observation, and projection remains with the 4D Engine / PLP pipeline (hybrid-first). The adapter instantiates and visualizes projected output only.

**Strategic positioning (declared):** Host adapters aim to make projected 4D lineage inspectable and cinematic inside mainstream DCC/game engines. That is product strategy, not a claim that Unreal (or any host) uniquely ships a complete 4D engine, nor that studios “will love” any unfinished surface.

Parity note: Unity’s `FourDAdapter` follows the same consume-only contract — see [UNITY_ADAPTER_V1.md](./UNITY_ADAPTER_V1.md). Unity subsystem parity (Sequencer-analogue, debugger, live projection) is **roadmap** for Unity — not implemented in this change.

---

## 2. Plugin and modules

| Item | Name |
| --- | --- |
| Plugin | `FourDAdapter` |
| Runtime module | `FourDAdapterRuntime` |
| Editor module | `FourDAdapterEditor` |

### Directory layout (v1 + v1.1 stubs)

```
unreal/FourDAdapter/
  FourDAdapter.uplugin
  README.md
  Content/Materials/README.md          # declared MF_* / M_FourD* names
  Source/
    FourDAdapterRuntime/
      FourDAdapterRuntime.Build.cs     # optional MovieScene deps commented
      Public/
        FourDAdapterRuntime.h
        FourDSceneLoader.h
        FourDLineageRegistry.h
        FourDLineageEntry.h
        FourDMaterialMapper.h
        FourDBlueprintLibrary.h
        FourDScene3DTypes.h
        A4DWorldActor.h                # v1.1 skeleton
        FourDVisualizationComponent.h  # v1.1 skeleton
        UScene3DAsset.h                # v1.1 skeleton
        ULineageBundleAsset.h          # v1.1 skeleton
        UMovieScene4DTrack.h           # v1.1 skeleton
        UMovieScene4DSection.h         # v1.1 skeleton
        MovieScene4DTrackTemplate.h    # v1.1 skeleton
        FourDSequencerController.h     # v1.1 skeleton
        UFourDLiveLinkClient.h         # v1.1 skeleton
      Private/ … matching .cpp stubs
    FourDAdapterEditor/
      FourDAdapterEditor.Build.cs
      Public/
        FourDAdapterEditor.h
        FourDImporterCommands.h
        FourDImporterStyle.h
        FourDDebuggerCommands.h        # v1.1 skeleton
        FourDDebuggerStyle.h           # v1.1 skeleton
        SFourDDebuggerPanel.h          # v1.1 skeleton
        SFourDWAxisWidget.h            # v1.1 skeleton
        FourDViewportOverlay.h         # v1.1 skeleton
      Private/ … matching .cpp stubs
```

**Repo path (skeleton):** `unreal/FourDAdapter/` — peer of `unreal/GovernedEnginePlugin/`, intended to be copied or enabled as `Project/Plugins/FourDAdapter/`. Engine version is left flexible in `.uplugin`; open against a local UE install to verify.

---

## 3. Runtime module design (v1)

### 3.1 `UFourDSceneLoader`

**Purpose:** Load `scene3D` and instantiate Actors, Static Meshes, and Materials.

**Responsibilities (declared):**

- Parse JSON/binary `scene3D`
- Create `AActor` hierarchy for nodes
- Create `UStaticMesh` assets for meshes
- Create `UMaterialInstance` assets for materials
- Register lineage with `UFourDLineageRegistry`

**Core API (skeleton stubs):** see headers under `FourDAdapterRuntime/Public/`.

### 3.2 `FFourDLineageEntry` / `UFourDLineageRegistry`

Maintain mapping from Unreal objects to lineage entries; query for editor tools and Blueprints.

### 3.3 `UFourDMaterialMapper`

Map 4D material properties to Unreal material parameters (W-depth encoding, ghosting opacity, visualization modes). Material *function* names: [UNREAL_MATERIAL_FUNCTIONS.md](./UNREAL_MATERIAL_FUNCTIONS.md).

### 3.4 `UFourDBlueprintLibrary`

Exposes W-aware helpers to Blueprints (**skeleton**).

---

## 4. Material graph integration (**declared**)

No `.uasset` materials ship in this skeleton. Names and parameters are **declared** for a future Content package — see [UNREAL_MATERIAL_FUNCTIONS.md](./UNREAL_MATERIAL_FUNCTIONS.md) and `Content/Materials/README.md`.

| Asset (declared) | Role |
| --- | --- |
| `M_FourDBase` | BaseColor × WDepth × GhostOpacity × WDepthMode |
| `M_FourDGhost` | Neighbor-slice ghosting |
| `M_FourDDepth` | W-depth viz specialization |
| `MF_WDepthGradient` | Gradient sample by W |
| `MF_WGhostOpacity` | Opacity falloff |
| `MF_WHeatmap` | Heatmap remap |
| `MF_WContourBands` | Contour banding |

---

## 5. Editor module design (v1 — **declared** / stubs)

| Surface | Status | Notes |
| --- | --- | --- |
| `FFourDImporterEditorModule` | **skeleton** | menus/commands register; UI not interactive |
| `SFourDImporterWindow` | **skeleton** | file pickers declared |
| `SFourDSliceControllerPanel` | **skeleton** | W-slice UI declared |
| Details customizations | **skeleton** | lineage / material fields |
| `SFourDDebuggerPanel` (v1.1) | **skeleton** | [UNREAL_4D_DEBUGGER.md](./UNREAL_4D_DEBUGGER.md) |
| Viewport overlay (v1.1) | **skeleton** | [UNREAL_SUBSYSTEM_ENHANCEMENTS.md](./UNREAL_SUBSYSTEM_ENHANCEMENTS.md) |

---

## 6. Typical Unreal workflow (**declared**)

1. Install / enable `FourDAdapter` plugin.
2. Open FourD Importer window.
3. Select `scene3D` and `lineageBundle` files (PLP outputs) — or bind `UScene3DAsset` / `ULineageBundleAsset` (**declared**).
4. Click **Import Projection** → Actors, meshes, materials created (when implemented).
5. Place `A4DWorldActor` and attach `UFourDVisualizationComponent` (**declared**).
6. Open **4D Slice Controller** / **4D Debugger** panels; adjust W-slice, ghosting, W-depth mode.
7. Drive W-slice from Blueprints / Sequencer 4D track (**declared** — no evaluation evidence).
8. Optionally connect `UFourDLiveLinkClient` (**declared**).

---

## 7. v1.1 subsystem enhancements (**declared**)

These extend the import plugin toward a first-class Unreal subsystem. All runtime behavior below is **declared** or **skeleton** until a local UE compile proves otherwise.

| Enhancement | Doc | Code stub | Status |
| --- | --- | --- | --- |
| Overview / map | This section + [UNREAL_SUBSYSTEM_ENHANCEMENTS.md](./UNREAL_SUBSYSTEM_ENHANCEMENTS.md) | — | **declared** |
| Sequencer 4D track + template + controller | [UNREAL_SEQUENCER_4D_TRACK.md](./UNREAL_SEQUENCER_4D_TRACK.md) | `UMovieScene4DTrack` / `Section` / `FMovieScene4DTrackTemplate` / `UFourDSequencerController` | **skeleton** · live scrub preview **roadmap** |
| Material functions | [UNREAL_MATERIAL_FUNCTIONS.md](./UNREAL_MATERIAL_FUNCTIONS.md) | Content README only | **declared** |
| Compute W-encoding | [UNREAL_W_ENCODING_COMPUTE.md](./UNREAL_W_ENCODING_COMPUTE.md) | — | **declared** / **roadmap** |
| 4D Debugger Slate tab | [UNREAL_4D_DEBUGGER.md](./UNREAL_4D_DEBUGGER.md) | `SFourDDebuggerPanel` / `SFourDWAxisWidget` + commands/style | **skeleton** |
| Live link (`ProjectionRequest`/`Response`) | [UNREAL_LIVE_PROJECTION.md](./UNREAL_LIVE_PROJECTION.md) | `UFourDLiveLinkClient` | **skeleton** |
| `A4DWorldActor` | Subsystem doc | `A4DWorldActor.*` | **skeleton** |
| `UFourDVisualizationComponent` | Subsystem doc | SetWSlice/Ghosting/WDepthMode + events | **skeleton** |
| Viewport overlay | Subsystem doc | `FourDViewportOverlay.*` | **skeleton** |
| W-aware selection | Subsystem doc | declared API on registry / debugger | **declared** |
| `UScene3DAsset` / `ULineageBundleAsset` | Subsystem doc | headers | **skeleton** |
| Multi-projection | Subsystem doc | declared | **declared** / **roadmap** |
| Performance (instanced ghosting, GPU W-depth, async load, Nanite) | Subsystem doc | — | **roadmap** |
| UX polish (tooltips, example levels, quickstart) | Subsystem doc | — | **declared** / **roadmap** |

### 7.1 What v1.1 does **not** claim

- Sequencer live scrub preview, keyframing UI, or cinematic playback of W/time
- Nanite-backed projected meshes or working `CS_WEncoding`
- Working WebSocket/TCP live bridge against a production PLP server
- Editor Slate panels beyond stub registration / empty Construct
- Any CI Unreal build

---

## 8. Extension points (v2+ / **roadmap**)

- Runtime W-navigation for gameplay
- Full multi-projection session management
- Bidirectional live edits (host → WorldDocument) — out of scope for consume-only v1/v1.1
- Marketplace packaging / sample project

---

## 9. Status table (evidence-bound)

| Surface | Status | Evidence |
| --- | --- | --- |
| Design doc (this file + v1.1 docs) | **declared** | `docs/4d-engine/v1/adapters/UNREAL_*.md` |
| Plugin descriptor + Build.cs | **skeleton** | `unreal/FourDAdapter/` |
| Runtime UCLASS/USTRUCT stubs (v1) | **skeleton** | headers + NotImplemented cpp |
| Runtime v1.1 stubs (world actor, viz, assets, Sequencer, live client) | **skeleton** | new headers/cpp; no UE compile |
| Editor module registration stubs | **skeleton** | importer + debugger tab spawner stub |
| Material assets `M_FourD*` / `MF_*` | **declared** | `Content/Materials/README.md` only |
| Sequencer track evaluation / live preview | **roadmap** | stubs + design; no MovieScene dep enabled |
| Live link transport | **skeleton** / **roadmap** | `UFourDLiveLinkClient` stub; no proven handshake |
| Compute W-encoding (`CS_WEncoding`) | **roadmap** | [UNREAL_W_ENCODING_COMPUTE.md](./UNREAL_W_ENCODING_COMPUTE.md) |
| Nanite / GPU W-depth / async load | **roadmap** | design prose only |
| UE compile / CI | **not claimed** | no Unreal toolchain gate in CI |
| Computes 4D / PLP projection | **out of scope** | consumes PLP only |

---

## Cross-links

- Index: [../README.md](../README.md)
- PLP: [../plp/PLP_V1.md](../plp/PLP_V1.md)
- Unity adapter: [UNITY_ADAPTER_V1.md](./UNITY_ADAPTER_V1.md)
- Plugin README: [`unreal/FourDAdapter/README.md`](../../../unreal/FourDAdapter/README.md)
- Subsystem map: [UNREAL_SUBSYSTEM_ENHANCEMENTS.md](./UNREAL_SUBSYSTEM_ENHANCEMENTS.md)
- Sequencer: [UNREAL_SEQUENCER_4D_TRACK.md](./UNREAL_SEQUENCER_4D_TRACK.md)
- Materials: [UNREAL_MATERIAL_FUNCTIONS.md](./UNREAL_MATERIAL_FUNCTIONS.md) · [UNREAL_W_ENCODING_COMPUTE.md](./UNREAL_W_ENCODING_COMPUTE.md)
- Debugger: [UNREAL_4D_DEBUGGER.md](./UNREAL_4D_DEBUGGER.md)
- Live link: [UNREAL_LIVE_PROJECTION.md](./UNREAL_LIVE_PROJECTION.md)
