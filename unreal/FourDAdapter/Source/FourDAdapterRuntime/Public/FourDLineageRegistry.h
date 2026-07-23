#pragma once

#include "CoreMinimal.h"
#include "UObject/Object.h"
#include "FourDLineageEntry.h"
#include "FourDLineageRegistry.generated.h"

/**
 * Maps Unreal objects to PLP lineage entries.
 * Skeleton — Register/Get/Query bodies are stubs until a UE build lands.
 */
UCLASS(BlueprintType)
class FOURDADAPTERRUNTIME_API UFourDLineageRegistry : public UObject
{
	GENERATED_BODY()

public:
	UFUNCTION(BlueprintCallable, Category = "4D Adapter")
	static UFourDLineageRegistry* Get(UWorld* World);

	UFUNCTION(BlueprintCallable, Category = "4D Adapter")
	void RegisterLineage(UObject* Object, const FFourDLineageEntry& Entry);

	UFUNCTION(BlueprintCallable, Category = "4D Adapter")
	bool GetLineage(UObject* Object, FFourDLineageEntry& OutEntry) const;

	UFUNCTION(BlueprintCallable, Category = "4D Adapter")
	void QueryByWBand(float WMin, float WMax, TArray<UObject*>& OutObjects) const;

private:
	TMap<TWeakObjectPtr<UObject>, FFourDLineageEntry> Entries;
};
