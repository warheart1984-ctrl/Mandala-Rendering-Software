# MRS 4D Inspector wire protocol

**Status:** **declared**. Endpoint may share live-link transport or a dedicated path (`/mrs_inspector`).

## Request — screen

```json
{
  "type": "inspect_screen",
  "schemaVersion": "1.1",
  "sx": 0.42,
  "sy": 0.37,
  "width": 1920,
  "height": 1080
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
  "curvature": { "k1": 0, "k2": 0, "dir1": [1,0,0,0], "dir2": [0,1,0,0] },
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

Miss: `{ "type": "inspect_result", "ok": false, "error": "no_hit" }`.
