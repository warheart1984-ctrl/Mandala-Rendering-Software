#pragma once

#include "CoreMinimal.h"
#include "UObject/NoExportTypes.h"
#include "FourDShadingTypes.generated.h"

/**
 * FourDRenderer v2.0 shading + geometry host contracts (Unreal).
 * Field names align with docs/4d-engine/v2 RFCs (BVH, Observation, Materials, Shader ABI).
 * Status: skeleton — USTRUCTs + LiveLink hooks only; does not claim 4D path tracing / RHI BVH.
 *
 * Spelling: FObservationModeId (not FObervationModeId).
 * UPROPERTY macros: EditAnywhere, BlueprintReadWrite (not AnyEditReadBlueprintReadWrite).
 *
 * Layout note: do NOT redefine UE's FVector4 / FVector. Use FFourDVector4 for Blueprint
 * USTRUCTs. Hit uses int32 0/1 (RFC may say bool).
 */

/** Blueprint-friendly 4-vector (avoids colliding with engine FVector4). */
USTRUCT(BlueprintType)
struct FOURDADAPTERRUNTIME_API FFourDVector4
{
	GENERATED_BODY()

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "4D|ABI")
	float X = 0.f;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "4D|ABI")
	float Y = 0.f;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "4D|ABI")
	float Z = 0.f;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "4D|ABI")
	float W = 0.f;

	FFourDVector4() = default;
	FFourDVector4(float InX, float InY, float InZ, float InW)
		: X(InX), Y(InY), Z(InZ), W(InW) {}

	explicit FFourDVector4(const FVector4f& V) : X(V.X), Y(V.Y), Z(V.Z), W(V.W) {}

	FVector4f ToVector4f() const { return FVector4f(X, Y, Z, W); }
};

UENUM(BlueprintType)
enum class EFourDObservationMode : uint8
{
	Perspective4DTo3D UMETA(DisplayName = "Perspective 4D→3D"),
	WSliceConstant UMETA(DisplayName = "W-Slice Constant")
};

USTRUCT(BlueprintType)
struct FOURDADAPTERRUNTIME_API FPrimitive4D
{
	GENERATED_BODY()

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "4D|Geometry")
	FFourDVector4 P0;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "4D|Geometry")
	FFourDVector4 P1;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "4D|Geometry")
	FFourDVector4 P2;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "4D|Geometry")
	uint32 MaterialId = 0;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "4D|Geometry")
	uint32 ProjectionPolicyId = 0;
};

USTRUCT(BlueprintType)
struct FOURDADAPTERRUNTIME_API FEmbeddedSurface4D
{
	GENERATED_BODY()

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "4D|Geometry")
	FFourDVector4 Origin;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "4D|Geometry")
	FFourDVector4 BasisX;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "4D|Geometry")
	FFourDVector4 BasisY;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "4D|Geometry")
	FFourDVector4 BasisZ;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "4D|Geometry")
	FVector2D UVScale = FVector2D(1.f, 1.f);

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "4D|Geometry")
	uint32 MaterialId = 0;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "4D|Geometry")
	uint32 ProjectionPolicyId = 0;
};

USTRUCT(BlueprintType)
struct FOURDADAPTERRUNTIME_API FBVHNode4D
{
	GENERATED_BODY()

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "4D|BVH")
	FFourDVector4 BoundsMin;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "4D|BVH")
	FFourDVector4 BoundsMax;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "4D|BVH")
	uint32 FirstChildOrPrim = 0;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "4D|BVH")
	uint32 ChildCount = 0;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "4D|BVH")
	uint32 PrimCount = 0;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "4D|BVH")
	uint32 Flags = 0;
};

/**
 * Host BVH4D descriptor — RFC uses raw pointers; USTRUCT records counts only (skeleton).
 * Buffer ownership stays with a future RHI path (roadmap).
 */
USTRUCT(BlueprintType)
struct FOURDADAPTERRUNTIME_API FBVH4DDesc
{
	GENERATED_BODY()

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "4D|BVH")
	uint32 NodeCount = 0;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "4D|BVH")
	uint32 PrimCount = 0;
};

/** Plain (non-USTRUCT) mirrors for CPU / future compute. */
struct FRay4D
{
	FVector4f Origin = FVector4f(0.f, 0.f, 0.f, 0.f);
	FVector4f Direction = FVector4f(0.f, 0.f, 0.f, 1.f);
};

