#pragma once

#include "CoreMinimal.h"
#include "Engine/DataAsset.h"
#include "ULineageBundleAsset.generated.h"

/**
 * Declared data asset wrapper for a PLP LineageBundle payload.
 * Skeleton — no import factory; JsonPayload may be empty.
 */
UCLASS(BlueprintType)
class FOURDADAPTERRUNTIME_API ULineageBundleAsset : public UDataAsset
{
	GENERATED_BODY()

public:
	UPROPERTY(EditAnywhere, BlueprintReadOnly, Category = "4D Adapter")
	FString SchemaVersion;

	UPROPERTY(EditAnywhere, BlueprintReadOnly, Category = "4D Adapter")
	FString WorldId;

	/** Raw LineageBundle JSON text — declared storage until cooked binary exists. */
	UPROPERTY(EditAnywhere, BlueprintReadOnly, Category = "4D Adapter", meta = (MultiLine = true))
	FString JsonPayload;
};
