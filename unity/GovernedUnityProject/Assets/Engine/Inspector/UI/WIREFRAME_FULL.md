# Wireframe A — Full MRS 4D Inspector Window

**Path:** `Assets/Engine/Inspector/UI/WIREFRAME_FULL.md`  
**Status:** layout **mockup** (not an implemented IMGUI/UI Toolkit asset). Aligns with `MRS4DInspectorWindow` skeleton sections.

```
+-----------------------------------------------------------+
|                     MRS 4D Inspector                      |
+-----------------------------------------------------------+
| [Scene Click → Inspect]                                   |
|                                                           |
| ▼ Position & Projection                                   |
|   Position: (x, y, z, w)                                  |
|   Projection Matrix: [ 3x4 compact view ]                 |
|                                                           |
| ▼ Differential Geometry                                   |
|   Normal4D: (nx, ny, nz, nw)                              |
|   Tangent Basis:                                          |
|       t1: ( ... )                                         |
|       t2: ( ... )                                         |
|   Principal Curvature: k1, k2                             |
|   (curvatureStub: true until second forms exist)          |
|                                                           |
| ▼ Jacobian                                                |
|   [ 4x2 matrix grid ]                                     |
|                                                           |
| ▼ Rotation Planes                                         |
|   Plane x–w: angle θ                                      |
|   Plane y–z: angle φ                                      |
|                                                           |
| ▼ Hyperplane Intersections                                |
|   H0: dist = ..., onPlane = false                         |
|   H1: dist = ..., onPlane = true                          |
|                                                           |
| ▼ Local Topology                                          |
|   Incident Cells: [1, 4, 7]                               |
|   Neighbor Cells: [2, 3, 8]                               |
|   Boundary: false                                         |
|                                                           |
| ▼ Shader Debugging (declared / future — v1.4)             |
|   (hidden unless shaderDebug payload present)             |
|                                                           |
| [Copy JSON] [Export Snapshot]                             |
+-----------------------------------------------------------+
```

See also: [`WIREFRAME_COMPACT.md`](./WIREFRAME_COMPACT.md), [`theme.md`](./theme.md).
