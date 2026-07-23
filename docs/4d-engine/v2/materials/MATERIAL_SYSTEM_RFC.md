# FourDRenderer v2.0 — Material System RFC  
## SO(4) Materials, 4D Textures, Hybrid 4D/3D Shading

| Field | Value |
| --- | --- |
| Status | **Declared** |
| Aligns with | RT4D materials (**partial**) · Unreal `MF_*` design docs (**declared**, no `.uasset`) |

## 1. Purpose

Define materials for FourDRenderer v2.0: SO(4)-aware descriptors, 4D texture sampling, hybrid 4D/3D shading, and routing flags.

## 2. Material descriptor

```cpp
struct Material4DDesc {
    uint32 MaterialId;
    uint32 BSDFType;           // Lambert4D, GGX4D, …
    uint32 Use4DShading;       // bool
    uint32 UseHybridShading;   // bool
    float3 BaseColor;
    float  Roughness;
    float  WAnisotropy;        // optional
};
```

## 3. Flags

| Flag | Behavior |
| --- | --- |
| `Use4DShading` | Full BSDF4D participation |
| `UseHybridShading` | Evaluate 4D and 3D; blend |
| `Use3DOnly` | Bypass 4D shading |

Observation Mode decides when hybrid evaluation is active.

## 4. 4D texture sampling

```cpp
float4 SampleTexture4D(Texture4D tex, float4 coord);
```

Implementations may be procedural, flattened 4D→3D atlas, or 4D noise — **declared**, not claimed shipped.

## 5. BSDF types (**declared**)

| Type | Intent |
| --- | --- |
| Lambert4D | Diffuse over \(S^{3}\) |
| GGX4D | Microfacet generalized to 4D |
| Custom | User SO(4)-invariant models |

Energy / invariance requirements: [SHADING_AND_TRANSPORT_RFC.md](../shading-transport/SHADING_AND_TRANSPORT_RFC.md).

## 6. Hybrid shading

```cpp
float3 Blend4D3D(float3 L4D, float3 L3D, float alpha);
```

Routing jointly with Observation Mode and material flags.

## 7. Host material bridge

Unreal-side `MF_*` / `M_FourD*` designs under Engine v1 adapters are **declared** visualization helpers for projected Scene3D — they do **not** implement BSDF4D. See [`../../v1/adapters/UNREAL_MATERIAL_FUNCTIONS.md`](../../v1/adapters/UNREAL_MATERIAL_FUNCTIONS.md).

Material compiler dual-emit is **roadmap** ([SHADER_ABI.md](../shader-abi/SHADER_ABI.md) §8).

## 8. Evidence

| Claim | Status |
| --- | --- |
| This RFC | **declared** |
| RT4D MaterialSystem | **partial** |
| Unreal MF assets | **declared** (placeholders) |
| SO(4) enforcement | **not claimed** |
