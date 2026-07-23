#pragma once

#include "CoreMinimal.h"
#include "Engine/DataAsset.h"
#include "UScene3DAsset.generated.h"

/**
 * Declared data asset wrapper for a PLP Scene3D payload.
 * Skeleton — no import factory; JsonPayload may be empty.
 */
UCLASS(BlueprintType)
class FOURDADAPTERRUNTIME_API UScene3DAsset : public UDataAsset
{
	GENERATED_BODY()

public:
	UPROPERTY(EditAnywhere, BlueprintReadOnly, Category = "4D Adapter")
	FString SchemaVersion;

	UPROPERTY(EditAnywhere, BlueprintReadOnly, Category = "4D Adapter")
	FString SceneId;

	/** Raw Scene3D JSON text — declared storage until cooked binary exists. */
	UPROPERTY(EditAnywhere, BlueprintReadOnly, Category = "4D Adapter", meta = (MultiLine = true))
	FString JsonPayload;
};
