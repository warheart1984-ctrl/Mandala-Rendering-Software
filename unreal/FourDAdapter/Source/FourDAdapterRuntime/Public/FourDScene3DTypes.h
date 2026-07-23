#pragma once

#include "CoreMinimal.h"
#include "FourDScene3DTypes.generated.h"

/**
 * Minimal scene3D DTO stubs for PLP projected output.
 * Full schema lives with PLP / World Format — adapter consumes, does not author 4D.
 */
USTRUCT(BlueprintType)
struct FOURDADAPTERRUNTIME_API FScene3DMaterial
{
	GENERATED_BODY()

	UPROPERTY(BlueprintReadWrite, Category = "4D Adapter")
	FString Name;

	UPROPERTY(BlueprintReadWrite, Category = "4D Adapter")
	FLinearColor BaseColor = FLinearColor::White;

	UPROPERTY(BlueprintReadWrite, Category = "4D Adapter")
	float WDepth = 0.f;

	UPROPERTY(BlueprintReadWrite, Category = "4D Adapter")
	float GhostOpacity = 1.f;
};

USTRUCT(BlueprintType)
struct FOURDADAPTERRUNTIME_API FScene3DMesh
{
	GENERATED_BODY()

	UPROPERTY(BlueprintReadWrite, Category = "4D Adapter")
	FString Name;

	UPROPERTY(BlueprintReadWrite, Category = "4D Adapter")
	TArray<FVector> Vertices;

	UPROPERTY(BlueprintReadWrite, Category = "4D Adapter")
	TArray<int32> Indices;
};

USTRUCT(BlueprintType)
struct FOURDADAPTERRUNTIME_API FScene3DNode
{
	GENERATED_BODY()

	UPROPERTY(BlueprintReadWrite, Category = "4D Adapter")
	FString Name;

	UPROPERTY(BlueprintReadWrite, Category = "4D Adapter")
	FTransform Transform = FTransform::Identity;

	UPROPERTY(BlueprintReadWrite, Category = "4D Adapter")
	int32 MeshIndex = INDEX_NONE;

	UPROPERTY(BlueprintReadWrite, Category = "4D Adapter")
	int32 MaterialIndex = INDEX_NONE;

	UPROPERTY(BlueprintReadWrite, Category = "4D Adapter")
	int32 LineageId = 0;
};

USTRUCT(BlueprintType)
struct FOURDADAPTERRUNTIME_API FScene3D
{
	GENERATED_BODY()

	UPROPERTY(BlueprintReadWrite, Category = "4D Adapter")
	FString SceneId;

	UPROPERTY(BlueprintReadWrite, Category = "4D Adapter")
	TArray<FScene3DNode> Nodes;

	UPROPERTY(BlueprintReadWrite, Category = "4D Adapter")
	TArray<FScene3DMesh> Meshes;

	UPROPERTY(BlueprintReadWrite, Category = "4D Adapter")
	TArray<FScene3DMaterial> Materials;
};
