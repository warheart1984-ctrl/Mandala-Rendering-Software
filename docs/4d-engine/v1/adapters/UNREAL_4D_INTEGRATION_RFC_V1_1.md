# Unreal 4D Integration RFC v1.1

**FourDAdapter — Unreal Engine Dimensional Projection Subsystem**

| Field | Value |
| --- | --- |
| **Status** | Active |
| **Version** | 1.1 |
| **Commit** | `8feeec1` |
| **Maintainer** | Jon Halstead |
| **Applies to** | 4D Engine v1, PLP v1, Unreal Engine 5.x |
| **Category** | Engine Integration, Dimensional Projection, Cinematic Tooling |
| **Last Updated** | 2026-07-23 |

> **Drive-G-1:** This RFC is the **canonical governance** document for FourDAdapter v1.1.  
> Evidence today is **declared** design + **skeleton** stubs under `unreal/FourDAdapter/`.  
> It does **not** claim a functional Unreal Editor/runtime build, Sequencer evaluation, material assets, compute shaders, live sockets, or CI Unreal gates.

---

## 1. Overview

FourDAdapter v1.1 defines the Unreal-side subsystem responsible for:

- importing 4D Engine projections (`scene3D` + `lineageBundle`)
- applying W-aware visualization (GPU W-encoding)
- exposing dimensional controls to Sequencer
- providing Blueprint-level W-aware behavior
- offering a 4D Debugger for lineage and W-context
- enabling real-time projection streaming via Live Link

This RFC governs the subsystem’s architecture, responsibilities, versioning, and extension points.

---

## 2. Repository Structure (as of commit `8feeec1`)

### 2.1 Documentation (`docs/4d-engine/v1/adapters/`)

| File | Purpose |
| --- | --- |
| **[UNREAL_4D_INTEGRATION_RFC_V1_1.md](./UNREAL_4D_INTEGRATION_RFC_V1_1.md)** | **Canonical** FourDAdapter v1.1 governance RFC (this document) |
| [UNREAL_ADAPTER_V1.md](./UNREAL_ADAPTER_V1.md) | Module design / technical detail (points here for v1.1 governance) |
| [UNREAL_SUBSYSTEM_ENHANCEMENTS.md](./UNREAL_SUBSYSTEM_ENHANCEMENTS.md) | Roadmap + enhancements map |
| [UNREAL_SEQUENCER_4D_TRACK.md](./UNREAL_SEQUENCER_4D_TRACK.md) | Track / section / template / controller spec |
| [UNREAL_MATERIAL_FUNCTIONS.md](./UNREAL_MATERIAL_FUNCTIONS.md) | `MF_*` and `M_FourD*` definitions |
| [UNREAL_W_ENCODING_COMPUTE.md](./UNREAL_W_ENCODING_COMPUTE.md) | GPU W-encoding compute shader spec |
| [UNREAL_4D_DEBUGGER.md](./UNREAL_4D_DEBUGGER.md) | Debugger + W-axis + overlay spec |
| [UNREAL_LIVE_PROJECTION.md](./UNREAL_LIVE_PROJECTION.md) | Live Link protocol + client spec |

**Cross-links:**

- [docs/4d-engine/v1/README.md](../README.md)
- [plp/PLP_V1.md](../plp/PLP_V1.md)
- [UNITY_ADAPTER_V1.md](./UNITY_ADAPTER_V1.md) (parity note)

### 2.2 Unreal Plugin (`unreal/FourDAdapter/`)

**Runtime stubs:**

- `A4DWorldActor`
- `UFourDVisualizationComponent`
- Sequencer: Track, Section, Template, Controller
- `UFourDLiveLinkClient`
- Asset placeholders (`UScene3DAsset`, `ULineageBundleAsset`)

**Editor stubs:**

- 4D Debugger panel
- W-axis widget
- viewport overlay

**Content:**

- `Materials/README.md` (**declared**, no `.uasset` yet)

---

## 3. Status Table (v1.1)

| Surface | Status |
| --- | --- |
| Design docs | **declared** |
| Plugin / Build.cs / UCLASS stubs | **skeleton** |
| Sequencer channels + `Apply4DState` | **skeleton** · live scrub preview **roadmap** |
| `MF_*` / `M_FourD*` | **declared** (no `.uasset`) |
| `CS_WEncoding` | **declared** / **roadmap** |
| Debugger / W-axis / overlay | **skeleton** |
| `UFourDLiveLinkClient` | **skeleton** |
| Nanite / instanced ghosting / async load | **roadmap** |
| UE compile / CI | **not claimed** |
| Computes 4D | **out of scope** |

**Still non-functional without UE** — correct: no MovieScene deps enabled, no sockets, no Sequencer registration, no material assets, no compute shader, no Slate interactivity, no CI Unreal gate.

This status table is canonical for v1.1 governance. [UNREAL_ADAPTER_V1.md](./UNREAL_ADAPTER_V1.md) keeps a matching evidence-bound table for module detail — do not invent stronger claims there.

---

## 4. Subsystem Responsibilities (v1.1)

FourDAdapter v1.1 **SHALL** (as declared design / skeleton stubs):

**Import 4D Engine projections**

- Load `scene3D`
- Load `lineageBundle`
- Instantiate Actors, meshes, materials
- Register lineage

