# Inspector integration guide (MRS developers)

**Status:** **skeleton** implementation exists in JS + Unity Editor stubs.  
**JS SoT:** `4d-renderer/src/inspector/` (`MRSInspector4D`).  
**Unity:** `unity/GovernedUnityProject/Assets/Engine/Inspector/`.  
**Contracts:** [MRS-IC-v1.1](../contracts/MRS-IC-v1.1.md) · [MRS-IC-v1.2](../contracts/MRS-IC-v1.2.md)  
**Alias path:** [`inspector-integration.md`](./inspector-integration.md) redirects here.

> C++ snippets below are a **declared** host API sketch for native ports. They are **not** a shipped C++ library in this repo.

## Step 1 — Include Inspector module

**JS (SoT):**

```js
import { MRSInspector4D } from "4d-renderer";
// or: import { MRSInspector4D } from "./inspector/index.js";
const inspector = new MRSInspector4D({ mesh, hyperplanes });
```

**Declared C++ host sketch:**

```cpp
#include "MRSInspector4D.h"
MRSInspector4D inspector;
```

## Step 2 — Connect to BVH + primitive system

Inspector requires (when claiming full conformance):

- BVH traversal  
- primitive intersection  
- primitive geometry (implicit/parametric)  

**Present:** mesh faces + `MeshPicker4D` / spatial pick; GPU BVH path optional / **skeleton**.

## Step 3 — Implement API endpoints

Screen-space:

```cpp
bool inspectAtScreenPoint(float sx, float sy, Inspector4DResult& out);
```

Ray-space:

```cpp
bool inspectAtRay(Vec4 origin, Vec4 dir, Inspector4DResult& out);
```

Primitive-space:

```cpp
bool inspectPrimitive(int id, Vec4 params, Inspector4DResult& out);
```

JS mirrors these on `MRSInspector4D`. Wire protocol: [`INSPECTOR_PROTOCOL.md`](./INSPECTOR_PROTOCOL.md).

## Step 4 — Populate Inspector4DResult

Fill:

- position  
- normal  
- tangent basis  
- curvature (**stubbed** — \(k_1=k_2=0\), `curvatureStub: true`)  
- Jacobian  
- projection matrix  
- hyperplane intersections  
- rotation planes  
- topology  

## Step 5 — Serialize for Unity

Provide JSON (+ binary **planned**). Helpers: `resultToJSON` / `resultToWire` / `buildInspectorEvidenceBundle` in `serialize.js` (wire vectors are arrays per [`INSPECTOR_PROTOCOL.md`](./INSPECTOR_PROTOCOL.md)).

Unity: `MRSInspectorClient` (WebSocket) + menu **MRS / 4D Inspector** (`MRS4DInspectorWindow`); SceneView click hook. Copy/Export prefer last wire JSON when connected.

### Local wire endpoint (prepares Editor integration)

```bash
npm run inspector:ws
```

Default: `ws://127.0.0.1:9490`. Reuses `LiveLinkServer` + `UnityClientProtocol` with `MRSInspector4D.handleWireMessage`. Server starts on a **default test mesh**; on Connect, Unity `MRSInspectorClient` pushes the active `FourDTesseractRenderer` inspectable snapshot (`scene_push`: rotated verts + `d4`/`d3`/`scale`, plus `meshAssetId`). UI shows `scene: default_test_mesh` vs `scene: unity_bound`. Manual **Push Scene** refreshes after surface/time changes. Not a claimed RT4D Hyper-Caustic Lens / multi-user sync.

**Gaps (declared):** SceneView 3D camera ≠ full 4D `Ray4D.from2DMouse` identity (projection params are pushed; Unity Scene camera matrix is not); real curvature; shaderDebug; production auth/TLS; auto re-push on every animation frame.

## Step 6 — Deterministic replay hooks

Inspector **intends** to run identically under replay (MRS-IC Invariant 3.3). Persist evidence bundles under CSSV or research logs when required.

See [`INSPECTOR_EVIDENCE_BUNDLE.md`](./INSPECTOR_EVIDENCE_BUNDLE.md). Bit-identical multi-host replay is **not** claimed enforced.

## Smoke test

```bash
npm run test:inspector4d
```

Includes in-process `handleWireMessage` / `scene_push` checks plus a WebSocket `scene_push` → `inspect_ray` round-trip against `LiveLinkServer`.
