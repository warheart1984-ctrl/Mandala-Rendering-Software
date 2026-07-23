# Unreal 4D Integration — FourDAdapter v1.x

**Adapter:** FourDAdapter  
**Engine:** Unreal Engine 5.x  
**4D Engine:** v1  
**PLP:** v1  
**Status:** v1.1 declared · v1.2 planned  
**Canonical RFC:** [Unreal 4D Integration RFC v1.1](./UNREAL_4D_INTEGRATION_RFC_V1_1.md)

> **Drive-G-1:** This file is the **adapter index**. In-repo evidence today is a **skeleton** under `unreal/FourDAdapter/` plus **declared** specs. It does **not** claim Unreal Editor tools, material assets, Sequencer evaluation, Nanite paths, live projection, or a CI Unreal build are working.

---

## 1. Purpose

`FourDAdapter` is the Unreal-side dimensional projection subsystem for the 4D Engine. It:

- imports 4D Engine projections (`scene3D + lineageBundle`)
- preserves dimensional provenance (lineage, W-context, observation mode)
- exposes W-aware visualization and controls inside Unreal
- integrates with Sequencer, Blueprint, materials, and editor tooling
- prepares for real-time projection streaming via Live Link

This document is the **adapter index** for Unreal, linking to all subordinate specs and tracking implementation status.

**Constitutional boundary:** Unreal does **not** compute 4D. Authority for WorldDocument, observation, and projection remains with the 4D Engine / PLP pipeline (hybrid-first).

**FourDRenderer v2.0:** Upstream architecture for 4D BVH / SO(4) / path / project contracts lives at [`../../v2/README.md`](../../v2/README.md). FourDAdapter remains a **consumer** of Scene3D + lineage. Deep Unreal RHI mods, Nanite W-awareness, and Lumen W-GI are **roadmap** under v2 — **out of scope** for FourDAdapter v1.1.

---

## 2. Document index

All Unreal-specific adapter docs live under `docs/4d-engine/v1/adapters/`:

| Document | Role |
| --- | --- |
| [UNREAL_ADAPTER_V1.md](./UNREAL_ADAPTER_V1.md) | This file — adapter index |
| [UNREAL_4D_INTEGRATION_RFC_V1_1.md](./UNREAL_4D_INTEGRATION_RFC_V1_1.md) | Canonical Integration RFC v1.1 |
| [UNREAL_SUBSYSTEM_ENHANCEMENTS.md](./UNREAL_SUBSYSTEM_ENHANCEMENTS.md) | Subsystem map · v1.2 plan · CI · Nanite roadmap |
| [UNREAL_SEQUENCER_4D_TRACK.md](./UNREAL_SEQUENCER_4D_TRACK.md) | Sequencer track / section / template |
| [UNREAL_MATERIAL_FUNCTIONS.md](./UNREAL_MATERIAL_FUNCTIONS.md) | `MF_*` / `M_FourD*` material design |
| [UNREAL_W_ENCODING_COMPUTE.md](./UNREAL_W_ENCODING_COMPUTE.md) | `CS_WEncoding` compute design |
| [UNREAL_4D_DEBUGGER.md](./UNREAL_4D_DEBUGGER.md) | 4D Debugger Slate surface |
| [UNREAL_LIVE_PROJECTION.md](./UNREAL_LIVE_PROJECTION.md) | Live Link / projection streaming |

**Cross-links:**

- Index: [../README.md](../README.md)
- FourDRenderer v2 (upstream authority): [`../../v2/README.md`](../../v2/README.md) · [v2 roadmap](../../v2/roadmap/ENGINE_INTEGRATION_ROADMAP.md)
- PLP: [../plp/PLP_V1.md](../plp/PLP_V1.md)
- Unity parity: [UNITY_ADAPTER_V1.md](./UNITY_ADAPTER_V1.md)
- Plugin README: [`unreal/FourDAdapter/README.md`](../../../unreal/FourDAdapter/README.md)

---

## 3. Surfaces & status (v1.1)

| Surface | Status |
| --- | --- |
| Design docs | **declared** |
| Plugin / Build.cs / UCLASS stubs | **skeleton** |
| Sequencer channels + `Apply4DState` path | **skeleton** · live scrub preview **roadmap** |
| `MF_*` / `M_FourD*` | **declared** (no `.uasset`) |
| `CS_WEncoding` | **declared** / **roadmap** |
| Debugger / W-axis / overlay | **skeleton** |
| `UFourDLiveLinkClient` | **skeleton** |
| Nanite / instanced ghosting / async load | **roadmap** |
| UE compile / CI | **not claimed** |
| Computes 4D | **out of scope** |
| Still non-functional without UE | **correct** (no MovieScene deps, sockets, materials, compute, Slate UI, CI gate) |

This table is authoritative for v1.1 status wording in this repo.

---

## 4. Runtime subsystem (**declared**, **skeleton**)

Runtime code lives under `unreal/FourDAdapter/Source/FourDAdapterRuntime/`.

**Declared surfaces:**