**Provide W-aware visualization**

- Material functions (`MF_*`)
- GPU W-encoding compute shader (**declared**)
- Ghosting + W-depth modes

**Expose dimensional controls to Sequencer**

- `WMin` / `WMax`
- `GhostOpacity`
- `GhostNeighborCount`
- `WDepthMode`
- `Apply4DState` path

**Expose Blueprint-level dimensional behavior**

- `UFourDVisualizationComponent`
- `SetWSlice`, `SetGhosting`, `SetWDepthMode`
- `GetLineage`

**Provide dimensional debugging tools**

- 4D Debugger panel
- W-axis visualization
- viewport overlay

**Enable real-time projection streaming**

- `UFourDLiveLinkClient`
- Live Link protocol (**declared**)

FourDAdapter v1.1 **SHALL NOT**:

- compute 4D
- replace Unreal’s renderer
- modify lineage
- modify projection parameters
- assume Nanite / async load (**roadmap**)

---

## 5. Sequencer Integration (v1.1)

### 5.1 Track

`UMovieScene4DTrack` (**skeleton**)

### 5.2 Section

`UMovieScene4DSection` with channels:

- `WMinChannel`
- `WMaxChannel`
- `GhostOpacityChannel`
- `GhostNeighborCountChannel`
- `WDepthModeChannel`

### 5.3 Template

`FMovieScene4DTrackTemplate` (**skeleton**)

### 5.4 Controller

`UFourDSequencerController` (**skeleton**)

### 5.5 Live Preview

Declared in **roadmap**; not implemented.

---

## 6. Material Functions (v1.1)

Declared in [UNREAL_MATERIAL_FUNCTIONS.md](./UNREAL_MATERIAL_FUNCTIONS.md):

- `MF_WDepthGradient`
- `MF_WGhostOpacity`
- `MF_WHeatmap`
- `MF_WContourBands`

Material assets (`M_FourD*`) are **declared** but not yet created.

---

## 7. GPU W-Encoding Compute Shader (v1.1)

Declared in [UNREAL_W_ENCODING_COMPUTE.md](./UNREAL_W_ENCODING_COMPUTE.md):

- `CS_WEncoding` signature
- `WDepthBuffer`, `GhostWeightBuffer`
- `ColorBuffer`, `OpacityBuffer`
- Modes: Gradient, Heatmap, Contour
- `GhostOpacityScale`

Not yet implemented; **roadmap**.

---

## 8. Blueprint Component API (v1.1)

`UFourDVisualizationComponent` (**skeleton**):

- `SetWSlice`
- `SetGhosting`
- `SetWDepthMode`
- `GetLineage`

Events declared for v1.2 **roadmap**.

---

## 9. 4D Debugger (v1.1)

Declared in [UNREAL_4D_DEBUGGER.md](./UNREAL_4D_DEBUGGER.md):

- Debugger panel (**skeleton**)
- W-axis widget (**skeleton**)
- viewport overlay (**skeleton**)

No Slate interactivity yet.

---

## 10. Live Projection Protocol (v1.1)

Declared in [UNREAL_LIVE_PROJECTION.md](./UNREAL_LIVE_PROJECTION.md):

- Request: `{ worldId, observationModeId, time }`
- Response: `{ scene3D, lineageBundle }`
- `UFourDLiveLinkClient` (**skeleton**)

Sockets not yet implemented.

---

## 11. Versioning Rules

### 11.1 v1.1 guarantees

- All surfaces **declared**
- All stubs present
- All cross-links established
- All specs published
- **No functional runtime yet**
- No Sequencer registration
- No compute shader
- No material assets
- No Slate interactivity
- No Live Link sockets

### 11.2 v1.2 roadmap

- Sequencer live preview
- Material assets
- Compute shader implementation
- Debugger interactivity
- Live Link sockets
- Nanite + instanced ghosting
- async load path
- CI Unreal gate

---

## 12. Compliance with PLP v1

> **Drive-G-1:** Adapter design **aligns with** / **declares compliance intent** for PL-1…PL-5.  
> Import-side stubs and design docs are **not** runtime enforcement of PLP.

FourDAdapter v1.1 **declares compliance intent** with:

| Principle | Intent (not enforced runtime) |
| --- | --- |
| **PLP-1** Deterministic projection | Import only — adapter does not recompute projection |
| **PLP-2** Mandatory lineage | Registry stub present; lineage registration declared |
| **PLP-3** Mandatory W-context | W-context fields stored / declared on viz + Sequencer surfaces |
| **PLP-4** Hybrid-first compatibility | Unreal consumes projected 3D only |
| **PLP-5** ObservationMode declaration | Import-side / live-request fields only |

---

## 13. Closing Statement

FourDAdapter v1.1 establishes the Unreal-side dimensional subsystem as a **declared**, versioned, governed component of the 4D Engine ecosystem. It provides the architectural scaffolding for:

- cinematic W-aware sequencing
- GPU-accelerated dimensional visualization
- designer-friendly Blueprint controls
- studio-grade debugging
- real-time projection streaming

While v1.1 is **non-functional without Unreal dependencies**, it is complete as a **declared** subsystem and ready for v1.2 implementation (**roadmap**).
