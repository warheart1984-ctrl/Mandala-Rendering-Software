# Inspector integration guide (MRS developers)

**Status:** skeleton implementation exists in JS + Unity Editor stubs.

1. **Include module** — `import { MRSInspector4D } from "4d-renderer"` (or `./inspector/index.js`).
2. **Connect geometry** — pass mesh / scene with pick callback (reuse `MeshPicker4D` or BVH).
3. **API** — `inspectAtScreenPoint`, `inspectAtRay`, `inspectPrimitive`.
4. **Fill result** — position, normal, tangents, curvature (partial), Jacobian, \(P\), hyperplanes, rotation planes, topology.
5. **Serialize** — `resultToJSON` / evidence bundle.
6. **Unity** — `MRSInspectorClient` + `MRS/4D Inspector` window; SceneView click hook.
7. **Replay** — persist evidence bundles under CSSV or research logs when required.

UI wireframes: see [`MRS-IC-v1.1.md`](./MRS-IC-v1.1.md) and Unity `MRS4DInspectorWindow`.
