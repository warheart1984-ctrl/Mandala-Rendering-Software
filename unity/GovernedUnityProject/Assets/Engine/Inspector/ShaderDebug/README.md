# Inspector Shader Debugging — Unity layout stub

**Status:** **declared / future** (MRS-IC evolution **v1.4**).  
No engine evaluates a shader graph into these fields yet. Optional DTO field `shaderDebug` may be `null`.

## Declared fields (`ShaderDebugInfo`)

```text
ShaderDebugInfo
├── nodeValues[]          // value of each shader node at p
│     ├── name
│     └── value (scalar | vec)
├── finalColor            // Vec4 — shaded color before projection
└── materialParams        // resolved material parameters
      ├── metallic
      ├── roughness
      └── emission
```

## Unity UI section (mockup)

```
▼ Shader Debugging
   Node Values:
      Node_Albedo: (r,g,b,a)
      Node_Normal4D: (nx,ny,nz,nw)
      Node_Roughness: 0.42
   Final Color: (r,g,b)
   Material Params:
      Metallic: 0.1
      Roughness: 0.42
      Emission: (0,0,0)
```

Theme accent: `#F7DC6F` — see [`../UI/theme.md`](../UI/theme.md).  
Docs: [`../../../../../../docs/4drs/substrate/shader-debugging.md`](../../../../../../docs/4drs/substrate/shader-debugging.md).
