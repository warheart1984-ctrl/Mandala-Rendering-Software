using System.Runtime.InteropServices;
using UnityEngine;

/// <summary>
/// FourDRenderer v2.0 contract structs (legacy unity/Assets mirror).
/// Prefer GovernedUnityProject copy as SoT. Status: declared / skeleton.
/// </summary>
public static class FourDRendererLayout
{
    public const int Ray4DStrideBytes = 32;
    public const int Hit4DStrideBytes = 48;
    public const int ShadingInput4DStrideBytes = 56; // not 96
    public const int ShadingOutput3DStrideBytes = 40;
    public const int ObservationModeDescStrideBytes = 32;
    public const int Material4DDescStrideBytes = 36;
    public const uint ProjectionPerspective4DTo3D = 0;
    public const uint ProjectionSliceWConstant = 1;
    public const uint ProjectionStereographic4DTo3D = 2;
}

public enum ObservationModeChoice
{
    Perspective4DTo3D = 0,
    WSliceConstant = 1,
}

[StructLayout(LayoutKind.Sequential)]
public struct Ray4D
{
    public Vector4 Origin;
    public Vector4 Direction;
}

[StructLayout(LayoutKind.Sequential)]
public struct Hit4D
{
    public int Hit; // 0/1 — not bool (GPU stride)
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
                return new ObservationModeId { Value = 0 };
        }
    }

    public static uint ToProjectionPolicyId(ObservationModeChoice choice)
    {
        return choice == ObservationModeChoice.WSliceConstant
            ? FourDRendererLayout.ProjectionSliceWConstant
            : FourDRendererLayout.ProjectionPerspective4DTo3D;
    }
}
