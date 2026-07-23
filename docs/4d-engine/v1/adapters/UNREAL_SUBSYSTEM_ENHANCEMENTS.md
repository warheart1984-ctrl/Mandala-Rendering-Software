# Unreal FourDAdapter — subsystem enhancements (**declared**)

> **Drive-G-1:** Shapes below are **declared**; headers are **skeleton**. Perf / Nanite / compute / CI Unreal gate = **roadmap** / **planned**.  
> Marketing softened to **strategic positioning (declared)** only.

**Parent index:** [UNREAL_ADAPTER_V1.md](./UNREAL_ADAPTER_V1.md)  
**Canonical RFC:** [UNREAL_4D_INTEGRATION_RFC_V1_1.md](./UNREAL_4D_INTEGRATION_RFC_V1_1.md)

---

## Status map

| Surface | Status |
| --- | --- |
| `A4DWorldActor` | **skeleton** |
| `UFourDVisualizationComponent` | **skeleton** (full API stub) |
| Viewport overlay | **skeleton** |
| W-aware selection | **declared** |
| `UScene3DAsset` / `ULineageBundleAsset` | **skeleton** |
| Sequencer track / template / controller | **skeleton** · preview **roadmap** |
| `UFourDLiveLinkClient` | **skeleton** |
| Multi-projection | **declared** / **roadmap** |
| Instanced ghosting / GPU W-depth / async load / Nanite | **roadmap** |
| UX polish (tooltips, example levels, quickstart) | **declared** / **roadmap** |
| v1.2 compile-ready integration | **planned** |
| CI Unreal gate | **planned** (workflow stub only; UE image not provisioned) |

---

## 1. `A4DWorldActor` (**skeleton**)

Root actor: soft refs to scene/lineage assets, owns `UFourDVisualizationComponent` + `UFourDLiveLinkClient`, `ReloadProjection()` stub.

---

## 2. `UFourDVisualizationComponent` (**skeleton**)

Declared / stubbed API:

| API | Notes |
| --- | --- |
| `BeginPlay` | Cache lineage entries from registry (**stub**) |
| `SetWSlice(WMin, WMax)` | Update band + apply |
| `SetGhosting(bEnabled, NeighborCount, Opacity)` | Ghost state |
| `SetWDepthMode(Mode)` | 0/1/2 |
| `GetLineage(Actor, OutEntry)` | Query helper |
| `ApplyVisualization` | Mapper / MID stomps (**stub**) |

**Declared multicast events (stubs fire nothing meaningful yet):**

- `OnWBandEntered` / `OnWBandExited`
- `OnGhostNeighborChanged`
- `OnProjectionModeChanged`

---

## 3. Viewport overlay (**skeleton**)

`FFourDViewportOverlay` — W-band text, ghost flag, live indicator, selected lineage id. No proven draw.

---

## 4. W-aware selection (**declared**)

Debugger / editor: `QueryByWBand` → set selection; optional dim out-of-band actors.

---

## 5. Assets (**skeleton**)

`UScene3DAsset` / `ULineageBundleAsset` — JSON payload data assets. Import factory **roadmap**.

---

## 6. Multi-projection (**declared** / **roadmap**)

Named slots `{ modeId, sceneAsset, lineageAsset, vizState }`; debugger header switch. Concurrent cross-slot ghosting **roadmap**. Unity parity later — **roadmap**, not claimed here.

---

## 7. Performance (**roadmap**)

Instanced ghosting (ISM/HISM), GPU W-depth / `CS_WEncoding`, async scene3D load, Nanite path — **roadmap** only. See §12 and [UNREAL_W_ENCODING_COMPUTE.md](./UNREAL_W_ENCODING_COMPUTE.md).

---

## 8. UX polish (**declared** / **roadmap**)

Tooltips **declared**; example level `L_FourDQuickstart` **roadmap**; quickstart link **declared**.

**Strategic positioning (declared):** Host-side lineage tooling inside Unreal is an adapter goal — not evidence of studio adoption, exclusivity, or “top-of-the-line” readiness.

---

## 9. v1.2 implementation plan (**planned**)

> Move FourDAdapter from **declared** / **skeleton** toward compile-ready, minimally functional Unreal integration.  
> Nothing in this section claims present capability.

### 9.1 Goals

Enable (when implemented):

- UE build for runtime + editor modules
- basic Sequencer evaluation
- basic W-aware materials
- basic 4D Debugger interactivity
- basic Live Link projection import
- optional CI Unreal compile gate (requires provisioned UE image)

### 9.2 Workstreams

