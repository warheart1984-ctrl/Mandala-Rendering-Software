using System.Runtime.InteropServices;
using UnityEngine;

/// <summary>
/// FourDRenderer v2.0 contract structs for Unity ComputeBuffer / CPU interop.
/// Field names match docs/4d-engine/v2 RFCs (SHADER_ABI, BVH, Observation, Materials).
/// Status: declared / skeleton host binding — not a path tracer.
/// Package SoT mirror: mrs/packages/renderer-core/src/interop/
/// </summary>
/// <remarks>
/// Layout pitfalls:
/// - Hit4D.Hit is int (0/1), not bool — bool + Sequential is not reliable for GPU strides.
/// - ShadingInput4D stride is 56 bytes (3×Vector4 + 2×uint), not 96.
/// - BVH4D pointer container is host-only; use BVH4DDesc counts for buffers.
/// </remarks>
public static class FourDRendererLayout
{
    public const int Ray4DStrideBytes = 32;             // 2 × Vector4
    public const int Hit4DStrideBytes = 48;             // int+float+uint + pad + 2×Vector4 (16-align)
    public const int ShadingInput4DStrideBytes = 56;    // 3 × Vector4 + 2 × uint
    public const int ShadingOutput3DStrideBytes = 40;   // 3 × Vector3 + float
    public const int ObservationModeDescStrideBytes = 32;
    public const int Material4DDescStrideBytes = 36;
    public const int Primitive4DStrideBytes = 56;       // 3 × Vector4 + 2 × uint
    public const int EmbeddedSurface4DStrideBytes = 80; // 4 × Vector4 + float2 + 2 × uint
    public const int BVHNode4DStrideBytes = 48;         // 2 × Vector4 + 4 × uint

    public const uint ProjectionPerspective4DTo3D = 0;
    public const uint ProjectionSliceWConstant = 1;
    public const uint ProjectionStereographic4DTo3D = 2;
}

/// <summary>Inspector / host toggle mapped to ProjectionPolicyId (Observation Mode RFC examples). Status: partial.</summary>
public enum ObservationModeChoice
{
    Perspective4DTo3D = 0,
    WSliceConstant = 1,
}

[StructLayout(LayoutKind.Sequential)]
public struct Primitive4D
{
    public Vector4 P0;
    public Vector4 P1;
    public Vector4 P2;
    public uint MaterialId;
    public uint ProjectionPolicyId;
}

[StructLayout(LayoutKind.Sequential)]
public struct EmbeddedSurface4D
{
    public Vector4 Origin;
    public Vector4 BasisX;
    public Vector4 BasisY;
    public Vector4 BasisZ;
    public Vector2 UVScale;
    public uint MaterialId;
    public uint ProjectionPolicyId;
}

[StructLayout(LayoutKind.Sequential)]
public struct BVHNode4D
{
    public Vector4 BoundsMin;
    public Vector4 BoundsMax;
    public uint FirstChildOrPrim;
    public uint ChildCount;
    public uint PrimCount;
    public uint Flags;
}

/// <summary>Host descriptor — RFC BVH4D uses pointers; Unity holds counts only (skeleton).</summary>
[StructLayout(LayoutKind.Sequential)]
public struct BVH4DDesc
{
    public uint NodeCount;
    public uint PrimCount;
}

[StructLayout(LayoutKind.Sequential)]
public struct Ray4D
{
    public Vector4 Origin;
    public Vector4 Direction;
}

/// <summary>Hit4D — RFC may say bool Hit; GPU/C# ABI uses int 0/1.</summary>
[StructLayout(LayoutKind.Sequential)]
public struct Hit4D
{
    public int Hit;
    public float T;
    public uint PrimIndex;
    public Vector4 Position;
    public Vector4 Normal;
}

[StructLayout(LayoutKind.Sequential)]
public struct ShadingInput4D
{
    public Vector4 Position4D;
    public Vector4 Normal4D;
    public Vector4 ViewDir4D;
    public uint MaterialId;
    public uint ProjectionPolicyId;
}

[StructLayout(LayoutKind.Sequential)]
public struct ShadingOutput3D
{
    public Vector3 Position3D;
    public Vector3 Normal3D;
    public Vector3 Radiance3D;
    public float Depth;
}

[StructLayout(LayoutKind.Sequential)]
public struct ObservationModeId
{
    public ulong Value;
}

[StructLayout(LayoutKind.Sequential)]
public struct ObservationModeDesc
{
    public ObservationModeId Id;
    public uint ProjectionPolicyId;
    public uint PathRoutingPolicyId;
    public uint VisibilityPolicyId;
    public uint BlendPolicyId;
    public float WSliceMin;
    public float WSliceMax;
}

[StructLayout(LayoutKind.Sequential)]
public struct Material4DDesc
{
    public uint MaterialId;
    public uint BSDFType;
    public uint Use4DShading;
    public uint UseHybridShading;
    public Vector3 BaseColor;
    public float Roughness;
    public float WAnisotropy;
}

public static class FourDObservationModeMap
{
    public const ulong Perspective4DTo3DId = 0x1000000000000001UL;
    public const ulong WSliceConstantId = 0x1000000000000002UL;

    public static ObservationModeId ToObservationModeId(ObservationModeChoice choice)
    {
        switch (choice)
        {
            case ObservationModeChoice.Perspective4DTo3D:
                return new ObservationModeId { Value = Perspective4DTo3DId };
            case ObservationModeChoice.WSliceConstant:
                return new ObservationModeId { Value = WSliceConstantId };
            default:
                return new ObservationModeId { Value = Perspective4DTo3DId };
        }
    }

    public static uint ToProjectionPolicyId(ObservationModeChoice choice)
    {
        switch (choice)
        {
            case ObservationModeChoice.Perspective4DTo3D:
                return FourDRendererLayout.ProjectionPerspective4DTo3D;
            case ObservationModeChoice.WSliceConstant:
                return FourDRendererLayout.ProjectionSliceWConstant;
            default:
                return FourDRendererLayout.ProjectionPerspective4DTo3D;
        }
    }

    /// <summary>JSON-safe hex for LiveLink shading_update.observationModeId.</summary>
    public static string ToWireHex(ObservationModeChoice choice)
    {
        return $"0x{ToObservationModeId(choice).Value:x}";
    }
}