struct FHit4D
{
	/** RFC may say bool; ABI uses 0/1 for packing parity with HLSL uint Hit. */
	int32 Hit = 0;
	float T = 0.f;
	uint32 PrimIndex = 0;
	FVector4f Position = FVector4f(0.f, 0.f, 0.f, 0.f);
	FVector4f Normal = FVector4f(0.f, 0.f, 0.f, 0.f);
};

USTRUCT(BlueprintType)
struct FOURDADAPTERRUNTIME_API FShadingInput4D
{
	GENERATED_BODY()

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "4D|ABI")
	FFourDVector4 Position4D;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "4D|ABI")
	FFourDVector4 Normal4D;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "4D|ABI")
	FFourDVector4 ViewDir4D;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "4D|ABI")
	uint32 MaterialId = 0;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "4D|ABI")
	uint32 ProjectionPolicyId = 0;
};

USTRUCT(BlueprintType)
struct FOURDADAPTERRUNTIME_API FShadingOutput3D
{
	GENERATED_BODY()

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "4D|ABI")
	FVector Position3D = FVector::ZeroVector;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "4D|ABI")
	FVector Normal3D = FVector::UpVector;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "4D|ABI")
	FVector Radiance3D = FVector::ZeroVector;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "4D|ABI")
	float Depth = 0.f;
};

USTRUCT(BlueprintType)
struct FOURDADAPTERRUNTIME_API FObservationModeId
{
	GENERATED_BODY()

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "4D|Observation")
	uint64 Value = 0;
};

USTRUCT(BlueprintType)
struct FOURDADAPTERRUNTIME_API FObservationModeDesc
{
	GENERATED_BODY()

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "4D|Observation")
	FObservationModeId Id;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "4D|Observation")
	uint32 ProjectionPolicyId = 0;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "4D|Observation")
	uint32 PathRoutingPolicyId = 0;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "4D|Observation")
	uint32 VisibilityPolicyId = 0;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "4D|Observation")
	uint32 BlendPolicyId = 0;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "4D|Observation")
	float WSliceMin = 0.f;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "4D|Observation")
	float WSliceMax = 0.f;
};

USTRUCT(BlueprintType)
struct FOURDADAPTERRUNTIME_API FMaterial4DDesc
{
	GENERATED_BODY()

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "4D|Material")
	uint32 MaterialId = 0;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "4D|Material")
	uint32 BSDFType = 0;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "4D|Material")
	uint32 Use4DShading = 0;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "4D|Material")
	uint32 UseHybridShading = 0;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "4D|Material")
	FVector BaseColor = FVector(1.f, 1.f, 1.f);

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "4D|Material")
	float Roughness = 0.5f;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "4D|Material")
	float WAnisotropy = 0.f;
};

namespace FourDRendererV2
{
	static constexpr uint32 ProjectionPerspective4DTo3D = 0;
	static constexpr uint32 ProjectionSliceWConstant = 1;
	static constexpr uint32 ProjectionStereographic4DTo3D = 2;

	static constexpr uint64 ObservationModeId_Perspective4DTo3D = 0x1000000000000001ULL;
	static constexpr uint64 ObservationModeId_WSliceConstant = 0x1000000000000002ULL;

	/** Documented StructuredBuffer strides (HLSL SoT). ShadingInput4D is 56, not 96. */
	static constexpr int32 ShadingInput4DStrideBytes = 56;
	static constexpr int32 ObservationModeDescStrideBytes = 32;
	static constexpr int32 Material4DDescStrideBytes = 36;
	static constexpr int32 Primitive4DStrideBytes = 56;
	static constexpr int32 BVHNode4DStrideBytes = 48;

	inline uint32 GetProjectionPolicyId(EFourDObservationMode Mode)
	{
		switch (Mode)
		{
		case EFourDObservationMode::WSliceConstant:
			return ProjectionSliceWConstant;
		case EFourDObservationMode::Perspective4DTo3D:
		default:
			return ProjectionPerspective4DTo3D;
		}
	}

	inline uint64 GetObservationModeIdValue(EFourDObservationMode Mode)
	{
		switch (Mode)
		{
		case EFourDObservationMode::WSliceConstant:
			return ObservationModeId_WSliceConstant;
		case EFourDObservationMode::Perspective4DTo3D:
		default:
			return ObservationModeId_Perspective4DTo3D;
		}
	}
}