| Workstream | Task | Outcome (when done) |
| --- | --- | --- |
| **Build & module wiring** | Complete `*.Build.cs` for runtime/editor | Plugin loads in Unreal; modules recognized |
| **Sequencer integration (MVP)** | Add MovieScene deps; implement `UMovieScene4DTrack` / `Section` / `FMovieScene4DTrackTemplate`; register with Sequencer | Track appears; `WMin`/`WMax` drives `SetWSlice` at preview time |
| **Blueprint component (MVP)** | Implement `UFourDVisualizationComponent` methods against adapter runtime | Designers can call `SetWSlice`, `SetGhosting`, `SetWDepthMode` from Blueprints |
| **Materials & `MF_*` (MVP)** | Create `M_FourDBase`, `M_FourDGhost`, `M_FourDDepth`; implement `MF_*` in material graphs | W-depth and ghosting visible in editor |
| **4D Debugger (MVP)** | Basic Slate panel; selection hook; lineage + W-band display | Inspect lineage for selected Actors |
| **Live Link client (MVP)** | `UFourDLiveLinkClient` TCP/WebSocket; parse JSON `ProjectionResponse`; call scene import stubs | Request/receive one projection per session |
| **Scene import (MVP)** | Minimal `scene3D` → Actors / meshes / materials path | A simple projected scene appears in Unreal |
| **CI Unreal gate (MVP)** | Editor build job for plugin compile | Gate only after UE image is provisioned — see §10 |

### 9.3 Milestones (M1–M6)

| Milestone | Target |
| --- | --- |
| **M1** | Plugin loads; modules compile |
| **M2** | Sequencer track drives W-slice |
| **M3** | Materials show W-depth / ghosting |
| **M4** | Debugger shows lineage |
| **M5** | Live Link imports a projection |
| **M6** | CI Unreal gate green (requires provisioned UE toolchain) |

---

## 10. CI Unreal gate design (**planned**)

> Design only until a UE 5.x image / runner is provisioned.  
> Repo ships a **non-blocking** stub workflow that does **not** fail PRs or act as a required check.

### 10.1 Purpose

Ensure `unreal/FourDAdapter/`:

- compiles against a target Unreal version
- maintains module integrity
- prevents regressions on `origin/main` **once** the gate is enabled and required

### 10.2 Inputs

| Input | Example / note |
| --- | --- |
| Unreal Engine version | e.g. 5.3 / 5.x |
| Plugin path | `unreal/FourDAdapter/` |
| Build configuration | Development Editor |

### 10.3 Pipeline steps (**planned**)

1. Checkout repo
2. Install Unreal (pre-cached or container image) — **not provisioned today**
3. Generate project files (if needed)
4. Build editor target with plugin enabled (`UnrealEditor` or engine-specific target)
5. Optional v1.2: headless load test verifying `FourDAdapter` module loads

### 10.4 Pass / fail criteria (**planned**)

**Pass:** build succeeds; plugin modules compile; no missing dependencies.

**Fail:** build error in `FourDAdapterRuntime` or `FourDAdapterEditor`; missing MovieScene / Slate / Networking deps; UCLASS/UFUNCTION macro issues.

### 10.5 Integration

| Item | Plan |
| --- | --- |
| Workflow path | [`.github/workflows/fourdadapter-unreal.yml`](../../../.github/workflows/fourdadapter-unreal.yml) (stub) · design also noted as `ci/unreal/fourdadapter.yml` |
| Trigger (future) | PRs touching `unreal/FourDAdapter/` · optionally `docs/4d-engine/v1/adapters/` |
| Gate | **Planned** required check for `origin/main` — **not** enabled; stub is `workflow_dispatch` only and echoes that UE CI is not provisioned |

---

## 11. Nanite + instanced ghosting (**roadmap** / **declared**)

> High-level strategy only. No Nanite, instancing, or async load behavior is claimed as working.

### 11.1 Purpose

Make ghosting and W-aware visualization **scale** (when implemented) to:

- Nanite meshes
- large crowds
- complex environments

### 11.2 Strategy (**roadmap**)

| Theme | Intent |
| --- | --- |
| **Instanced ghosting** | Use ISM/HISM or GPU instance data; store W-depth and ghost weight per instance; avoid duplicating geometry for ghost slices |
| **Nanite compatibility** | Keep W-encoding on Nanite-safe material paths; prefer material parameters and instance data over custom vertex formats |
| **Async load** | Load projected scenes in chunks; async asset loading for meshes/materials; avoid blocking editor/game thread on large projections |
| **Compute integration** | Run `CS_WEncoding` on instance buffers; feed results into Nanite-compatible materials |

### 11.3 Surfaces (**declared** / **roadmap**)

- [UNREAL_W_ENCODING_COMPUTE.md](./UNREAL_W_ENCODING_COMPUTE.md) — extend for instance data (**roadmap**)
- This document — Nanite + async roadmap
- Runtime module — instancing helpers (**roadmap**)
- Materials — Nanite-safe W-encoding (**roadmap**)

---

## Cross-links

- [UNREAL_ADAPTER_V1.md](./UNREAL_ADAPTER_V1.md)
- [UNREAL_4D_INTEGRATION_RFC_V1_1.md](./UNREAL_4D_INTEGRATION_RFC_V1_1.md)
- [UNREAL_SEQUENCER_4D_TRACK.md](./UNREAL_SEQUENCER_4D_TRACK.md)
- [UNREAL_MATERIAL_FUNCTIONS.md](./UNREAL_MATERIAL_FUNCTIONS.md)
- [UNREAL_W_ENCODING_COMPUTE.md](./UNREAL_W_ENCODING_COMPUTE.md)
- [UNREAL_4D_DEBUGGER.md](./UNREAL_4D_DEBUGGER.md)
- [UNREAL_LIVE_PROJECTION.md](./UNREAL_LIVE_PROJECTION.md)
- [UNITY_ADAPTER_V1.md](./UNITY_ADAPTER_V1.md)
