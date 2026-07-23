# Unreal Live Projection / Live Link (**declared** / **skeleton**)

> **Drive-G-1:** Protocol and client API are **declared**.  
> Evidence: `UFourDLiveLinkClient` stub (no sockets). Do **not** claim a working Unreal ↔ PLP live session.

**Status:** **declared** (JSON contract) · **skeleton** (client) · interop with Unity LiveLink wire = **roadmap**

**Naming:** Design + stub use `UFourDLiveLinkClient`. Older notes may say “live projection client” — same role.

---

## 1. Purpose

Refresh projected `scene3D` + `lineageBundle` without computing 4D in Unreal. Client sends `ProjectionRequest`; server (PLP / `projectWorld` gateway) returns `ProjectionResponse`. Unreal remains a **consumer**.

---

## 2. JSON contract (**declared**)

### `ProjectionRequest`

```json
{
  "type": "ProjectionRequest",
  "worldId": "string",
  "observationModeId": "drop_w",
  "time": 0.0,
  "params": {}
}
```

| Field | Notes |
| --- | --- |
| `worldId` | Matches WorldDocument / lineage authority |
| `observationModeId` | PLP `modeId` — [PLP_V1.md](../plp/PLP_V1.md) |
| `time` | Observation clock (server-defined units) |
| `params` | Optional mode params |

### `ProjectionResponse`

```json
{
  "type": "ProjectionResponse",
  "status": "ok",
  "worldId": "string",
  "scene3D": {},
  "lineageBundle": {}
}
```

Error: `{ "type": "ProjectionResponse", "status": "error", "message": "…" }`.  
Honest PLP stubs may also surface `status: "skeleton"` / `"partial"` — treat as non-production.

---

## 3. Tie to PLP / MRS live-link

| System | Evidence | Relation |
| --- | --- | --- |
| PLP `projectWorld` | `mrs/packages/renderer-core/src/plp/projectWorld.js` (**skeleton**) | Canonical producer of `scene3D` + `lineageBundle` for responses |
| MRS LiveLink WS | default port **9487** (`LIVELINK_DEFAULT_PORT`) | Unity mesh/snapshot path — **skeleton**/experimental |
| Inspector WS | default port **9490** | Separate inspector helper |

**Declared:** Unreal `UFourDLiveLinkClient` speaks the ProjectionRequest/Response artifact protocol above. It is **not** claimed to speak Unity LiveLink frames. A gateway wrapping `projectWorld` (port TBD; env name **declared**: `MRS_PLP_WS_URL`) is the intended bridge. Shared-port interop = **roadmap**.

PLP non-goal remains: not replacing Unity LiveLink wire protocol.

---

## 4. `UFourDLiveLinkClient` API (**skeleton**)

| Method | Today |
| --- | --- |
| `Connect(Url)` | log + false |
| `Disconnect()` | no-op |
| `IsConnected()` | false |
| `SendProjectionRequest(WorldId, ModeId, Time)` | log + false |
| Events OnResponse / OnError | **declared** |

On success (future): feed assets / `UFourDSceneLoader` / `A4DWorldActor::ReloadProjection`.

---

## 5. Transport (**declared**)

WebSocket text JSON preferred; TCP length-prefixed JSON fallback. Endpoint configured on the client UObject — not hard-coded to 9487.

## Cross-links

- [PLP_V1.md](../plp/PLP_V1.md)
- [UNREAL_ADAPTER_V1.md](./UNREAL_ADAPTER_V1.md)
- [UNREAL_SEQUENCER_4D_TRACK.md](./UNREAL_SEQUENCER_4D_TRACK.md)
- Unity LiveLink: `unity/.../LiveLink/` · `docs/4drs/substrate/`
