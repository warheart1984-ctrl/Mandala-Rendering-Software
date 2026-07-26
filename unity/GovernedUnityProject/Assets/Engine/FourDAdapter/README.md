# FourDAdapter — Unity skeleton

> **Status: skeleton**  
> Consumes projected **scene3D** + **lineageBundle** (PLP).  
> **Does not compute 4D.** Does not replace LiveLink or Inspector modules.

Docs: `docs/4d-engine/v1/adapters/UNITY_ADAPTER_V1.md`  
PLP: `docs/4d-engine/v1/plp/PLP_V1.md`

Cross-links (do not break):

- `Assets/Engine/LiveLink/` — experimental MRS live snapshots
- `Assets/Engine/Inspector/` — MRS-IC Editor window

All Runtime/Editor scripts below are stubs with TODO markers.

## Interop / shading buffer

- Types: `Assets/Engine/Rendering/FourDRendererTypes.cs` — **declared** / **skeleton** (RFC field names).
- `FourDTesseractRenderer` optional `ComputeBuffer` of `ShadingInput4D` — **partial** inspection/debug channel (`ReadBackShadingData()`).
- Optional LiveLink `shading_update` JSON publish (interval-gated, CPU mirror) — **partial**; default off.
- Observation mode Inspector enum maps to host IDs `0x1000000000000001` / `0x1000000000000002` (transport only unless PLP/path routing consumes them).
- **PLP remains the Scene3D host path**; this buffer does not replace projection → Scene3D.
- SoT: `mrs/packages/renderer-core/src/interop/FOURD_SHADING_TYPES.md`
