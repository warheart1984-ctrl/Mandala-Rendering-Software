// FourDRenderer v2.0 — GPU ABI structs (Unity Assets copy)
// Canonical SoT: docs/4d-engine/v2/shader-abi/FourDRendererTypes.hlsli
// Status: declared — header only; no kernels claimed.

#ifndef FOURD_RENDERER_TYPES_HLSL
#define FOURD_RENDERER_TYPES_HLSL

struct Ray4D
{
    float4 Origin;
    float4 Direction;
};

struct Hit4D
{
    uint   Hit;        // 0/1 — not bool (GPU + C# ComputeBuffer stride)
    float  T;
    uint   PrimIndex;
    float4 Position;
    float4 Normal;
};

struct ShadingInput4D
{
    float4 Position4D;
    float4 Normal4D;
    float4 ViewDir4D;
    uint   MaterialId;
    uint   ProjectionPolicyId;
};

struct ShadingOutput3D
{
    float3 Position3D;
    float3 Normal3D;
    float3 Radiance3D;
    float  Depth;
};

struct ObservationModeId
{
    uint2 Value; // uint64 as lo/hi
};

struct ObservationModeDesc
{
    ObservationModeId Id;
    uint   ProjectionPolicyId;
    uint   PathRoutingPolicyId;
    uint   VisibilityPolicyId;
    uint   BlendPolicyId;
    float  WSliceMin;
    float  WSliceMax;
};

struct Material4DDesc
{
    uint   MaterialId;
    uint   BSDFType;
    uint   Use4DShading;
    uint   UseHybridShading;
    float3 BaseColor;
    float  Roughness;
    float  WAnisotropy;
};

static const uint FOURD_PROJ_PERSPECTIVE_4D_TO_3D = 0;
static const uint FOURD_PROJ_SLICE_W_CONSTANT = 1;
static const uint FOURD_PROJ_STEREOGRAPHIC_4D_TO_3D = 2;
static const uint FOURD_SHADING_INPUT_STRIDE_BYTES = 56;

#endif
