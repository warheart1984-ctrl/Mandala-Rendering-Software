# Inspector Shader Debugging Extension

**Status:** **declared / future** (MRS-IC Article V evolution **v1.4**).  
**Not implemented** as an engine evaluation path. JS `Inspector4DResult.shaderDebug` is `null` by default. Do not claim DAG evaluation or material capture as present capability.

## Extension fields

Add to `Inspector4DResult` (declared shape):

```cpp
struct ShaderDebugInfo {
    std::vector<NodeValue> nodeValues; // value of each shader node at p
    Vec4 finalColor;                   // final shaded color before projection
    MaterialParams materialParams;     // resolved material parameters
};
```

JSON sketch (when present):

```json
{
  "shaderDebug": {
    "nodeValues": [
      { "name": "Node_Albedo", "value": [1, 1, 1, 1] },
      { "name": "Node_Roughness", "value": 0.42 }
    ],
    "finalColor": [0.8, 0.7, 0.6, 1],
    "materialParams": {
      "metallic": 0.1,
      "roughness": 0.42,
      "emission": [0, 0, 0]
    }
  }
}
```

## Unity UI section

See [`unity/.../Inspector/ShaderDebug/README.md`](../../../unity/GovernedUnityProject/Assets/Engine/Inspector/ShaderDebug/README.md) and wireframe note in [`WIREFRAME_FULL.md`](../../../unity/GovernedUnityProject/Assets/Engine/Inspector/UI/WIREFRAME_FULL.md).

## Engine integration (roadmap — not present)

1. Evaluate shader graph at point \(p\) using the same DAG used for rendering.  
2. Capture intermediate node outputs.  
3. Provide them to Unity via `Inspector4DResult.shaderDebug`.

Related **declared** contract: SG-C in [`CONSTITUTIONAL_CONTRACTS.md`](./CONSTITUTIONAL_CONTRACTS.md). Shader graph skeleton: `4d-renderer/src/shader-graph/`.
