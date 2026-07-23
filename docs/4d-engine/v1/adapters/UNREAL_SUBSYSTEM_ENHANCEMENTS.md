# Unreal FourDAdapter — subsystem enhancements (**declared**)

> **Drive-G-1:** Shapes below are **declared**; headers are **skeleton**. Perf/Nanite/compute = **roadmap**.  
> Marketing softened to **strategic positioning (declared)** only.

**Parent:** [UNREAL_ADAPTER_V1.md](./UNREAL_ADAPTER_V1.md) §7 (v1.1)

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

Named slots `{ modeId, sceneAsset, lineageAsset, vizState }`; debugger header switch. Concurrent cross-slot ghosting **roadmap**. Unity parity later — **roadmap**, not in this change.

---

## 7. Performance (**roadmap**)

Instanced ghosting (ISM/HISM), GPU W-depth / `CS_WEncoding`, async scene3D load, Nanite path — **roadmap** only. See [UNREAL_W_ENCODING_COMPUTE.md](./UNREAL_W_ENCODING_COMPUTE.md).

---

## 8. UX polish (**declared** / **roadmap**)

Tooltips **declared**; example level `L_FourDQuickstart` **roadmap**; quickstart link **declared**.

**Strategic positioning (declared):** Host-side lineage tooling inside Unreal is an adapter goal — not evidence of studio adoption, exclusivity, or “top-of-the-line” readiness.

## Cross-links

- [UNREAL_SEQUENCER_4D_TRACK.md](./UNREAL_SEQUENCER_4D_TRACK.md)
- [UNREAL_MATERIAL_FUNCTIONS.md](./UNREAL_MATERIAL_FUNCTIONS.md)
- [UNREAL_4D_DEBUGGER.md](./UNREAL_4D_DEBUGGER.md)
- [UNREAL_LIVE_PROJECTION.md](./UNREAL_LIVE_PROJECTION.md)
- [UNITY_ADAPTER_V1.md](./UNITY_ADAPTER_V1.md)
