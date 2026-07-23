# Unreal 4D Debugger — Slate tab (**declared** / **skeleton**)

> **Drive-G-1:** Layout below is a **declared** product spec.  
> Evidence: `SFourDDebuggerPanel`, `SFourDWAxisWidget`, commands/style stubs, tab-spawner registration stub.  
> Not interactive; no UE compile claimed.

**Status:** **declared** (spec) · **skeleton** (Slate stubs) · advanced panes = **roadmap**

---

## 1. Purpose

Editor-only debugging for projected scenes: lineage, W-bands, viz mode, live re-projection requests. Complements importer + slice controller. Does not own WorldDocument authority.

**Tab id (declared):** `FourDAdapter.Debugger`  
**Display name:** `4D Debugger`  
**Root widget:** `SFourDDebuggerPanel`

---

## 2. Commands (`FFourDDebuggerCommands`) — **skeleton**

| Command | Intent |
| --- | --- |
| `OpenDebugger` | Spawn / focus tab |
| `RefreshLineage` | Re-query registry |
| `FocusSelectedLineage` | Sync to editor selection |
| `ToggleGhosting` | Toggle ghosting on world actor |
| `RequestLiveReproject` | Fire live client if connected |
| `ClearVisualization` | Reset W-slice / mode |

---

## 3. Style (`FFourDDebuggerStyle`) — **skeleton**

Style set `FourDDebuggerStyle` — brushes/icons **declared**, assets not shipped.

---

## 4. `SFourDDebuggerPanel` sections + actions (**declared**)

```
┌─ 4D Debugger ─────────────────────────────────────────────┐
│ [World ▼]  [Projection ▼]  ● Live: disconnected|connected │
├─ Observation ─────────────────────────────────────────────┤
│ WMin ════●════ WMax     Ghost [x]  Neighbors [ 2 ]        │
│ Opacity falloff ════●══  WDepthMode [ Off | Heat | Contour ]
│ ObservationModeId [ drop_w ▼ ]   Time [ 0.00 ]            │
│ [ Apply Slice ]  [ Request Live Reproject ]               │
├─ W-axis (SFourDWAxisWidget) ──────────────────────────────┤
│  |----[====active====]----|  (OnPaint stub)               │
├─ Selection / Lineage ─────────────────────────────────────┤
│ Selected Actor / Node4D / Mesh4D / Camera4D / Slice3D     │
│ [ Select by W-band ]  [ Ping source id ]                  │
├─ Registry ────────────────────────────────────────────────┤
│ Filter + ListView (Actor | projectedNodeId | source | W)  │
├─ Assets ──────────────────────────────────────────────────┤
│ Scene3DAsset / LineageBundleAsset  [ Reload ]             │
├─ Log ─────────────────────────────────────────────────────┤
│ Stub ring buffer                                          │
└───────────────────────────────────────────────────────────┘
```

| Section | Actions (declared) |
| --- | --- |
| Header | Switch world / projection slot; show live status |
| Observation | Apply slice; request live reproject |
| W-axis | Visual band scrub (widget paint only stubbed) |
| Selection | W-aware select; focus lineage |
| Registry | Click row → select actor |
| Assets | Reload from `UScene3DAsset` / `ULineageBundleAsset` |
| Log | Clear |

---

## 5. `SFourDWAxisWidget::OnPaint` (**skeleton**)

Declared paint: draw W axis line, active `[WMin,WMax]` band, optional ghost neighbor ticks. Stub returns `FVector2D::ZeroVector` / empty paint.

---

## 6. Roadmap debugger surfaces

| Surface | Status |
| --- | --- |
| Mini-viewport `FPreviewScene` | **roadmap** |
| Dimensional timeline | **roadmap** |
| Origin / lineage graph view | **roadmap** |
| Projection-ray debug draw | **roadmap** |

---

## 7. Module registration (**skeleton**)

`FFourDAdapterEditorModule` **declares** intent to register style, commands, and `FGlobalTabmanager` nomad tab spawner for `SFourDDebuggerPanel`. Stub logs non-interactive startup.

## Cross-links

- [UNREAL_ADAPTER_V1.md](./UNREAL_ADAPTER_V1.md)
- [UNREAL_LIVE_PROJECTION.md](./UNREAL_LIVE_PROJECTION.md)
- [UNREAL_SUBSYSTEM_ENHANCEMENTS.md](./UNREAL_SUBSYSTEM_ENHANCEMENTS.md)
