// FourDRenderer v2.0 — GPU ABI structs (HLSL / StructuredBuffer-friendly)
// Contract source: docs/4d-engine/v2/shader-abi/SHADER_ABI.md
//                 + bvh-projection / observation / materials RFCs
// Status: declared (header only) — does not claim shipping kernels.
//
// Layout notes:
// - Hit4D.Hit is uint (0/1), not bool — matches SHADER_ABI.md; avoids C#/GPU packing traps.
// - ShadingInput4D stride = 3*float4 + 2*uint = 56 bytes.
// - Material4DDesc: float3 BaseColor packs as 12 bytes in StructuredBuffer; pad if CB layout needed.

#ifndef FOURD_RENDERER_TYPES_HLSLI
#define FOURD_RENDERER_TYPES_HLSLI

// Geometry / BVH (BVH_AND_PROJECTION_RFC) — declared; no traversal kernel claimed.
struct Primitive4D
{
    float4 P0;
    float4 P1;
    float4 P2;
    uint   MaterialId;
    uint   ProjectionPolicyId;
};

struct EmbeddedSurface4D
{
    float4 Origin;
    float4 BasisX;
    float4 BasisY;
    float4 BasisZ;
    float2 UVScale;
    uint   MaterialId;
    uint   ProjectionPolicyId;
};

struct BVHNode4D
{
    float4 BoundsMin;
    float4 BoundsMax;
    uint   FirstChildOrPrim;
    uint   ChildCount; // 0 => leaf (layout variant)
    uint   PrimCount;
    uint   Flags;
};

struct Ray4D
{
    float4 Origin;
    float4 Direction;
};

struct Hit4D
{
    uint   Hit;        // 0 = miss, 1 = hit (RFC prose may say bool)
    float  T;
    uint   PrimIndex;
    float4 Position;   // BVH RFC field name (not Position4D)
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
    uint2 Value; // uint64 as lo/hi for HLSL without native uint64 on all targets
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
    uint   BSDFType;           // Lambert4D=0, GGX4D=1, …
    uint   Use4DShading;       // 0/1
    uint   UseHybridShading;   // 0/1
    float3 BaseColor;
    float  Roughness;
    float  WAnisotropy;
};

// ProjectionPolicyId vocabulary (Observation Mode RFC examples)
static const uint FOURD_PROJ_PERSPECTIVE_4D_TO_3D = 0;
static const uint FOURD_PROJ_SLICE_W_CONSTANT     = 1;
static const uint FOURD_PROJ_STEREOGRAPHIC_4D_TO_3D = 2;

static const uint FOURD_SHADING_INPUT_STRIDE_BYTES = 56;

#endif // FOURD_RENDERER_TYPES_HLSLI
