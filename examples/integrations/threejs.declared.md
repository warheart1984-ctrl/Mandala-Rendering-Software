# Declared — Three.js bridge

No Three.js / WebGL mesh bridge is shipped as a maintained example.

Projected 2D output today goes through Canvas 2D (`CanvasRenderer`) or
hyperplane slicing (`HyperplaneSlicer`). ExportManager can emit OBJ/GLTF in
**Node** for offline tooling — that is not a live Three.js scene graph sync.
