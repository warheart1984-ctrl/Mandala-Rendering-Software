# Unity live-link (MRS → Unity)

**Status:** **skeleton** / README: **Experimental**. Not charter-enforced.

## Architecture

```
MRS LiveLinkServer (ws://host:9487)
        │  state_snapshot | mesh_update | config
        ▼
MRSUnityLiveLink  →  Π₃D  →  MRSMeshBinding / MRSShaderMapper
```

## Projection \(\Pi_{3\mathrm{D}}\)

| Mode | Formula |
| --- | --- |
| DropW (default) | \((x,y,z,w)\mapsto(x,y,z)\) |
| ScaleByW | \((x,y,z)\cdot(1+s\,w)\) |
| OffsetYByW | \((x,\,y+s\,w,\,z)\) |

## Unity scripts

Path: `unity/GovernedUnityProject/Assets/Engine/LiveLink/`

| Script | Role |
| --- | --- |
| `MRSUnityLiveLink.cs` | Client MonoBehaviour |
| `IMRSConnection.cs` / `MRSWebSocketConnection.cs` | Transport stub |
| `MRSTypes.cs` | Snapshot / entity / vec4 |
| `MRSMeshBinding.cs` | Entity → GameObject |
| `MRSShaderMapper.cs` | Material param map skeleton |
| `MRSJsonUtil.cs` | Minimal JSON parse |

## JSON message (MRS → Unity)

```json
{
  "type": "state_snapshot",
  "frame": 1234,
  "seed": 4,
  "timestamp": 1710000000000,
  "entities": [
    {
      "id": 1,
      "pos4": [0.1, 0.2, -1.5, 0.0],
      "topologyId": "hypersphere",
      "materialId": "hyperlens_inner",
      "shaderGraphId": null,
      "data": {}
    }
  ]
}
```

Binary framing: [`MRS_BINARY_PROTOCOL.md`](./MRS_BINARY_PROTOCOL.md).

## MRS server

`4d-renderer` `LiveLinkServer` + `UnityClientProtocol` — use `broadcastStateSnapshot`.

## Replay hooks (declared)

`MRSUnityLiveLink.lastFrame` / `lastSeed` record the last snapshot indices for DR-C-style correlation with CSSV / ProvenanceRecorder. Bit-identical multi-host replay remains **declared**, not enforced.
