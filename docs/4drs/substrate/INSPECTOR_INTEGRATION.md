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

Provide JSON (+ binary **planned**). Helpers: `resultToJSON` / `buildInspectorEvidenceBundle` in `serialize.js`.

Unity: `MRSInspectorClient` + menu **MRS / 4D Inspector** (`MRS4DInspectorWindow`); SceneView click hook.

UI mockups: [`WIREFRAME_FULL.md`](../../../unity/GovernedUnityProject/Assets/Engine/Inspector/UI/WIREFRAME_FULL.md), theme [`theme.md`](../../../unity/GovernedUnityProject/Assets/Engine/Inspector/UI/theme.md).

## Step 6 — Deterministic replay hooks

Inspector **intends** to run identically under replay (MRS-IC Invariant 3.3). Persist evidence bundles under CSSV or research logs when required.

See [`INSPECTOR_EVIDENCE_BUNDLE.md`](./INSPECTOR_EVIDENCE_BUNDLE.md). Bit-identical multi-host replay is **not** claimed enforced.

## Smoke test

```bash
npm run test:inspector4d
```
