# MRS 4D Inspector wire protocol

**Status:** **declared** / **skeleton** endpoint.  
Transport may share live-link (`LiveLinkServer` + `UnityClientProtocol`) or a dedicated process (`npm run inspector:ws`, default `ws://127.0.0.1:9490`). Path `/mrs_inspector` is documentary — the `ws` listener does not route by HTTP path.

**Evidence (Drive-G-1):** JS `handleWireMessage` + `resultToWire` prepare protocol-shaped JSON; Unity `MRSInspectorClient` wires connect / `scene_push` / send / parse. Server starts on a **default test mesh**; Unity may **bind** the live inspectable mesh + camera via `scene_push` (session-local — not production multi-user scene sync). Curvature carries `curvatureStub: true`.

## Connect (local)

```bash
npm run inspector:ws
# optional: node scripts/inspector-ws-server.mjs --port 9490 --host 127.0.0.1
```

Unity Editor: **MRS → 4D Inspector** → set endpoint `ws://127.0.0.1:9490` → **Connect** (auto `scene_push` when a `FourDTesseractRenderer` is present) → enable **Scene Click → Inspect**. Status shows `scene: default_test_mesh` or `scene: unity_bound`.

## Request — scene bind / push

Prefer inline `mesh` for rotated/custom geometry; `meshAssetId` alone loads `engine/surfaces/meshes/<id>.mesh.json` (A+C). Aliases: `scene_bind`. Query: `scene_status`. Reset: `scene_reset`.

```json
{
  "type": "scene_push",
  "schemaVersion": "1.1",
  "sceneId": "unity_bound",
  "meshAssetId": "tesseract",
  "camera": { "d4": 4, "d3": 4, "scale": 2 },
  "mesh": {
    "vertices": [[0, 0, 0, 0], [1, 0, 0, 0], [0, 1, 0, 0]],
    "faces": [[0, 1, 2]]
  }
}
```

Ack: `{ "type": "scene_bound", "ok": true, "sceneId": "unity_bound", "source": "unity_mesh", "label": "scene: unity_bound", "vertexCount": 3, "faceCount": 1, ... }`.  
`source`: `unity_mesh` | `mesh_asset` | `default`.

## Request — screen

Optional per-request `camera` overrides the bound scene camera for `Ray4D.from2DMouse`.

```json
{
  "type": "inspect_screen",
  "schemaVersion": "1.1",
  "sx": 0.42,
  "sy": 0.37,
  "width": 1920,
  "height": 1080,
  "camera": { "d4": 4, "d3": 4, "scale": 2 }
}
```

## Request — ray

```json
{
  "type": "inspect_ray",
  "schemaVersion": "1.1",
  "origin": [0, 0, -2.5, 0],
  "direction": [0, 0, 1, 0]
}
```

## Request — primitive

```json
{
  "type": "inspect_primitive",
  "schemaVersion": "1.1",
  "primitiveId": 3,
  "localParams": [0.5, 0.5, 0, 0]
}
```

## Response — `inspect_result`

Vectors on the wire are **number arrays** `[x,y,z,w]` (not `{x,y,z,w}` objects). Internal JS results may still use objects; `resultToWire` converts.

```json
{
  "type": "inspect_result",
  "schemaVersion": "1.1",
  "ok": true,
  "position": [1, 2, 3, 0.5],
  "normal4D": [0, 0, 1, 0],
  "tangentBasis": {
    "t1": [1, 0, 0, 0],
    "t2": [0, 1, 0, 0]
  },
  "curvature": { "k1": 0, "k2": 0, "dir1": [1,0,0,0], "dir2": [0,1,0,0], "curvatureStub": true },
  "jacobian": [[1,0],[0,1],[0,0],[0,0]],
  "projectionMatrix": [
    [1,0,0,0],
    [0,1,0,0],
    [0,0,1,0],
    [0,0,0,1]
  ],
  "rotationPlanes": [
    { "axisA": [1,0,0,0], "axisB": [0,0,0,1], "angle": 0.1, "label": "x-w" }
  ],
  "hyperplanes": [
    { "normal": [0,0,1,0], "d": -1.8, "distance": 0.2, "onPlane": false }
  ],
  "topology": {
    "incidentCellIds": [7],
    "neighborCellIds": [3, 8],
    "isBoundary": false
  },
  "provenance": {
    "primitiveId": 7,
    "bvhPath": [],
    "faceIndex": 7
  },
  "shaderDebug": null
}
```

Miss (compact): `{ "type": "inspect_result", "schemaVersion": "1.1", "ok": false, "error": "no_hit" }`.
