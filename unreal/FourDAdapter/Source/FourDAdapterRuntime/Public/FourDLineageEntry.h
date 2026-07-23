#pragma once

#include "CoreMinimal.h"
#include "FourDLineageEntry.generated.h"

USTRUCT(BlueprintType)
struct FOURDADAPTERRUNTIME_API FFourDLineageEntry
{
	GENERATED_BODY()

	UPROPERTY(BlueprintReadOnly, Category = "4D Adapter")
	int32 LineageId = 0;

	UPROPERTY(BlueprintReadOnly, Category = "4D Adapter")
	int32 Node4D = 0;

	UPROPERTY(BlueprintReadOnly, Category = "4D Adapter")
	int32 Mesh4D = 0;

	UPROPERTY(BlueprintReadOnly, Category = "4D Adapter")
	int32 Camera4D = 0;

	UPROPERTY(BlueprintReadOnly, Category = "4D Adapter")
	int32 Slice3D = 0;

	UPROPERTY(BlueprintReadOnly, Category = "4D Adapter")
	float WMin = 0.f;

	UPROPERTY(BlueprintReadOnly, Category = "4D Adapter")
	float WMax = 0.f;

	UPROPERTY(BlueprintReadOnly, Category = "4D Adapter")
	FString ProjectionType;
};