- `A4DWorldActor` — root actor for imported 4D projections
- `UFourDVisualizationComponent` — Blueprint-spawnable W-aware component
- Sequencer integration:
  - `UMovieScene4DTrack`
  - `UMovieScene4DSection`
  - `FMovieScene4DTrackTemplate`
  - `UFourDSequencerController`
- Live projection:
  - `UFourDLiveLinkClient`
- Also present as stubs: scene loader, lineage registry, material mapper, Blueprint library, `UScene3DAsset` / `ULineageBundleAsset`

**Responsibilities (v1.1):**

- define UCLASS stubs
- establish method signatures
- align with RFCs / subordinate specs listed in §2

No functional runtime behavior is claimed in v1.1.

---

## 5. Editor subsystem (**declared**, **skeleton**)

Editor code lives under `unreal/FourDAdapter/Source/FourDAdapterEditor/`.

**Declared surfaces:**

- 4D Debugger panel
- W-axis widget
- viewport overlay
- importer window / slice controller / details customizations (**skeleton**)
- menu/toolbar hooks (**planned**)

**Responsibilities (v1.1):**

- define UCLASS/Slate stubs
- align with [UNREAL_4D_DEBUGGER.md](./UNREAL_4D_DEBUGGER.md) and [UNREAL_SUBSYSTEM_ENHANCEMENTS.md](./UNREAL_SUBSYSTEM_ENHANCEMENTS.md)

No interactive Slate behavior is claimed in v1.1.

---

## 6. Content & materials (**declared**)

Content lives under `unreal/FourDAdapter/Content/`:

- [`Materials/README.md`](../../../unreal/FourDAdapter/Content/Materials/README.md) — declares `M_FourDBase`, `M_FourDGhost`, `M_FourDDepth`
- No `.uasset` materials are present in v1.1

Material behavior is specified in:

- [UNREAL_MATERIAL_FUNCTIONS.md](./UNREAL_MATERIAL_FUNCTIONS.md)
- [UNREAL_W_ENCODING_COMPUTE.md](./UNREAL_W_ENCODING_COMPUTE.md)

---

## 7. PLP v1 alignment (**intent**)

FourDAdapter v1.1 **aligns with** / **declares compliance intent** for PLP v1 (not runtime enforcement):

| Principle | Adapter stance |
| --- | --- |
| **PLP-1** Deterministic projection | Import only; no 4D computation in Unreal |
| **PLP-2** Mandatory lineage | `lineageBundle` consumed; registry **declared** / **skeleton** |
| **PLP-3** Mandatory W-context | W-band and W-depth fields **declared** |
| **PLP-4** Hybrid-first | Unreal consumes 3D artifacts only |
| **PLP-5** ObservationMode | Observation mode referenced in [UNREAL_LIVE_PROJECTION.md](./UNREAL_LIVE_PROJECTION.md) |

---

## 8. v1.2 implementation plan (pointer)

FourDAdapter v1.2 **SHALL** (when implemented — **planned**):

- enable UE compile for runtime + editor modules
- implement Sequencer registration and evaluation
- implement material assets and `MF_*` integration
- implement `CS_WEncoding` compute shader
- implement interactive 4D Debugger + W-axis widget
- implement `UFourDLiveLinkClient` sockets and basic streaming
- add CI Unreal gate for adapter build

**Detailed plan** (goals, workstreams M1–M6, CI design, Nanite roadmap): [UNREAL_SUBSYSTEM_ENHANCEMENTS.md](./UNREAL_SUBSYSTEM_ENHANCEMENTS.md).

---

## 9. Unity parity

Unity adapter v1.x: [UNITY_ADAPTER_V1.md](./UNITY_ADAPTER_V1.md).

**Parity goals:**

- equivalent `scene3D` + `lineageBundle` consumption
- W-aware tools (slice, ghosting, depth)
- editor-side provenance preservation

Unreal and Unity adapters **SHALL** remain conceptually aligned while respecting engine-specific idioms. Unity subsystem parity (Sequencer-analogue, debugger, live projection) remains **roadmap** for Unity where not yet evidenced.

---

## 10. Non-goals (v1.x)

FourDAdapter v1.x **SHALL NOT**:

- compute 4D geometry or physics
- replace Unreal’s renderer
- modify lineage or projection parameters
- guarantee Nanite / async load behavior in v1.1
- ship as a compiled plugin in this repository (no UE CI gate provisioned yet)

---

## 11. Change log

- **v1.1 (commit 8feeec1)**
  - Declared full adapter surface
  - Added RFC v1.1
  - Added subsystem docs and cross-links
  - Added runtime/editor UCLASS stubs
  - Added status table
- **v1.x index refresh**
  - This file reframed as adapter index with relative links and Drive-G-1 status wording
  - v1.2 plan / CI / Nanite roadmap expanded under subsystem enhancements
- **v1.2 (planned)**
  - First compile-ready Unreal integration
  - Functional Sequencer, materials, compute, debugger, Live Link
  - CI Unreal gate (when UE image is provisioned)
